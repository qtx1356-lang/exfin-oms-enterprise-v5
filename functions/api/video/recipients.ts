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
      for (const document of documents) {
        const data = decodeDoc(document);
        const uid = String(data.uid || data.authUid || data.firebaseUid || data.userId || '').trim();
        if (!uid || uid === caller.uid || !isApprovedEmployee(data)) continue;
        recipients.push({
          uid,
          name: String(data.name || data.fullName || data.employeeCode || 'Employee').slice(0, 80),
          employeeCode: String(data.employeeCode || ''),
          role: 'EMPLOYEE',
          email: String(data.email || ''),
        });
      }
    } else {
      const documents = await listCollection(env, 'admin_users', 500);
      for (const document of documents) {
        const data = decodeDoc(document);
        const uid = String(document.name || '').split('/').pop() || String(data.uid || data.authUid || '').trim();
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
