// @ts-ignore
import { connect } from 'cloudflare:sockets';
import { calculateEfficiency } from '../../../../src/services/efficiency/efficiencyCalculator';
import { DEFAULT_WEIGHTAGES } from '../../../../src/types/efficiency';

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

  function unwrapFields(fields) {
    if (!fields) return {};
    const res = {};
    for (const k in fields) {
      res[k] = unwrapValue(fields[k]);
    }
    return res;
  }

  function unwrapValue(val) {
    if (!val) return null;
    if ('stringValue' in val) return val.stringValue;
    if ('booleanValue' in val) return val.booleanValue;
    if ('integerValue' in val) return parseInt(val.integerValue, 10);
    if ('doubleValue' in val) return val.doubleValue;
    if ('arrayValue' in val) return (val.arrayValue?.values || []).map(unwrapValue);
    if ('mapValue' in val) return unwrapFields(val.mapValue?.fields);
    if ('timestampValue' in val) return val.timestampValue;
    if ('nullValue' in val) return null;
    return val;
  }

  async function safeQueryCollection(collectionId: string, queryBody: any = {}): Promise<Record<string, any>[]> {
    try {
      const res = await firestoreQuery(collectionId, queryBody);
      if (!res.ok) {
        return [];
      }
      const data: any = await res.json();
      if (!Array.isArray(data)) return [];
      return data.map((d: any) => {
        if (!d || !d.document) return null;
        const docName = d.document.name || '';
        const id = docName.split('/').pop();
        const fields = unwrapFields(d.document.fields || {});
        return { id, ...fields } as Record<string, any>;
      }).filter(Boolean) as Record<string, any>[];
    } catch (err) {
      return [];
    }
  }

  function getPreviousKolkataDateString() {
    try {
      const now = new Date();
      const kolkataStr = now.toLocaleString("en-US", { timeZone: "Asia/Kolkata" });
      const d = new Date(kolkataStr);
      d.setDate(d.getDate() - 1);
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      return `${yyyy}-${mm}-${dd}`;
    } catch (e) {
      const d = new Date();
      d.setDate(d.getDate() - 1);
      return d.toISOString().split('T')[0];
    }
  }

  const DEFAULT_TARGET_RECIPIENTS = [
    'hr@exfinsolution.com',
    'ceo@exfinsolution.com',
    'sanjivsinha06@gmail.com'
  ];

  function getEffectiveRecipients(fsData) {
    // 1. Persisted Firestore Configuration is the SINGLE SOURCE OF TRUTH if present
    if (fsData?.fields?.adminEmails?.arrayValue) {
      const fsList = (fsData.fields.adminEmails.arrayValue.values || [])
        .map(v => v.stringValue?.trim())
        .filter(Boolean);
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      const valid = fsList.filter(e => emailRegex.test(e));
      return { valid: true, recipients: valid, error: null };
    }

    // 2. Initial Fallback to environment variable ONLY if no saved configuration document exists
    const rawEnv = env?.EMAIL_RECIPIENTS || (typeof process !== 'undefined' ? process.env?.EMAIL_RECIPIENTS : undefined);
    if (rawEnv && typeof rawEnv === 'string' && rawEnv.trim().length > 0) {
      const envList = rawEnv.split(',').map(s => s.trim()).filter(Boolean);
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      const valid = envList.filter(e => emailRegex.test(e));
      return { valid: true, recipients: valid, error: null };
    }

    // 3. Fallback to DEFAULT_TARGET_RECIPIENTS on initial unconfigured state
    return { valid: true, recipients: [...DEFAULT_TARGET_RECIPIENTS], error: null };
  }

  async function sendEmailViaGmailSmtp(recipients, subject, html) {
    const host = env.SMTP_HOST || (typeof process !== 'undefined' ? process.env?.SMTP_HOST : undefined) || 'smtp.gmail.com';
    const port = parseInt(env.SMTP_PORT || (typeof process !== 'undefined' ? process.env?.SMTP_PORT : undefined) || '465', 10);
    const user = env.SMTP_USER || (typeof process !== 'undefined' ? process.env?.SMTP_USER : undefined);
    const pass = env.SMTP_PASSWORD || env.SMTP_PASS || (typeof process !== 'undefined' ? (process.env?.SMTP_PASSWORD || process.env?.SMTP_PASS) : undefined);

    if (!user || !pass) {
      throw new Error('MISSING_CREDENTIAL: SMTP_USER or SMTP_PASSWORD is not configured in Cloudflare Production environment.');
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const validRecipients = (recipients || []).map(r => String(r).trim()).filter(r => emailRegex.test(r));

    if (validRecipients.length === 0) {
      throw new Error('INVALID_RECIPIENTS: No valid recipient email addresses configured.');
    }

    let socket;
    try {
      socket = connect({ hostname: host, port }, { secureTransport: "on" });
    } catch (err) {
      throw new Error(`CONNECTION_FAILED: Unable to open TLS socket to ${host}:${port}: ${err.message || String(err)}`);
    }

    const writer = socket.writable.getWriter();
    const reader = socket.readable.getReader();
    const decoder = new TextDecoder();
    const encoder = new TextEncoder();

    let readBuffer = "";

    async function readLine() {
      while (!readBuffer.includes("\r\n")) {
        const { value, done } = await reader.read();
        if (done) break;
        readBuffer += decoder.decode(value, { stream: true });
      }
      const idx = readBuffer.indexOf("\r\n");
      if (idx !== -1) {
        const line = readBuffer.slice(0, idx);
        readBuffer = readBuffer.slice(idx + 2);
        return line;
      }
      const line = readBuffer;
      readBuffer = "";
      return line;
    }

    // Properly handles multi-line SMTP responses (e.g. 250-line1\r\n250 line2\r\n)
    async function readResponse() {
      const lines = [];
      while (true) {
        const line = await readLine();
        if (!line) break;
        lines.push(line);
        // In SMTP, a hyphen at character index 3 indicates intermediate multi-line response.
        if (line.length < 4 || line.charAt(3) !== '-') {
          break;
        }
      }
      return lines.join("\n");
    }

    async function sendCmd(cmd) {
      await writer.write(encoder.encode(cmd + "\r\n"));
      return await readResponse();
    }

    try {
      const greeting = await readResponse();
      if (!greeting.startsWith("220")) {
        throw new Error(`SMTP_SERVER_ERROR: Unexpected greeting from ${host}:${port}: ${greeting}`);
      }

      const ehloResp = await sendCmd("EHLO localhost");
      if (!ehloResp.startsWith("250")) {
        throw new Error(`SMTP_EHLO_FAILED: EHLO command rejected by ${host}: ${ehloResp}`);
      }

      const authResp = await sendCmd("AUTH LOGIN");
      if (!authResp.startsWith("334")) {
        throw new Error(`GMAIL_REJECTED_AUTH: AUTH LOGIN prompt failed: ${authResp}`);
      }

      const userResp = await sendCmd(btoa(user));
      if (!userResp.startsWith("334")) {
        throw new Error(`GMAIL_REJECTED_AUTH: Gmail rejected SMTP_USER username. Response: ${userResp}`);
      }

      const passResp = await sendCmd(btoa(pass));
      if (!passResp.startsWith("235")) {
        throw new Error(`GMAIL_REJECTED_AUTH: Gmail authentication failed. Response: ${passResp}`);
      }

      const mailFromResp = await sendCmd(`MAIL FROM:<${user}>`);
      if (!mailFromResp.startsWith("250")) {
        throw new Error(`SMTP_MAIL_FROM_FAILED: MAIL FROM:<${user}> rejected: ${mailFromResp}`);
      }

      for (const rcpt of validRecipients) {
        const rcptResp = await sendCmd(`RCPT TO:<${rcpt}>`);
        if (!rcptResp.startsWith("250") && !rcptResp.startsWith("251")) {
          throw new Error(`SMTP_RCPT_FAILED: Gmail rejected recipient <${rcpt}>: ${rcptResp}`);
        }
      }

      const dataResp = await sendCmd("DATA");
      if (!dataResp.startsWith("354")) {
        throw new Error(`SMTP_DATA_FAILED: DATA command rejected: ${dataResp}`);
      }

      const messageData = [
        `From: EXFIN OMS Operations <${user}>`,
        `To: ${validRecipients.join(", ")}`,
        `Subject: ${subject}`,
        `MIME-Version: 1.0`,
        `Content-Type: text/html; charset=utf-8`,
        ``,
        html,
        `.`
      ].join("\r\n");

      const dataResult = await sendCmd(messageData);
      if (!dataResult.startsWith("250")) {
        throw new Error(`SMTP_DISPATCH_FAILED: Email payload rejected by server: ${dataResult}`);
      }

      const msgIdMatch = dataResult.match(/250\s+2\.0\.0\s+OK\s+(.+)$/);
      const messageId = msgIdMatch ? msgIdMatch[1] : `msg_cf_${Date.now()}`;

      await sendCmd("QUIT").catch(() => {});

      return {
        success: true,
        message: "Email accepted by Gmail SMTP",
        recipientCount: validRecipients.length,
        recipients: validRecipients,
        messageId
      };
    } finally {
      try {
        writer.close();
        reader.cancel();
      } catch (e) {}
    }
  }

  try {
    if (request.method === 'GET' && pathStr === 'config') {
      const res = await firestoreFetch('system_settings/daily_admin_report');
      let fsData = null;
      if (res.ok) {
        fsData = await res.json();
      }
      const recipientRes = getEffectiveRecipients(fsData);
      const recipients = recipientRes.recipients || DEFAULT_TARGET_RECIPIENTS;
      const config = {
        enabled: fsData?.fields?.enabled?.booleanValue ?? true,
        sendTime: fsData?.fields?.sendTime?.stringValue ?? '07:00 AM',
        adminEmails: recipients,
        includeAttendance: fsData?.fields?.includeAttendance?.booleanValue ?? true,
        includeLeaves: fsData?.fields?.includeLeaves?.booleanValue ?? true,
        includeExpenses: fsData?.fields?.includeExpenses?.booleanValue ?? true,
        includeOtherDailyActivity: fsData?.fields?.includeOtherDailyActivity?.booleanValue ?? true,
      };
      return new Response(JSON.stringify({ success: true, config }), { headers: { 'Content-Type': 'application/json' } });
    }

    if (request.method === 'POST' && pathStr === 'config') {
      const body = await request.json();
      const rawEmails = Array.isArray(body.adminEmails) ? body.adminEmails : [];
      
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      const cleanedRecipients = [];
      const seen = new Set();
      for (const raw of rawEmails) {
        if (typeof raw === 'string') {
          const trimmed = raw.trim();
          if (emailRegex.test(trimmed)) {
            const lower = trimmed.toLowerCase();
            if (!seen.has(lower)) {
              seen.add(lower);
              cleanedRecipients.push(trimmed);
            }
          }
        }
      }

      if (cleanedRecipients.length === 0) {
        return new Response(JSON.stringify({
          success: false,
          error: 'At least one valid email recipient is required before saving configuration.'
        }), { status: 400, headers: { 'Content-Type': 'application/json' } });
      }

      if (cleanedRecipients.length > 20) {
        return new Response(JSON.stringify({
          success: false,
          error: 'Maximum 20 email recipients are allowed.'
        }), { status: 400, headers: { 'Content-Type': 'application/json' } });
      }

      const firestoreBody = {
        fields: {
          enabled: { booleanValue: !!body.enabled },
          sendTime: { stringValue: body.sendTime || '07:00 AM' },
          adminEmails: { arrayValue: { values: cleanedRecipients.map(e => ({ stringValue: e })) } },
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
      return new Response(JSON.stringify({ success: true, config: { ...body, adminEmails: cleanedRecipients } }), { headers: { 'Content-Type': 'application/json' } });
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
        const rcptStr = fields.recipient?.stringValue || '';
        const rcptList = rcptStr ? rcptStr.split(', ') : (fields.recipients?.arrayValue?.values?.map(v => v.stringValue) || []);
        return {
          id: doc.name.split('/').pop(),
          status: fields.status?.stringValue,
          startedAt: fields.startedAt?.stringValue || fields.createdAt?.timestampValue,
          completedAt: fields.completedAt?.stringValue,
          reportDate: fields.reportDate?.stringValue,
          recipientCount: fields.recipientCount?.integerValue || rcptList.length,
          recipients: rcptList,
          recipient: fields.recipient?.stringValue,
          error: fields.error?.stringValue,
          lastRetriedAt: fields.lastRetriedAt?.stringValue,
          isRetry: fields.isRetry?.booleanValue ?? false
        };
      }).filter(Boolean);
      return new Response(JSON.stringify({ success: true, history }), { headers: { 'Content-Type': 'application/json' } });
    }

    if (request.method === 'POST' && pathStr === 'send-test') {
      const res = await firestoreFetch('system_settings/daily_admin_report');
      let fsData = null;
      if (res.ok) {
        fsData = await res.json();
      }
      const recipientRes = getEffectiveRecipients(fsData);
      if (!recipientRes.valid) {
        return new Response(JSON.stringify({
          success: false,
          error: recipientRes.error
        }), { status: 400, headers: { 'Content-Type': 'application/json' } });
      }
      const recipients = recipientRes.recipients;

      if (recipients.length === 0) {
        return new Response(JSON.stringify({
          success: false,
          error: 'No valid email recipients are configured.'
        }), { status: 400, headers: { 'Content-Type': 'application/json' } });
      }

      const emailHtml = `<!DOCTYPE html><html><body style="font-family: Arial, sans-serif; background-color: #f8fafc; padding: 25px; color: #1e293b;"><div style="max-width: 600px; margin: 0 auto; background: white; padding: 30px; border-radius: 8px; box-shadow: 0 4px 6px rgb(0 0 0 / 0.05); border-top: 4px solid #6366f1;"><h2 style="color: #1e1b4b; margin-top: 0;">EXFIN OMS — Connection Verification</h2><p>This is a <strong>Test Daily Report</strong> designed to verify that the EXFIN OMS backend email server configuration is fully operational.</p><p>Details:</p><table style="width: 100%; border-collapse: collapse; font-size: 13px;"><tr style="border-bottom: 1px solid #e2e8f0;"><td style="padding: 8px 0; font-weight: bold;">Status</td><td style="padding: 8px 0; color: #10b981;">ACTIVE / OPERATIONAL</td></tr><tr style="border-bottom: 1px solid #e2e8f0;"><td style="padding: 8px 0; font-weight: bold;">Recipients</td><td style="padding: 8px 0;">${recipients.join(', ')}</td></tr><tr style="border-bottom: 1px solid #e2e8f0;"><td style="padding: 8px 0; font-weight: bold;">Recipient Count</td><td style="padding: 8px 0;">${recipients.length}</td></tr><tr style="border-bottom: 1px solid #e2e8f0;"><td style="padding: 8px 0; font-weight: bold;">Dispatched From</td><td style="padding: 8px 0;">EXFIN OMS CF Pages Server</td></tr></table></div></body></html>`;

      try {
        const sendRes = await sendEmailViaGmailSmtp(recipients, 'EXFIN OMS — Test Daily Report', emailHtml);
        
        await firestoreFetch(`audit_logs/${Date.now()}`, 'PATCH', {
          fields: {
            actionCategory: { stringValue: 'SYSTEM_SETTINGS' },
            action: { stringValue: 'Dispatched Test Daily Admin Report Email' },
            timestamp: { stringValue: new Date().toISOString() },
          }
        });

        return new Response(JSON.stringify({ 
          success: true, 
          message: `Test email sent to ${recipients.length} recipient${recipients.length === 1 ? '' : 's'}`,
          recipientCount: recipients.length,
          recipients,
          messageId: sendRes.messageId
        }), { headers: { 'Content-Type': 'application/json' } });
      } catch (err) {
        return new Response(JSON.stringify({ success: false, error: err.message || 'Failed to send test email' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
      }
    }

    if (request.method === 'POST' && (pathStr === 'send-yesterday' || pathStr === 'retry-yesterday')) {
      const isRetry = pathStr === 'retry-yesterday';
      let currentStage = 'REQUEST_RECEIVED';
      let targetDate = '';
      try {
        const body = await request.json().catch(() => ({}));

        // STEP 1: RECIPIENTS_LOADED
        currentStage = 'RECIPIENTS_LOADED';
        const res = await firestoreFetch('system_settings/daily_admin_report');
        let fsData = null;
        if (res.ok) {
          fsData = await res.json();
        }
        const recipientRes = getEffectiveRecipients(fsData);
        if (!recipientRes.valid) {
          return new Response(JSON.stringify({
            success: false,
            stage: currentStage,
            error: recipientRes.error
          }), { status: 400, headers: { 'Content-Type': 'application/json' } });
        }
        const recipients = recipientRes.recipients;
        if (recipients.length === 0) {
          return new Response(JSON.stringify({
            success: false,
            stage: currentStage,
            error: 'No valid email recipients are configured.'
          }), { status: 400, headers: { 'Content-Type': 'application/json' } });
        }

        // STEP 2: REPORT_DATE_CALCULATED
        currentStage = 'REPORT_DATE_CALCULATED';
        targetDate = (body.date && typeof body.date === 'string' && body.date.trim()) 
          ? body.date.trim() 
          : getPreviousKolkataDateString();

        // STEP 3: ATTENDANCE_DATA_LOADED & EFFICIENCY
        currentStage = 'ATTENDANCE_DATA_LOADED';
        const emps = await safeQueryCollection('registrations');
        const approvedEmps = emps.filter(e => e.status === 'Approved' && e.role !== 'ADMIN' && e.role !== 'SUPER_ADMIN');
        const totalEmployeesCount = approvedEmps.length;

        const attendance = await safeQueryCollection('attendance', {
          where: { fieldFilter: { field: { fieldPath: 'date' }, op: 'EQUAL', value: { stringValue: targetDate } } }
        });
        const presentCount = attendance.length;
        const absentCount = Math.max(0, totalEmployeesCount - presentCount);
        const unresolvedCheckouts = attendance.filter(a => !a.checkOutTime).length;

        const leaves = await safeQueryCollection('leave_requests', {
          where: { fieldFilter: { field: { fieldPath: 'status' }, op: 'EQUAL', value: { stringValue: 'Approved' } } }
        });
        const activeLeaves = leaves.filter(l => l.startDate <= targetDate && l.endDate >= targetDate).length;

        // STEP 4: EXPENSE & TASKS DATA LOADED
        currentStage = 'EXPENSE_DATA_LOADED';
        const expenses = await safeQueryCollection('expense_claims', {
          where: { fieldFilter: { field: { fieldPath: 'status' }, op: 'EQUAL', value: { stringValue: 'Pending' } } }
        });
        const totalExpensesSum = expenses.reduce((sum, e) => sum + (parseFloat(e.amount) || 0), 0);

        const rawTasks = await safeQueryCollection('tasks');
        // Strictly filter tasks that belong to targetDate according to the Admin Panel engine
        const tasks = rawTasks.filter(t => {
          const tDate = t.dueDate || (t.completedAt ? t.completedAt.substring(0, 10) : t.createdAtDeviceTime ? t.createdAtDeviceTime.substring(0, 10) : '');
          return tDate === targetDate;
        });

        const rawWorkDetails = await safeQueryCollection('daily_work_details', {
          where: { fieldFilter: { field: { fieldPath: 'date' }, op: 'EQUAL', value: { stringValue: targetDate } } }
        });

        // Calculate efficiency using the exact same calculateEfficiency engine as the Admin Panel
        const evaluatedEmployees = approvedEmps.map(emp => {
          const empCode = emp.employeeCode || emp.id;
          const empName = emp.name || empCode;
          const dept = emp.department || emp.office || 'Operations';
          const teamLeaderId = emp.teamLeaderId || null;

          const calc = calculateEfficiency(
            emp.id || empCode,
            empCode,
            empName,
            dept,
            teamLeaderId,
            targetDate,
            targetDate,
            tasks as any,
            attendance as any,
            DEFAULT_WEIGHTAGES,
            rawWorkDetails as any
          );

          return {
            empCode,
            empName,
            dept,
            efficiency: calc.finalScore,
            grade: calc.grade,
            breakdown: calc.breakdown
          };
        });

        for (const emp of evaluatedEmployees) {
          if (!Number.isFinite(emp.efficiency)) {
            throw new Error(`Daily Report validation failed: Non-finite efficiency for ${emp.empCode}`);
          }
          if (emp.efficiency < -1 || emp.efficiency > 100) {
            throw new Error(`Daily Report validation failed: Out of bounds efficiency ${emp.efficiency} for ${emp.empCode}`);
          }
          if (emp.breakdown && emp.breakdown.assignedTasksCount === 0) {
            if (emp.breakdown.taskCompletionScore !== -1 || emp.breakdown.onTimeCompletionScore !== -1 || emp.breakdown.qualityScore !== -1) {
              throw new Error(`Daily Report validation failed: No-task employee ${emp.empCode} penalized by task factors.`);
            }
          }
        }

        // Separate active/evaluated employees with non-negative score vs uncalculated
        const validEvaluated = evaluatedEmployees.filter(e => e.efficiency >= 0);
        const evaluatedForStats = validEvaluated.length > 0 ? validEvaluated : evaluatedEmployees;

        const totalScoreSum = evaluatedForStats.reduce((sum, e) => sum + Math.max(0, e.efficiency), 0);
        const overallAvgEfficiency = evaluatedForStats.length > 0 ? Math.round(totalScoreSum / evaluatedForStats.length) : 0;
        const sortedByEff = [...evaluatedForStats].sort((a, b) => b.efficiency - a.efficiency);
        const highestEff = sortedByEff.length > 0 ? Math.max(0, sortedByEff[0].efficiency) : 0;
        const lowestEff = sortedByEff.length > 0 ? Math.max(0, sortedByEff[sortedByEff.length - 1].efficiency) : 0;

        const topPerformerCandidates = evaluatedForStats
          .filter(e => e.efficiency >= 60)
          .sort((a, b) => {
            if (b.efficiency !== a.efficiency) {
              return b.efficiency - a.efficiency;
            }
            return a.empCode.localeCompare(b.empCode);
          });

        const topPerformers = topPerformerCandidates.slice(0, 5);

        const improvementCandidates = evaluatedForStats
          .filter(e => e.efficiency < 60)
          .sort((a, b) => {
            if (a.efficiency !== b.efficiency) {
              return a.efficiency - b.efficiency;
            }
            return a.empCode.localeCompare(b.empCode);
          });

        const bottomPerformers = improvementCandidates.slice(0, 5);

        // Pre-render invariant checks
        const overlap = topPerformers.filter(top =>
          bottomPerformers.some(bottom => bottom.empCode === top.empCode)
        );
        if (overlap.length > 0) {
          throw new Error("Daily Report validation failed: Top Performers and Needs Improvement overlap.");
        }

        const invalidTopPerformers = topPerformers.filter(e => e.efficiency < 60);
        if (invalidTopPerformers.length > 0) {
          throw new Error("Daily Report validation failed: Top Performers contains employee below 60%.");
        }

        const invalidImprovement = bottomPerformers.filter(e => e.efficiency >= 60);
        if (invalidImprovement.length > 0) {
          throw new Error("Daily Report validation failed: Needs Improvement contains employee at or above 60%.");
        }

        const hasBelowThresholdEmployees = evaluatedForStats.some(e => e.efficiency < 60);
        if (bottomPerformers.length === 0 && hasBelowThresholdEmployees) {
          throw new Error("Daily Report validation failed: Employees below 60% exist but Needs Improvement is empty.");
        }

        const topPerformersEmptyMessage = evaluatedForStats.length > 0 
          ? `No qualifying top performers (all evaluated employees scored below 60%).`
          : `No performance records available`;

        const topPerformersRows = topPerformers.length > 0 ? topPerformers.map((p, idx) => `
          <tr style="border-bottom: 1px solid #f1f5f9;">
            <td style="padding: 12px 10px; font-weight: bold; color: #0f766e;">#${idx + 1}</td>
            <td style="padding: 12px 10px; color: #0f172a; font-weight: 500;">${p.empName} <span style="font-size: 11px; color: #64748b;">(${p.empCode})</span></td>
            <td style="padding: 12px 10px; color: #475569;">${p.dept}</td>
            <td style="padding: 12px 10px; font-weight: bold; color: #047857; text-align: right;">${Math.max(0, p.efficiency)}%</td>
          </tr>
        `).join('') : `<tr><td colspan="4" style="padding: 15px; text-align: center; color: #64748b; font-style: italic;">${topPerformersEmptyMessage}</td></tr>`;

        const needsImprovementEmptyMessage = evaluatedForStats.length > 0
          ? `No improvement records needed (All performers scored &ge; 60%)`
          : `No improvement records available`;

        const needsImprovementRows = bottomPerformers.length > 0 ? bottomPerformers.map((p, idx) => `
          <tr style="border-bottom: 1px solid #f1f5f9;">
            <td style="padding: 12px 10px; font-weight: bold; color: #b91c1c;">#${idx + 1}</td>
            <td style="padding: 12px 10px; color: #0f172a; font-weight: 500;">${p.empName} <span style="font-size: 11px; color: #64748b;">(${p.empCode})</span></td>
            <td style="padding: 12px 10px; color: #475569;">${p.dept}</td>
            <td style="padding: 12px 10px; font-weight: bold; color: #b91c1c; text-align: right;">${Math.max(0, p.efficiency)}%</td>
          </tr>
        `).join('') : `<tr><td colspan="4" style="padding: 15px; text-align: center; color: #64748b; font-style: italic;">${needsImprovementEmptyMessage}</td></tr>`;

        const adminPanelUrl = 'https://exfin-oms-enterprise-v5.pages.dev/x7Kp9';

        // STEP 5: REPORT_HTML_GENERATED
        currentStage = 'REPORT_HTML_GENERATED';
        const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>EXFIN OMS Daily Operational Report</title>
</head>
<body style="font-family: Arial, sans-serif; background-color: #f1f5f9; padding: 20px; margin: 0;">
  <div style="max-width: 800px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgb(0 0 0 / 0.1);">
    <div style="background: linear-gradient(135deg, #1e1b4b 0%, #31105e 100%); color: white; padding: 30px; text-align: center;">
      <h1 style="margin: 0; font-size: 26px; font-weight: bold;">EXFIN OMS</h1>
      <p style="margin: 5px 0 0 0; color: #c084fc; font-size: 14px;">Daily Operations & Administration Report</p>
      <div style="margin-top: 15px; font-weight: bold; background: rgba(255,255,255,0.15); display: inline-block; padding: 5px 16px; border-radius: 20px; font-size: 13px;">
        Report Date: ${targetDate} (Asia/Kolkata)
      </div>
    </div>
    <div style="padding: 25px;">
      <h3 style="border-bottom: 2px solid #f1f5f9; padding-bottom: 8px; color: #0f172a; text-transform: uppercase; font-size: 14px; margin-top: 0;">Summary Overview</h3>
      <div style="display: flex; gap: 12px; flex-wrap: wrap; margin-bottom: 20px;">
        <div style="flex: 1 1 120px; background: #ecfdf5; border: 1px solid #a7f3d0; padding: 12px; border-radius: 10px; text-align: center;">
          <div style="color: #047857; font-weight: bold; font-size: 11px;">PRESENT</div>
          <div style="font-size: 24px; color: #065f46; font-weight: bold;">${presentCount}</div>
        </div>
        <div style="flex: 1 1 120px; background: #fef2f2; border: 1px solid #fecaca; padding: 12px; border-radius: 10px; text-align: center;">
          <div style="color: #b91c1c; font-weight: bold; font-size: 11px;">ABSENT</div>
          <div style="font-size: 24px; color: #991b1b; font-weight: bold;">${absentCount}</div>
        </div>
        <div style="flex: 1 1 120px; background: #fffbeb; border: 1px solid #fde68a; padding: 12px; border-radius: 10px; text-align: center;">
          <div style="color: #d97706; font-weight: bold; font-size: 11px;">ACTIVE LEAVES</div>
          <div style="font-size: 24px; color: #92400e; font-weight: bold;">${activeLeaves}</div>
        </div>
        <div style="flex: 1 1 120px; background: #f8fafc; border: 1px solid #e2e8f0; padding: 12px; border-radius: 10px; text-align: center;">
          <div style="color: #475569; font-weight: bold; font-size: 11px;">PENDING EXPENSES</div>
          <div style="font-size: 24px; color: #0f172a; font-weight: bold;">₹${totalExpensesSum.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</div>
        </div>
      </div>
      
      <div style="margin-top: 20px; color: #334155; font-size: 14px; line-height: 1.8; border-top: 1px solid #f1f5f9; padding-top: 15px;">
        <p style="margin: 4px 0;"><strong>Total Active Employees:</strong> ${totalEmployeesCount}</p>
        <p style="margin: 4px 0;"><strong>Pending Expense Claims:</strong> ${expenses.length}</p>
        <p style="margin: 4px 0;"><strong>Unresolved Checkouts:</strong> ${unresolvedCheckouts}</p>
      </div>

      <div style="margin-top: 30px;">
        <div style="border-bottom: 2px solid #f1f5f9; padding-bottom: 8px;">
          <h3 style="color: #0f172a; font-size: 14px; text-transform: uppercase; margin: 0;">Efficiency Summary</h3>
          <p style="margin: 4px 0 0 0; font-size: 11px; color: #0f766e; font-weight: bold;">EFFICIENCY PERIOD: Previous Day — ${targetDate} (Asia/Kolkata)</p>
        </div>
        <table style="width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 14px;">
          <tr style="border-bottom: 1px solid #f1f5f9;"><td style="padding: 8px; color: #475569;">Average Efficiency</td><td style="padding: 8px; font-weight: bold; color: #0f766e; text-align: right;">${overallAvgEfficiency}%</td></tr>
          <tr style="border-bottom: 1px solid #f1f5f9;"><td style="padding: 8px; color: #475569;">Highest Performer</td><td style="padding: 8px; font-weight: bold; color: #047857; text-align: right;">${highestEff}%</td></tr>
          <tr style="border-bottom: 1px solid #f1f5f9;"><td style="padding: 8px; color: #475569;">Lowest Performer</td><td style="padding: 8px; font-weight: bold; color: #b91c1c; text-align: right;">${lowestEff}%</td></tr>
        </table>
      </div>

      <div style="margin-top: 30px;">
        <h3 style="color: #0f172a; border-bottom: 2px solid #f1f5f9; padding-bottom: 8px; font-size: 14px; text-transform: uppercase;">Top 5 Performers</h3>
        <table style="width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 13px;">
          ${topPerformersRows}
        </table>
      </div>

      <div style="margin-top: 30px;">
        <h3 style="color: #0f172a; border-bottom: 2px solid #f1f5f9; padding-bottom: 8px; font-size: 14px; text-transform: uppercase;">Needs Improvement</h3>
        <table style="width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 13px;">
          ${needsImprovementRows}
        </table>
      </div>

      <div style="margin-top: 35px; text-align: center;">
        <a href="${adminPanelUrl}" style="background-color: #0f766e; color: #ffffff; padding: 12px 28px; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 14px; display: inline-block;">View More</a>
      </div>
    </div>
    <div style="background: #f8fafc; border-top: 1px solid #e2e8f0; padding: 15px; text-align: center; color: #64748b; font-size: 12px;">
      EXFIN Office Management System — Generated Daily Operational Briefing
    </div>
  </div>
</body>
</html>`;

        // Pre-SMTP validations
        const containsSummary = html.includes('Summary Overview');
        const containsEfficiency = html.includes('Efficiency Summary');
        const containsTop5 = html.includes('Top 5 Performers');
        const containsNeedsImprovement = html.includes('Needs Improvement');
        const containsAdminLink = html.includes('View More');
        const containsX7Kp9 = html.includes('/x7Kp9');
        const containsEfficiencyPeriod = html.includes('EFFICIENCY PERIOD');

        if (!containsSummary || !containsEfficiency || !containsTop5 || !containsNeedsImprovement || !containsAdminLink || !containsX7Kp9 || !containsEfficiencyPeriod) {
          throw new Error('Daily Report HTML validation failed: missing required efficiency, period, or admin panel link sections.');
        }

        const htmlSizeBytes = new TextEncoder().encode(html).length;
        const subject = `EXFIN OMS — Previous Day Admin Report — ${targetDate}`;

        // STEP 7: GMAIL_SEND_STARTED
        currentStage = 'GMAIL_SEND_STARTED';
        const sendRes = await sendEmailViaGmailSmtp(recipients, subject, html);

        // STEP 8: GMAIL_SEND_COMPLETED
        currentStage = 'GMAIL_SEND_COMPLETED';
        const reportLogRef = `daily_admin_reports/${targetDate}`;
        const fieldsToUpdate: any = {
          reportDate: { stringValue: targetDate },
          status: { stringValue: 'SENT' },
          startedAt: { stringValue: new Date().toISOString() },
          completedAt: { stringValue: new Date().toISOString() },
          recipientCount: { integerValue: recipients.length },
          recipient: { stringValue: recipients.join(', ') },
          messageId: { stringValue: sendRes.messageId || 'simulated' }
        };
        if (isRetry) {
          fieldsToUpdate.lastRetriedAt = { stringValue: new Date().toISOString() };
          fieldsToUpdate.isRetry = { booleanValue: true };
        }
        await firestoreFetch(reportLogRef, 'PATCH', {
          fields: fieldsToUpdate
        });

        // Audit log entry for tracking
        await firestoreFetch(`audit_logs/${Date.now()}`, 'PATCH', {
          fields: {
            actionCategory: { stringValue: 'SYSTEM_SETTINGS' },
            action: { stringValue: isRetry ? `Manual Retry Daily Admin Report for ${targetDate}` : `Manual Dispatched Daily Admin Report for ${targetDate}` },
            timestamp: { stringValue: new Date().toISOString() },
          }
        }).catch(() => {});

        return new Response(JSON.stringify({ 
          success: true, 
          action: isRetry ? 'RETRY' : 'SEND',
          isRetry,
          stage: 'GMAIL_SEND_COMPLETED',
          message: isRetry ? "Previous Day email retried successfully and accepted by Gmail SMTP" : "Email accepted by Gmail SMTP",
          reportDate: targetDate,
          recipientCount: recipients.length,
          recipients,
          messageId: sendRes.messageId,
          htmlSizeBytes,
          stats: {
            totalEmployees: totalEmployeesCount,
            present: presentCount,
            absent: absentCount,
            activeLeaves: activeLeaves,
            pendingExpenses: expenses.length,
            totalExpenseSum: totalExpensesSum,
            unresolvedCheckouts
          }
        }), { headers: { 'Content-Type': 'application/json' } });
      } catch (err) {
        return new Response(JSON.stringify({
          success: false,
          stage: currentStage,
          reportDate: targetDate,
          error: err.message || 'Failed to dispatch report'
        }), { status: 400, headers: { 'Content-Type': 'application/json' } });
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
