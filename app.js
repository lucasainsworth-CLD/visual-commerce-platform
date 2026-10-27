const ids = ['intro', 'ingest', 'enrich', 'generate', 'transform', 'moderate', 'optimize', 'deliver', 'orchestrate'];
const names = ['Intro', '1 Ingest', '2 Enrich', '3 Generate', '4 Transform', '5 Moderate', '6 Optimize', '7 Deliver', '8 Orchestrate'];
const config = window.LIFECYCLE_DEMO_CONFIG || {};
const uploadPresets = config.uploadPresets || { lifestyle: config.uploadPreset };
const $ = (selector) => document.querySelector(selector);
let activeIndex = 0;
const uploadWidgets = new Map();
let assetSource;
let selectedAsset = false;
let latestEnrichAsset;
let latestModerationAsset;
let originalAssetBytes;
let optimizeMeasurementRequest = 0;
let deliverMeasurementRequest = 0;
let assetPollingToken = 0;
let latestAssetFingerprint;
const lifecycleStatus = Object.fromEntries(ids.map((id) => [id, id === 'intro' ? 'ready' : 'idle']));
const lifecycleLabels = {
  idle: 'Waiting for an asset',
  processing: 'Processing',
  ready: 'Complete',
  attention: 'Needs attention'
};
const lifecycleTimers = new Map();
const sampleAssets = {
  lifestyle: {
    source: 'https://res.cloudinary.com/demohost/image/upload/v1790954902/kwgoitjaob4m9eoy7ocw.jpg',
    assetId: '79ac8f2844766065ab27dbe4c797a866',
    format: 'jpg'
  }
};

function setDemoState(value) {
  const state = $('#state');
  if (state) state.textContent = value;
}

function setCanvasBusy(stage, busy, message) {
  const loader = $(`#${stage}-loader`);
  if (!loader) return;
  loader.hidden = !busy;
  const label = loader.querySelector('span');
  if (message && label) label.textContent = message;
}

function setLifecycleStatus(stage, status) {
  lifecycleStatus[stage] = status;
  const link = document.querySelector(`nav a[href="#${stage}"]`);
  if (!link) return;
  link.dataset.lifecycleStatus = status;
  link.setAttribute('aria-label', `${link.textContent.trim()}: ${lifecycleLabels[status]}`);
}

function isEnrichmentReady(asset = latestEnrichAsset) {
  const enrichment = enrichmentOnlyAsset(asset);
  return Boolean(enrichment?.tags?.length || Object.keys(enrichment?.metadata || {}).length || Object.keys(enrichment?.context || {}).length);
}

function normalizeFieldKey(key) {
  return String(key).trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
}

function moderationData(asset = latestModerationAsset) {
  const fields = {
    ...(asset?.metadata || {}),
    ...(asset?.context || {})
  };
  const fieldValue = (name) => Object.entries(fields).find(([key]) => {
    const normalized = normalizeFieldKey(key);
    return normalized === name || normalized.endsWith(`_${name}`) || normalized.includes(name);
  })?.[1];
  const completedModeration = (asset?.moderations || []).find((entry) => {
    const status = String(entry?.status || '').toLowerCase();
    return status && !['pending', 'queued', 'processing'].includes(status);
  });

  return {
    status: fieldValue('moderation_status') || completedModeration?.status,
    summary: fieldValue('moderation_rules_summary'),
    jobUrl: fieldValue('moderation_job_url'),
    reasons: fieldValue('moderation_rejection_reasons_list'),
    completedModeration
  };
}

function isModerationReady(asset = latestModerationAsset) {
  const moderation = moderationData(asset);
  const status = String(moderation.status || '').toLowerCase();
  const completedStatus = status && !['pending', 'queued', 'processing', 'in_progress'].includes(status);
  return Boolean(completedStatus || moderation.summary || moderation.jobUrl || moderation.reasons || moderation.completedModeration);
}

function syncOrchestrationStatus() {
  const complete = lifecycleStatus.enrich === 'ready' && lifecycleStatus.moderate === 'ready';
  setLifecycleStatus('orchestrate', complete ? 'ready' : 'processing');
  setCanvasBusy('orchestrate', !complete, 'Waiting for enrichment and moderation results…');
}

function beginAssetLifecycle() {
  assetPollingToken += 1;
  ['ingest', 'enrich', 'generate', 'transform', 'moderate', 'optimize', 'deliver', 'orchestrate']
    .forEach((stage) => setLifecycleStatus(stage, 'processing'));
  ['ingest', 'generate', 'transform'].forEach((stage) => {
    clearTimeout(lifecycleTimers.get(stage));
    lifecycleTimers.set(stage, setTimeout(() => {
      setLifecycleStatus(stage, 'ready');
      if (stage === 'ingest') setCanvasBusy('ingest', false);
      if (stage === 'generate') syncGenerateVisual();
      if (stage === 'transform') syncTransformVisual();
    }, stage === 'ingest' ? 450 : 950));
  });
  setCanvasBusy('ingest', true, 'Preparing asset record…');
  setCanvasBusy('generate', true, 'Creating visual variations…');
  setCanvasBusy('moderate', true, 'Running moderation rules…');
  setCanvasBusy('optimize', true, 'Measuring optimized delivery…');
  setCanvasBusy('deliver', true, 'Preparing delivery variants…');
  syncOrchestrationStatus();
  return assetPollingToken;
}

function go(index) {
  activeIndex = Math.max(0, Math.min(index, ids.length - 1));
  ids.forEach((id, itemIndex) => {
    $('#' + id).classList.toggle('active', itemIndex === activeIndex);
    document.querySelector(`a[href="#${id}"]`).classList.toggle('active', itemIndex === activeIndex);
  });
  const counter = $('#counter');
  if (counter) counter.textContent = names[activeIndex] + ' of 8';
  history.replaceState(null, '', '#' + ids[activeIndex]);
  requestAnimationFrame(() => {
    if (ids[activeIndex] === 'enrich') syncEnrichVisual();
    if (ids[activeIndex] === 'transform') syncTransformVisual();
    if (ids[activeIndex] === 'moderate') syncModerationVisual();
    if (ids[activeIndex] === 'optimize') syncOptimizeVisual();
    if (ids[activeIndex] === 'deliver') syncDeliverVisual();
  });
}

function formatBytes(value) {
  return value < 1048576 ? Math.round(value / 1024) + ' KB' : (value / 1048576).toFixed(1) + ' MB';
}

function updateAsset(info) {
  const source = info.secure_url || info.url || info.source;
  if (!source) return;
  assetSource = source;
  latestEnrichAsset = undefined;
  latestModerationAsset = undefined;
  latestAssetFingerprint = undefined;
  originalAssetBytes = info.bytes || info.size || undefined;
  document.querySelectorAll('[data-img]').forEach((image) => { image.src = source; });
  const preview = new Image();
  preview.onload = () => {
    const dimensions = preview.naturalWidth + ' × ' + preview.naturalHeight + ' px';
    $('#dims').textContent = dimensions;
    const optimizeDimensions = $('#optimize-original-dimensions');
    if (optimizeDimensions) optimizeDimensions.textContent = dimensions;
  };
  preview.src = source;
  $('#format').textContent = (info.format || info.type || 'JPG').replace('image/', '').toUpperCase();
  const fileSize = originalAssetBytes ? formatBytes(originalAssetBytes) : 'Cloudinary original';
  $('#size').textContent = fileSize;
  const optimizeOriginalSize = $('#optimize-original-size');
  if (optimizeOriginalSize) optimizeOriginalSize.textContent = fileSize;
  updateGenerateOriginal();
  updateOptimizeDelivery();
  updateDeliverVariants();
}

function updateGenerateOriginal() {
  const image = $('#generate-original');
  if (!image || !assetSource) return;
  image.src = assetSource.includes('/image/upload/')
    ? assetSource.replace('/image/upload/', '/image/upload/c_scale,w_300/f_auto/q_auto/')
    : assetSource;
}

function updateOptimizeDelivery() {
  const image = $('#optimize-delivery');
  if (!image || !assetSource) return;
  const deliveryUrl = assetSource.includes('/image/upload/')
    ? assetSource.replace('/image/upload/', '/image/upload/c_scale,w_600/f_auto/q_auto/')
    : assetSource;
  image.src = deliveryUrl;
  updateOptimizeMeasurements(assetSource, deliveryUrl);
}

async function measureDeliveryBytes(url) {
  try {
    const response = await fetch(url, { method: 'HEAD', cache: 'no-store' });
    const bytes = Number(response.headers.get('content-length'));
    if (response.ok && bytes > 0) return bytes;
  } catch { /* Fall back to a small delivered-asset download. */ }

  try {
    const response = await fetch(url, { cache: 'no-store' });
    if (!response.ok) return undefined;
    return (await response.blob()).size || undefined;
  } catch {
    return undefined;
  }
}

function renderOptimizeSavings(originalBytes, deliveryBytes) {
  const arc = $('#optimize-savings-arc');
  const percent = $('#optimize-savings-percent');
  const caption = $('#optimize-savings-caption');
  const comparison = $('#optimize-savings-comparison');
  if (!arc || !percent || !caption || !comparison) return;

  if (!originalBytes || !deliveryBytes) {
    arc.setAttribute('opacity', '0');
    percent.textContent = '—';
    caption.textContent = 'MEASURING';
    comparison.textContent = 'Measuring delivery size…';
    return;
  }

  const savings = (originalBytes - deliveryBytes) / originalBytes * 100;
  const remaining = Math.max(0, Math.min(1, deliveryBytes / originalBytes));
  const visibleArc = savings < 0 ? 66.67 : remaining * 66.67;
  const color = savings > 0 ? '#58dda1' : '#ff765d';
  arc.setAttribute('stroke-dasharray', `${visibleArc} ${100 - visibleArc}`);
  arc.setAttribute('stroke', color);
  arc.setAttribute('opacity', '1');
  percent.textContent = `${Math.round(Math.abs(savings))}%`;
  percent.style.color = color;
  caption.textContent = savings >= 0 ? 'SMALLER' : 'LARGER';
  comparison.textContent = `${formatBytes(originalBytes)} → ${formatBytes(deliveryBytes)}`;
}

async function updateOptimizeMeasurements(originalUrl, deliveryUrl) {
  const request = ++optimizeMeasurementRequest;
  const deliverySize = $('#optimize-delivery-size');
  if (deliverySize) deliverySize.textContent = 'Measuring…';
  renderOptimizeSavings(undefined, undefined);

  const [measuredOriginal, measuredDelivery] = await Promise.all([
    originalAssetBytes ? Promise.resolve(originalAssetBytes) : measureDeliveryBytes(originalUrl),
    measureDeliveryBytes(deliveryUrl)
  ]);
  if (request !== optimizeMeasurementRequest) return;

  if (measuredOriginal && !originalAssetBytes) {
    originalAssetBytes = measuredOriginal;
    const originalSize = formatBytes(measuredOriginal);
    $('#size').textContent = originalSize;
    const optimizeOriginalSize = $('#optimize-original-size');
    if (optimizeOriginalSize) optimizeOriginalSize.textContent = originalSize;
  }
  if (deliverySize) deliverySize.textContent = measuredDelivery ? formatBytes(measuredDelivery) : 'Unavailable';
  renderOptimizeSavings(originalAssetBytes, measuredDelivery);
  if (selectedAsset) {
    setLifecycleStatus('optimize', 'ready');
    setCanvasBusy('optimize', false);
  }
}

function syncOptimizeVisual() {
  const empty = $('#optimize-empty');
  const showcase = $('#optimize-showcase');
  if (!empty || !showcase) return;
  empty.hidden = selectedAsset;
  showcase.hidden = !selectedAsset;
  setCanvasBusy('optimize', selectedAsset && lifecycleStatus.optimize === 'processing');
}

const deliverVariants = [
  { id: 'mobile', transformation: 'c_fill,ar_9:16,w_400/f_auto/q_auto' },
  { id: 'square', transformation: 'c_fill,ar_1:1,w_300/f_auto/q_auto' },
  { id: 'tablet', transformation: 'c_fill,ar_4:3,w_500/f_auto/q_auto' },
  { id: 'desktop', transformation: 'c_scale,w_800/f_auto/q_auto' }
];

function syncDeliverVisual() {
  const empty = $('#deliver-empty');
  const showcase = $('#deliver-showcase');
  if (!empty || !showcase) return;
  empty.hidden = selectedAsset;
  showcase.hidden = !selectedAsset;
  setCanvasBusy('deliver', selectedAsset && lifecycleStatus.deliver === 'processing');
}

function deliveryUrl(transformation) {
  if (!assetSource || !assetSource.includes('/image/upload/')) return assetSource;
  return assetSource.replace('/image/upload/', `/image/upload/${transformation}/`);
}

async function updateDeliverVariants() {
  if (!assetSource) return;
  const request = ++deliverMeasurementRequest;
  const variants = deliverVariants.map((variant) => ({
    ...variant,
    url: deliveryUrl(variant.transformation)
  }));

  variants.forEach((variant) => {
    const image = $(`#deliver-${variant.id}`);
    const size = $(`#deliver-${variant.id}-size`);
    if (image) image.src = variant.url;
    if (size) size.textContent = 'Measuring…';
  });

  const sizes = await Promise.all(variants.map((variant) => measureDeliveryBytes(variant.url)));
  if (request !== deliverMeasurementRequest) return;
  variants.forEach((variant, index) => {
    const size = $(`#deliver-${variant.id}-size`);
    if (size) size.textContent = sizes[index] ? formatBytes(sizes[index]) : 'Unavailable';
  });
  if (selectedAsset) {
    setLifecycleStatus('deliver', 'ready');
    setCanvasBusy('deliver', false);
  }
}

function updateEnrichPreview() {
  if (!assetSource) return;

  const ingestFrame = $('#asset-inspector');
  const frameWidth = Math.round(ingestFrame?.getBoundingClientRect().width || 680);
  const deliveryWidth = Math.max(1, frameWidth);
  // A local preview cannot be transformed until it has been uploaded to Cloudinary.
  if (!assetSource.includes('/image/upload/')) {
    return assetSource;
  }

  return assetSource.replace(
    '/image/upload/',
    `/image/upload/c_scale,w_${deliveryWidth}/f_auto/q_auto/`
  );
}

function enrichmentOnlyAsset(asset) {
  if (!asset) return asset;
  const omitModeration = (fields = {}) => Object.fromEntries(
    Object.entries(fields).filter(([key]) => !/^moderation(?:_|$)/i.test(key))
  );

  return {
    ...asset,
    metadata: omitModeration(asset.metadata),
    context: omitModeration(asset.context)
  };
}

function syncEnrichVisual() {
  const frame = $('#enrich-visual');
  if (!frame?.contentWindow) return;

  if (!selectedAsset) {
    frame.contentWindow.postMessage({ type: 'enrich:empty' }, location.origin);
    return;
  }

  const imageUrl = updateEnrichPreview();
  frame.contentWindow.postMessage({
    type: isEnrichmentReady() ? 'enrich:ready' : 'enrich:loading',
    imageUrl,
    asset: enrichmentOnlyAsset(latestEnrichAsset)
  }, location.origin);
}

function syncTransformVisual() {
  const frame = $('#transform-visual');
  if (!frame?.contentWindow) return;
  frame.contentWindow.postMessage(
    selectedAsset
      ? { type: 'transform:ready', imageUrl: assetSource }
      : { type: 'transform:empty' },
    location.origin
  );
}

function syncGenerateVisual() {
  const empty = $('#generate-empty');
  const showcase = $('#generate-showcase');
  if (!empty || !showcase) return;
  empty.hidden = selectedAsset;
  showcase.hidden = !selectedAsset;
  setCanvasBusy('generate', selectedAsset && lifecycleStatus.generate === 'processing');
}

function parseModerationSummary(value) {
  if (value && typeof value === 'object') return value;
  if (typeof value !== 'string') return {};
  try {
    const summary = JSON.parse(value);
    return summary && typeof summary === 'object' ? summary : {};
  } catch {
    return {};
  }
}

function moderationReasons(value) {
  if (Array.isArray(value)) return value.map(String);
  if (typeof value !== 'string') return [];
  try {
    const reasons = JSON.parse(value);
    return Array.isArray(reasons) ? reasons.map(String) : [value];
  } catch {
    return [value];
  }
}

function setModerationRule(ruleId, state) {
  const rule = document.querySelector(`[data-moderation-rule="${ruleId}"]`);
  if (!rule) return;
  rule.classList.remove('pending', 'approved', 'rejected');
  rule.classList.add(state);
  const label = rule.querySelector('span');
  if (label) label.textContent = state === 'approved' ? 'Approved' : state === 'rejected' ? 'Rejected' : 'Checking';
}

function syncModerationVisual() {
  const empty = $('#moderate-empty');
  const showcase = $('#moderate-showcase');
  if (!empty || !showcase) return;

  if (!selectedAsset) {
    empty.hidden = false;
    showcase.hidden = true;
    return;
  }

  empty.hidden = true;
  showcase.hidden = false;
  const status = $('#moderate-status');
  const summaryLabel = $('#moderate-summary');
  const jobLink = $('#moderate-job');
  const moderation = moderationData();

  if (!isModerationReady()) {
    status.textContent = 'CHECKING';
    summaryLabel.textContent = 'Waiting for structured moderation metadata…';
    ['image-quality-check', 'no-unlicensed-logos', 'no-identifiable-people', 'minimum-image-size']
      .forEach((ruleId) => setModerationRule(ruleId, 'pending'));
    jobLink.hidden = true;
    setCanvasBusy('moderate', true, 'Running moderation rules…');
    return;
  }

  const summary = parseModerationSummary(moderation.summary);
  const reasons = moderationReasons(moderation.reasons)
    .map((reason) => reason.toLowerCase());
  const overall = String(moderation.status || (summary.failed ? 'rejected' : 'approved')).toUpperCase();
  const passed = Number(summary.passed) || 0;
  const failed = Number(summary.failed) || 0;
  const total = Number(summary.total) || passed + failed || 4;
  const peopleRejected = reasons.some((reason) => reason.includes('identifiable-person'));

  status.textContent = overall;
  summaryLabel.textContent = `${passed} of ${total} checks approved`;
  setModerationRule('image-quality-check', 'approved');
  setModerationRule('no-unlicensed-logos', 'approved');
  setModerationRule('no-identifiable-people', peopleRejected || (overall === 'REJECTED' && failed === 1) ? 'rejected' : 'approved');
  setModerationRule('minimum-image-size', 'approved');

  if (moderation.jobUrl) {
    jobLink.href = moderation.jobUrl;
    jobLink.hidden = false;
  } else {
    jobLink.hidden = true;
  }

  showcase.classList.remove('is-ready');
  void showcase.offsetWidth;
  showcase.classList.add('is-ready');
  setLifecycleStatus('moderate', 'ready');
  setCanvasBusy('moderate', false);
  syncOrchestrationStatus();
}

function showInspector() {
  $('#upload-prompt').hidden = true;
  $('#asset-inspector').hidden = false;
  selectedAsset = true;
  requestAnimationFrame(() => {
    syncEnrichVisual();
    syncTransformVisual();
    syncGenerateVisual();
    syncModerationVisual();
    syncOptimizeVisual();
    syncDeliverVisual();
  });
}

function renderAssetData(asset) {
  const metadata = asset.metadata || {};
  const context = asset.context?.custom || asset.context || {};
  const output = {
    width: asset.width,
    height: asset.height,
    bytes: asset.bytes,
    format: asset.format,
    tags: asset.tags || [],
    metadata,
    context,
    moderations: asset.moderations || []
  };
  const fingerprint = JSON.stringify(output);
  if (fingerprint === latestAssetFingerprint) return false;
  latestAssetFingerprint = fingerprint;
  $('#metadata-output').textContent = JSON.stringify(output, null, 2);
  if (asset.width && asset.height) {
    const dimensions = asset.width + ' × ' + asset.height + ' px';
    $('#dims').textContent = dimensions;
    const optimizeDimensions = $('#optimize-original-dimensions');
    if (optimizeDimensions) optimizeDimensions.textContent = dimensions;
  }
  if (asset.bytes) {
    const size = formatBytes(asset.bytes);
    originalAssetBytes = asset.bytes;
    $('#size').textContent = size;
    const optimizeOriginalSize = $('#optimize-original-size');
    if (optimizeOriginalSize) optimizeOriginalSize.textContent = size;
    if (assetSource) updateOptimizeDelivery();
  }
  latestEnrichAsset = output;
  latestModerationAsset = output;
  if (isEnrichmentReady(output)) setLifecycleStatus('enrich', 'ready');
  syncEnrichVisual();
  syncModerationVisual();
  syncOrchestrationStatus();
  return true;
}

async function pollAsset(assetReference, resourceType = 'image', attempt = 0, pollingToken = assetPollingToken) {
  if (!config.assetEndpoint) {
    $('#note').textContent = 'Upload complete. Add the Worker endpoint to read live metadata.';
    return;
  }

  try {
    const lookup = typeof assetReference === 'string'
      ? { assetId: assetReference }
      : assetReference;
    const lookupId = lookup.assetId || lookup.publicId;
    const query = new URLSearchParams({ resourceType });
    if (lookup.assetId) query.set('assetId', lookup.assetId);
    if (lookup.publicId) query.set('publicId', lookup.publicId);
    const endpoint = `${config.assetEndpoint}?${query.toString()}`;

    $('#metadata-output').textContent = JSON.stringify({
      assetLookup: 'requesting',
      assetId: lookupId,
      attempt: attempt + 1,
      message: 'Requesting live Cloudinary asset data…'
    }, null, 2);

    const response = await fetch(endpoint, {
      cache: 'no-store',
      headers: { Accept: 'application/json' }
    });
    const data = await response.json();
    if (pollingToken !== assetPollingToken) return;
    if (!response.ok) {
      $('#metadata-output').textContent = JSON.stringify({
        assetLookup: 'failed',
        status: response.status,
        error: data.error,
        details: data.details
      }, null, 2);
      setDemoState('LOOKUP ERROR');
      return;
    }
    if (data.asset) {
      renderAssetData(data.asset);
      const enrichmentReady = isEnrichmentReady(latestEnrichAsset);
      const moderationReady = isModerationReady(latestModerationAsset);
      setDemoState(enrichmentReady && moderationReady ? 'ENRICHED' : 'PROCESSING');
      $('#note').textContent = enrichmentReady && moderationReady
        ? 'Live tags, metadata, and moderation results loaded from Cloudinary.'
        : 'Automation is still adding tags, metadata, and moderation results…';
      if (enrichmentReady && moderationReady) return;
    }
  } catch (error) {
    $('#metadata-output').textContent = JSON.stringify({
      assetLookup: 'unreachable',
      error: error.message
    }, null, 2);
    $('#note').textContent = 'Upload completed; metadata lookup will retry.';
  }

  if (attempt < 23) setTimeout(() => pollAsset(assetReference, resourceType, attempt + 1, pollingToken), 2500);
}

function handleUpload(info) {
  const pollingToken = beginAssetLifecycle();
  updateAsset(info);
  showInspector();
  $('#metadata-output').textContent = JSON.stringify({
    assetLookup: 'pending',
    assetId: info.asset_id || 'missing from upload response',
    message: 'Waiting for Cloudinary asset data…'
  }, null, 2);
  setDemoState('PROCESSING');
  $('#note').textContent = 'Uploaded. Checking for tags and structured metadata…';
  go(ids.indexOf('ingest'));
  pollAsset(info.asset_id, info.resource_type || 'image', 0, pollingToken);
}

function openUploadWidget(assetType) {
  const uploadPreset = uploadPresets[assetType];
  if (!uploadPreset) {
    $('#note').textContent = 'That upload route is not configured yet.';
    return;
  }
  if (!window.cloudinary) {
    $('#note').textContent = 'The Cloudinary Upload Widget is still loading. Refresh the page and try again.';
    return;
  }

  if (!uploadWidgets.has(uploadPreset)) {
    const sources = ['local', 'url', 'google_drive', 'onedrive', 'sharepoint', 'gettyimages'];
    if (config.dropboxAppKey) sources.splice(3, 0, 'dropbox');

    let uploadWidget;
    uploadWidget = window.cloudinary.createUploadWidget({
      cloudName: config.cloudName,
      uploadPreset,
      sources,
      ...(config.dropboxAppKey ? { dropboxAppKey: config.dropboxAppKey } : {}),
      multiple: false,
      maxFiles: 1,
      maxFileSize: 10000000,
      resourceType: 'image',
      clientAllowedFormats: ['jpg', 'jpeg', 'png', 'webp'],
      singleUploadAutoClose: true,
      showAdvancedOptions: false
    }, (error, result) => {
      if (error) {
        $('#note').textContent = 'Upload failed. Check the upload preset configuration.';
        return;
      }
      const completedItem = result?.event === 'queues-end'
        ? result.info?.files?.find((file) => file.uploadInfo)?.uploadInfo
        : null;
      const uploadInfo = result?.event === 'success' ? result.info : completedItem;
      if (uploadInfo) {
        handleUpload(uploadInfo);
        uploadWidget.close({ quiet: true });
      }
    });
    uploadWidgets.set(uploadPreset, uploadWidget);
  }
  uploadWidgets.get(uploadPreset).open();
}

function openAssetTypeDialog() {
  const dialog = $('#asset-type-dialog');
  if (dialog?.showModal) dialog.showModal();
  else dialog?.setAttribute('open', '');
}

function closeAssetTypeDialog() {
  const dialog = $('#asset-type-dialog');
  if (dialog?.open && dialog.close) dialog.close();
  else dialog?.removeAttribute('open');
}

document.querySelectorAll('[data-asset-type]').forEach((option) => {
  const isConfigured = Boolean(uploadPresets[option.dataset.assetType]);
  option.disabled = !isConfigured;
  if (isConfigured && option.dataset.assetType !== 'lifestyle') {
    option.querySelector('[data-preset-state]').textContent = 'Ready to upload';
  }
  option.onclick = () => {
    if (!uploadPresets[option.dataset.assetType]) return;
    closeAssetTypeDialog();
    openUploadWidget(option.dataset.assetType);
  };
});

$('#asset-type-dialog').addEventListener('click', (event) => {
  if (event.target === event.currentTarget) closeAssetTypeDialog();
});

$('#upload').onclick = openAssetTypeDialog;
document.querySelectorAll('[data-sample]').forEach((link) => {
  link.onclick = (event) => {
    event.preventDefault();
    const sample = sampleAssets[link.dataset.sample];
    if (!sample) return;
    const pollingToken = beginAssetLifecycle();
    updateAsset(sample);
    showInspector();
    setDemoState('SAMPLE ASSET');
    $('#metadata-output').textContent = JSON.stringify({
      assetLookup: 'pending',
      assetId: sample.assetId,
      message: 'Loading live Cloudinary asset data…'
    }, null, 2);
    $('#note').textContent = 'Lifestyle campaign asset selected. Checking its live metadata.';
    go(ids.indexOf('ingest'));
    pollAsset(sample.assetId, 'image', 0, pollingToken);
  };
});
$('#file').onchange = (event) => {
  const file = event.target.files[0];
  if (!file) return;
  updateAsset({ source: URL.createObjectURL(file), type: file.type, size: file.size });
  showInspector();
  setDemoState('LOCAL PREVIEW');
  $('#note').textContent = 'Configure an unsigned upload preset to send this file to Cloudinary.';
};
$('#change-asset').onclick = openAssetTypeDialog;
$('#enrich-visual').onload = syncEnrichVisual;
$('#transform-visual').onload = syncTransformVisual;
addEventListener('message', (event) => {
  if (event.origin !== location.origin || event.data?.type !== 'transform:loaded') return;
  syncTransformVisual();
});

document.querySelectorAll('nav a').forEach((link) => {
  link.onclick = (event) => {
    event.preventDefault();
    go(ids.indexOf(link.hash.slice(1)));
  };
});
ids.forEach((id) => setLifecycleStatus(id, lifecycleStatus[id]));
const next = $('#next');
const prev = $('#prev');
if (next) next.onclick = () => go(activeIndex + 1);
if (prev) prev.onclick = () => go(activeIndex - 1);
$('[data-next]').onclick = () => go(1);
addEventListener('keydown', (event) => {
  if (event.key === 'ArrowRight') go(activeIndex + 1);
  if (event.key === 'ArrowLeft') go(activeIndex - 1);
});

updateAsset({ source: 'https://res.cloudinary.com/demohost/image/upload/v1787601621/utctndwrbavu4seggpqu.jpg' });
go(Math.max(0, ids.indexOf(location.hash.slice(1))));
