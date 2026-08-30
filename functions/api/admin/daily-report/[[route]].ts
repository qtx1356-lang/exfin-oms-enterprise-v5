export async function onRequest(context) {
  const { request, env, params } = context;
  const route = params.route || [];
  const pathStr = route.join('/');

  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*' } });
  }

  const authHeader = request.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ success: false, error: 'Authentication required' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
  }
  const token = authHeader.split('Bearer ')[1].trim();

  const projectId = env.FIREBASE_PROJECT_ID || 'exfin-oms-production';
  const resendApiKey = env.RESEND_API_KEY;

  async function firestoreFetch(docPath, method = 'GET', body = null) {
    const fUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/${docPath}`;
    return fetch(fUrl, {
      method,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: body ? JSON.stringify(body) : undefined
    });
  }

  async function firestoreQuery(collectionId, queryBody) {
    const fUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents:runQuery`;
    return fetch(fUrl, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ structuredQuery: { from: [{ collectionId }], ...queryBody } })
    });
  }

  function unwrap(val) {
    if (!val) return null;
    if ('stringValue' in val) return val.stringValue;
    if ('booleanValue' in val) return val.booleanValue;
    if ('integerValue' in val) return parseInt(val.integerValue, 10);
    if ('doubleValue' in val) return val.doubleValue;
    if ('arrayValue' in val) return (val.arrayValue.values || []).map(unwrap);
    if ('mapValue' in val) {
        const res = {};
        for (const k in val.mapValue.fields) res[k] = unwrap(val.mapValue.fields[k]);
        return res;
    }
    if ('timestampValue' in val) return val.timestampValue;
    if ('nullValue' in val) return null;
    return val;
  }

  try {
    if (request.method === 'GET' && pathStr === 'config') {
      const res = await firestoreFetch('system_settings/daily_admin_report');
      if (res.status === 404) {
        return new Response(JSON.stringify({ success: true, config: { enabled: false, sendTime: '07:00', adminEmails: [] } }), { headers: { 'Content-Type': 'application/json' } });
      }
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        return new Response(JSON.stringify({ success: false, error: err.error?.message || 'Failed to fetch config' }), { status: res.status, headers: { 'Content-Type': 'application/json' } });
      }
      const data = await res.json();
      const config = {
        enabled: data.fields?.enabled?.booleanValue ?? false,
        sendTime: data.fields?.sendTime?.stringValue ?? '07:00',
        adminEmails: data.fields?.adminEmails?.arrayValue?.values?.map(v => v.stringValue) ?? [],
        includeAttendance: data.fields?.includeAttendance?.booleanValue ?? true,
        includeLeaves: data.fields?.includeLeaves?.booleanValue ?? true,
        includeExpenses: data.fields?.includeExpenses?.booleanValue ?? true,
        includeOtherDailyActivity: data.fields?.includeOtherDailyActivity?.booleanValue ?? true,
      };
      return new Response(JSON.stringify({ success: true, config }), { headers: { 'Content-Type': 'application/json' } });
    }

    if (request.method === 'POST' && pathStr === 'config') {
      const body = await request.json();
      const firestoreBody = {
        fields: {
          enabled: { booleanValue: !!body.enabled },
          sendTime: { stringValue: body.sendTime || '07:00' },
          adminEmails: { arrayValue: { values: (body.adminEmails || []).map(e => ({ stringValue: e })) } },
          includeAttendance: { booleanValue: !!body.includeAttendance },
          includeLeaves: { booleanValue: !!body.includeLeaves },
          includeExpenses: { booleanValue: !!body.includeExpenses },
          includeOtherDailyActivity: { booleanValue: !!body.includeOtherDailyActivity },
          updatedAt: { timestampValue: new Date().toISOString() }
        }
      };
      const res = await firestoreFetch('system_settings/daily_admin_report', 'PATCH', firestoreBody);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        return new Response(JSON.stringify({ success: false, error: err.error?.message || 'Failed to save config' }), { status: res.status, headers: { 'Content-Type': 'application/json' } });
      }
      return new Response(JSON.stringify({ success: true, config: body }), { headers: { 'Content-Type': 'application/json' } });
    }

    if (request.method === 'GET' && pathStr === 'history') {
      const queryBody = {
        orderBy: [{ field: { fieldPath: 'startedAt' }, direction: 'DESCENDING' }],
        limit: 30
      };
      const res = await firestoreQuery('daily_admin_reports', queryBody);
      if (!res.ok) {
        return new Response(JSON.stringify({ success: false, error: 'Failed to fetch history' }), { status: res.status, headers: { 'Content-Type': 'application/json' } });
      }
      const data = await res.json();
      const history = data.map(d => {
        if (!d.document) return null;
        const doc = d.document;
        const fields = doc.fields || {};
        return {
          id: doc.name.split('/').pop(),
          status: fields.status?.stringValue,
          startedAt: fields.startedAt?.stringValue || fields.createdAt?.timestampValue,
          completedAt: fields.completedAt?.stringValue,
          reportDate: fields.reportDate?.stringValue,
          recipientCount: fields.recipientCount?.integerValue,
          recipient: fields.recipient?.stringValue,
          error: fields.error?.stringValue
        };
      }).filter(Boolean);
      return new Response(JSON.stringify({ success: true, history }), { headers: { 'Content-Type': 'application/json' } });
    }

    async function sendEmailViaResend(to, bcc, subject, html) {
      if (!resendApiKey) {
        throw new Error('Email provider configuration missing: RESEND_API_KEY environment variable is not set in Cloudflare Pages.');
      }
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${resendApiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: env.RESEND_FROM || 'EXFIN OMS <noreply@exfin-oms.internal>',
          to,
          bcc: bcc && bcc.length > 0 ? bcc : undefined,
          subject,
          html
        })
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || 'Failed to send via Resend');
      }
      const data = await res.json();
      return { success: true, simulated: false, messageId: data.id };
    }

    if (request.method === 'POST' && pathStr === 'send-test') {
      const res = await firestoreFetch('system_settings/daily_admin_report');
      let adminEmails = [];
      let sendTime = '07:00';
      if (res.ok) {
        const data = await res.json();
        adminEmails = data.fields?.adminEmails?.arrayValue?.values?.map(v => v.stringValue) ?? [];
        sendTime = data.fields?.sendTime?.stringValue ?? '07:00';
      }
      if (adminEmails.length === 0) {
        return new Response(JSON.stringify({ success: false, error: 'No Admin email recipients configured' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
      }

      const emailHtml = `<!DOCTYPE html><html><body style="font-family: Arial, sans-serif; background-color: #f8fafc; padding: 25px; color: #1e293b;"><div style="max-width: 600px; margin: 0 auto; background: white; padding: 30px; border-radius: 8px; box-shadow: 0 4px 6px rgb(0 0 0 / 0.05); border-top: 4px solid #6366f1;"><h2 style="color: #1e1b4b; margin-top: 0;">EXFIN OMS — Connection Verification</h2><p>This is a <strong>Test Daily Report</strong> designed to verify that the EXFIN OMS backend email server configuration is fully operational.</p><p>Details:</p><table style="width: 100%; border-collapse: collapse; font-size: 13px;"><tr style="border-bottom: 1px solid #e2e8f0;"><td style="padding: 8px 0; font-weight: bold;">Status</td><td style="padding: 8px 0; color: #10b981;">ACTIVE / OPERATIONAL</td></tr><tr style="border-bottom: 1px solid #e2e8f0;"><td style="padding: 8px 0; font-weight: bold;">Primary Recipient</td><td style="padding: 8px 0;">${adminEmails[0]}</td></tr><tr style="border-bottom: 1px solid #e2e8f0;"><td style="padding: 8px 0; font-weight: bold;">BCC Recipients</td><td style="padding: 8px 0;">${adminEmails.length > 1 ? adminEmails.slice(1).join(', ') : 'None'}</td></tr><tr style="border-bottom: 1px solid #e2e8f0;"><td style="padding: 8px 0; font-weight: bold;">Recipient Count</td><td style="padding: 8px 0;">${adminEmails.length}</td></tr><tr style="border-bottom: 1px solid #e2e8f0;"><td style="padding: 8px 0; font-weight: bold;">Send Time Setting</td><td style="padding: 8px 0;">${sendTime} (Asia/Kolkata)</td></tr><tr style="border-bottom: 1px solid #e2e8f0;"><td style="padding: 8px 0; font-weight: bold;">Dispatched From</td><td style="padding: 8px 0;">EXFIN OMS CF Pages Server</td></tr></table></div></body></html>`;

      try {
        const sendRes = await sendEmailViaResend(adminEmails[0], adminEmails.slice(1), 'EXFIN OMS — Test Daily Report', emailHtml);
        
        await firestoreFetch(`audit_logs/${Date.now()}`, 'PATCH', {
          fields: {
            actionCategory: { stringValue: 'SYSTEM_SETTINGS' },
            action: { stringValue: 'Dispatched Test Daily Admin Report Email' },
            timestamp: { stringValue: new Date().toISOString() },
          }
        });

        return new Response(JSON.stringify({ 
          success: true, 
          message: `Email accepted by provider. Message ID: ${sendRes.messageId}`,
          recipientCount: adminEmails.length,
          recipients: adminEmails
        }), { headers: { 'Content-Type': 'application/json' } });
      } catch (err) {
        return new Response(JSON.stringify({ success: false, error: err.message }), { status: 500, headers: { 'Content-Type': 'application/json' } });
      }
    }

    if (request.method === 'POST' && pathStr === 'send-yesterday') {
      const body = await request.json().catch(() => ({}));
      const res = await firestoreFetch('system_settings/daily_admin_report');
      let adminEmails = [];
      if (res.ok) {
        const data = await res.json();
        adminEmails = data.fields?.adminEmails?.arrayValue?.values?.map(v => v.stringValue) ?? [];
      }
      
      if (adminEmails.length === 0) {
        return new Response(JSON.stringify({ success: false, error: 'No Admin email recipients configured' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
      }

      const targetDate = body.date || new Date().toISOString().split('T')[0];

      // Fetch Employees
      const empRes = await firestoreQuery('registrations', {});
      const emps = (await empRes.json() || []).map(d => d.document ? { id: d.document.name.split('/').pop(), ...unwrap(d.document) } : null).filter(Boolean);
      const totalEmployeesCount = emps.filter(e => e.status === 'Approved' && e.role !== 'ADMIN' && e.role !== 'SUPER_ADMIN').length;

      // Fetch Attendance
      const attRes = await firestoreQuery('attendance', { where: { fieldFilter: { field: { fieldPath: 'date' }, op: 'EQUAL', value: { stringValue: targetDate } } } });
      const attendance = (await attRes.json() || []).map(d => d.document ? { id: d.document.name.split('/').pop(), ...unwrap(d.document) } : null).filter(Boolean);
      
      const presentCount = attendance.length;
      const absentCount = Math.max(0, totalEmployeesCount - presentCount);

      // Fetch Leaves
      const lvRes = await firestoreQuery('leave_requests', { where: { fieldFilter: { field: { fieldPath: 'status' }, op: 'EQUAL', value: { stringValue: 'Approved' } } } });
      const leaves = (await lvRes.json() || []).map(d => d.document ? { id: d.document.name.split('/').pop(), ...unwrap(d.document) } : null).filter(Boolean);
      const activeLeaves = leaves.filter(l => l.startDate <= targetDate && l.endDate >= targetDate).length;

      // Fetch Expenses
      const expRes = await firestoreQuery('expense_claims', { where: { fieldFilter: { field: { fieldPath: 'status' }, op: 'EQUAL', value: { stringValue: 'Pending' } } } });
      const expenses = (await expRes.json() || []).map(d => d.document ? { id: d.document.name.split('/').pop(), ...unwrap(d.document) } : null).filter(Boolean);
      
      const unresolvedCheckouts = attendance.filter(a => !a.checkOutTime).length;
      const totalExpensesSum = expenses.reduce((sum, e) => sum + (e.amount || 0), 0);

      const html = `<!DOCTYPE html><html><body style="font-family: Arial, sans-serif; background-color: #f1f5f9; padding: 20px;"><div style="max-width: 800px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgb(0 0 0 / 0.1);"><div style="background: linear-gradient(135deg, #1e1b4b 0%, #31105e 100%); color: white; padding: 30px; text-align: center;"><h1 style="margin: 0; font-size: 26px;">EXFIN OMS</h1><p style="margin: 5px 0 0 0; color: #c084fc;">Daily Operations Report</p><div style="margin-top: 15px; font-weight: bold;">Report Date: ${targetDate}</div></div><div style="padding: 25px;"><h3 style="border-bottom: 2px solid #f1f5f9; padding-bottom: 8px;">Summary Overview</h3><div style="display: flex; gap: 12px; flex-wrap: wrap;">
        <div style="flex: 1 1 120px; background: #ecfdf5; border: 1px solid #a7f3d0; padding: 12px; border-radius: 10px; text-align: center;"><div style="color: #047857; font-weight: bold; font-size: 11px;">PRESENT</div><div style="font-size: 24px; color: #065f46; font-weight: bold;">${presentCount}</div></div>
        <div style="flex: 1 1 120px; background: #fef2f2; border: 1px solid #fecaca; padding: 12px; border-radius: 10px; text-align: center;"><div style="color: #b91c1c; font-weight: bold; font-size: 11px;">ABSENT</div><div style="font-size: 24px; color: #991b1b; font-weight: bold;">${absentCount}</div></div>
        <div style="flex: 1 1 120px; background: #fffbeb; border: 1px solid #fde68a; padding: 12px; border-radius: 10px; text-align: center;"><div style="color: #d97706; font-weight: bold; font-size: 11px;">ACTIVE LEAVES</div><div style="font-size: 24px; color: #92400e; font-weight: bold;">${activeLeaves}</div></div>
        <div style="flex: 1 1 120px; background: #f8fafc; border: 1px solid #e2e8f0; padding: 12px; border-radius: 10px; text-align: center;"><div style="color: #475569; font-weight: bold; font-size: 11px;">EXPENSES</div><div style="font-size: 24px; color: #0f172a; font-weight: bold;">₹${totalExpensesSum.toLocaleString()}</div></div>
      </div>
      
      <div style="margin-top: 20px; color: #475569; font-size: 14px;">
        <p><strong>Pending Expense Claims:</strong> ${expenses.length}</p>
        <p><strong>Unresolved Checkouts:</strong> ${unresolvedCheckouts}</p>
      </div>
      </div></div></body></html>`;

      try {
        const sendRes = await sendEmailViaResend(adminEmails[0], adminEmails.slice(1), `EXFIN OMS — Daily Admin Report — ${targetDate}`, html);

        const reportLogRef = `daily_admin_reports/${targetDate}`;
        await firestoreFetch(reportLogRef, 'PATCH', {
          fields: {
            reportDate: { stringValue: targetDate },
            status: { stringValue: 'SENT' },
            startedAt: { stringValue: new Date().toISOString() },
            completedAt: { stringValue: new Date().toISOString() },
            recipientCount: { integerValue: adminEmails.length },
            recipient: { stringValue: adminEmails[0] },
            messageId: { stringValue: sendRes.messageId || 'simulated' }
          }
        });

        return new Response(JSON.stringify({ 
          success: true, 
          message: `Email accepted by provider. Message ID: ${sendRes.messageId}`,
          reportDate: targetDate
        }), { headers: { 'Content-Type': 'application/json' } });
      } catch (err) {
        return new Response(JSON.stringify({ success: false, error: err.message }), { status: 500, headers: { 'Content-Type': 'application/json' } });
      }
    }

    return new Response(JSON.stringify({ success: false, error: 'API endpoint not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (err) {
    return new Response(JSON.stringify({ success: false, error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
