import nodemailer from 'nodemailer';

export interface EmailPayload {
  to: string | string[];
  bcc?: string | string[];
  subject: string;
  html: string;
}

export interface SendEmailResult {
  success: boolean;
  simulated: boolean;
  messageId?: string;
  message?: string;
  error?: string;
  recipientCount?: number;
  recipients?: string[];
  accepted?: string[];
  rejected?: string[];
}

export async function sendMail(payload: EmailPayload): Promise<SendEmailResult> {
  const host = process.env.SMTP_HOST || 'smtp.gmail.com';
  const portStr = process.env.SMTP_PORT || '465';
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASSWORD || process.env.SMTP_PASS;

  if (!user || !pass) {
    return {
      success: false,
      simulated: false,
      error: 'SMTP_USER or SMTP_PASSWORD is not configured in the production environment.'
    };
  }

  // Extract recipients array
  let toList: string[] = [];
  if (Array.isArray(payload.to)) {
    toList = payload.to.map(s => s.trim()).filter(Boolean);
  } else if (typeof payload.to === 'string') {
    toList = payload.to.split(',').map(s => s.trim()).filter(Boolean);
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const validRecipients = toList.filter(e => emailRegex.test(e));

  if (validRecipients.length !== 3) {
    return {
      success: false,
      simulated: false,
      error: 'EMAIL_RECIPIENTS contains invalid recipient configuration.'
    };
  }

  // Set sender to the authenticated Gmail account with friendly display name
  const fromName = process.env.EMAIL_FROM_NAME || 'EXFIN OMS Admin Report';
  const from = process.env.SMTP_FROM || `${fromName} <${user}>`;
  const to = `${fromName} <${user}>`;
  const replyTo = user;

  try {
    const port = parseInt(portStr, 10);
    const isSecure = port === 465 || process.env.SMTP_SECURE === 'true';

    const transporter = nodemailer.createTransport({
      host,
      port,
      secure: isSecure,
      auth: {
        user,
        pass,
      },
      tls: {
        rejectUnauthorized: false
      }
    });

    try {
      await transporter.verify();
      console.log(`[SMTP Email Dispatcher] Verified connection with ${host}:${port}`);
    } catch (verifyErr: any) {
      console.error(`[SMTP Email Dispatcher] Connection/Authentication failed:`, verifyErr);
      const msg = verifyErr.message || String(verifyErr);
      if (
        msg.includes('535') ||
        msg.toLowerCase().includes('auth') ||
        msg.toLowerCase().includes('credential') ||
        msg.toLowerCase().includes('invalid login')
      ) {
        return {
          success: false,
          simulated: false,
          error: 'Gmail SMTP authentication failed.'
        };
      }
      return {
        success: false,
        simulated: false,
        error: 'Unable to connect to Gmail SMTP.'
      };
    }

    const info = await transporter.sendMail({
      from,
      to,
      replyTo,
      bcc: validRecipients,
      subject: payload.subject,
      html: payload.html,
    });

    const accepted = (info.accepted || []) as string[];
    const rejected = (info.rejected || []) as string[];

    if (rejected.length > 0) {
      return {
        success: false,
        simulated: false,
        error: 'Gmail rejected one or more recipients.',
        accepted,
        rejected
      };
    }

    console.log(`[SMTP Email Dispatcher] Email accepted by Gmail SMTP to ${validRecipients.join(', ')}. MessageId: ${info.messageId}`);

    return {
      success: true,
      simulated: false,
      message: 'Email accepted by Gmail SMTP',
      messageId: info.messageId,
      recipientCount: validRecipients.length,
      recipients: validRecipients,
      accepted,
      rejected
    };
  } catch (err: any) {
    console.error(`[SMTP Email Dispatcher] Failed to send email:`, err);
    const msg = err.message || String(err);
    if (
      msg.includes('535') ||
      msg.toLowerCase().includes('auth') ||
      msg.toLowerCase().includes('credential') ||
      msg.toLowerCase().includes('invalid login')
    ) {
      return {
        success: false,
        simulated: false,
        error: 'Gmail SMTP authentication failed.'
      };
    }
    if (
      msg.toLowerCase().includes('connect') ||
      msg.toLowerCase().includes('econnrefused') ||
      msg.toLowerCase().includes('timeout') ||
      msg.toLowerCase().includes('enotfound')
    ) {
      return {
        success: false,
        simulated: false,
        error: 'Unable to connect to Gmail SMTP.'
      };
    }
    if (msg.toLowerCase().includes('recipient') || msg.includes('550') || msg.includes('553')) {
      return {
        success: false,
        simulated: false,
        error: 'Gmail rejected one or more recipients.'
      };
    }
    return {
      success: false,
      simulated: false,
      error: msg
    };
  }
}
