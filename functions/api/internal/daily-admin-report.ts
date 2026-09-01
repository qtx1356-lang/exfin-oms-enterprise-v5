// @ts-ignore
import { connect } from 'cloudflare:sockets';

// Helper to convert PEM private key to binary PKCS#8 ArrayBuffer
function pemToPkcs8(pem: string): ArrayBuffer {
  const pemHeader = "-----BEGIN PRIVATE KEY-----";
  const pemFooter = "-----END PRIVATE KEY-----";
  let base64 = pem.trim();
  if (base64.startsWith(pemHeader)) {
    base64 = base64.substring(pemHeader.length);
  }
  if (base64.endsWith(pemFooter)) {
    base64 = base64.substring(0, base64.length - pemFooter.length);
  }
  base64 = base64.replace(/\s+/g, "");
  
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
}

// Helper to generate Google OAuth2 Access Token using Web Crypto RS256 inside Cloudflare Edge
async function getGoogleAccessToken(serviceAccountJson: string): Promise<string> {
  const sa = JSON.parse(serviceAccountJson);
  const privateKeyPem = sa.private_key;
  const clientEmail = sa.client_email;
  const tokenUrl = "https://oauth2.googleapis.com/token";

  const privateKeyBuffer = pemToPkcs8(privateKeyPem);

  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8",
    privateKeyBuffer,
    {
      name: "RSASSA-PKCS1-v1_5",
      hash: { name: "SHA-256" },
    },
    false,
    ["sign"]
  );

  const header = {
    alg: "RS256",
    typ: "JWT"
  };

  const nowSecs = Math.floor(Date.now() / 1000);
  const payload = {
    iss: clientEmail,
    sub: clientEmail,
    scope: "https://www.googleapis.com/auth/datastore",
    aud: tokenUrl,
    exp: nowSecs + 3600,
    iat: nowSecs
  };

  const textEncoder = new TextEncoder();
  const base64UrlEncode = (str: string) => {
    const bytes = textEncoder.encode(str);
    let binString = "";
    for (let i = 0; i < bytes.byteLength; i++) {
      binString += String.fromCharCode(bytes[i]);
    }
    return btoa(binString)
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=/g, "");
  };

  const headerEncoded = base64UrlEncode(JSON.stringify(header));
  const payloadEncoded = base64UrlEncode(JSON.stringify(payload));
  const stringToSign = `${headerEncoded}.${payloadEncoded}`;

  const signatureBuffer = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    cryptoKey,
    textEncoder.encode(stringToSign)
  );

  const signatureBytes = new Uint8Array(signatureBuffer);
  let signatureBinString = "";
  for (let i = 0; i < signatureBytes.byteLength; i++) {
    signatureBinString += String.fromCharCode(signatureBytes[i]);
  }
  const signatureEncoded = btoa(signatureBinString)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");

  const assertion = `${stringToSign}.${signatureEncoded}`;

  const response = await fetch(tokenUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${assertion}`
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Google OAuth exchange failed: ${errText}`);
  }

  const tokenData = await response.json() as any;
  return tokenData.access_token;
}

function parseTimeToMinutes(timeStr: string): number {
  const match = timeStr.trim().match(/^(\d+):(\d+)\s*(AM|PM)$/i);
  if (!match) return 420; // Default to 07:00 AM
  let hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  const ampm = match[3].toUpperCase();
  
  if (ampm === 'PM' && hours < 12) hours += 12;
  if (ampm === 'AM' && hours === 12) hours = 0;
  
  return hours * 60 + minutes;
}

function getPreviousKolkataDateString(): string {
  try {
    const now = new Date();
    const kolkataStr = now.toLocaleString("en-US", { timeZone: "Asia/Kolkata" });
    const d = new Date(kolkataStr);
    d.setDate(d.getDate() - 1);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  } catch (e) {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return d.toISOString().split('T')[0];
  }
}

function unwrapFields(fields: any): any {
  if (!fields) return {};
  const res: any = {};
  for (const k in fields) {
    res[k] = unwrapValue(fields[k]);
  }
  return res;
}

function unwrapValue(val: any): any {
  if (!val) return null;
  if ('stringValue' in val) return val.stringValue;
  if ('booleanValue' in val) return val.booleanValue;
  if ('integerValue' in val) return parseInt(val.integerValue, 10);
  if ('doubleValue' in val) return val.doubleValue;
  if ('arrayValue' in val) return (val.arrayValue?.values || []).map(unwrapValue);
  if ('mapValue' in val) return unwrapFields(val.mapValue?.fields);
  if ('timestampValue' in val) return val.timestampValue;
  if ('nullValue' in val) return null;
  return val;
}

export async function onRequest(context: any) {
  const { request, env } = context;

  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { 
      status: 405, 
      headers: { 'Content-Type': 'application/json' } 
    });
  }

  const cronSecret = env.CRON_SECRET;
  if (!cronSecret) {
    return new Response(JSON.stringify({ error: 'Server Configuration Error: CRON_SECRET is not configured.' }), { 
      status: 500, 
      headers: { 'Content-Type': 'application/json' } 
    });
  }

  const authHeader = request.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: 'Unauthorized: Missing or invalid authorization header.' }), { 
      status: 401, 
      headers: { 'Content-Type': 'application/json' } 
    });
  }

  const token = authHeader.split('Bearer ')[1].trim();
  if (token !== cronSecret) {
    return new Response(JSON.stringify({ error: 'Unauthorized: Invalid token.' }), { 
      status: 401, 
      headers: { 'Content-Type': 'application/json' } 
    });
  }

  const serviceAccountKey = env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (!serviceAccountKey) {
    return new Response(JSON.stringify({ error: 'Server Configuration Error: FIREBASE_SERVICE_ACCOUNT_KEY is not configured.' }), { 
      status: 500, 
      headers: { 'Content-Type': 'application/json' } 
    });
  }

  const projectId = env.FIREBASE_PROJECT_ID || 'exfin-oms-production';

  try {
    // 1. Get Google OAuth access token for firestore REST API
    const accessToken = await getGoogleAccessToken(serviceAccountKey);

    // 2. Load settings configuration
    const configUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/system_settings/daily_admin_report`;
    const configRes = await fetch(configUrl, {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });

    let config = {
      enabled: true,
      sendTime: '07:00 AM'
    };

    if (configRes.ok) {
      const fsData = await configRes.json() as any;
      config.enabled = fsData.fields?.enabled?.booleanValue ?? true;
      config.sendTime = fsData.fields?.sendTime?.stringValue ?? '07:00 AM';
    }

    if (!config.enabled) {
      return new Response(JSON.stringify({
        ok: true,
        action: 'SKIP',
        reason: 'Scheduler is disabled in configuration settings.',
        reportDate: getPreviousKolkataDateString()
      }), { headers: { 'Content-Type': 'application/json' } });
    }

    // 3. Time zone calculations in Asia/Kolkata
    const now = new Date();
    const kolkataStr = now.toLocaleString("en-US", { timeZone: "Asia/Kolkata" });
    const kolkataDate = new Date(kolkataStr);
    const currentHours = kolkataDate.getHours();
    const currentMinutes = kolkataDate.getMinutes();
    const currentTotalMinutes = currentHours * 60 + currentMinutes;

    const sendTimeMinutes = parseTimeToMinutes(config.sendTime);

    const targetDate = getPreviousKolkataDateString();

    if (currentTotalMinutes < sendTimeMinutes) {
      const formatTime = (h: number, m: number) => {
        const p = h >= 12 ? 'PM' : 'AM';
        const hr = h % 12 || 12;
        const mn = String(m).padStart(2, '0');
        return `${hr}:${mn} ${p}`;
      };
      return new Response(JSON.stringify({
        ok: true,
        action: 'SKIP',
        reason: `Current time (${formatTime(currentHours, currentMinutes)}) is before the configured daily send time (${config.sendTime}) in Asia/Kolkata.`,
        reportDate: targetDate
      }), { headers: { 'Content-Type': 'application/json' } });
    }

    // 4. Duplicate protection: check if the report log already exists in Firestore
    const logUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/daily_admin_reports/${targetDate}`;
    const logRes = await fetch(logUrl, {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });

    if (logRes.ok) {
      return new Response(JSON.stringify({
        ok: true,
        action: 'SKIP',
        reason: `Daily report for ${targetDate} has already been sent successfully.`,
        reportDate: targetDate
      }), { headers: { 'Content-Type': 'application/json' } });
    }

    // 5. Trigger email dispatch!
    // We reuse the existing, production-tested email endpoint by calling it directly
    const triggerUrl = new URL(request.url);
    triggerUrl.pathname = '/api/admin/daily-report/send-yesterday';

    const triggerResponse = await fetch(triggerUrl.toString(), {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ date: targetDate })
    });

    if (!triggerResponse.ok) {
      const errBody = await triggerResponse.json().catch(() => ({ error: 'Unknown Error' })) as any;
      throw new Error(`Report compilation or dispatch failed: ${errBody.error || triggerResponse.statusText}`);
    }

    const resData = await triggerResponse.json() as any;

    return new Response(JSON.stringify({
      ok: true,
      action: 'SEND',
      reason: `Daily report for ${targetDate} was successfully generated and dispatched.`,
      reportDate: targetDate,
      details: resData
    }), { headers: { 'Content-Type': 'application/json' } });

  } catch (err: any) {
    return new Response(JSON.stringify({
      ok: false,
      error: err.message || String(err)
    }), { 
      status: 500, 
      headers: { 'Content-Type': 'application/json' } 
    });
  }
}
