import {
  ADMIN_ROLES,
  VideoEnv,
  decodeDoc,
  isApprovedEmployee,
  json,
  listCollection,
  normalizeRole,
  normalizeStatus,
  verifyCaller,
  isCallerActive,
} from './routeShared';

type PagesFunction<E> = (context: { request: Request; env: E }) => Response | Promise<Response>;

export const onRequest: PagesFunction<VideoEnv> = async ({ request, env }) => {
  if (request.method === 'OPTIONS') return json(null, 204);
  try {
    const caller = await verifyCaller(request, env);
    if (!caller) return json({ success: false, error: 'Authentication required.' }, 401);
    if (!(await isCallerActive(env, caller))) return json({ success: false, error: 'Your account is inactive or not approved for video calls.' }, 403);

    const recipients: Array<{ uid: string; name: string; employeeCode?: string; role: string; email?: string }> = [];
    if (caller.isAdmin && ADMIN_ROLES.has(caller.role)) {
      const documents = await listCollection(env, 'registrations', 500);
      // Device-token records are written by the authenticated device-token endpoint;
      // their uid is taken from the verified Firebase ID token. Use that identity
      // when available so the invitation UID and push recipient UID cannot diverge
      // from the employee's currently registered Android identity.
      const tokenDocuments = await listCollection(env, 'push_device_tokens', 1000);
      const tokenUidsByEmployeeCode = new Map<string, Set<string>>();
      const tokenUidsByEmail = new Map<string, Set<string>>();
      for (const tokenDocument of tokenDocuments) {
        const tokenData = decodeDoc(tokenDocument);
        const tokenUid = String(tokenData.uid || tokenData.authUid || tokenData.userId || '').trim();
        if (!tokenUid) continue;
        const employeeCode = String(tokenData.employeeCode || '').trim().toUpperCase();
        const email = String(tokenData.email || '').trim().toLowerCase();
        if (employeeCode) {
          const values = tokenUidsByEmployeeCode.get(employeeCode) || new Set<string>();
          values.add(tokenUid);
          tokenUidsByEmployeeCode.set(employeeCode, values);
        }
        if (email) {
          const values = tokenUidsByEmail.get(email) || new Set<string>();
          values.add(tokenUid);
          tokenUidsByEmail.set(email, values);
        }
      }
      for (const document of documents) {
        const data = decodeDoc(document);
        if (!isApprovedEmployee(data)) continue;
        const employeeCode = String(data.employeeCode || '').trim();
        const email = String(data.email || '').trim().toLowerCase();
        const tokenMatches = (employeeCode ? tokenUidsByEmployeeCode.get(employeeCode.toUpperCase()) : undefined)
          || (email ? tokenUidsByEmail.get(email) : undefined);
        // Only substitute a token-derived UID when the registration maps uniquely.
        // Ambiguous records are skipped rather than risking a call to the wrong person.
        const tokenUids = tokenMatches ? [...tokenMatches] : [];
        const registrationUid = String(data.authUid || data.firebaseUid || data.uid || '').trim();
        const uid = tokenUids.length === 1 ? tokenUids[0] : (!tokenUids.length ? registrationUid : '');
        if (!uid || uid === caller.uid) continue;
        recipients.push({
          uid,
          name: String(data.name || data.fullName || employeeCode || 'Employee').slice(0, 80),
          employeeCode,
          role: 'EMPLOYEE',
          email: String(data.email || ''),
        });
      }
    } else {
      const documents = await listCollection(env, 'admin_users', 500);
      for (const document of documents) {
        const data = decodeDoc(document);
        const uid = String(data.authUid || data.firebaseUid || data.uid || document.name || '').split('/').pop()?.trim() || '';
        const role = normalizeRole(data.role || data.userRole || data.roleName);
        const status = normalizeStatus(data.status);
        const inactive = data.active === false || ['SUSPENDED', 'DELETED', 'INACTIVE', 'DISABLED', 'BLOCKED'].includes(status);
        if (!uid || uid === caller.uid || !ADMIN_ROLES.has(role) || inactive) continue;
        recipients.push({ uid, name: String(data.name || data.displayName || data.loginId || data.email || 'Administrator').slice(0, 80), role, email: String(data.email || '') });
      }
    }

    recipients.sort((a, b) => a.name.localeCompare(b.name));
    return json({ success: true, recipients });
  } catch (error: any) {
    console.error('[Pages Video Recipients]', error?.message || error);
    if (error?.message?.includes('FIREBASE_SERVICE_ACCOUNT_KEY')) return json({ success: false, error: 'Video server Firebase credentials are not configured yet.' }, 503);
    return json({ success: false, error: 'Could not load video call recipients.' }, 500);
  }
};
