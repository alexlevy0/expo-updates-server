import crypto from 'crypto';
import { config } from '../config';

interface WebhookPayload {
  event: 'release.created' | 'release.activated' | 'release.rollback';
  release: {
    id: string;
    platform: string;
    channel: string;
    runtimeVersion: string;
    message?: string;
  };
  timestamp: string;
}

export async function sendWebhook(payload: WebhookPayload): Promise<void> {
  const url = config.webhooks.onReleaseUrl;
  if (!url) return;

  const body = JSON.stringify(payload);
  const signature = config.webhooks.secret
    ? crypto.createHmac('sha256', config.webhooks.secret).update(body).digest('hex')
    : null;

  try {
    await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(signature && { 'X-Webhook-Signature': `sha256=${signature}` }),
      },
      body,
    });
  } catch (error) {
    console.error('Webhook failed:', error);
  }
}
