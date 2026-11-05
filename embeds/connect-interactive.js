const LOGOS = '../assets/integrations/logos';
const FALLBACK = 'https://cloudinary.com/integrations?category=all';
// /integrations/<slug> is a real pattern and covers more brands than the partner
// pages do, so prefer it. Four logos have no page of their own and fall back to the
// directory.
const integration = (slug) => `https://cloudinary.com/integrations/${slug}`;
const ALL = 'https://cloudinary.com/integrations';

const categories = [
  {
    label: 'AI TOOLS',
    logos: [
      { name: 'OpenAI', file: 'openai', href: integration('openai') },
      { name: 'Claude', file: 'anthropic', href: integration('claude') },
      { name: 'Cursor', file: 'cursor', href: integration('cursor') },
      { name: 'n8n', file: 'n8n', href: integration('n8n') },
      { name: 'Base44', file: 'base44', href: 'https://cloudinary.com/documentation/cloudinary_llm_mcp#base44_integration' },
      { name: 'bolt', file: 'bolt' },
      { name: 'Lovable', file: 'lovable' }
    ]
  },
  {
    label: 'DESIGN / CMS',
    logos: [
      { name: 'Adobe Creative Cloud', file: 'adobe', href: integration('adobe') },
      { name: 'Figma', file: 'figma', href: integration('figma') },
      { name: 'Canva', file: 'canva', href: integration('canva') },
      { name: 'Contentstack', file: 'contentstack', href: integration('contentstack') },
      { name: 'WordPress', file: 'wordpress' },
      { name: 'Contentful', file: 'contentful', href: integration('contentful') }
    ]
  },
  {
    label: 'PIM / MARKETING',
    logos: [
      { name: 'Syndigo', file: 'syndigo', href: integration('syndigo') },
      { name: 'Akeneo', file: 'akeneo', href: integration('akeneo') },
      { name: 'Braze', file: 'braze', href: integration('braze') },
      { name: 'Klaviyo', file: 'klaviyo', href: integration('klaviyo') }
    ]
  },
  {
    label: 'E-COMMERCE',
    logos: [
      { name: 'Shopify', file: 'shopify', href: integration('shopify') },
      { name: 'SAP Commerce Cloud', file: 'sap', href: integration('sap') },
      { name: 'Salesforce', file: 'salesforce' }
    ]
  }
];

const grid = document.querySelector('#grid');

function build() {
  for (const category of categories) {
    const card = document.createElement('article');
    card.className = 'card';
    const label = document.createElement('a');
    label.className = 'card-label';
    label.href = ALL;
    label.target = '_blank';
    label.rel = 'noopener noreferrer';
    label.textContent = category.label;
    const fan = document.createElement('div');
    fan.className = 'fan';

    const nodes = category.logos.map((logo) => {
      const href = logo.href || FALLBACK;
      const node = document.createElement('a');
      node.className = 'logo';
      node.href = href;
      node.target = '_blank';
      node.rel = 'noopener noreferrer';
      node.setAttribute('aria-label', logo.href ? `${logo.name} integration` : `${logo.name} - see all integrations`);
      const image = document.createElement('img');
      image.src = `${LOGOS}/${logo.file}.png`;
      image.alt = '';
      const tip = document.createElement('span');
      tip.className = 'tip';
      tip.textContent = logo.name;
      node.append(image, tip);
      fan.append(node);
      return node;
    });

    card.append(label, fan);
    grid.append(card);

    const place = () => layout(card, fan, nodes);
    card.addEventListener('pointerenter', () => { card.classList.add('is-open'); place(); });
    card.addEventListener('pointerleave', () => { card.classList.remove('is-open'); place(); });
    // Keyboard users get the same reveal when focus enters the card.
    card.addEventListener('focusin', () => { card.classList.add('is-open'); place(); });
    card.addEventListener('focusout', (event) => {
      if (card.contains(event.relatedTarget)) return;
      card.classList.remove('is-open');
      place();
    });
    card.addEventListener('click', (event) => {
      if (event.target.closest('a')) return;
      window.open(ALL, '_blank', 'noopener');
    });
    card.__place = place;
  }
  placeAll();
  // The grid reflows as cards are added, fonts load and the slide animates in, so
  // re-measure rather than trusting the geometry at build time.
  requestAnimationFrame(placeAll);
  new ResizeObserver(placeAll).observe(grid);
}

function placeAll() {
  document.querySelectorAll('.card').forEach((card) => card.__place && card.__place());
}

// At rest the logos are already fanned and legible. On hover they grow and spread
// past the card's own edges, clamped to the stage so nothing is clipped away.
function layout(card, fan, nodes) {
  const open = card.classList.contains('is-open');
  // Offset/client geometry rather than getBoundingClientRect: the slide animates in with
  // a transform, and a rect measured mid-animation reports the wrong size.
  const grid = document.querySelector('.grid');
  const fanLeft = card.offsetLeft + fan.offsetLeft;
  const fanTop = card.offsetTop + fan.offsetTop;
  const width = fan.clientWidth || card.clientWidth - 28;
  const height = fan.clientHeight || 1;
  const count = nodes.length;

  const chip = open
    ? Math.max(56, Math.min(78, width / 3.2))
    : Math.max(48, Math.min(65, width / 3.83));
  const half = chip / 2;

  // Logo centres are positioned in fan-local pixels; these are the limits that keep a
  // chip inside the grid even when it has spilled outside its own card.
  const edge = 10;
  const minX = edge - fanLeft + half;
  const maxX = grid.clientWidth - edge - fanLeft - half;
  // Break out sideways and downward, but never upward over the card's own label.
  const minY = Math.max(edge - fanTop + half, half);
  const maxY = grid.clientHeight - edge - fanTop - half;

  const rows = count > 4 ? 2 : 1;
  const perRow = Math.ceil(count / rows);
  const centerX = width / 2;
  const centerY = height / 2;
  // Two rows of open chips are taller than the fan, so the stack has to break downward out
  // of the card. Anchoring it and stepping by rowGap is what keeps the rows apart: deriving
  // each row from the centre let the minY clamp squeeze the gap shut against the card label.
  const rowRoom = rows > 1 ? Math.max(chip * 1.02, maxY - minY) : Infinity;
  const rowGap = Math.min(chip * 1.3, Math.max(chip * 1.12, height / (rows + 0.25)), rowRoom);
  const stack = (rows - 1) * rowGap;
  const firstRowY = Math.max(minY, Math.min(centerY - stack / 2, maxY - stack));
  const arc = Math.min(12, chip * 0.2, rows > 1 ? Math.max(0, rowGap - chip - 4) : Infinity);

  for (let row = 0; row < rows; row += 1) {
    const rowNodes = nodes.slice(row * perRow, row * perRow + perRow);
    const n = rowNodes.length;
    const gap = open ? chip * 1.42 : chip * 1.2;
    let spread = n > 1 ? Math.min(gap * (n - 1), maxX - minX) : 0;
    let left = centerX - spread / 2;
    // Shift the whole row rather than squashing it, so spacing stays even.
    if (left < minX) left = minX;
    if (left + spread > maxX) left = Math.max(minX, maxX - spread);
    const step = n > 1 ? spread / (n - 1) : 0;

    rowNodes.forEach((node, i) => {
      const index = row * perRow + i;
      let x = left + i * step;
      let y = firstRowY + row * rowGap;
      // A slight arc so a row reads as a fan rather than a table. It is capped by whatever
      // clearance is left between the rows: at full strength a lifted middle chip rises
      // into the row above it, which is what made larger chips collide.
      if (n > 2) {
        const t = (i / (n - 1)) * 2 - 1;
        y -= (1 - t * t) * arc;
      }
      node.style.setProperty('--chip', `${Math.round(chip)}px`);
      node.style.left = `${Math.round(x)}px`;
      node.style.top = `${Math.round(Math.min(maxY, Math.max(minY, y)))}px`;
      node.style.zIndex = String(open ? 20 + index : 2);
      node.style.transitionDelay = open ? `${index * 22}ms` : '0ms';
    });
  }
}

addEventListener('resize', placeAll);

build();
