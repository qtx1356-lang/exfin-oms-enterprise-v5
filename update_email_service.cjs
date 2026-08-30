const fs = require('fs');

let code = `import nodemailer from 'nodemailer';

export interface EmailPayload {
  to: string;
  bcc?: string | string[];
  subject: string;
  html: string;
}

export interface SendEmailResult {
  success: boolean;
  simulated: boolean;
  messageId?: string;
  error?: string;
  accepted?: string[];
  rejected?: string[];
}

export async function sendMail(payload: EmailPayload): Promise<SendEmailResult> {
  const host = process.env.SMTP_HOST;
  const portStr = process.env.SMTP_PORT || '587';
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const from = process.env.SMTP_FROM || 'EXFIN OMS <noreply@exfin-oms.internal>';

  const isConfigured = !!(host && user && pass);

  if (!isConfigured) {
    throw new Error('Email provider configuration missing: SMTP credentials are not configured in environment.');
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
        rejectUnauthorized: false // Helps avoid some strict cert issues
      }
    });

    // Explicitly verify the connection first
    try {
      await transporter.verify();
      console.log(\`[SMTP Email Dispatcher] Verification successful with \${host}:\${port}\`);
    } catch (verifyErr: any) {
      console.error(\`[SMTP Email Dispatcher] Connection/Authentication failed:\`, verifyErr);
      throw new Error(\`SMTP verification failed: \${verifyErr.message}\`);
    }

    const info = await transporter.sendMail({
      from,
      to: payload.to,
      bcc: payload.bcc,
      subject: payload.subject,
      html: payload.html,
    });

    console.log(\`[SMTP Email Dispatcher] Sent email successfully to \${payload.to}. MessageId: \${info.messageId}\`);

    return {
      success: true,
      simulated: false,
      messageId: info.messageId,
      accepted: (info.accepted || []) as string[],
      rejected: (info.rejected || []) as string[]
    };
  } catch (err: any) {
    console.error(\`[SMTP Email Dispatcher] Failed to send email to \${payload.to}:\`, err);
    return {
      success: false,
      simulated: false,
      error: err.message || String(err)
    };
  }
}
`;

fs.writeFileSync('server/services/emailService.ts', code);
