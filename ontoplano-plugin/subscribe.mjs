const url = process.env.ONTOPLANO_URL;
const token = process.env.ONTOPLANO_TOKEN;
const webhookUrl = process.env.PUBLIC_WEBHOOK_URL;
if (!url || !token || !webhookUrl)
	throw new Error('ONTOPLANO_URL, ONTOPLANO_TOKEN and PUBLIC_WEBHOOK_URL are required');
const response = await fetch(new URL('/api/v1/webhooks', url), {
	method: 'POST',
	headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
	body: JSON.stringify({ url: webhookUrl, events: ['audio.uploaded'] })
});
if (!response.ok) throw new Error(`Subscription failed: HTTP ${response.status}`);
const { secret } = await response.json();
console.log(`Set WEBHOOK_SECRET=${secret} in your secret manager, then start the receiver.`);
