/**
 * EXFIN OMS — Central Precise Address Formatter & Geocoding Service
 * 
 * AUTHORITATIVE LOCATION RULE:
 * Coordinates (latitude + longitude) are the source of truth.
 * Format reverse-geocoded response into a precise, human-readable address:
 * "House/Building, Road/Street, Locality, City, District, State, PIN"
 */

export const isGenericFallbackAddress = (str: string | null | undefined): boolean => {
  if (!str) return true;
  const lower = str.trim().toLowerCase();
  return (
    lower === 'raniganj hq' ||
    lower === 'location name unavailable' ||
    lower === 'location unavailable' ||
    lower === 'pending checkout' ||
    lower === 'pending' ||
    lower === 'general' ||
    lower === 'home' ||
    lower === 'on site' ||
    lower === 'field' ||
    lower === 'offline' ||
    lower === 'unresolved'
  );
};

/**
 * Format raw parts into a clean, non-redundant, comma-separated address string.
 */
export const cleanAndCombineAddressParts = (
  parts: (string | null | undefined)[],
  explicitPostcode?: string | null
): string | null => {
  const seen = new Set<string>();
  const validParts: string[] = [];
  let foundPostcode: string | null = explicitPostcode ? String(explicitPostcode).trim() : null;

  for (const item of parts) {
    if (!item || typeof item !== 'string') continue;
    const trimmed = item.trim();
    if (!trimmed) continue;

    const lower = trimmed.toLowerCase();

    // Skip country names, plus codes, coordinates, or generic error phrases
    if (
      lower === 'india' ||
      lower === 'in' ||
      lower === 'united states' ||
      lower.includes('plus code') ||
      /^[a-z0-9]{4}\+[a-z0-9]{2,}/i.test(trimmed) ||
      /^[-+]?\d+\.\d+/.test(trimmed) ||
      lower.includes('location unavailable') ||
      lower.includes('location name unavailable') ||
      lower === 'offline'
    ) {
      continue;
    }

    // Check if item is purely a 5 or 6 digit PIN / postal code
    if (/^\d{5,6}$/.test(trimmed)) {
      if (!foundPostcode) {
        foundPostcode = trimmed;
      }
      continue;
    }

    // Deduplication check: avoid exact match or substring repetition
    let isDuplicate = false;
    for (const existing of seen) {
      if (existing === lower || existing.includes(lower) || lower.includes(existing)) {
        isDuplicate = true;
        break;
      }
    }

    if (!isDuplicate) {
      seen.add(lower);
      validParts.push(trimmed);
    }
  }

  if (validParts.length === 0) return null;

  let mainAddress = validParts.join(', ');

  // Append PIN / postal code if available (e.g. "West Bengal - 713347")
  if (foundPostcode) {
    mainAddress += ` - ${foundPostcode}`;
  }

  return mainAddress;
};

/**
 * Central Address Formatter
 * Formats reverse geocoding data objects (OSM Nominatim, Android Geocoder, Capacitor, BigDataCloud)
 * or raw strings into a precise, structured address.
 */
export const formatPreciseAddress = (addressData: any): string | null => {
  if (!addressData) return null;

  // 1. Raw string input
  if (typeof addressData === 'string') {
    const rawString = addressData.trim();
    if (
      !rawString ||
      rawString.toLowerCase().includes('unavailable') ||
      rawString.toLowerCase() === 'offline'
    ) {
      return null;
    }
    const parts = rawString.split(',').map((p) => p.trim()).filter(Boolean);
    return cleanAndCombineAddressParts(parts);
  }

  if (typeof addressData !== 'object') return null;

  const addr = addressData.address || addressData;

  // Extract structured address components in priority order:
  // 1. house_number / building_number
  // 2. building / premises / featureName
  // 3. road / street / thoroughfare
  // 4. neighbourhood / suburb / subLocality
  // 5. locality / village / town / city
  // 6. district / subAdminArea / county
  // 7. state / adminArea / principalSubdivision
  // 8. postcode / PIN
  const houseNumber: string | null =
    addr.house_number ||
    addr.houseNumber ||
    addr.subThoroughfare ||
    addr.building_number ||
    null;

  const building: string | null =
    addr.building ||
    addr.premises ||
    (addr.featureName &&
    addr.featureName !== houseNumber &&
    addr.featureName !== addr.thoroughfare &&
    addr.featureName !== addr.road
      ? addr.featureName
      : null);

  const road: string | null =
    addr.road ||
    addr.street ||
    addr.thoroughfare ||
    addr.pedestrian ||
    addr.footway ||
    null;

  const neighbourhood: string | null =
    addr.neighbourhood ||
    addr.suburb ||
    addr.subLocality ||
    addr.residential ||
    addr.quarter ||
    addr.city_district ||
    (addr.localityInfo?.administrative?.find(
      (a: any) => a.order === 5 || a.order === 4
    )?.name) ||
    null;

  const locality: string | null =
    addr.locality ||
    addr.city ||
    addr.town ||
    addr.village ||
    addr.municipality ||
    (addr.localityInfo?.administrative?.find(
      (a: any) => a.order === 3 || a.order === 2
    )?.name) ||
    null;

  const district: string | null =
    addr.district ||
    addr.subAdminArea ||
    addr.state_district ||
    addr.county ||
    null;

  const state: string | null =
    addr.state ||
    addr.adminArea ||
    addr.principalSubdivision ||
    addr.province ||
    null;

  const postcode: string | null =
    addr.postcode ||
    addr.postalCode ||
    addr.postal_code ||
    addr.zip ||
    null;

  const rawParts = [
    houseNumber,
    building,
    road,
    neighbourhood,
    locality,
    district,
    state,
    postcode
  ];

  const constructed = cleanAndCombineAddressParts(rawParts, postcode);
  if (constructed) return constructed;

  // Fallback to formattedAddress or display_name if structured fields were empty
  const fmt = addr.formattedAddress || addr.formatted_address || addr.display_name;
  if (typeof fmt === 'string' && fmt.trim()) {
    const parts = fmt.split(',').map((p) => p.trim()).filter(Boolean);
    return cleanAndCombineAddressParts(parts);
  }

  return null;
};

// Admin & App On-Demand Geocoding Cache Map
const adminAddressCache = new Map<string, string>();
const pendingGeocodeRequests = new Map<string, Promise<string | null>>();
const cacheListeners = new Set<() => void>();

export const subscribeToAddressCacheUpdates = (listener: () => void): (() => void) => {
  cacheListeners.add(listener);
  return () => {
    cacheListeners.delete(listener);
  };
};

const notifyCacheListeners = () => {
  cacheListeners.forEach((fn) => {
    try {
      fn();
    } catch (e) {}
  });
};

export const getAdminCachedAddress = (lat: number, lon: number): string | null => {
  const numLat = Number(lat);
  const numLon = Number(lon);
  if (isNaN(numLat) || isNaN(numLon) || (numLat === 0 && numLon === 0)) return null;
  const coordKey = `${numLat.toFixed(4)},${numLon.toFixed(4)}`;
  return adminAddressCache.get(coordKey) || null;
};

export const setAdminCachedAddress = (lat: number, lon: number, address: string) => {
  const numLat = Number(lat);
  const numLon = Number(lon);
  if (isNaN(numLat) || isNaN(numLon) || (numLat === 0 && numLon === 0) || !address) return;
  const coordKey = `${numLat.toFixed(4)},${numLon.toFixed(4)}`;
  adminAddressCache.set(coordKey, address);
  notifyCacheListeners();
};

export const fetchAndCacheAddressForCoords = async (
  lat: number,
  lon: number
): Promise<string | null> => {
  const numLat = Number(lat);
  const numLon = Number(lon);
  if (isNaN(numLat) || isNaN(numLon) || (numLat === 0 && numLon === 0)) {
    return null;
  }

  const coordKey = `${numLat.toFixed(4)},${numLon.toFixed(4)}`;
  if (adminAddressCache.has(coordKey)) {
    return adminAddressCache.get(coordKey)!;
  }

  if (pendingGeocodeRequests.has(coordKey)) {
    return pendingGeocodeRequests.get(coordKey)!;
  }

  const fetchPromise = (async () => {
    try {
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        return null;
      }

      // Try OSM Nominatim first for precise reverse geocoding
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3500);
      const resp = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${numLat}&lon=${numLon}`,
        { signal: controller.signal }
      );
      clearTimeout(timeoutId);

      if (resp.ok) {
        const data = await resp.json();
        const formatted = formatPreciseAddress(data);
        if (formatted) {
          adminAddressCache.set(coordKey, formatted);
          notifyCacheListeners();
          return formatted;
        }
      }

      // Fallback to BigDataCloud
      const resp2 = await fetch(
        `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${numLat}&longitude=${numLon}&localityLanguage=en`
      );
      if (resp2.ok) {
        const data2 = await resp2.json();
        const formatted2 = formatPreciseAddress(data2);
        if (formatted2) {
          adminAddressCache.set(coordKey, formatted2);
          notifyCacheListeners();
          return formatted2;
        }
      }
    } catch (e) {
      console.warn('On-demand reverse geocode error:', e);
    } finally {
      pendingGeocodeRequests.delete(coordKey);
    }
    return null;
  })();

  pendingGeocodeRequests.set(coordKey, fetchPromise);
  return fetchPromise;
};
