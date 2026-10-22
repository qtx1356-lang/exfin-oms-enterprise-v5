# EXFIN OMS Video API Worker

This Worker is the application backend for the Cloudflare Realtime SFU video conference feature. It replaces the unavailable Express backend for the video API only. The existing attendance, Firebase Auth client, Android updater, and other application APIs are unchanged.

## Worker

Worker name: `exfin-oms-video-api`

Deploy from the repository root:

```bash
npx wrangler deploy --config worker/video-api/wrangler.jsonc
```

The GitHub workflow `.github/workflows/cloudflare-video-api.yml` can also deploy it. That workflow requires the GitHub Actions secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`.

## Cloudflare Worker secrets/variables

Configure these on the `exfin-oms-video-api` Worker. Do not commit their values.

Required:

- `REALTIME_SFU_APP_ID` — Cloudflare Realtime SFU App ID.
- `REALTIME_SFU_BEARER_TOKEN` — Cloudflare Realtime SFU App Secret/bearer token.
- `FIREBASE_PROJECT_ID` — `exfin-oms-production`.
- `FIREBASE_SERVICE_ACCOUNT_JSON` — the Firebase service-account JSON for the project, stored as a Worker secret.

Optional:

- `ALLOWED_ORIGIN` — the exact EXFIN OMS Pages origin. If omitted, the Worker echoes the request Origin.

The SFU secret remains backend-only. Cloudflare's Realtime documentation explicitly requires the App Secret to stay on trusted backend infrastructure. The Worker also keeps Firebase service-account credentials backend-only.

## Pages API gateway

The existing Pages Function remains the public `/api/*` gateway. Set the Pages environment variable `EXFIN_API_ORIGIN` to the HTTPS Worker origin, for example:

`https://exfin-oms-video-api.<your-workers-subdomain>.workers.dev`

Do not put a trailing path, credentials, query string, or fragment in this value.

After the Worker is deployed and `EXFIN_API_ORIGIN` is set on the Pages production environment, the existing `cloudflareSfuVideoService.ts` calls continue to use `/api/video-conference/...` without exposing SFU credentials.

## Firebase permissions

The service account used by `FIREBASE_SERVICE_ACCOUNT_JSON` needs permission to read/write the Firestore collections used by video calls and to send FCM messages for the Firebase project. The Worker uses Google OAuth2 service-account tokens rather than the Node-only Firebase Admin SDK.

Collections used by the video Worker:

- `admin_users`
- `video_conferences`
- `video_conference_publications`
- `push_device_tokens`

## Incoming Android call alerts

When an approved admin creates a conference, the Worker stores the invitation and sends a high-priority FCM data/notification message to the invited users' registered device tokens. This is the server-side step that was missing when the Pages frontend had no reachable application backend.
