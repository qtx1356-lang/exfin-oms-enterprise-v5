export async function onRequest(context: { request: Request; env: { EXFIN_API_ORIGIN?: string } }) {
  const { request, env } = context;
  const corsHeaders = {
    "Access-Control-Allow-Origin": request.headers.get("Origin") || "*",
    "Access-Control-Allow-Headers": "Authorization, Content-Type, X-Requested-With, Accept, Origin",
    "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
    "Vary": "Origin",
  };

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  // Pages Functions do not run the Express server in server.ts. Forward API calls
  // to that server only when an administrator explicitly configures its HTTPS origin.
  const configuredOrigin = String(env.EXFIN_API_ORIGIN || "").trim();
  if (!configuredOrigin) {
    return new Response(JSON.stringify({
      success: false,
      error: "API backend is not configured for this Cloudflare Pages deployment. Set EXFIN_API_ORIGIN to the HTTPS origin of the running EXFIN OMS API server.",
      code: "API_BACKEND_NOT_CONFIGURED"
    }), {
      status: 503,
      headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" }
    });
  }

  let origin: URL;
  try {
    origin = new URL(configuredOrigin);
    if (origin.protocol !== "https:" || origin.username || origin.password || origin.search || origin.hash || origin.pathname !== "/") {
      throw new Error("invalid origin");
    }
  } catch {
    return new Response(JSON.stringify({
      success: false,
      error: "EXFIN_API_ORIGIN must be an HTTPS origin, for example https://api.example.com.",
      code: "INVALID_API_BACKEND_ORIGIN"
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" }
    });
  }

  const incomingUrl = new URL(request.url);
  const targetUrl = new URL(incomingUrl.pathname + incomingUrl.search, origin);
  const headers = new Headers(request.headers);
  headers.delete("host");
  headers.delete("content-length");
  headers.delete("cookie");

  try {
    const upstream = await fetch(targetUrl.toString(), {
      method: request.method,
      headers,
      body: ["GET", "HEAD"].includes(request.method) ? undefined : request.body,
      redirect: "manual"
    });
    const responseHeaders = new Headers(upstream.headers);
    for (const [key, value] of Object.entries(corsHeaders)) responseHeaders.set(key, value);
    responseHeaders.set("Cache-Control", "no-store");
    return new Response(upstream.body, { status: upstream.status, statusText: upstream.statusText, headers: responseHeaders });
  } catch {
    return new Response(JSON.stringify({
      success: false,
      error: "The configured EXFIN OMS API server could not be reached.",
      code: "API_BACKEND_UNREACHABLE"
    }), {
      status: 502,
      headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" }
    });
  }
}
