import {
  ADMIN_ROLES,
  VideoEnv,
  createMeetingToken,
  decodeDoc,
  findApprovedEmployee,
  getDoc,
  isApprovedEmployee,
  isCallerActive,
  json,
  liveKitUrl,
  nameForUid,
  sendIncomingCallPush,
  setDoc,
  updateDoc,
  verifyCaller,
} from './routeShared';

type PagesFunction<E> = (context: { request: Request; env: E }) => Response | Promise<Response>;

export const onRequest: PagesFunction<VideoEnv> = async ({ request, env }) => {
  if (request.method === 'OPTIONS') return json(null, 204);
  try {
    const caller = await verifyCaller(request, env);
    if (!caller) return json({ success: false, error: 'Authentication required.' }, 401);
    if (!(await isCallerActive(env, caller))) return json({ success: false, error: 'Your account is inactive or not approved for video calls.' }, 403);
    if (request.method !== 'POST') return json({ success: false, error: 'Method not allowed.' }, 405);

    const body = await request.json().catch(() => ({})) as any;
    const mode = body?.mode === 'group' ? 'group' : 'direct';
    const rawRecipients = Array.isArray(body?.recipientUids) ? body.recipientUids : [];
    const recipientUids = Array.from(new Set(rawRecipients.filter((value: unknown) => typeof value === 'string' && value.length > 0 && value.length <= 128))) as string[];
    if (!recipientUids.length || recipientUids.length > 50 || (mode === 'direct' && recipientUids.length !== 1)) {
      return json({ success: false, error: 'Select one recipient for a direct call, or up to 50 for a group meeting.' }, 400);
    }
    if (mode === 'group' && (!caller.isAdmin || !ADMIN_ROLES.has(caller.role))) return json({ success: false, error: 'Only authorized administrators can start group meetings.' }, 403);
    if (recipientUids.includes(caller.uid)) return json({ success: false, error: 'You cannot call your own account.' }, 400);

    const resolved: Array<{ uid: string; name: string; role: string; employeeCode?: string }> = [];
    for (const uid of recipientUids) {
      if (caller.isAdmin && ADMIN_ROLES.has(caller.role)) {
        const employee = await findApprovedEmployee(env, uid);
        if (!employee || !isApprovedEmployee(employee.data)) return json({ success: false, error: 'One or more selected employees are not active and approved.' }, 403);
        const data = employee.data || {};
        resolved.push({ uid, name: String(data.name || data.fullName || data.employeeCode || 'Employee').slice(0, 80), role: 'EMPLOYEE', employeeCode: String(data.employeeCode || '') });
      } else {
        const admin = await getDoc(env, 'admin_users', uid);
        if (!admin) return json({ success: false, error: 'The selected administrator is not available.' }, 403);
        const data = decodeDoc(admin);
        const role = String(data.role || data.userRole || data.roleName || '').trim().toUpperCase().replace(/[\s-]+/g, '_');
        const status = String(data.status || '').trim().toUpperCase().replace(/[\s/\\-]+/g, '_');
        if (!ADMIN_ROLES.has(role) || data.active === false || ['SUSPENDED', 'DELETED', 'INACTIVE', 'DISABLED', 'BLOCKED'].includes(status)) return json({ success: false, error: 'The selected administrator is not active.' }, 403);
        resolved.push({ uid, name: String(data.name || data.displayName || data.loginId || data.email || 'Administrator').slice(0, 80), role });
      }
    }

    const now = Math.floor(Date.now() / 1000);
    const exp = now + 60 * 60 * 2;
    const roomName = `exfin-${crypto.randomUUID().replace(/-/g, '').slice(0, 24)}`;
    const roomUrl = liveKitUrl(env);
    const callId = crypto.randomUUID();
    const callerName = await nameForUid(env, caller.uid);
    const title = String(body?.title || (mode === 'group' ? 'EXFIN OMS group meeting' : 'EXFIN OMS video call')).trim().slice(0, 100) || 'EXFIN OMS video call';
    const token = await createMeetingToken(env, roomName, caller.uid, callerName, exp);
    const createdAt = new Date().toISOString();
    const expiresAt = new Date(exp * 1000).toISOString();
    const participantUids = [caller.uid, ...recipientUids];

    await setDoc(env, 'video_calls', callId, { callId, roomName, roomUrl, title, mode, callerUid: caller.uid, participantUids, status: 'active', createdAt, expiresAt });

    const pushDiagnostics: Array<{ recipientUid: string; employeeName: string; tokenCount: number; attempted: number; sent: number; failed: number; errors: string[] }> = [];
    for (const person of resolved) {
      const inviteId = `${callId}_${person.uid}`;
      await setDoc(env, 'video_call_invites', inviteId, {
        callId,
        recipientUid: person.uid,
        senderUid: caller.uid,
        senderName: callerName,
        senderRole: caller.role,
        roomName,
        roomUrl,
        title,
        mode,
        status: 'pending',
        createdAt,
        expiresAt,
      });
      if (caller.isAdmin && ADMIN_ROLES.has(caller.role)) {
        try {
          const pushResult = await sendIncomingCallPush(env, person.uid, String(person.employeeCode || ''), callId, callerName, title);
          pushDiagnostics.push({ recipientUid: person.uid, employeeName: person.name, ...pushResult });
          await updateDoc(env, 'video_call_invites', inviteId, {
            pushStatus: pushResult.sent > 0 ? 'sent' : pushResult.tokenCount === 0 ? 'no_token' : 'failed',
            pushTokenCount: pushResult.tokenCount,
            pushAttempted: pushResult.attempted,
            pushSent: pushResult.sent,
            pushFailed: pushResult.failed,
            pushErrors: pushResult.errors,
            pushAttemptedAt: new Date().toISOString(),
          }).catch(() => {});
        } catch (pushError: any) {
          const error = String(pushError?.message || pushError || 'FCM_SEND_FAILED').slice(0, 240);
          pushDiagnostics.push({ recipientUid: person.uid, employeeName: person.name, tokenCount: 0, attempted: 0, sent: 0, failed: 1, errors: [error] });
          await updateDoc(env, 'video_call_invites', inviteId, { pushStatus: 'error', pushErrors: [error], pushAttemptedAt: new Date().toISOString() }).catch(() => {});
        }
      }
    }

    return json({ success: true, callId, roomUrl, token, title, peerName: resolved.map((item) => item.name).join(', '), ...(pushDiagnostics.length ? { pushDiagnostics } : {}) });
  } catch (error: any) {
    console.error('[Pages Video Calls]', error?.message || error);
    if (error?.message === 'LIVEKIT_NOT_CONFIGURED') return json({ success: false, error: 'LiveKit is not configured yet. Add LIVEKIT_URL, LIVEKIT_API_KEY, and LIVEKIT_API_SECRET to Cloudflare Pages production secrets.' }, 503);
    if (error?.message?.includes('FIREBASE_SERVICE_ACCOUNT_KEY')) return json({ success: false, error: 'Video server Firebase credentials are not configured yet.' }, 503);
    return json({ success: false, error: 'Could not process the video request.' }, 500);
  }
};
