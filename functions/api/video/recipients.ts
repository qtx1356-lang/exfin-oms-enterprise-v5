import {
  ADMIN_ROLES,
  VideoEnv,
  decodeDoc,
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

    const recipients: Array<{ uid: string; name: string; employeeCode?: string; role: string; email?: string; phone?: string }> = [];
    if (caller.isAdmin && ADMIN_ROLES.has(caller.role)) {
      const documents = await listCollection(env, 'registrations', 500);

      for (const document of documents) {
        const data = decodeDoc(document);
        const employeeCode = String(data.employeeCode || data.employeeId || data.loginId || '').trim();
        const normalizedStatus = normalizeStatus(data.status || data.accountStatus || data.approvalStatus || data.employeeStatus || '');
        const approved = normalizedStatus === 'APPROVED' || normalizedStatus === 'ACTIVE' || normalizedStatus === 'APPROVED_ACTIVE';
        const inactive = data.isDeleted === true || data.active === false || ['SUSPENDED', 'DELETED', 'INACTIVE', 'DISABLED', 'BLOCKED', 'REJECTED', 'PENDING_APPROVAL'].includes(normalizedStatus);
        if (!approved || inactive) continue;

        const email = String(data.email || '').trim().toLowerCase();
        // IMPORTANT: participant identity must be the canonical Firebase Auth UID.
        // Token records may contain employee-code/legacy aliases, but those aliases
        // must never replace the authenticated Firebase UID used by the conference
        // authorization and Android call-join flow.
        const canonicalUid = String(data.authUid || data.firebaseUid || data.uid || '').trim();
        const documentId = String(document.name || '').split('/').pop()?.trim() || '';
        const uid = canonicalUid || documentId;
        if (!uid || uid === caller.uid) continue;

        recipients.push({
          uid,
          name: String(data.name || data.fullName || employeeCode || 'Employee').slice(0, 80),
          employeeCode,
          role: 'EMPLOYEE',
          email,
          phone: String(data.whatsappNumber || data.whatsapp || data.phoneNumber || data.mobileNumber || data.mobile || data.phone || '').trim(),
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
