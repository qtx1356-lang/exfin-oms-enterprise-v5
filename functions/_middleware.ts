interface PagesContext {
  request: Request;
  next: () => Promise<Response>;
}

export async function onRequest(context: PagesContext): Promise<Response> {
  const userAgent = context.request.headers.get('user-agent') || '';

  // Detect Median or legacy GoNative User-Agents
  if (/median|gonative/i.test(userAgent)) {
    console.log('[EXFIN ACCESS CONTROL] Median/GoNative request blocked');
    return new Response(
      'Access through the legacy mobile application is no longer supported. Please use the official EXFIN OMS application or web portal.',
      {
        status: 403,
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
          'Cache-Control': 'no-store, max-age=0'
        }
      }
    );
  }

  return await context.next();
}
