import { APP_LAUNCH_PARAM, APP_LAUNCH_VALUE, APP_VERSION_PARAM } from '$lib/platform';

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
 * The mark saying "ask me again" — the way out of an instance.
 *
 * Without it, going back to the question would be answered by the question
 * itself: the launch reads what was chosen last time and sends you straight
 * back to the instance you were trying to leave. This forgets first.
 */
export const ARRIVING_TO_ASK = 'ask';

/**
 * The address of the question, for a page that wants out of wherever it is.
 *
 * Always the copy of the app on the device, never `/instance` on the instance
 * being left: that instance may be running a version of ontoplano old enough
 * not to have this screen, and a way back that depends on what somebody else
 * deployed is not a way back.
 */
export const askAgainOnThisPhone = (): string =>
	`${DEVICE_ORIGIN}${CHOOSE_PATH}?${ARRIVING_TO_ASK}=1`;

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

/**
 * The address a launch actually navigates to: the instance, wearing the mark.
 *
 * `?app=android` is how the instance's pages learn they are inside the app —
 * see `$lib/platform.ts` — and the shell's own version rides beside it, so an
 * instance that has moved on can say "update the app". Announced here, on the
 * way out of the copy on the device, because this is the one line every
 * launch passes through; the server keeps both in cookies and takes the
 * parameters straight back off the address.
 */
export function launchAddress(instance: string): string {
	try {
		const url = new URL(instance);
		url.searchParams.set(APP_LAUNCH_PARAM, APP_LAUNCH_VALUE);
		if (typeof __APP_VERSION__ === 'string')
			url.searchParams.set(APP_VERSION_PARAM, __APP_VERSION__);
		return url.toString();
	} catch {
		// Whatever this address is, it is not one to decorate — let the
		// navigation fail or succeed as itself.
		return instance;
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
		if (!url) rememberPhoneInstance();
	} catch {
		/* a browser that refuses storage still gets the app it is looking at */
	}
}

/**
 * That a phone-only instance was once started here.
 *
 * Kept apart from the choice itself, and never cleared: connecting to a server
 * afterwards does not delete what is on the phone, so the question on the
 * instance screen stops being "start one" and becomes "go back to the one you
 * have". Somebody who has written a month into this device and then tried the
 * official instance should not be offered a button that reads like it is about
 * to start again from nothing.
 */
const PHONE_MADE_AT = 'ontoplano:phone-instance';

/** Whether this device has been an instance at some point. */
export function phoneInstanceExists(): boolean {
	if (typeof localStorage === 'undefined') return false;
	try {
		return localStorage.getItem(PHONE_MADE_AT) === 'yes';
	} catch {
		return false;
	}
}

/** Remember that it does. Called the first time the phone is chosen. */
export function rememberPhoneInstance(): void {
	if (typeof localStorage === 'undefined') return;
	try {
		localStorage.setItem(PHONE_MADE_AT, 'yes');
	} catch {
		/* a browser that refuses storage still gets the instance it is looking at */
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
