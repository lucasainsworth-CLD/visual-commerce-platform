// Block names, categories and groupings are the product's own: the trigger and the four
// enrichment blocks are the ones in this demo's real flow, and the rest come from the
// MediaFlows block reference. Keeping the vocabulary exact is the point -- a prospect who
// opens MediaFlows after the demo should recognise every block by name.
const tone = {
  trigger: '#62d5ee',
  logic: '#ffc24d',
  manage: '#75b8ff',
  ai: '#c3a2ff',
  analysis: '#58dda1',
  dev: '#8ea6c4',
  beyond: '#62d5ee'
};

const icons = {
  upload: '<path d="M3 10.5V12a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1v-1.5"/><path d="M8 10V3"/><path d="m5 6 3-3 3 3"/>',
  logs: '<rect x="2" y="3" width="12" height="10" rx="1.5"/><path d="m5 7 2 1.8L5 10.6"/><path d="M8.6 10.6H11"/>',
  branch: '<path d="M4 2v4.5A2.5 2.5 0 0 0 6.5 9H12"/><path d="M4 14V9.5"/><circle cx="4" cy="15" r="1"/><path d="m9.8 6.8 2.4 2.2-2.4 2.2"/>',
  tag: '<path d="M7.4 2H3a1 1 0 0 0-1 1v4.4a1 1 0 0 0 .3.7l5.6 5.6a1 1 0 0 0 1.4 0l4.4-4.4a1 1 0 0 0 0-1.4L8.1 2.3A1 1 0 0 0 7.4 2Z"/><circle cx="5.2" cy="5.2" r="1"/>',
  ai: '<path d="M8 2.2 9.3 5l2.9 1.3L9.3 7.6 8 10.4 6.7 7.6 3.8 6.3 6.7 5Z"/><path d="M12.4 10.2 13 11.5l1.3.6-1.3.6-.6 1.3-.6-1.3-1.3-.6 1.3-.6Z"/>',
  alt: '<rect x="2" y="3" width="12" height="10" rx="1.5"/><path d="m2 10.5 3-2.6 2.3 2 2.4-2.6L14 10.5"/><circle cx="5.8" cy="6.1" r="1"/>',
  shield: '<path d="M8 2 3 4v4c0 2.8 2 5 5 6 3-1 5-3.2 5-6V4Z"/><path d="m5.9 8 1.5 1.5L10.3 6.6"/>',
  bell: '<path d="M4 6.6a4 4 0 1 1 8 0c0 2.4.8 3.6 1.2 4H2.8C3.2 10.2 4 9 4 6.6Z"/><path d="M6.6 12.8a1.6 1.6 0 0 0 2.8 0"/>',
  bolt: '<path d="M9.2 1.8 3.6 8.6h3.6l-.4 5.6 5.6-6.8H8.8Z"/>',
  wand: '<path d="M2.4 13.6 10 6"/><path d="M11.4 1.8 12 3.6l1.8.6-1.8.6-.6 1.8-.6-1.8L9 4.2l1.8-.6Z"/><path d="m9.2 7.2 1.6 1.6"/>',
  plug: '<path d="M6 2v3.4M10 2v3.4"/><path d="M4 5.4h8v2.2A4 4 0 0 1 8 11.6 4 4 0 0 1 4 7.6Z"/><path d="M8 11.6V14"/>',
  channels: '<rect x="1.8" y="3" width="6" height="10" rx="1"/><rect x="9.4" y="3" width="4.8" height="6" rx="1"/><path d="M9.4 11.4h4.8"/>',
  normalize: '<path d="M2.4 8h11.2"/><path d="M4.6 5.2h6.8M4.6 10.8h6.8"/>'
};

const trigger = {
  id: 'trigger',
  label: 'On Asset Upload',
  kicker: 'Flow starts',
  category: 'Trigger',
  tone: tone.trigger,
  icon: icons.upload,
  title: 'One upload starts everything',
  body: 'The flow is scoped to the demo folder, so only assets landing there run it. Every upload you made in this demo fired this trigger before the page had finished rendering the thumbnail.',
  rows: [['Scope', 'demo asset folder'], ['Resource type', 'image'], ['Fan-out', '2 parallel branches']],
  aside: 'Nothing here is scheduled or polled. The asset arriving is the event.'
};

const branches = [
  {
    name: 'Branch 1',
    purpose: 'Make it findable',
    tone: tone.manage,
    nodes: [
      {
        id: 'update-tags',
        label: 'Update Tags',
        kicker: 'Media management',
        category: 'Media management',
        tone: tone.manage,
        icon: icons.tag,
        title: 'Category tags land before AI runs',
        body: 'The image category chosen at upload decides which tag set and which structured metadata are written. This happens first, so every later block -- and every later moderation rule -- can read the category off the asset.',
        rows: [['Lifestyle Shot', 'lifestyle, look-book, campaign…'], ['Product Shot', 'product, SKU-lookup, catalog…'], ['UGC / Creator', 'creator, UGC, review…'], ['Travel & Hospitality', 'travel, destination, hospitality…']],
        aside: 'Product shots also get their SKU written into structured metadata, which is what makes a PIM lookup possible later.'
      },
      {
        id: 'tag-ai',
        label: 'Tag Image Using AI',
        kicker: 'AI media enrichment',
        category: 'AI media enrichment',
        tone: tone.ai,
        icon: icons.ai,
        title: 'Only confident tags are kept',
        body: 'The AI returns every tag it can see with a confidence score. The flow keeps the ones at or above 75% and discards the rest, so the library fills with tags a merchandiser would agree with rather than everything the model guessed.',
        rows: [['Confidence floor', '≥ 0.75'], ['Below the floor', 'discarded'], ['Written to', 'asset tags']],
        aside: 'This threshold is the dial worth arguing about in a workshop: raise it for a tighter library, lower it for wider recall.'
      },
      {
        id: 'alt-text',
        label: 'Generate Alt Text',
        kicker: 'AI media enrichment',
        category: 'AI media enrichment',
        tone: tone.ai,
        icon: icons.alt,
        title: 'Accessibility stops being a backlog',
        body: 'A written description is generated from the image itself and stored on the asset, so the storefront has alt text the moment the image exists -- not whenever someone gets round to the accessibility ticket.',
        rows: [['Stored in', 'contextual metadata'], ['Covers', 'every uploaded asset'], ['Manual effort', 'none']],
        aside: 'You saw this one land on the Enrich stage: the description beside your image was written by this block.'
      }
    ]
  },
  {
    name: 'Branch 2',
    purpose: 'Make it safe',
    tone: tone.analysis,
    nodes: [
      {
        id: 'branch-condition',
        label: 'Branch On Condition',
        kicker: 'Flow logic',
        category: 'Flow logic',
        tone: tone.logic,
        icon: icons.branch,
        title: 'The category picks the rulebook',
        body: 'This block reads the structured metadata written a moment earlier and sends the asset down a different moderation path for each category. One flow, four rulebooks -- no separate pipeline per content type.',
        rows: [['Reads', 'asset_subject_'], ['Paths', '4 (one per category)'], ['Default', 'no path, no moderation']],
        aside: 'This is the block that makes a single flow serve a product team and a UGC team at once.'
      },
      {
        id: 'moderate',
        label: 'Moderate Image Using Custom Rules',
        kicker: 'Media analysis',
        category: 'Media analysis',
        tone: tone.analysis,
        icon: icons.shield,
        title: 'Different content, different questions',
        body: 'Each category is checked against the rules that actually matter for it. A packshot is asked whether its background is clean and its product centred; a creator contribution is asked whether it is safe for work and original.',
        rows: [['Lifestyle Shot', '5 rules · people, logos, quality…'], ['Product Shot', '4 rules · background, centring…'], ['UGC / Creator', '5 rules · SFW, originality…'], ['Travel & Hospitality', '5 rules · AI-generated, subject…']],
        aside: 'The Moderate stage you just saw was reading the result of this block, rule by rule.'
      },
      {
        id: 'notify',
        label: 'Send A Notification',
        kicker: 'Notifications',
        category: 'Notifications',
        tone: tone.dev,
        icon: icons.bell,
        title: 'Email, Slack, you name it.',
        body: 'Set custom rules, collet messages into a weekly digest, or send slack pings for hihg-importance issues.',
        rows: [['On pass', 'continue silently'], ['On failure', 'Slack / email + asset'], ['Carries', 'the failed rule']],
        aside: ''
      }
    ]
  }
];

const downstream = [
  {
    id: 'otf',
    label: 'On-the-fly transformations',
    category: 'Delivery on-demand',
    tone: tone.beyond,
    icon: icons.wand,
    title: 'Transformations are built when they are requested',
    body: 'Every crop, format and quality variant is produced the first time a URL is requested and then cached at the edge. A new breakpoint is as easy as a URL change.',
    rows: [['Trigger', 'the first request'], ['Then', 'cached on the CDN'], ['New format', 'change the URL']],
    aside: ''
  },
  {
    id: 'partners',
    label: 'Partner & third-party sync',
    category: 'Storage · PIM · commerce',
    tone: tone.manage,
    icon: icons.plug,
    title: 'Partner Integrations',
    body: 'MediaFlows can publish finished assets into the systems the business already runs on.',
    rows: [['Connectors', '75+ pre-built'], ['Also', 'APIs and MCPs'], ['Direction', 'in and out']],
    aside: ''
  },
  {
    id: 'normalize',
    label: 'Image Normalization',
    category: 'Media management',
    tone: tone.manage,
    icon: icons.normalize,
    title: 'Normalization',
    body: 'Contributed media arrives at every size, color crop. Normalization prepares your assets for e-commerce',
    rows: [['Applies', 'brand baseline'], ['Typical use', 'UGC and partner feeds'], ['Runs', 'before publication']],
    aside: 'A rejected image can be normalized and re-checked instead of simply thrown away.'
  },
  {
    id: 'channels',
    label: 'Channel readiness',
    category: 'Marketing & productivity',
    tone: tone.ai,
    icon: icons.channels,
    title: 'Every channel gets its own cut',
    body: 'Each destination has its own aspect ratios, file-size ceilings and naming rules. A flow can check an asset against a channel\'s requirements and produce the renditions it needs, so a launch does not wait on a design queue.',
    rows: [['Checked', 'ratio, size, format'], ['Produces', 'per-channel renditions'], ['Blocks', 'on failure']],
    aside: 'The Deliver stage showed four of these renditions side by side.'
  },
  
];

const byId = new Map();
[trigger, ...branches.flatMap((branch) => branch.nodes), ...downstream].forEach((item) => byId.set(item.id, item));

const stage = document.querySelector('#stage');
const detail = document.querySelector('#detail');
let openId = null;

function svg(path) {
  return `<svg viewBox="0 0 16 16" aria-hidden="true">${path}</svg>`;
}

function nodeMarkup(item) {
  return `<button class="node" type="button" data-id="${item.id}" style="--tone:${item.tone}" aria-expanded="false">
    <span class="tile">${svg(item.icon)}</span>
    <span><small>${item.kicker}</small><strong>${item.label}</strong></span>
  </button>`;
}

function build() {
  document.querySelector('#trigger').innerHTML = `
    <span class="bolt">${svg(icons.bolt)}</span>
    ${nodeMarkup(trigger)}`;

  document.querySelector('#branches').innerHTML = branches.map((branch) => `
    <section class="branch" style="--tone:${branch.tone}">
      <p><b>${branch.name}</b> &middot; ${branch.purpose}</p>
      ${branch.nodes.map((node, index) => `
        ${index ? '<i class="link" style="--len:22px"></i>' : ''}
        ${nodeMarkup(node)}
      `).join('')}
    </section>`).join('');

  document.querySelector('#rail').innerHTML = downstream.map((item) => `
    <button class="chip" type="button" data-id="${item.id}" style="--tone:${item.tone}" aria-expanded="false">
      ${svg(item.icon)}${item.label}
    </button>`).join('');
}

// The panel bursts out of the block it belongs to: beside it where the canvas has the room,
// otherwise below or above. Sideways is tried first because the panel is taller than the gap
// under a mid-column block, and because it leaves the spine itself visible while it is open.
function place(button) {
  const stageBox = stage.getBoundingClientRect();
  const box = button.getBoundingClientRect();
  const margin = 8;
  detail.style.visibility = 'hidden';
  detail.classList.add('is-shown');
  const size = { width: detail.offsetWidth, height: detail.offsetHeight };

  const nodeLeft = box.left - stageBox.left;
  const nodeTop = box.top - stageBox.top;
  const midX = nodeLeft + box.width / 2 - size.width / 2;
  const sideY = nodeTop + box.height / 2 - size.height / 2;
  const candidates = [
    { left: nodeLeft + box.width + margin, top: sideY, origin: '0 50%' },
    { left: nodeLeft - size.width - margin, top: sideY, origin: '100% 50%' },
    { left: midX, top: nodeTop + box.height + margin, origin: '50% 0' },
    { left: midX, top: nodeTop - size.height - margin, origin: '50% 100%' }
  ];
  const fits = (spot) => spot.left >= margin && spot.left + size.width <= stageBox.width - margin
    && spot.top >= margin && spot.top + size.height <= stageBox.height - margin;
  const spot = candidates.find(fits) || candidates[2];
  detail.style.left = `${Math.round(Math.max(margin, Math.min(spot.left, stageBox.width - size.width - margin)))}px`;
  detail.style.top = `${Math.round(Math.max(margin, Math.min(spot.top, stageBox.height - size.height - margin)))}px`;
  detail.style.transformOrigin = spot.origin;
  detail.style.visibility = '';
}

function close() {
  openId = null;
  detail.classList.remove('is-shown');
  stage.classList.remove('has-open');
  stage.querySelectorAll('[data-id]').forEach((button) => {
    button.classList.remove('is-open');
    button.setAttribute('aria-expanded', 'false');
  });
}

function open(id) {
  const item = byId.get(id);
  const button = stage.querySelector(`[data-id="${id}"]`);
  if (!item || !button) return;
  close();
  openId = id;
  detail.style.setProperty('--tone', item.tone);
  detail.innerHTML = `
    <header><span>${item.category}</span><button type="button" data-close aria-label="Close details">&times;</button></header>
    <h3>${item.title}</h3>
    <p>${item.body}</p>
    ${item.rows?.length ? `<dl>${item.rows.map(([key, value]) => `<div><dt>${key}</dt><dd>${value}</dd></div>`).join('')}</dl>` : ''}
    ${item.aside ? `<p class="aside">${item.aside}</p>` : ''}`;
  button.classList.add('is-open');
  button.setAttribute('aria-expanded', 'true');
  stage.classList.add('has-open');
  place(button);
}

build();

// Click, not hover, so it matches the Optimize and Deliver stages: one click opens a block,
// a second click on the same block puts it away.
stage.addEventListener('click', (event) => {
  if (event.target.closest('[data-close]')) { close(); return; }
  const button = event.target.closest('[data-id]');
  if (!button) { if (!event.target.closest('.detail')) close(); return; }
  if (button.dataset.id === openId) close(); else open(button.dataset.id);
});

addEventListener('keydown', (event) => { if (event.key === 'Escape') close(); });
addEventListener('resize', () => { if (openId) place(stage.querySelector(`[data-id="${openId}"]`)); });

// The Generate stage's review decision is narrated back here, so the slide stays a recap of
// the run the prospect just watched rather than a generic diagram.
addEventListener('message', (event) => {
  if (event.origin !== location.origin) return;
  const data = event.data || {};
  if (data.type !== 'orchestrate:decision') return;
  const item = byId.get('notify');
  item.aside = data.decision === 'approved'
    ? 'In this run the generated output was approved, so the workflow carried on to delivery without anyone being paged.'
    : data.decision === 'rejected'
      ? 'In this run the generated output was rejected, so nothing was published and the request went back to the queue.'
      : 'This is where the headcount argument lives: review queues shrink to the exceptions.';
  if (openId === 'notify') open('notify');
});

parent.postMessage({ type: 'orchestrate:loaded' }, location.origin);
