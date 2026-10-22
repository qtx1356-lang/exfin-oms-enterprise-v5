# EXFIN OMS Video API Worker Deployment and Secrets

This guide deploys the EXFIN OMS video-conferencing API as a Cloudflare Worker and connects the existing Cloudflare Pages frontend to it. **No Android APK rebuild is required** for this backend-only deployment.

## Architecture

Admin panel / existing Android app → Cloudflare Pages `/api/*` proxy → `exfin-oms-video-api` Worker → Firebase (Auth token verification, Firestore, FCM) and Cloudflare Realtime SFU.

The Worker is defined in `worker/video-api/`. Its Wrangler config names the Worker `exfin-oms-video-api` and enables `workers.dev`.

## 1. Configure GitHub Actions deployment secrets

In GitHub, open the repository:

`qtx1356-lang/exfin-oms-enterprise-v5` → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**.

Create these two repository secrets:

- `CLOUDFLARE_API_TOKEN`: a Cloudflare API token with permission to deploy/edit Workers for the correct account. Use the minimum permissions Cloudflare requires for Workers Scripts deployment.
- `CLOUDFLARE_ACCOUNT_ID`: the Cloudflare account ID that owns the Worker.

Do not put secret values in source files, commits, issues, or chat messages.

## 2. Run the Worker deployment workflow

Open **Actions** → **Deploy EXFIN OMS Video API Worker**. Choose **Run workflow** on the `main` branch. The workflow also runs automatically when files under `worker/video-api/**` or the workflow file change on `main`.

Wait for the deployment job to finish successfully. If it fails, open the failed job and read the first error in the deployment step. Common causes include missing/invalid GitHub secrets or a token for the wrong Cloudflare account.

After successful deployment, Cloudflare should show a Worker named:

`exfin-oms-video-api`

Its default URL normally has this form:

`https://exfin-oms-video-api.<your-workers-subdomain>.workers.dev`

Use the exact URL displayed in Cloudflare; do not guess the account subdomain.

## 3. Configure Worker runtime secrets

In Cloudflare Dashboard, open **Workers & Pages** → **exfin-oms-video-api** → **Settings** → **Variables and Secrets** (the labels may vary). Add the following as encrypted secrets where appropriate:

- `REALTIME_SFU_APP_ID`: the Cloudflare Realtime SFU application ID.
- `REALTIME_SFU_BEARER_TOKEN`: the Realtime SFU bearer token. Keep it server-side.
- `FIREBASE_PROJECT_ID`: the Firebase project ID used by this app (confirm the exact project ID in Firebase Console).
- `FIREBASE_SERVICE_ACCOUNT_JSON`: the complete service-account JSON as one secret value. The service account must have the required Firestore access and permission to send Firebase Cloud Messaging messages for the same project.

Optional variable:

- `ALLOWED_ORIGIN`: the exact production Pages origin, for example `https://your-admin-domain.example`. Use the real production origin, without a path. If production and preview origins both need access, configure the Worker’s CORS policy deliberately rather than using a broad wildcard for authenticated application traffic.

Save the secrets and redeploy/restart the Worker if the dashboard prompts you. Never expose the service-account private key or SFU bearer token in the frontend, Android app, or GitHub source code.

## 4. Connect Cloudflare Pages to the Worker

In Cloudflare Dashboard, open **Workers & Pages** → the existing EXFIN OMS Pages project → **Settings** → **Environment variables**.

For the **Production** environment, set:

- Name: `EXFIN_API_ORIGIN`
- Value: the exact HTTPS origin of the deployed Worker, e.g. `https://exfin-oms-video-api.<your-workers-subdomain>.workers.dev`

Use only the origin: no trailing API path, query string, username, or password. Save the setting and trigger a new Pages production deployment so the Pages Function receives it. If Preview deployments also need video calls, configure the variable in Preview separately.

## 5. Verify the deployment

1. Confirm the Worker exists in Cloudflare and the latest GitHub Actions deployment run succeeded.
2. Open the EXFIN OMS admin panel and try the video-conference configuration/call flow.
3. Confirm the previous `API_BACKEND_NOT_CONFIGURED` error is gone.
4. If the error changes to `API_BACKEND_UNREACHABLE`, verify the Worker URL is correct and publicly reachable.
5. If the Worker responds with a Firebase, SFU, or authorization error, inspect the Worker’s logs in Cloudflare and verify the runtime secrets and Firebase service-account permissions.
6. Test that the intended employee receives the incoming-call notification and can join. A successful Worker deployment alone does not prove FCM delivery or media publishing works.

## Important notes

- Do **not** build or distribute a new APK just for this Worker deployment. The existing app calls the Pages API URL, which proxies requests to the Worker.
- Do not create a second backend or expose SFU credentials client-side.
- The Pages proxy currently returns `API_BACKEND_NOT_CONFIGURED` if `EXFIN_API_ORIGIN` is empty, and `API_BACKEND_UNREACHABLE` if the configured origin cannot be reached.
- Keep the Android application ID `com.exfin.oms`, attendance/geofencing implementation, Firebase client configuration, and updater unchanged for this deployment.
