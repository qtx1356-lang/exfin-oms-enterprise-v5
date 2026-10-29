# Google Meet + WhatsApp setup for EXFIN OMS

The admin video-conference dialog now includes a Google Meet workflow. It creates a Google Calendar event with a Meet conference link and then opens WhatsApp for each selected employee. The old EXFIN OMS in-app call alert is not used to deliver these meeting invitations.

## Required Google configuration

1. In Google Cloud Console, select or create a project owned by the organization.
2. Enable **Google Calendar API**.
3. Configure the OAuth consent screen. Add the administrators who will create meetings as test users while the app remains in Testing; publish/verify the consent configuration as appropriate for your organization before broad rollout.
4. Create an **OAuth client ID** of type **Web application**.
5. Add the exact deployed EXFIN OMS origin(s) under **Authorized JavaScript origins** (for example, the production Cloudflare Pages origin). Do not add URL paths.
6. Add the client ID as the Cloudflare Pages environment variable **VITE_GOOGLE_CLIENT_ID** for Production (and Preview if needed), then redeploy the Pages application.
7. On first use, an admin selects employees and clicks **Create Google Meet**, then grants Calendar event permission to the Google account that should own the meeting.

The client ID is public configuration; never put a Google OAuth client secret in frontend code or a VITE_ variable.

## How it works

- EXFIN OMS requests a Google OAuth access token in the admin's browser using Google Identity Services.
- It creates a 60-minute Google Calendar event with `conferenceDataVersion=1` and a Meet conference request.
- Employees with email addresses are included as calendar attendees. Google Calendar may send them calendar invitations.
- After a Meet URL is returned, the dialog lists the selected employees with individual WhatsApp actions.
- WhatsApp opens a prefilled message for the employee's stored phone number when available. A 10-digit Indian mobile number is normalized with country code 91; other numbers are used as stored. If no phone number is available, WhatsApp opens its contact picker with the prefilled message.

## WhatsApp limitation

WhatsApp does not permit a website to silently send messages or automatically dispatch one message to several chats. The administrator must confirm sending each employee message in WhatsApp. The meeting link can also be copied and shared manually.

## Employee contact data

The employee recipient API checks these registration fields in order for a WhatsApp number: `whatsappNumber`, `whatsapp`, `phoneNumber`, `mobileNumber`, `mobile`, `phone`. If your registration documents use another field name, add it to `functions/api/video/recipients.ts` before relying on direct-to-number WhatsApp links.