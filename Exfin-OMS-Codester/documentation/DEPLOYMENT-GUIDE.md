# Exfin OMS — Deployment Guide

This guide describes how to deploy Exfin OMS to Cloud Run, Netlify, Vercel, or custom VPS servers.

---

## 1. Node Server / Docker / Cloud Run Deployment (Full-Stack)

Exfin OMS includes an integrated Express backend server (`server.ts`) that serves static client assets in production and proxies API/server routes.

### Build Command
```bash
npm run build
```

### Start Command
```bash
npm start
```

### Dockerfile Template
```dockerfile
FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY dist ./dist

ENV PORT=3000
ENV NODE_ENV=production

EXPOSE 3000

CMD ["node", "dist/server.cjs"]
```

---

## 2. Environment Variables in Production

Ensure the following environment variables are set in your hosting platform:

```env
NODE_ENV=production
PORT=3000
VITE_FIREBASE_API_KEY=your_api_key
VITE_FIREBASE_AUTH_DOMAIN=your_project_id.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your_project_id
VITE_FIREBASE_STORAGE_BUCKET=your_project_id.firebasestorage.app
VITE_FIREBASE_MESSAGING_SENDER_ID=your_messaging_sender_id
VITE_FIREBASE_APP_ID=your_app_id
```

---

## 3. Netlify / Vercel Static Hosting (Single Page Application)

If hosting client static files on Netlify or Vercel:

1. **Build Command**: `npm run build`
2. **Publish Directory**: `dist`
3. **SPA Redirects**: Create `public/_redirects` file:
```
/*    /index.html   200
```

---

## 4. HTTPS & Location Services Requirement

> **IMPORTANT**: Modern web browsers and mobile devices restrict access to GPS location APIs (`navigator.geolocation`) unless the application is served over a secure **HTTPS** connection (or `localhost`). Ensure SSL/TLS certificates are active on your production domain.
