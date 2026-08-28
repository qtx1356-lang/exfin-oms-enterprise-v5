import nodemailer from 'nodemailer';

export interface EmailPayload {
  to: string;
  subject: string;
  html: string;
}

export interface SendEmailResult {
  success: boolean;
  simulated: boolean;
  messageId?: string;
  error?: string;
}

/**
 * Server-Side Email Delivery Service
 * Delivers professional HTML emails using Nodemailer with SMTP credentials.
 * Falls back to console simulation if SMTP credentials are not configured in environment.
 */
export async function sendMail(payload: EmailPayload): Promise<SendEmailResult> {
  const host = process.env.SMTP_HOST;
  const portStr = process.env.SMTP_PORT || '587';
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const from = process.env.SMTP_FROM || 'EXFIN OMS <noreply@exfin-oms.internal>';

  const isConfigured = !!(host && user && pass);

  if (!isConfigured) {
    console.log(`[SMTP Email Simulation]
To: ${payload.to}
Subject: ${payload.subject}
Body Size: ${payload.html.length} chars
--- FALLBACK SIMULATION ONLY ---`);
    return {
      success: true,
      simulated: true,
      messageId: `sim_${Date.now()}_${Math.floor(Math.random() * 1000)}`
    };
  }

  try {
    const port = parseInt(portStr, 10);
    const transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465, // Use SSL for port 465
      auth: {
        user,
        pass,
      },
      tls: {
        rejectUnauthorized: false
      }
    });

    const info = await transporter.sendMail({
      from,
      to: payload.to,
      subject: payload.subject,
      html: payload.html,
    });

    console.log(`[SMTP Email Dispatcher] Sent email successfully to ${payload.to}. MessageId: ${info.messageId}`);
    return {
      success: true,
      simulated: false,
      messageId: info.messageId,
    };
  } catch (err: any) {
    console.error(`[SMTP Email Dispatcher] Failed to send email to ${payload.to}:`, err);
    return {
      success: false,
      simulated: false,
      error: err.message || String(err)
    };
  }
}
