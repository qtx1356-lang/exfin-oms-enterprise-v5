/**
 * Utility to sanitize payloads before sending to Firestore.
 * Recursively removes any keys with `undefined` values, which Firestore updateDoc/setDoc rejects.
 */
export function sanitizeFirestorePayload<T extends Record<string, any>>(obj: T): T {
  const clean: Record<string, any> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) {
      if (value !== null && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date)) {
        clean[key] = sanitizeFirestorePayload(value);
      } else {
        clean[key] = value;
      }
    }
  }
  return clean as T;
}
