// High-Precision Diagnostic Startup Performance Logger
declare global {
  interface Window {
    __APP_START_TIME__?: number;
  }
}

if (typeof window !== 'undefined' && !window.__APP_START_TIME__) {
  window.__APP_START_TIME__ = performance.now();
}

const loggedTags = new Set<string>();

export const logStartupTag = (tag: string, extraDetails?: string): void => {
  const now = performance.now();
  const startTime = window.__APP_START_TIME__ || now;
  const elapsedMs = Math.round((now - startTime) * 100) / 100;
  const isoTime = new Date().toISOString();

  // Keep log distinct and scannable
  const detailStr = extraDetails ? ` - ${extraDetails}` : '';
  console.log(`[STARTUP_PERF] [${tag}] +${elapsedMs}ms (${isoTime})${detailStr}`);
  loggedTags.add(tag);
};

// Immediately log process start upon module import
logStartupTag('APP_PROCESS_START', 'JS Bundle loaded & application process initialized');
