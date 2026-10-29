const corsHeaders = (origin) => origin ? {
  'access-control-allow-origin': origin,
  'access-control-allow-methods': 'GET, OPTIONS',
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
