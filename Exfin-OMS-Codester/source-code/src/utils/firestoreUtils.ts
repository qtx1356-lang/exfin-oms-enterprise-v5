/**
 * Utility to sanitize payloads before sending to Firestore.
 * Recursively removes any keys or array elements with `undefined` values,
 * which Firestore updateDoc/setDoc rejects.
 */
export function sanitizeFirestorePayload<T extends Record<string, any>>(obj: T): T {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }

  if (obj instanceof Date) {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj
      .filter((item) => item !== undefined)
      .map((item) => {
        if (item !== null && typeof item === 'object' && !(item instanceof Date)) {
          return sanitizeFirestorePayload(item);
        }
        return item;
      }) as unknown as T;
  }

  const clean: Record<string, any> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) {
      if (value !== null && typeof value === 'object' && !(value instanceof Date)) {
        if (Array.isArray(value)) {
          clean[key] = value
            .filter((item) => item !== undefined)
            .map((item) => {
              if (item !== null && typeof item === 'object' && !(item instanceof Date)) {
                return sanitizeFirestorePayload(item);
              }
              return item;
            });
        } else {
          clean[key] = sanitizeFirestorePayload(value);
        }
      } else {
        clean[key] = value;
      }
    }
  }
  return clean as T;
}
