import { DEVICE_ORIGIN, inPhoneApp } from './instance-choice';

/**
 * Google Play's purchase sheet, from either side of the app.
 *
 * Two origins take part in a purchase and neither can do it alone. The
 * instance holds the session, the account and the server that verifies the
 * purchase; only the copy of the app the phone carries has a bridge to the
 * shell, and only the shell can open Play's sheet (`PlayBilling.java`, compiled
 * into the copy Play distributes and no other). So a purchase is a round trip:
 * the instance sends the person to `/play` on the device's own origin with the
 * product and the account, the sheet opens there, and the token comes back to
 * the instance in the address — the same way the reminders key crosses at
 * `/ring`. The instance then claims it (`/api/billing/play/claim`).
 *
 * The account rides into Play as the purchase's obfuscated account id, so a
 * purchase whose trip back never lands — the app killed mid-sheet — still
 * reaches the right account through Play's notification to the server.
 */

/** Where the device's copy opens the sheet. */
export const PLAY_PATH = '/play';

/** What crosses in the address, both ways. */
export const PLAY_PARAMS = {
	/** The instance's origin, which the trip goes back to. */
	at: 'at',
	/** The Play product id. */
	sku: 'sku',
	/** The account the purchase is for, as Play's obfuscated account id. */
	account: 'account',
	/** On the way back: the purchase token. */
	purchase: 'purchase',
	/** On the way back: why there is no purchase. */
	failed: 'failed'
} as const;

/** What the shell answers. */
export type PlayAnswer =
	| { purchaseToken: string; product: string }
	| { cancelled: true }
	| { failed: string };

type Bridge = {
	subscribe(what: { product: string; account: string }): Promise<{
		purchaseToken?: string;
		product?: string;
		cancelled?: boolean;
	}>;
};

function bridge(): Bridge | null {
	if (!inPhoneApp()) return null;
	const capacitor = (globalThis as { Capacitor?: { Plugins?: Record<string, unknown> } }).Capacitor;
	const found = capacitor?.Plugins?.PlayBilling;
	return found ? (found as Bridge) : null;
}

/** Open Play's sheet for `product`. Only meaningful on the device's own origin. */
export async function subscribeThroughPlay(product: string, account: string): Promise<PlayAnswer> {
	const play = bridge();
	if (!play) return { failed: 'unavailable' };
	try {
		const answer = await play.subscribe({ product, account });
		if (answer.cancelled) return { cancelled: true };
		if (answer.purchaseToken) {
			return { purchaseToken: answer.purchaseToken, product: answer.product ?? product };
		}
		return { failed: 'empty' };
	} catch (e) {
		// The shell rejects with Play's own response code as the error code.
		const code = (e as { code?: unknown })?.code;
		return { failed: typeof code === 'string' && code ? code : 'error' };
	}
}

/** The address on the device's copy that opens the sheet, for a page on the instance. */
export function playTripAddress(instance: string, sku: string, account: string): string {
	const url = new URL(PLAY_PATH, DEVICE_ORIGIN);
	url.searchParams.set(PLAY_PARAMS.at, instance);
	url.searchParams.set(PLAY_PARAMS.sku, sku);
	url.searchParams.set(PLAY_PARAMS.account, account);
	return url.toString();
}

/**
 * The address back on the instance, carrying what happened.
 *
 * `null` for `instance` when the asking origin is not one this phone opens:
 * a token is money, and it only goes back to the instance the person chose.
 */
export function playReturnAddress(
	instance: string,
	chosen: string | null,
	sku: string,
	answer: PlayAnswer
): string | null {
	let home: URL;
	try {
		home = new URL(instance);
		if (!chosen || new URL(chosen).origin !== home.origin) return null;
	} catch {
		return null;
	}
	if ('cancelled' in answer) return new URL('/settings/billing', home).toString();
	const back = new URL('/buy', home);
	back.searchParams.set('play', '1');
	back.searchParams.set(PLAY_PARAMS.sku, sku);
	if ('purchaseToken' in answer) back.searchParams.set(PLAY_PARAMS.purchase, answer.purchaseToken);
	else back.searchParams.set(PLAY_PARAMS.failed, answer.failed);
	return back.toString();
}
