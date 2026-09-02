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
  let sa: any;
  try {
    sa = typeof serviceAccountJson === 'object' ? serviceAccountJson : JSON.parse(serviceAccountJson);
  } catch (e) {
    try {
      sa = JSON.parse(atob(serviceAccountJson.trim()));
    } catch (e2) {
      throw new Error('Invalid FIREBASE_SERVICE_ACCOUNT_KEY JSON format');
    }
  }

  let privateKeyPem: string = sa.private_key || '';
  if (!privateKeyPem) {
    throw new Error('Service account JSON is missing private_key field');
  }
  // Replace literal escaped newlines if present from environment variable storage
  privateKeyPem = privateKeyPem.replace(/\\n/g, '\n');

  const clientEmail = sa.client_email;
  if (!clientEmail) {
    throw new Error('Service account JSON is missing client_email field');
  }

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

export async function onRequest(context: any) {
  const { request, env } = context;

  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ success: false, message: 'Method not allowed' }), { 
      status: 405, 
      headers: { 'Content-Type': 'application/json' } 
    });
  }

  const cronSecret = env.CRON_SECRET;
  if (!cronSecret) {
    return new Response(JSON.stringify({ success: false, message: 'Server Configuration Error: CRON_SECRET is not configured in Cloudflare environment.' }), { 
      status: 500, 
      headers: { 'Content-Type': 'application/json' } 
    });
  }

  const authHeader = request.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ success: false, message: 'Unauthorized: Missing or invalid Authorization header.' }), { 
      status: 401, 
      headers: { 'Content-Type': 'application/json' } 
    });
  }

  const token = authHeader.split('Bearer ')[1].trim();
  if (token !== cronSecret) {
    return new Response(JSON.stringify({ success: false, message: 'Unauthorized: Invalid CRON_SECRET token.' }), { 
      status: 401, 
      headers: { 'Content-Type': 'application/json' } 
    });
  }

  const serviceAccountKey = env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (!serviceAccountKey) {
    return new Response(JSON.stringify({ success: false, message: 'Server Configuration Error: FIREBASE_SERVICE_ACCOUNT_KEY is not configured.' }), { 
      status: 500, 
      headers: { 'Content-Type': 'application/json' } 
    });
  }

  const projectId = env.FIREBASE_PROJECT_ID || 'exfin-oms-production';

  try {
    const body = await request.json().catch(() => ({}));
    const isForce = body.force === true || body.isManual === true || body.source === 'github-actions-dispatch';
    const targetDate = (body.date && typeof body.date === 'string' && body.date.trim()) 
      ? body.date.trim() 
      : getPreviousKolkataDateString();

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

    if (!config.enabled && !isForce) {
      return new Response(JSON.stringify({
        success: true,
        action: 'SKIP',
        message: 'Scheduler is disabled in configuration settings.',
        reportDate: targetDate
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    // 3. Duplicate protection: check if the report log already exists with SENT status in Firestore
    if (!isForce) {
      const logUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/daily_admin_reports/${targetDate}`;
      const logRes = await fetch(logUrl, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      });

      if (logRes.ok) {
        const logData = await logRes.json() as any;
        const existingStatus = logData.fields?.status?.stringValue;
        if (existingStatus === 'SENT') {
          return new Response(JSON.stringify({
            success: true,
            action: 'SKIP',
            message: `Daily report for ${targetDate} has already been sent successfully.`,
            reportDate: targetDate
          }), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }
      }
    }

    // 4. Trigger the existing, production-tested email endpoint
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

    const resData = await triggerResponse.json().catch(() => ({}));

    if (!triggerResponse.ok || resData.success === false) {
      const errorMsg = resData.error || triggerResponse.statusText || 'Report compilation or dispatch failed';
      return new Response(JSON.stringify({
        success: false,
        message: 'Daily admin report failed',
        error: errorMsg,
        stage: resData.stage,
        reportDate: targetDate
      }), { 
        status: 500, 
        headers: { 'Content-Type': 'application/json' } 
      });
    }

    return new Response(JSON.stringify({
      success: true,
      action: 'SEND',
      message: 'Daily admin report sent successfully',
      reportDate: targetDate,
      recipientCount: resData.recipientCount,
      recipients: resData.recipients,
      messageId: resData.messageId,
      stats: resData.stats
    }), { 
      status: 200, 
      headers: { 'Content-Type': 'application/json' } 
    });

  } catch (err: any) {
    return new Response(JSON.stringify({
      success: false,
      message: 'Daily admin report failed',
      error: err.message || String(err)
    }), { 
      status: 500, 
      headers: { 'Content-Type': 'application/json' } 
    });
  }
}

