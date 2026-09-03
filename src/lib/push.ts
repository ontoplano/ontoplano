/**
 * Signing this browser up to be told things while the app is closed.
 *
 * The browser half of `services/push.ts`. Three separate permissions are at
 * play and they are easy to confuse:
 *
 * 1. **The notification permission** is the browser's, granted by the person,
 *    and can only be asked for from a gesture — a prompt raised on page load is
 *    ignored by Firefox and held against the site by Chrome.
 * 2. **A push subscription** is this browser's address at its vendor's push
 *    service. Having permission does not create one; it has to be asked for.
 * 3. **Our row** is that address stored against the account, which is what lets
 *    the server reach this browser later.
 *
 * All three are per browser per profile, so this runs on the phone and on the
 * laptop independently, and losing one does not affect the other.
 */

/** The VAPID key travels as base64url and the API wants bytes. */
function toBytes(base64url: string): BufferSource {
	const padded = (base64url + '='.repeat((4 - (base64url.length % 4)) % 4))
		.replace(/-/g, '+')
		.replace(/_/g, '/');
	const raw = atob(padded);
	const bytes = new Uint8Array(raw.length);
	for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i);
	return bytes;
}

/** Whether this browser can do push at all. iOS below 16.4 cannot, for one. */
export function pushSupported(): boolean {
	return (
		typeof window !== 'undefined' &&
		'serviceWorker' in navigator &&
		'PushManager' in window &&
		typeof Notification !== 'undefined'
	);
}

/** Something a person can recognise as "this device" in a list of them. */
function label(): string {
	const agent = navigator.userAgent;
	const platform = /Android/.test(agent)
		? 'Android'
		: /iPhone|iPad/.test(agent)
			? 'iPhone'
			: /Mac/.test(agent)
				? 'Mac'
				: /Windows/.test(agent)
					? 'Windows'
					: /Linux/.test(agent)
						? 'Linux'
						: 'Browser';
	const browser = /Firefox/.test(agent)
		? 'Firefox'
		: /Edg\//.test(agent)
			? 'Edge'
			: /Chrome/.test(agent)
				? 'Chrome'
				: /Safari/.test(agent)
					? 'Safari'
					: '';
	return browser ? `${browser} on ${platform}` : platform;
}

/**
 * Ask, subscribe, and tell the server — in that order, from a click.
 *
 * Answers with what happened rather than throwing, because every outcome here
 * is ordinary: the person said no, the browser cannot do it, the instance has
 * no keys. Each of those is a different sentence on screen and none of them is
 * an error worth reporting.
 */
export async function enablePush(
	publicKey: string | null
): Promise<'on' | 'denied' | 'unsupported' | 'failed'> {
	if (!pushSupported() || !publicKey) return 'unsupported';

	const permission =
		Notification.permission === 'granted'
			? 'granted'
			: await Notification.requestPermission().catch(() => 'denied');
	if (permission !== 'granted') return 'denied';

	try {
		const registration = await navigator.serviceWorker.ready;
		// An existing subscription is reused rather than replaced: re-subscribing
		// with a different key throws, and the same one gives back what is
		// already there anyway.
		const subscription =
			(await registration.pushManager.getSubscription()) ??
			(await registration.pushManager.subscribe({
				userVisibleOnly: true,
				applicationServerKey: toBytes(publicKey)
			}));

		const response = await fetch('/api/push', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ subscription: subscription.toJSON(), label: label() })
		});
		return response.ok ? 'on' : 'failed';
	} catch {
		return 'failed';
	}
}

/**
 * Stop this browser being pushed to.
 *
 * Both halves: the row here and the subscription at the push service. Dropping
 * only ours would leave a subscription the browser thinks is live, and dropping
 * only the browser's would leave a row that fails every minute until the server
 * gives up on it.
 */
export async function disablePush(): Promise<void> {
	if (!pushSupported()) return;

	try {
		const registration = await navigator.serviceWorker.ready;
		const subscription = await registration.pushManager.getSubscription();
		if (!subscription) return;

		await fetch('/api/push', {
			method: 'DELETE',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ endpoint: subscription.endpoint })
		}).catch(() => {});
		await subscription.unsubscribe();
	} catch {
		// Nothing here is worth interrupting somebody over.
	}
}

/**
 * Whether this browser is currently signed up.
 *
 * Asks the browser rather than the server: the server's row can outlive a
 * subscription the browser has quietly dropped, and the question on screen is
 * "will this device be told", which only the device can answer.
 */
export async function pushEnabled(): Promise<boolean> {
	if (!pushSupported() || Notification.permission !== 'granted') return false;
	try {
		const registration = await navigator.serviceWorker.ready;
		return (await registration.pushManager.getSubscription()) !== null;
	} catch {
		return false;
	}
}
