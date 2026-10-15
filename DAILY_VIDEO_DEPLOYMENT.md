# EXFIN OMS Daily.co video conferencing deployment

## Included integration
- Admin/HR/Super Admin/Team Leader can start direct calls to approved employees and group meetings (up to 50 invitees).
- Employees can call active administrators; employees cannot create group meetings.
- Daily rooms are private, expire after two hours, and use room-scoped meeting tokens minted only by the Express backend.
- Incoming call invitations are stored in Firestore and native FCM notifications are sent to registered Android devices. The in-app listener also displays invitations while the app is open.
- The API uses the existing Firebase ID-token verification and Firestore Admin service. No Daily credential is sent to the browser or APK.

## Required Daily account credential
1. Create/sign in to a Daily account at https://dashboard.daily.co/.
2. In the Daily dashboard, open Developers and create/copy a Daily API key.
3. Set the backend environment variable `DAILY_API_KEY` to that value. Store it only in the Express/Cloud Run/Render backend's secret environment configuration. Never set it as `VITE_DAILY_API_KEY`, commit its value, or put it in Google AI Studio/client configuration.
4. A separate Daily domain variable is not required: the room-creation API returns the correct room URL.

## Backend and frontend deployment
- Deploy the existing `server.ts` Express backend with the new routes. The API must be reachable over HTTPS from the Cloudflare Pages admin UI and native Android app.
- Configure the Cloudflare Pages build variable `VITE_API_BASE_URL` to the HTTPS origin of that backend (without an extra trailing slash). If the frontend and API are served from the same origin, keep it empty.
- The backend must have Firebase Admin credentials for the existing Firebase project (the current `FIREBASE_SERVICE_ACCOUNT_KEY` / Google application credentials configuration). Do not paste the service-account JSON into source control.
- Deploy the updated `firestore.rules`. Client access is read-only for a user's own incoming/outgoing call invitations and calls in which that UID participates; call creation, status changes, Daily tokens, and device-token storage are server-only.
- Native incoming push notifications require the existing Firebase Cloud Messaging setup and the Android app to have notification permission. The new backend stores device tokens in `push_device_tokens`; the existing client registration flow posts to the added register/unregister routes.
- Build/deploy the Cloudflare Pages frontend after setting `VITE_API_BASE_URL`. The API backend and Pages frontend are separate deployment targets; a successful Android APK workflow alone does not deploy the admin website or API.

## Verification checklist
1. Confirm `GET /api/health` responds from the HTTPS backend.
2. Confirm `DAILY_API_KEY` is configured in the backend's secret environment and restart/redeploy the service.
3. Sign in as an administrator, start a direct call to an approved employee, and verify the employee receives an incoming notification and can answer.
4. Test employee-to-admin calls, group meetings with multiple invitees, decline, leave, and expiry.
5. Verify no Daily API key is present in the built frontend assets, APK, repository history, or client environment variables.
6. Confirm the deployed Firestore rules permit reading only the intended call documents and deny client writes.

## Security notes
- API tokens are short-lived and scoped to a private room. Room expiry is a fallback if a client exits unexpectedly.
- Invite notifications contain a call ID only; they do not contain a Daily meeting token.
- Never log provider authorization headers, Daily API keys, or meeting tokens.
