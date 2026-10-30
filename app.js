const ids = ['intro', 'ingest', 'enrich', 'generate', 'transform', 'moderate', 'connect', 'optimize', 'deliver', 'orchestrate', 'usecases'];
const names = ['Intro', '1 Ingest', '2 Enrich', '3 Generate', '4 Transform', '5 Moderate', '6 Connect', '7 Optimize', '8 Deliver', '9 Orchestrate', 'Use cases'];
const config = window.LIFECYCLE_DEMO_CONFIG || {};
const uploadPresets = config.uploadPresets || { lifestyle: config.uploadPreset };
const structuredMetadataField = config.structuredMetadataField || 'asset_subject_';
const structuredMetadataSkuField = config.structuredMetadataSkuField || 'SKU';
const structuredMetadataSkuValue = config.structuredMetadataSkuValue || '000123';
const lifestyleSubjectValue = 'lifestyle_shot';
const productSubjectValue = 'product_shot';
const creatorSubjectValue = 'ugc___creator';
const travelSubjectValue = 'sqeyaugdmr39vxwznqxa';
const moderationRuleCatalog = {
  people: { label: 'No Identifiable People', rejectionReason: 'Identifiable person detected' },
  quality: { label: 'Image Quality Check', rejectionReason: 'Low image quality' },
  logos: { label: 'Known Logo Detection', rejectionReason: 'unlicensed logos found' },
  watermark: { label: 'Watermark Detection', rejectionReason: 'Watermark detected' },
  size: { label: 'Minimum Image Size', rejectionReason: 'Image too small' },
  background: { label: 'Clean White Background', rejectionReason: 'Background check failed' },
  centered: { label: 'Centered Product', rejectionReason: 'Product framing issue' },
  aiGenerated: { label: 'AI Generated Image Detection', rejectionReason: 'Likely AI-generated' },
  travel: { label: 'Travel and Hospitality Image Check', rejectionReason: "Image looks like it's not travel & hospitality focused" },
  originality: { label: 'Image Originality Check', rejectionReason: 'This image was found online' },
  safeForWork: { label: 'Safe for Work', rejectionReason: 'SFW check failed' }
};
const moderationRulesBySubject = {
  [lifestyleSubjectValue]: ['people', 'quality', 'logos', 'watermark', 'size'],
  [productSubjectValue]: ['background', 'quality', 'watermark', 'centered'],
  [travelSubjectValue]: ['aiGenerated', 'travel', 'watermark', 'size', 'people'],
  [creatorSubjectValue]: ['safeForWork', 'originality', 'aiGenerated', 'watermark', 'quality']
};
const lifestyleUploadTags = ['lifestyle', 'look-book', 'fashion', 'seasonal', 'mood-board', 'campaign'];
const productUploadTags = ['product', 'SKU-lookup', 'angles', 'seasonal', 'customize', 'catalog'];
const creatorUploadTags = ['creator', 'UGC', 'review', 'opinion', 'contribution', 'customer'];
const travelUploadTags = ['travel', 'leisure', 'destination', 'visit', 'hospitality', 'places'];
const debugUpload = (label, details) => {
  if (window.console?.debug) console.debug(`[Cloudinary upload] ${label}`, details);
};
const tagsForSubject = (assetSubjectValue) => {
  if (assetSubjectValue === lifestyleSubjectValue) return lifestyleUploadTags;
  if (assetSubjectValue === productSubjectValue) return productUploadTags;
  if (assetSubjectValue === creatorSubjectValue) return creatorUploadTags;
  if (assetSubjectValue === travelSubjectValue) return travelUploadTags;
  return null;
};
const $ = (selector) => document.querySelector(selector);
let activeIndex = 0;
const uploadWidgets = new Map();
let resolveAssetSubjectSelection;
let assetSource;
let selectedAsset = false;
let latestEnrichAsset;
let latestModerationAsset;
let latestTransformAsset;
let generateDecision;
let assetIsSample = false;
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
    source: 'https://res.cloudinary.com/demohost/image/upload/v1793289865/lsi1nr9n4xvwldut6opg.jpg',
    publicId: 'lsi1nr9n4xvwldut6opg',
    format: 'jpg',
    label: 'Lifestyle campaign image'
  },
  product: {
    source: 'https://res.cloudinary.com/demohost/image/upload/hn7pclfnel8f3vfvxxse',
    publicId: 'hn7pclfnel8f3vfvxxse',
    label: 'Product image'
  },
  travel: {
    source: 'https://res.cloudinary.com/demohost/image/upload/b3yzsvls1blajg8lhamv',
    publicId: 'b3yzsvls1blajg8lhamv',
    label: 'Travel & Hospitality image'
  },
  creator: {
    source: 'https://res.cloudinary.com/demohost/image/upload/kfmu2hxnxtcc6xfy7ca7',
    publicId: 'kfmu2hxnxtcc6xfy7ca7',
    label: 'Creator / UGC image'
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
  link.dataset.lifecycleGlow = status;
  link.setAttribute('aria-label', `${link.textContent.trim()}: ${lifecycleLabels[status]}`);
}

function activateLifecycleGlow() {
  const flow = document.querySelector('.lifecycle-flow');
  if (!flow) return;
  clearTimeout(lifecycleTimers.get('glow-reveal'));
  flow.classList.remove('has-asset', 'is-revealing');
  requestAnimationFrame(() => {
    flow.classList.add('has-asset', 'is-revealing');
    lifecycleTimers.set('glow-reveal', setTimeout(() => flow.classList.remove('is-revealing'), 2100));
  });
}

function hasAltDescription(asset) {
  const context = asset?.context?.custom || asset?.context || {};
  return Object.entries(context).some(([key, value]) => {
    const normalizedKey = normalizeFieldKey(key);
    return ['alt', 'description_alt'].includes(normalizedKey)
      && value != null
      && String(value).trim().length > 0;
  });
}

function hasEnrichmentData(asset = latestEnrichAsset) {
  const enrichment = enrichmentOnlyAsset(asset);
  return Boolean(enrichment?.tags?.length || Object.keys(enrichment?.metadata || {}).length || Object.keys(enrichment?.context || {}).length);
}

function isEnrichmentReady(asset = latestEnrichAsset) {
  return hasAltDescription(enrichmentOnlyAsset(asset));
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
  return Boolean(completedStatus || moderation.summary || moderation.reasons || moderation.completedModeration);
}

function syncOrchestrationStatus() {
  setLifecycleStatus('orchestrate', selectedAsset ? 'ready' : 'idle');
  setCanvasBusy('orchestrate', false);
  const empty = $('#orchestrate-empty');
  if (empty) empty.hidden = selectedAsset;
  const diagram = $('#orchestrate-diagram');
  if (diagram) diagram.hidden = !selectedAsset;
  const review = $('#orchestrate-review');
  if (review) {
    review.textContent = generateDecision === 'approved'
      ? 'In this run the generated clip was approved, so the workflow continued to delivery.'
      : generateDecision === 'rejected'
        ? 'In this run the generated clip was rejected, so nothing was published.'
        : 'In this demo, image-to-video is manually reviewed before publication.';
  }
}

function beginAssetLifecycle() {
  assetPollingToken += 1;
  ['ingest', 'enrich', 'generate', 'transform', 'moderate', 'connect', 'optimize', 'deliver', 'orchestrate']
    .forEach((stage) => setLifecycleStatus(stage, 'processing'));
  ['ingest', 'generate', 'transform', 'connect'].forEach((stage) => {
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
  if (counter) counter.textContent = names[activeIndex] + ' of ' + (ids.length - 2);
  history.replaceState(null, '', '#' + ids[activeIndex]);
  requestAnimationFrame(() => {
    if (ids[activeIndex] === 'enrich') syncEnrichVisual();
    if (ids[activeIndex] === 'transform') syncTransformVisual();
    if (ids[activeIndex] === 'moderate') syncModerationVisual();
    if (ids[activeIndex] === 'optimize') syncOptimizeVisual();
    if (ids[activeIndex] === 'deliver') syncDeliverVisual();
    if (ids[activeIndex] === 'orchestrate') syncOrchestrationStatus();
  });
}

function formatBytes(value) {
  return value < 1048576 ? Math.round(value / 1024) + ' KB' : (value / 1048576).toFixed(1) + ' MB';
}

function setAssetId(value) {
  const assetId = $('#asset-id');
  if (assetId) assetId.textContent = value || 'assigned on ingest';
}

function updateAsset(info) {
  const source = info.secure_url || info.url || info.source;
  if (!source) return;
  assetSource = source;
  setAssetId(info.asset_id || info.assetId);
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
  updateOptimizeDelivery();
  updateDeliverVariants();
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
    const resolved = Boolean(originalAssetBytes && measuredDelivery);
    setLifecycleStatus('optimize', resolved ? 'ready' : 'processing');
    setCanvasBusy('optimize', !resolved);
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

  const enrichFrame = $('#enrich-visual');
  const frameWidth = Math.round(enrichFrame?.getBoundingClientRect().width || 960);
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
    enrichImageSize = null;
    frame.style.height = '540px';
    frame.contentWindow.postMessage({ type: 'enrich:empty' }, location.origin);
    return;
  }

  if (latestEnrichAsset?.width && latestEnrichAsset?.height) {
    resizeEnrichVisual(latestEnrichAsset.width, latestEnrichAsset.height);
  }
  const imageUrl = updateEnrichPreview();
  frame.contentWindow.postMessage({
    type: hasEnrichmentData() ? 'enrich:ready' : 'enrich:loading',
    imageUrl,
    asset: enrichmentOnlyAsset(latestEnrichAsset),
    categoryTags: tagsForSubject(latestEnrichAsset?.metadata?.[structuredMetadataField]) || []
  }, location.origin);
}

let enrichImageSize = null;

function resizeEnrichVisual(width, height) {
  const frame = $('#enrich-visual');
  if (!frame || !width || !height) return;
  enrichImageSize = { width, height };
  const frameWidth = frame.getBoundingClientRect().width;
  const targetHeight = frameWidth * (height / width);
  frame.style.height = `${Math.round(Math.min(900, Math.max(540, targetHeight)))}px`;
}

function syncTransformVisual() {
  const frame = $('#transform-visual');
  if (!frame?.contentWindow) return;
  frame.contentWindow.postMessage(
    selectedAsset
      ? {
        type: 'transform:ready',
        imageUrl: assetSource,
        subject: latestTransformAsset?.metadata?.[structuredMetadataField]
      }
      : { type: 'transform:empty' },
    location.origin
  );
}

function generateEndpoints() {
  if (!config.assetEndpoint) return null;
  const base = config.assetEndpoint.replace(/\/asset$/, '');
  return { image: base + '/generate-image', video: base + '/generate-video' };
}

function syncGenerateVisual() {
  const frame = $('#generate-visual');
  if (!frame?.contentWindow) return;
  const endpoints = generateEndpoints();
  const assetId = latestTransformAsset?.assetId;
  frame.contentWindow.postMessage(
    selectedAsset && assetId && endpoints
      ? {
        type: 'generate:ready',
        imageUrl: assetSource,
        assetId,
        subject: latestTransformAsset?.metadata?.[structuredMetadataField],
        isSample: assetIsSample,
        endpoints
      }
      : { type: 'generate:empty' },
    location.origin
  );
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

function renderModerationRows(rows) {
  const list = $('#moderate-rule-list');
  if (!list) return;
  list.replaceChildren(...rows.map(({ label, state, rejectionReason, statusLabel }, index) => {
    const rule = document.createElement('article');
    rule.className = `moderate-rule ${state}`;
    rule.style.setProperty('--delay', `${(index + 1) * .08}s`);
    const number = document.createElement('small');
    number.textContent = String(index + 1).padStart(2, '0');
    const name = document.createElement('strong');
    name.textContent = label;
    const result = document.createElement('span');
    result.textContent = statusLabel || (state === 'approved' ? 'Approved' : state === 'rejected' ? 'Rejected' : 'Checking');
    rule.append(number, name, result);
    if (rejectionReason) {
      const detail = document.createElement('p');
      detail.className = 'moderate-rule-reason';
      detail.textContent = rejectionReason;
      rule.append(detail);
    }
    return rule;
  }));
}

function moderationReasonLabel(value) {
  const label = String(value).replace(/[_-]+/g, ' ').trim();
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function categoryModerationRows(asset, summary, reasons) {
  const subject = asset?.metadata?.[structuredMetadataField];
  const ruleIds = moderationRulesBySubject[subject];
  if (!ruleIds) return null;

  const matchedReasonIndices = new Set();
  const rows = ruleIds.map((ruleId) => {
    const rule = moderationRuleCatalog[ruleId];
    const expected = normalizeFieldKey(rule.rejectionReason);
    const reasonIndex = reasons.findIndex((reason, index) => (
      !matchedReasonIndices.has(index) && normalizeFieldKey(reason) === expected
    ));
    if (reasonIndex >= 0) matchedReasonIndices.add(reasonIndex);
    return {
      label: rule.label,
      state: reasonIndex >= 0 ? 'rejected' : 'pending',
      ...(reasonIndex >= 0 ? { rejectionReason: rule.rejectionReason } : {})
    };
  });
  const allResultsAccountedFor = Number(summary.total) === ruleIds.length
    && Number(summary.failed) === matchedReasonIndices.size
    && Number(summary.passed) === ruleIds.length - matchedReasonIndices.size
    && matchedReasonIndices.size === reasons.length;
  if (allResultsAccountedFor) {
    rows.forEach((row) => { if (row.state === 'pending') row.state = 'approved'; });
  } else {
    rows.forEach((row) => { if (row.state === 'pending') row.statusLabel = 'Not reported'; });
  }
  reasons.forEach((reason, index) => {
    if (!matchedReasonIndices.has(index)) {
      rows.push({ label: 'Other failed check', state: 'rejected', rejectionReason: moderationReasonLabel(reason) });
    }
  });
  return rows;
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
  const summaryLabel = $('#moderate-summary');
  const moderation = moderationData();

  if (!isModerationReady()) {
    summaryLabel.textContent = 'Waiting for structured moderation metadata…';
    renderModerationRows([{ label: 'Reading rule outcomes', state: 'pending' }]);
    setCanvasBusy('moderate', true, 'Running moderation rules…');
    return;
  }

  const summary = parseModerationSummary(moderation.summary);
  const reasons = moderationReasons(moderation.reasons).filter(Boolean);
  const passed = Number(summary.passed) || 0;
  const failed = Number(summary.failed) || 0;
  const total = Number(summary.total) || passed + failed;
  summaryLabel.textContent = total
    ? `${passed} of ${total} checks approved. Automations can trigger actions when any rule passes or fails.`
    : `Moderation ${String(moderation.status || 'complete').toLowerCase()}. Rule counts are not available.`;
  const rows = categoryModerationRows(latestModerationAsset, summary, reasons) ||
    reasons.map((reason) => ({ label: moderationReasonLabel(reason), state: 'rejected' }));
  if (!moderationRulesBySubject[latestModerationAsset?.metadata?.[structuredMetadataField]]) {
    if (passed) rows.push({ label: `${passed} other check${passed === 1 ? '' : 's'} approved`, state: 'approved' });
    if (failed > reasons.length) {
      const unlistedFailures = failed - reasons.length;
      rows.push({ label: `${unlistedFailures} other check${unlistedFailures === 1 ? '' : 's'} failed`, state: 'rejected' });
    }
  }
  if (!rows.length) rows.push({ label: 'Individual rule results unavailable', state: 'pending' });
  renderModerationRows(rows);

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
  activateLifecycleGlow();
  requestAnimationFrame(() => {
    syncEnrichVisual();
    syncTransformVisual();
    syncGenerateVisual();
    syncModerationVisual();
    syncOptimizeVisual();
    syncDeliverVisual();
    syncOrchestrationStatus();
  });
}

function renderAssetData(asset) {
  setAssetId(asset.asset_id || asset.assetId);
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
  latestTransformAsset = { ...output, assetId: asset.asset_id || asset.assetId };
  if (isEnrichmentReady(output)) setLifecycleStatus('enrich', 'ready');
  syncEnrichVisual();
  syncTransformVisual();
  syncGenerateVisual();
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
    else if (lookup.publicId) query.set('publicId', lookup.publicId);
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
  assetIsSample = false;
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

function openUploadWidget() {
  const uploadPreset = uploadPresets.lifestyle;
  if (!uploadPreset) {
    $('#note').textContent = 'The lifestyle upload preset is not configured yet.';
    return;
  }
  if (!window.cloudinary) {
    $('#note').textContent = 'The Cloudinary Upload Widget is still loading. Refresh the page and try again.';
    return;
  }

  if (!uploadWidgets.has('upload')) {
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
      showAdvancedOptions: false,
      prepareUploadParams: (callback, params) => {
        requestAssetSubject().then((assetSubjectValue) => {
          if (!assetSubjectValue) {
            callback({ cancel: true });
            return;
          }
          const requests = Array.isArray(params) ? params : [params];
          const metadata = [`${structuredMetadataField}=${assetSubjectValue}`];
          if (assetSubjectValue === productSubjectValue) {
            metadata.push(`${structuredMetadataSkuField}=${structuredMetadataSkuValue}`);
          }
          const preparedMetadata = metadata.join('|');
          const uploadTags = tagsForSubject(assetSubjectValue);
          const preparedTags = uploadTags ? uploadTags.slice() : [];
          debugUpload('prepared params', {
            uploadPreset,
            metadata: preparedMetadata,
            tags: preparedTags
          });
          const prepared = requests.map((request) => ({
            ...request,
            metadata: preparedMetadata,
            ...(uploadTags ? { tags: preparedTags.join(',') } : {})
          }));
          callback(Array.isArray(params) ? prepared : prepared[0]);
        }).catch((error) => {
          debugUpload('parameter preparation failed', error);
          callback({ cancel: true });
        });
      }
    }, (error, result) => {
      if (error) {
        debugUpload('error', error);
        const detail = typeof error === 'string' ? error : error?.message;
        $('#note').textContent = detail ? `Upload failed: ${detail}` : 'Upload failed. Check the upload preset configuration.';
        return;
      }
      const completedItem = result?.event === 'queues-end'
        ? result.info?.files?.find((file) => file.uploadInfo)?.uploadInfo
        : null;
      const uploadInfo = result?.event === 'success' ? result.info : completedItem;
      if (uploadInfo) {
        debugUpload('response', {
          assetId: uploadInfo.asset_id,
          tags: uploadInfo.tags || [],
          metadata: uploadInfo.metadata || {}
        });
        handleUpload(uploadInfo);
        uploadWidget.close({ quiet: true });
      }
    });
    uploadWidgets.set('upload', uploadWidget);
  }
  uploadWidgets.get('upload').open();
}

function requestAssetSubject() {
  return new Promise((resolve) => {
    resolveAssetSubjectSelection = resolve;
    openAssetTypeDialog();
  });
}

function finishAssetSubjectSelection(value) {
  const resolve = resolveAssetSubjectSelection;
  resolveAssetSubjectSelection = undefined;
  closeAssetTypeDialog();
  resolve?.(value);
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

document.querySelectorAll('[data-asset-subject]').forEach((option) => {
  option.onclick = () => {
    finishAssetSubjectSelection(option.dataset.assetSubjectValue);
  };
});

$('#asset-type-dialog').addEventListener('click', (event) => {
  if (event.target === event.currentTarget) finishAssetSubjectSelection(null);
});

$('#asset-type-dialog').addEventListener('close', () => {
  if (resolveAssetSubjectSelection) finishAssetSubjectSelection(null);
});

$('#upload').onclick = () => openUploadWidget();
document.querySelectorAll('[data-sample]').forEach((link) => {
  link.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopImmediatePropagation();
    const sample = sampleAssets[link.dataset.sample];
    if (!sample) return;
    const pollingToken = beginAssetLifecycle();
    assetIsSample = true;
    updateAsset(sample);
    showInspector();
    setDemoState('SAMPLE ASSET');
    $('#metadata-output').textContent = JSON.stringify({
      assetLookup: 'pending',
      assetId: sample.assetId || sample.publicId,
      message: 'Loading live Cloudinary asset data…'
    }, null, 2);
    $('#note').textContent = `${sample.label || 'Sample asset'} selected. Checking its live metadata.`;
    go(ids.indexOf('ingest'));
    pollAsset(sample.assetId || { publicId: sample.publicId }, 'image', 0, pollingToken);
  }, true);
});
$('#file').onchange = (event) => {
  const file = event.target.files[0];
  if (!file) return;
  updateAsset({ source: URL.createObjectURL(file), type: file.type, size: file.size });
  showInspector();
  setDemoState('LOCAL PREVIEW');
  $('#note').textContent = 'Configure an unsigned upload preset to send this file to Cloudinary.';
};
$('#change-asset').onclick = () => openUploadWidget();
$('#enrich-visual').onload = syncEnrichVisual;
$('#transform-visual').onload = syncTransformVisual;
$('#generate-visual').onload = syncGenerateVisual;
addEventListener('message', (event) => {
  if (event.origin !== location.origin) return;
  const type = event.data?.type;
  if (type === 'transform:loaded') syncTransformVisual();
  if (type === 'generate:loaded') syncGenerateVisual();
  if (type === 'generate:upload') {
    go(ids.indexOf('ingest'));
    openUploadWidget();
  }
  if (type === 'generate:decision') {
    generateDecision = event.data.decision;
    syncOrchestrationStatus();
  }
});
addEventListener('resize', () => {
  if (enrichImageSize) resizeEnrichVisual(enrichImageSize.width, enrichImageSize.height);
});

document.querySelectorAll('a[href^="#"]:not([data-sample])').forEach((link) => {
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

addEventListener('hashchange', () => {
  const nextIndex = ids.indexOf(location.hash.slice(1));
  if (nextIndex >= 0 && nextIndex !== activeIndex) go(nextIndex);
});

updateAsset({ source: 'https://res.cloudinary.com/demohost/image/upload/v1787601621/utctndwrbavu4seggpqu.jpg' });
go(Math.max(0, ids.indexOf(location.hash.slice(1))));
