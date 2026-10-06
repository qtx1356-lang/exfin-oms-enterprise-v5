/**
 * Detects whether the current client is running inside the legacy Median.co or GoNative wrapper app.
 * Does NOT classify standard browsers, PWA, or official EXFIN OMS Capacitor Android WebView as Median.
 */
export function isMedianApp(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  return /median|gonative/i.test(ua);
}
