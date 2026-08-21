import { ChannelDeliveryStatus } from '../../types/notification';

export interface SmsPayload {
  recipientMobile: string;
  recipientName?: string;
  message: string;
}

/**
 * Server/Backend SMS Delivery Dispatcher
 * Reserved strictly for CRITICAL notifications (e.g. Account Status Change, Critical Admin Alert).
 * Handles missing credentials gracefully without breaking app execution.
 */
export async function dispatchSmsNotification(payload: SmsPayload): Promise<ChannelDeliveryStatus> {
  if (!payload.recipientMobile) {
    return 'NOT_REQUIRED';
  }

  try {
    const isSmsConfigured = typeof process !== 'undefined' && (process.env.TWILIO_AUTH_TOKEN || process.env.SMS_API_KEY);

    if (!isSmsConfigured) {
      console.log(`[SMS Service] Provider missing credentials for ${payload.recipientMobile}. Setting status: NOT_CONFIGURED.`);
      return 'NOT_CONFIGURED';
    }

    const res = await fetch('/api/notifications/sms', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (res.ok) {
      return 'DELIVERED';
    } else {
      return 'FAILED';
    }
  } catch (err) {
    console.warn('[SMS Service] SMS dispatch warning:', err);
    return 'NOT_CONFIGURED';
  }
}
