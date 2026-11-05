const CLD = 'https://res.cloudinary.com/demohost';
const img = (path, w) => `${CLD}/image/upload/c_fill,g_auto,w_${w}/f_auto/q_auto/${path}`;
// Video is served untransformed: a derivative that does not exist yet answers 423
// Locked on first request, which would blank the card exactly when it matters.
const vid = (path) => `${CLD}/video/upload/${path}`;

// Pre-baked examples, every one produced by the same two add-ons this stage calls live.
const examples = [
  {
    kind: 'image', label: 'IMAGE GENERATION',
    title: 'Packshot into a lifestyle scene',
    copy: 'One catalogue packshot placed in a styled setting, with the leather, piping and hardware left untouched.',
    result: img('v1793396018/x1d4q3f8tjpqna5vqbqj.png', 640),
    source: img('forpdvkwjqjtcncb2mx2', 160)
  },
  {
    kind: 'image', label: 'IMAGE GENERATION',
    sampleSubject: 'lifestyle_shot',
    title: 'Campaign model, new location',
    copy: 'The same subject and styling relocated to a different environment, without rebooking the shoot.',
    result: img('v1793909974/jcjvejcefgok5iwyvfwn.png', 640),
    source: img('v1793909853/fovsrzqxc7pa7p96ocyg.jpg', 160)
  },
  {
    kind: 'image', label: 'IMAGE GENERATION',
    sampleSubject: 'sqeyaugdmr39vxwznqxa',
    title: 'Property scene, brought to life',
    copy: 'A guest added to an empty space, framed so the architecture stays exactly as photographed.',
    result: img('v1793394475/gkpblp25wkekamtfnfkg.png', 640),
    source: img('b3yzsvls1blajg8lhamv', 160)
  },
  {
    kind: 'video', label: 'IMAGE TO VIDEO',
    sampleSubject: 'product_shot',
    title: 'Still product, four seconds of motion',
    copy: 'A 720p clip generated from a single still - no studio, no camera crew, no edit suite.',
    result: vid('v1793393250/image-to-video/i2v_f6d2daf3c46747aca2b2389916d72426.mp4'),
    source: img('hn7pclfnel8f3vfvxxse', 160)
  }
];

// Both lanes are labelled the same way wherever they appear - progress, results and
// failures - and lead with the add-on that produced them, so the live run reads as the
// same two add-ons the example badges name.
const imageLaneLabel = 'Image Generation: same subject, new scene';
const videoLaneLabel = 'Image to Video: four second subtle animation';

const stage = document.querySelector('#stage');
const deck = document.querySelector('#deck');
const dots = document.querySelector('#dots');
let cards = [];
let active = 0;
let displayedFeaturedExample = null;
let asset = null;       // { imageUrl, assetId, subject }
let endpoints = null;   // { image, video }
let live = { state: 'idle' };
let pollTimer;

// The stage adopts Enrich's height, so the cards scale into whatever room there is
// rather than sitting at a fixed size with dead space around them.
function sizeDeck() {
  const stageWidth = stage.clientWidth || 640;
  const stageHeight = stage.clientHeight || 540;
  // Reserve room for the deck controls and the card's own text block.
  // Width is capped so the neighbouring cards still peek; height is then capped against
  // that width, otherwise a tall stage makes a narrow card that crops landscape results.
  const cardWidth = Math.round(Math.max(380, Math.min(stageWidth * 0.72, 620)));
  const mediaHeight = Math.round(Math.max(250, Math.min(stageHeight - 190, cardWidth * 1.1, 560)));
  deck.style.setProperty('--media-h', `${mediaHeight}px`);
  deck.style.setProperty('--card-w', `${cardWidth}px`);

  // The live card carries the same motion as the examples but runs wider, because it is
  // the one the prospect actually works in. Setting --card-w on the card itself is enough;
  // it inherits --media-h from the deck so every state keeps the examples' height. Height
  // is deliberately left alone: the review state already adds ~22px of its own chrome, and
  // growing the body too would push the card under the deck controls.
  const liveCard = deck.querySelector('#live-card');
  if (liveCard) {
    liveCard.style.setProperty('--card-w', `${Math.round(Math.min(cardWidth * 1.2, stageWidth - 28))}px`);
  }
  return { cardWidth };
}

function layout() {
  const { cardWidth } = sizeDeck();
  const step = Math.round(cardWidth * 0.54);
  cards.forEach((card, index) => {
    const offset = index - active;
    const depth = offset === 0 ? 0 : -260 - (Math.abs(offset) - 1) * 80;
    card.style.transform = `translate(-50%, -50%) translateX(${offset * step}px) translateZ(${depth}px) rotateY(${offset * -28}deg) scale(${offset === 0 ? 1 : 0.8})`;
    card.style.opacity = Math.abs(offset) > 2 ? '0' : String(1 - Math.abs(offset) * 0.22);
    card.style.zIndex = String(50 - Math.abs(offset));
    card.classList.toggle('is-active', offset === 0);
    card.setAttribute('aria-hidden', offset === 0 ? 'false' : 'true');
  });
  [...dots.children].forEach((dot, index) => dot.classList.toggle('on', index === active));
}

function go(index) {
  active = Math.max(0, Math.min(index, cards.length - 1));
  layout();
}

function exampleCard(item) {
  const card = document.createElement('article');
  card.className = 'card';
  const media = item.kind === 'video'
    ? `<video autoplay muted loop playsinline><source src="${item.result}" type="video/mp4"></video>`
    : `<img src="${item.result}" alt="${item.title}">`;
  card.innerHTML = `
    <div class="card-media">${media}
      <span class="media-flag">EXAMPLE</span>
      <span class="card-source"><img src="${item.source}" alt="Source image"><small>SOURCE</small></span>
    </div>
    <span class="badge ${item.kind === 'video' ? 'is-video' : ''}">${item.label}</span>
    <h3>${item.title}</h3>
    <p>${item.copy}</p>`;
  return card;
}

function liveCard() {
  const card = document.createElement('article');
  card.className = 'card is-live';
  card.id = 'live-card';
  return card;
}


// The parent hands over the full-resolution delivery URL; a 74px inset only needs
// a thumbnail of it.
function sourceThumb(url) {
  if (typeof url !== 'string' || !url.includes('/image/upload/')) return url;
  return url.replace('/image/upload/', '/image/upload/c_fill,g_auto,w_180/f_auto/q_auto/');
}

// Entitlement and policy refusals come back as raw API strings. Keep them truthful
// but readable: this is read out in front of a prospect.
function reasonText(raw) {
  const text = String(raw || '').trim().replace(/^action not permitted:\s*/i, '');
  if (/subscription required/i.test(text)) return 'The Image to Video add-on is not enabled on this cloud.';
  if (text === 'network') return 'The generation service could not be reached.';
  if (text === 'failed') return 'The generation service rejected the request.';
  return text;
}

// Reasons come back from the generation API, so they are escaped before display.
function escapeText(value) {
  const text = String(value).trim();
  const node = document.createElement('span');
  node.textContent = text.charAt(0).toUpperCase() + text.slice(1);
  return node.innerHTML;
}

// Both lanes produce output, so show both — and keep them visible after a decision
// rather than replacing the result with a status message.
function resultsMarkup() {
  const panes = [];
  const failed = (label, reason) => `<figure class="result is-failed">
      <span><b>Not generated</b>${reason ? `<i>${escapeText(reasonText(reason))}</i>` : ''}</span>
      <figcaption>${label}</figcaption>
    </figure>`;

  if (live.image) {
    panes.push(`<figure class="result"><img src="${live.image}" alt="Generated scene"><figcaption>${imageLaneLabel}</figcaption></figure>`);
  } else if (live.imageError) {
    panes.push(failed(imageLaneLabel, live.imageError));
  }
  if (live.video) {
    panes.push(`<figure class="result"><video autoplay muted loop playsinline><source src="${live.video}" type="video/mp4"></video><figcaption>${videoLaneLabel}</figcaption></figure>`);
  } else if (live.videoError) {
    panes.push(failed(videoLaneLabel, live.videoError));
  }
  return `<div class="results" data-panes="${panes.length}">${panes.join('')}
      <span class="card-source"><img src="${sourceThumb(asset.imageUrl)}" alt="Your source image"><small>SOURCE</small></span>
    </div>`;
}

function renderLive() {
  const card = document.querySelector('#live-card');
  if (!card) return;
  const s = live.state;
  let body = '';

  if (s === 'blocked') {
    body = `<div class="live-body">
      <span class="blocked-mark" aria-hidden="true">&#9888;</span>
      <b>Generation is switched off here</b>
      <span>${live.reason}</span>
      <span style="color:#62d5ee">Creator media can still be normalized, moderated and watermarked.</span>
    </div>`;
  } else if (s === 'idle') {
    body = asset?.isSample
      ? `<div class="live-body">
      <b>Try it on your own image</b>
      <span>This is one of our sample assets. Generate from it to watch the pipeline run, or bring in the image you actually want to see transformed.</span>
      <button type="button" class="live-cta" id="live-run">Generate from this sample</button>
      <button type="button" class="live-secondary" id="live-upload">Upload your own image instead</button>
    </div>`
      : `<div class="live-body">
      <b>Run it on your image</b>
      <span>Generate a new scene and a four-second clip from the asset you brought in.</span>
      <button type="button" class="live-cta" id="live-run">Generate from this image</button>
    </div>`;
  } else if (s === 'running') {
    body = `<div class="live-body">
      <i class="spinner" aria-hidden="true"></i>
      <b>Generating</b>
      <div class="lanes">
        <div class="lane ${live.image ? 'done' : ''}"><span>${imageLaneLabel}</span><i>${live.image ? 'ready' : live.imageError ? 'failed' : 'working…'}</i></div>
        <div class="lane ${live.video ? 'done' : ''}"><span>${videoLaneLabel}</span><i>${live.video ? 'ready' : live.videoError ? 'failed' : 'working…'}</i></div>
      </div>
      <span>Output is held for review before anything is published.</span>
    </div>`;
  } else if (s === 'review') {
    body = `${resultsMarkup()}
      <div class="review">
        <span class="badge is-live">AWAITING APPROVAL</span>
        <p class="review-note">Generative output can drift from the original. A human approves before this reaches a storefront.</p>
        <div class="review-actions">
          <button type="button" class="approve" id="live-approve">Approve</button>
          <button type="button" class="reject" id="live-reject">Reject</button>
        </div>
      </div>`;
  } else if (s === 'approved' || s === 'rejected') {
    body = `${resultsMarkup()}
      <div class="review">
        <span class="verdict ${s}">${s === 'approved' ? '\u2713 Approved for publication' : '\u2715 Rejected and sent back'}</span>
        <p class="review-note is-${s}">${s === 'approved'
          ? 'MediaFlows continues the workflow: tagged, optimized and delivered to every channel.'
          : 'Nothing is published. The request returns to the queue for a new generation.'}</p>
        <button type="button" class="live-cta is-quiet" id="live-reset">Run it again</button>
      </div>`;
  } else if (s === 'error') {
    body = `<div class="live-body">
      <span class="blocked-mark" aria-hidden="true">&#9888;</span>
      <b>Generation unavailable</b>
      <span>${live.message || 'The generation service did not respond.'}</span>
      <button type="button" class="live-cta" id="live-run">Try again</button>
    </div>`;
  }

  card.innerHTML = `${body}
    ${['review', 'approved', 'rejected'].includes(s) ? '' : `<span class="badge is-live">LIVE &middot; ${asset?.isSample ? 'SAMPLE ASSET' : 'YOUR IMAGE'}</span>
    <h3>${asset?.isSample ? 'Generate on a sample, or your own' : 'Generate on the selected asset'}</h3>
    <p>The same two add-ons that produced every example in this deck.</p>`}`;

  card.classList.toggle('is-approved', s === 'approved');
  card.classList.toggle('is-rejected', s === 'rejected');

  const run = card.querySelector('#live-run');
  if (run) run.addEventListener('click', (event) => { event.stopPropagation(); startGeneration(); });
  const upload = card.querySelector('#live-upload');
  if (upload) upload.addEventListener('click', (event) => {
    event.stopPropagation();
    parent.postMessage({ type: 'generate:upload' }, location.origin);
  });
  const reset = card.querySelector('#live-reset');
  if (reset) reset.addEventListener('click', (event) => { event.stopPropagation(); live = { state: 'idle' }; renderLive(); });
  const approve = card.querySelector('#live-approve');
  if (approve) approve.addEventListener('click', (event) => { event.stopPropagation(); decide('approved'); });
  const reject = card.querySelector('#live-reject');
  if (reject) reject.addEventListener('click', (event) => { event.stopPropagation(); decide('rejected'); });
}

function decide(decision) {
  live.state = decision;
  renderLive();
  parent.postMessage({ type: 'generate:decision', decision }, location.origin);
}

async function startGeneration() {
  if (!asset || !endpoints) return;
  clearTimeout(pollTimer);
  live = { state: 'running' };
  renderLive();

  // Both lanes run together; the review gate is what the viewer waits in.
  fetch(endpoints.image, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ assetId: asset.assetId, category: asset.subject })
  }).then((response) => response.json()).then((payload) => {
    if (payload.blocked) { live = { state: 'blocked', reason: payload.reason }; renderLive(); return; }
    if (payload.image?.url) live.image = payload.image.url;
    else live.imageError = payload.details || payload.error || 'failed';
    settle();
  }).catch(() => { live.imageError = 'network'; settle(); });

  fetch(endpoints.video, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ assetId: asset.assetId, category: asset.subject })
  }).then((response) => response.json()).then((payload) => {
    if (payload.blocked) { live = { state: 'blocked', reason: payload.reason }; renderLive(); return; }
    // A sample resolves to a clip the Worker already holds, so there is nothing to poll.
    if (payload.video?.url) { live.video = payload.video.url; settle(); return; }
    if (payload.job?.id) pollVideo(payload.job.id, Date.now());
    else { live.videoError = payload.details || payload.error || 'failed'; settle(); }
  }).catch(() => { live.videoError = 'network'; settle(); });
}

function pollVideo(jobId, startedAt) {
  if (live.state !== 'running') return;
  if (Date.now() - startedAt > 150000) { live.videoError = 'timed out'; settle(); return; }
  fetch(`${endpoints.video}/${encodeURIComponent(jobId)}`)
    .then((response) => response.json())
    .then((payload) => {
      const job = payload.job || {};
      if (job.status === 'completed' && job.url) { live.video = job.url; settle(); return; }
      if (job.status === 'failed') { live.videoError = job.message || 'failed'; settle(); return; }
      pollTimer = setTimeout(() => pollVideo(jobId, startedAt), 3000);
    })
    .catch(() => { pollTimer = setTimeout(() => pollVideo(jobId, startedAt), 4000); });
}

// Move to review as soon as both lanes have resolved either way.
function settle() {
  if (live.state !== 'running') { renderLive(); return; }
  const imageDone = live.image || live.imageError;
  const videoDone = live.video || live.videoError;
  if (!imageDone || !videoDone) { renderLive(); return; }
  if (!live.image && !live.video) {
    live = { state: 'error', message: live.imageError || live.videoError };
  } else {
    live.state = 'review';
  }
  renderLive();
}

function featuredExampleForAsset() {
  return asset?.isSample ? examples.find((item) => item.sampleSubject === asset.subject) : undefined;
}

function build() {
  deck.replaceChildren();
  dots.replaceChildren();
  const featured = featuredExampleForAsset();
  displayedFeaturedExample = featured || null;
  const orderedExamples = featured ? [featured, ...examples.filter((item) => item !== featured)] : examples;
  cards = orderedExamples.map((item) => {
    const card = exampleCard(item);
    deck.append(card);
    return card;
  });
  const card = liveCard();
  deck.append(card);
  cards.push(card);
  cards.forEach((node, index) => {
    node.addEventListener('click', () => { if (index !== active) go(index); });
    const dot = document.createElement('i');
    dots.append(dot);
  });
  renderLive();
  active = 0;
  layout();
}

document.querySelector('#prev').addEventListener('click', () => go(active - 1));
document.querySelector('#next').addEventListener('click', () => go(active + 1));
new ResizeObserver(() => layout()).observe(stage);
addEventListener('keydown', (event) => {
  if (event.key === 'ArrowLeft') go(active - 1);
  if (event.key === 'ArrowRight') go(active + 1);
});

addEventListener('message', (event) => {
  if (event.origin !== location.origin) return;
  const data = event.data || {};
  if (data.type === 'generate:empty') {
    stage.classList.remove('ready');
    return;
  }
  if (data.type === 'generate:ready') {
    const changed = !asset || asset.assetId !== data.assetId;
    asset = { imageUrl: data.imageUrl, assetId: data.assetId, subject: data.subject, isSample: data.isSample };
    endpoints = data.endpoints;
    if (changed) { clearTimeout(pollTimer); live = { state: 'idle' }; }
    if (changed || displayedFeaturedExample !== (featuredExampleForAsset() || null)) build(); else renderLive();
    stage.classList.add('ready');
  }
});

build();
parent.postMessage({ type: 'generate:loaded' }, location.origin);
