// Prompts live here, not in the browser: the page may only name a category, never
// supply prompt text, so a tampered client cannot spend generation credits on
// arbitrary content.
const imagePrompts = {
  // Chosen on evidence: a people-free contextual setting held product fidelity on a
  // handbag where the "in use" variant produced broken hands. No people means no
  // anatomy risk on any product category.
  product_shot: 'Keep the product from [1] exactly as it is: identical colour, materials, texture, stitching, hardware, trim and proportions. Do not restyle, recolour or redesign any part of it. Place it in a real-world lifestyle setting appropriate to the product, resting naturally on a surface with believable contact shadows. Soft natural daylight, shallow depth of field, tasteful props kept minimal and out of focus. No people, no hands, no text, no logos, no additional products. Photorealistic commercial lifestyle photography.',
  // The subject already exists in the source, so this is a relocation rather than an
  // invention - the highest-fidelity category of the four.
  lifestyle_shot: 'Keep the person and their clothing from [1] exactly as they are: identical face, hair, styling, garment colour and cut, pose and proportions. Do not restyle the subject. Relocate them into a contemporary outdoor environment that complements their styling, with natural directional light, architectural context and shallow depth of field. No text, no logos. Photorealistic campaign photography.',
  // Swap this in for streetwear or youth brands, where the juxtaposition lands harder.
  lifestyle_shot_alley: 'Keep the person and their clothing from [1] exactly as they are: identical face, hair, styling, garment colour and cut, pose and proportions. Do not restyle the subject. Relocate them into a vibrant urban back alley with colourful graffiti murals, wet asphalt and warm late-afternoon light raking down the wall. Shallow depth of field, editorial fashion framing. No text, no logos. Photorealistic campaign photography.',
  // The person is framed from behind so face fidelity is never in question.
  sqeyaugdmr39vxwznqxa: 'Keep the architecture, furnishings, materials and layout from [1] exactly as they are. Add one person relaxing naturally in the space, seated or reclining in the middle distance and seen from a three-quarter rear angle so their face is not the focus. Warm natural light, inviting hospitality mood, shallow depth of field. No text, no logos. Photorealistic travel and hospitality photography.'
};

// Creator / UGC is deliberately absent. Rights in contributor content are not the
// brand's to transform, so the page shows a policy block instead of generating.
const generationBlockedCategories = new Set(['ugc___creator']);
const defaultImageCategory = 'lifestyle_shot';

// Only 1:1, 16:9, 9:16, 4:3 and 3:4 are accepted by the API.
const imageAspect = {
  product_shot: '4:3',
  lifestyle_shot: '4:3',
  lifestyle_shot_alley: '4:3',
  ugc___creator: '1:1',
  sqeyaugdmr39vxwznqxa: '16:9'
};

const videoPrompt = 'Freestyle animate the image with creative and dynamic movement. Add natural motion, subtle transformations, and bring the scene to life with organic animation. Apply a slow motion effect to the animation, making all movements appear more deliberate and elegant. Reduce the speed to create a dreamy, cinematic quality.';

const assetIdPattern = /^[A-Za-z0-9_-]{16,64}$/;
const jobIdPattern = /^[A-Za-z0-9_-]{8,128}$/;

const promptFor = (category) => imagePrompts[category] || imagePrompts[defaultImageCategory];

const basicAuth = (env) => 'Basic ' + btoa(env.CLOUDINARY_API_KEY + ':' + env.CLOUDINARY_API_SECRET);

// Generations are deduped per asset+category so re-entering the stage, or a reloaded
// tab, reuses the result instead of spending credits again.
const cacheKeyFor = (request, parts) => new Request(
  new URL('/__generated/' + parts.map(encodeURIComponent).join('/'), request.url).toString(),
  { method: 'GET' }
);

async function readCached(request, parts) {
  const hit = await caches.default.match(cacheKeyFor(request, parts));
  return hit ? hit.json() : null;
}

async function writeCached(request, parts, body, seconds) {
  await caches.default.put(cacheKeyFor(request, parts), new Response(JSON.stringify(body), {
    headers: { 'content-type': 'application/json', 'cache-control': 'max-age=' + seconds }
  }));
}

const corsHeaders = (origin) => origin ? {
  'access-control-allow-origin': origin,
  'access-control-allow-methods': 'GET, POST, OPTIONS',
  'access-control-allow-headers': 'content-type',
  vary: 'Origin'
} : {};

const json = (body, status = 200, origin) => new Response(JSON.stringify(body), {
  status,
  headers: {
    'content-type': 'application/json',
    ...corsHeaders(origin)
  }
});

const allowedOrigins = (env) => (env.ALLOWED_ORIGINS || env.ALLOWED_ORIGIN || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);



// The generation APIs are in beta and their envelopes do not match the published
// reference, so find fields by shape instead of by a fixed path.
function findBy(node, predicate, depth = 0) {
  if (!node || typeof node !== 'object' || depth > 6) return null;
  if (predicate(node)) return node;
  for (const value of Array.isArray(node) ? node : Object.values(node)) {
    const found = findBy(value, predicate, depth + 1);
    if (found) return found;
  }
  return null;
}

const findString = (node, keys, depth = 0) => {
  if (!node || typeof node !== 'object' || depth > 6) return undefined;
  for (const key of keys) {
    if (typeof node[key] === 'string' && node[key]) return node[key];
  }
  for (const value of Array.isArray(node) ? node : Object.values(node)) {
    const found = findString(value, keys, depth + 1);
    if (found) return found;
  }
  return undefined;
};

const shapeOf = (payload) => {
  const describe = (node, depth = 0) => {
    if (!node || typeof node !== 'object' || depth > 2) return typeof node;
    if (Array.isArray(node)) return '[' + (node.length ? describe(node[0], depth + 1) : '') + ']';
    return '{' + Object.keys(node).slice(0, 12).join(',') + '}';
  };
  return describe(payload);
};

async function readBody(request) {
  try { return await request.json(); } catch (error) { return null; }
}

async function generateImage(request, env, origin) {
  const body = await readBody(request);
  const assetId = body?.assetId;
  const category = typeof body?.category === 'string' ? body.category : defaultImageCategory;
  if (!assetId || !assetIdPattern.test(assetId)) {
    return json({ error: 'A valid assetId is required' }, 400, origin);
  }

  if (generationBlockedCategories.has(category)) {
    return json({
      blocked: true,
      reason: 'Generative edits are disabled for creator content: rights in contributor media are held by the contributor, not the brand.'
    }, 200, origin);
  }

  if (!imagePrompts[category]) {
    return json({ error: 'Unknown category: ' + category }, 400, origin);
  }

  const cached = await readCached(request, ['image', assetId, category]);
  if (cached) return json({ ...cached, cached: true }, 200, origin);

  const endpoint = 'https://api.cloudinary.com/v2/generate/' + env.CLOUDINARY_CLOUD_NAME + '/image_to_image';
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { authorization: basicAuth(env), 'content-type': 'application/json' },
    body: JSON.stringify({
      prompt: promptFor(category),
      reference_images: [{ source_type: 'managed_asset', asset_id: assetId }],
      image_size: { aspect_ratio: imageAspect[category] || '1:1', resolution: '1K' }
    })
  });
  const payload = await response.json();
  if (!response.ok) {
    return json({
      error: 'Image generation failed',
      details: payload.error?.message || payload.error || 'Unknown error',
      requestId: payload.request_id
    }, response.status, origin);
  }

  const asset = findBy(payload, (node) => typeof node.secure_url === 'string' && node.secure_url);
  if (!asset) {
    return json({
      error: 'Image generation returned no asset',
      taskId: findString(payload, ['task_id']),
      shape: shapeOf(payload)
    }, 502, origin);
  }
  const result = {
    image: {
      url: asset.secure_url,
      width: asset.width,
      height: asset.height,
      bytes: asset.bytes,
      format: asset.format,
      model: asset.model?.id || asset.model?.family
    },
    creditsRemaining: payload.limits?.addons_quota?.remaining
  };
  await writeCached(request, ['image', assetId, category], result, 86400);
  return json(result, 200, origin);
}

async function generateVideo(request, env, origin) {
  const body = await readBody(request);
  const assetId = body?.assetId;
  const category = typeof body?.category === 'string' ? body.category : '';
  if (!assetId || !assetIdPattern.test(assetId)) {
    return json({ error: 'A valid assetId is required' }, 400, origin);
  }
  if (generationBlockedCategories.has(category)) {
    return json({
      blocked: true,
      reason: 'Generative edits are disabled for creator content: rights in contributor media are held by the contributor, not the brand.'
    }, 200, origin);
  }

  // Reuse an in-flight or finished job rather than paying for a second generation.
  const cached = await readCached(request, ['video', assetId]);
  if (cached) return json({ ...cached, cached: true }, 200, origin);

  const endpoint = 'https://api.cloudinary.com/v2/video/' + env.CLOUDINARY_CLOUD_NAME + '/image_to_video/generate';
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { authorization: basicAuth(env), 'content-type': 'application/json' },
    body: JSON.stringify({
      prompt: videoPrompt,
      image_asset_id: assetId,
      duration: 4,
      aspect_ratio: 'auto',
      resolution: '720p'
    })
  });
  const payload = await response.json();
  if (!response.ok) {
    return json({
      error: 'Video generation failed',
      details: payload.error?.message || payload.error || 'Unknown error',
      requestId: payload.request_id
    }, response.status, origin);
  }

  const jobId = findString(payload, ['job_id', 'jobId', 'task_id', 'id']);
  if (!jobId) {
    return json({ error: 'Video generation returned no job id', shape: shapeOf(payload) }, 502, origin);
  }
  const job = { job: { id: jobId, status: findString(payload, ['status']) || 'pending' } };
  await writeCached(request, ['video', assetId], job, 3600);
  return json(job, 200, origin);
}

async function videoStatus(request, env, origin, jobId) {
  if (!jobIdPattern.test(jobId)) {
    return json({ error: 'A valid job id is required' }, 400, origin);
  }
  const endpoint = 'https://api.cloudinary.com/v2/video/' + env.CLOUDINARY_CLOUD_NAME
    + '/image_to_video/generate/' + encodeURIComponent(jobId);
  const response = await fetch(endpoint, { headers: { authorization: basicAuth(env) } });
  const payload = await response.json();
  if (!response.ok) {
    return json({
      error: 'Video status lookup failed',
      details: payload.error?.message || payload.error || 'Unknown error'
    }, response.status, origin);
  }
  return json({
    job: {
      id: jobId,
      status: findString(payload, ['status']),
      url: findString(payload, ['url', 'secure_url']),
      publicId: findString(payload, ['public_id']),
      message: findString(payload, ['message'])
    }
  }, 200, origin);
}

export default {
  async fetch(request, env) {
    const origins = allowedOrigins(env);
    const requestOrigin = request.headers.get('Origin');
    const origin = origins.includes(requestOrigin) ? requestOrigin : undefined;
    if (!origin) {
      return json({ error: 'Origin is not allowed' }, 403);
    }

    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: corsHeaders(origin)
      });
    }

    const url = new URL(request.url);

    if (request.method === 'POST' && url.pathname === '/generate-image') {
      return generateImage(request, env, origin);
    }
    if (request.method === 'POST' && url.pathname === '/generate-video') {
      return generateVideo(request, env, origin);
    }
    const videoJobMatch = url.pathname.match(/^\/generate-video\/([^/]+)$/);
    if (request.method === 'GET' && videoJobMatch) {
      return videoStatus(request, env, origin, decodeURIComponent(videoJobMatch[1]));
    }
    if (request.method !== 'GET' || url.pathname !== '/asset') {
      return json({ error: 'Not found' }, 404, origin);
    }

    const assetId = url.searchParams.get('assetId');
    const publicId = url.searchParams.get('publicId');
    const validAssetId = assetId && /^[A-Za-z0-9_-]{16,64}$/.test(assetId);
    const validPublicId = publicId
      && publicId.length <= 255
      && /^[A-Za-z0-9_./-]+$/.test(publicId)
      && !publicId.split('/').some((segment) => segment === '.' || segment === '..');
    if (!validAssetId && !validPublicId) {
      return json({ error: 'A valid image assetId or publicId is required' }, 400, origin);
    }

    const resourcePath = validAssetId
      ? '/resources/' + encodeURIComponent(assetId)
      : '/resources/image/upload/' + publicId.split('/').map(encodeURIComponent).join('/');
    const endpoint = new URL('https://api.cloudinary.com/v1_1/' + env.CLOUDINARY_CLOUD_NAME + resourcePath);
    endpoint.searchParams.set('tags', 'true');
    endpoint.searchParams.set('context', 'true');
    endpoint.searchParams.set('metadata', 'true');
    endpoint.searchParams.set('moderations', 'true');

    const credentials = btoa(env.CLOUDINARY_API_KEY + ':' + env.CLOUDINARY_API_SECRET);
    const response = await fetch(endpoint, { headers: { authorization: 'Basic ' + credentials } });
    const payload = await response.json();
    if (!response.ok) {
      return json({
        error: 'Cloudinary asset lookup failed',
        details: payload.error?.message || payload.error || 'Unknown Cloudinary error'
      }, response.status, origin);
    }

    if (payload.resource_type !== 'image') {
      return json({ error: 'Only image assets are supported' }, 400, origin);
    }

    const demoFolder = env.DEMO_ASSET_FOLDER?.replace(/\/+$/, '');
    const assetFolder = (payload.asset_folder || '').replace(/\/+$/, '');
    if (demoFolder && assetFolder !== demoFolder && !assetFolder.startsWith(demoFolder + '/')) {
      return json({ error: 'Asset is outside the demo folder' }, 403, origin);
    }

    return json({
      asset: {
        assetId: payload.asset_id,
        publicId: payload.public_id,
        resourceType: payload.resource_type,
        width: payload.width,
        height: payload.height,
        bytes: payload.bytes,
        format: payload.format,
        tags: payload.tags || [],
        context: payload.context || {},
        metadata: payload.metadata || {},
        moderations: payload.moderations || []
      }
    }, 200, origin);
  }
};
