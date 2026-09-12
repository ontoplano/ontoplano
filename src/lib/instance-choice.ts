/**
 * Which instance this app opens on, when the person has said.
 *
 * A build opens on its own instance — that is what the flavours are for — and
 * this is the override: chosen on `/instance`, kept in the browser it was
 * chosen in, and read at launch. Nothing about it is an account setting,
 * because it decides *which* account system is being talked to.
 */
export const OFFICIAL_INSTANCE = 'https://app.ontoplano.com';

/**
 * What the phone app adds to the user agent.
 *
 * The one thing a page can still see about its shell once it has been sent to
 * somebody else's origin, where the app's own globals do not reach. It is how
 * the instance screen knows to offer the way back to the copy on the phone —
 * an offer that would be a dead end in a desktop browser.
 *
 * `scripts/android-flavours.mjs` reads this string out of this file and puts
 * it in every flavour's Capacitor config, so the two cannot disagree.
 */
export const APP_USER_AGENT = 'OntoplanoApp';

/**
 * Where the copy of the app on the phone is served from.
 *
 * Capacitor's own origin on Android, which is fixed unless the shell's config
 * changes it — and the shell does not. Leaving an instance means navigating
 * here, because the phone-only instance is not a place the app can go "back"
 * to: it is a different origin with its own storage, and only an address
 * reaches it.
 */
export const DEVICE_ORIGIN = 'https://localhost';

/** Where the question is asked. Also where leaving an instance lands. */
export const CHOOSE_PATH = '/instance';

/** The mark saying the answer is this phone. */
export const ARRIVING_HOME = 'here';

/** The mark carrying an instance to adopt and open. */
export const ARRIVING_AT = 'at';

/**
 * The question's address on the copy of the app the phone carries, carrying
 * the answer with it.
 *
 * Where a page served by an instance sends the choice. The app decides at
 * launch where to go and reads that decision out of the device origin's
 * storage, which a page on somebody else's origin cannot write — storage
 * belongs to the origin. So the answer travels as an address instead: nothing
 * for this phone, or the instance to open from now on.
 */
export const chooseOnThisPhone = (instance: string | null): string => {
	const answer = instance ? `${ARRIVING_AT}=${encodeURIComponent(instance)}` : `${ARRIVING_HOME}=1`;
	return `${DEVICE_ORIGIN}${CHOOSE_PATH}?${answer}`;
};

/**
 * The file each flavour ships saying which address its first screen suggests.
 *
 * Served from the app's own origin, so it is only ever there in the app — a
 * hosted instance has no such file and the fetch that looks for it fails
 * quietly, which is the right answer for a browser.
 */
export const INSTANCE_SUGGESTION_FILE = 'instance-suggestion.json';

/** Whether this page is being drawn inside the phone app, wherever it came from. */
export function inPhoneApp(): boolean {
	if (typeof navigator === 'undefined') return false;
	return navigator.userAgent.includes(APP_USER_AGENT);
}

/**
 * The address this build suggests, or null.
 *
 * Only a suggestion: it fills the address field on the instance screen and is
 * never navigated to on its own. A build that ships no such file — every web
 * build — gets null, and the screen falls back to the official instance.
 */
export async function suggestedInstance(): Promise<string | null> {
	try {
		const answer = await fetch(`/${INSTANCE_SUGGESTION_FILE}`, { cache: 'no-store' });
		if (!answer.ok) return null;
		const said = (await answer.json()) as { suggests?: unknown };
		return typeof said.suggests === 'string' && said.suggests ? said.suggests : null;
	} catch {
		return null;
	}
}

const KEPT_AT = 'ontoplano:instance';

/**
 * What is written down when the answer is "this phone".
 *
 * A value rather than an absent key, because the two are different answers:
 * nothing written down means nobody has been asked yet, and the app asks. If
 * choosing the phone erased the key instead, the question would come back
 * every launch.
 */
const PHONE = 'phone';

/** What was chosen here: an address, `'phone'`, or null for nobody has said. */
export function storedChoice(): string | null {
	if (typeof localStorage === 'undefined') return null;
	try {
		return localStorage.getItem(KEPT_AT);
	} catch {
		return null;
	}
}

/** The address chosen here, or null for this phone — or for not yet asked. */
export function storedInstance(): string | null {
	const choice = storedChoice();
	return choice && choice !== PHONE ? choice : null;
}

/** Whether the answer here was "this phone". */
export function choseThisPhone(): boolean {
	return storedChoice() === PHONE;
}

/** Remember it — null means "this device is the instance". */
export function rememberInstance(url: string | null): void {
	if (typeof localStorage === 'undefined') return;
	try {
		localStorage.setItem(KEPT_AT, url || PHONE);
	} catch {
		/* a browser that refuses storage still gets the app it is looking at */
	}
}

/** Forget it, so the next launch asks again. Leaving an instance does this. */
export function forgetInstance(): void {
	if (typeof localStorage === 'undefined') return;
	try {
		localStorage.removeItem(KEPT_AT);
	} catch {
		/* nothing to forget in a browser that refuses storage */
	}
}
