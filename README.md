# Connected Visual Media Lifecycle

A dependency-free, GitHub Pages-ready prototype for a Cloudinary platform demo.

## Run locally

```sh
python3 -m http.server 8000
```

Then open `http://localhost:8000`.

## Enable the real Cloudinary Upload Widget

1. Create a restricted unsigned upload preset in the `demohost` cloud.
2. Set its name in `window.LIFECYCLE_DEMO_CONFIG.uploadPreset` in `index.html`.
3. The existing **Upload image** control will open the Cloudinary Upload Widget with **Local** and **URL** sources.

For this demo preset, set the destination to a dedicated demo asset folder, assign your starter tags and structured metadata, and configure any AI tagging, moderation, eager transformations, and notification URL there. Restrict allowed file formats, disallow caller-provided public IDs, and avoid using a production preset.

## Read tags and structured metadata

The `worker/` folder contains a small Cloudflare Worker that reads the uploaded asset by its Cloudinary `asset_id` and returns only the data the page needs: tags, contextual metadata, structured metadata, and moderation results. The browser polls it every 2.5 seconds for up to about 38 seconds after a successful upload.

Deploy the Worker and set these Worker secrets:

```sh
cd worker
wrangler secret put CLOUDINARY_CLOUD_NAME
wrangler secret put CLOUDINARY_API_KEY
wrangler secret put CLOUDINARY_API_SECRET
wrangler secret put ALLOWED_ORIGIN
wrangler secret put DEMO_ASSET_FOLDER
wrangler deploy
```

Set `ALLOWED_ORIGIN` to the exact GitHub Pages origin (for example, `https://lucasainsworth-cld.github.io`). For both production and local testing, use `ALLOWED_ORIGINS` instead, with a comma-separated allowlist such as `https://lucasainsworth-cld.github.io,http://localhost:8000`. The Worker only accepts requests made from an allowed origin and only resolves image assets by asset ID. Set `DEMO_ASSET_FOLDER` to the dedicated demo folder after the seed assets have been moved there. Then paste the deployed URL plus `/asset` into `window.LIFECYCLE_DEMO_CONFIG.assetEndpoint` in `index.html`.

The Cloudinary API secret stays exclusively in the Worker. Never add it to `index.html`, the repository, or GitHub Pages settings.

## Generate: live image and video generation

The Worker also fronts the two generation add-ons, because both require the API secret
and neither is available as a delivery-URL transformation.

| Route | Method | Purpose |
| --- | --- | --- |
| `/generate-image` | POST | `image_to_image` generation. Body: `{ "assetId", "category" }`. Synchronous — returns the finished image. |
| `/generate-video` | POST | Submits an `image_to_video` job. Body: `{ "assetId" }`. Returns `{ job: { id, status } }`. |
| `/generate-video/<jobId>` | GET | Polls that job until `status` is `completed` or `failed`. |

**Prompts live in the Worker, not the page.** The browser sends only a category name, so a
tampered client cannot spend generation credits on arbitrary prompt text. Edit the
`imagePrompts` and `videoPrompt` constants at the top of `worker.js` to change them.

Video is generated at 4 seconds, 720p, aspect ratio `auto`. Generated images are stored as
managed assets in the Media Library; set a default upload folder on the product environment
if you want them kept tidy.

Redeploy after changing any of this:

```sh
cd worker
wrangler deploy
```

No new secrets are needed — the generation routes reuse `CLOUDINARY_CLOUD_NAME`,
`CLOUDINARY_API_KEY` and `CLOUDINARY_API_SECRET`.

### Credit protection

Generations are deduplicated per asset (and per category for images) through the Workers
Cache API, so re-entering the Generate stage or reloading the tab reuses the previous
result instead of paying for a new one.

**Caveat:** the Cache API behaves inconsistently on `*.workers.dev` subdomains and may
silently no-op there, so treat this as best-effort. The page also dedupes per session. If
credit burn ever becomes a real problem, bind a KV namespace and swap `readCached` /
`writeCached` to use it — that is the only storage that is durable across colos.
