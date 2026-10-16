const crypto = require('crypto');

// The frontend has already moved to LiveKit, while server.ts still exposes the
// old Daily-shaped provider helper internally. This bridge lets the existing
// authenticated API keep its public contract without reworking unrelated server
// routes: Daily-shaped room/token requests are translated to LiveKit at runtime.
// It is loaded before server.ts by serverWrapper.ts.

const originalFetch = globalThis.fetch;
const dailyApiKey = () => process.env.LIVEKIT_API_KEY || process.env.DAILY_API_KEY || '';
const liveKitSecret = () => process.env.LIVEKIT_API_SECRET || '';

function liveKitWsUrl() {
  const configured = String(process.env.LIVEKIT_URL || '').trim();
  if (!configured) return '';
  if (configured.startsWith('wss://') || configured.startsWith('ws://')) return configured;
  if (configured.startsWith('https://')) return `wss://${configured.slice(8)}`;
  if (configured.startsWith('http://')) return `ws://${configured.slice(7)}`;
  return `wss://${configured}`;
}

function base64url(value) {
  return Buffer.from(value).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function createLiveKitToken({ roomName, identity, name, exp }) {
  const apiKey = process.env.LIVEKIT_API_KEY || '';
  const secret = liveKitSecret();
  if (!apiKey || !secret) throw new Error('LIVEKIT_NOT_CONFIGURED');
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = base64url(JSON.stringify({
    iss: apiKey,
    sub: String(identity || '').slice(0, 128),
    name: String(name || '').slice(0, 80),
    nbf: now,
    exp: Math.max(now + 60, Number(exp) || now + 7200),
    video: {
      room: String(roomName || ''),
      roomJoin: true,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
    },
  }));
  const signingInput = `${header}.${payload}`;
  const signature = crypto.createHmac('sha256', secret).update(signingInput).digest('base64url');
  return `${signingInput}.${signature}`;
}

function jsonResponse(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function isDailyApi(url) {
  try {
    return new URL(url).hostname === 'api.daily.co';
  } catch (_) {
    return false;
  }
}

globalThis.fetch = async function exfinVideoProviderFetch(input, init) {
  const rawUrl = typeof input === 'string' ? input : input?.url;
  if (!rawUrl || !isDailyApi(rawUrl)) return originalFetch(input, init);

  const path = new URL(rawUrl).pathname.replace(/^\/v1\/?/, '');
  const method = String(init?.method || (typeof input === 'object' ? input.method : 'GET') || 'GET').toUpperCase();
  let body = {};
  try { body = init?.body ? JSON.parse(String(init.body)) : {}; } catch (_) {}

  const roomUrl = liveKitWsUrl();
  if (!roomUrl || !liveKitSecret() || !process.env.LIVEKIT_API_KEY) {
    throw new Error('LIVEKIT_NOT_CONFIGURED');
  }

  if (method === 'POST' && path === 'rooms') {
    const roomName = String(body.name || `exfin-${crypto.randomBytes(12).toString('hex')}`);
    return jsonResponse({ name: roomName, url: roomUrl });
  }

  if (method === 'POST' && path === 'meeting-tokens') {
    const properties = body.properties || {};
    return jsonResponse({
      token: createLiveKitToken({
        roomName: properties.room_name,
        identity: properties.user_id,
        name: properties.user_name,
        exp: properties.exp,
      }),
    });
  }

  if (method === 'DELETE' && path.startsWith('rooms/')) {
    return jsonResponse({});
  }

  return jsonResponse({ error: 'Unsupported provider compatibility request.' }, 404);
};

// The legacy server.ts checks DAILY_API_KEY before reaching its provider helper.
// Set a non-secret marker only; all real credentials remain LiveKit credentials.
if (!process.env.DAILY_API_KEY && process.env.LIVEKIT_API_KEY && process.env.LIVEKIT_API_SECRET) {
  process.env.DAILY_API_KEY = 'livekit-compatibility-mode';
}
