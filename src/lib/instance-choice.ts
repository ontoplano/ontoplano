/**
 * Which instance this app opens on, when the person has said.
 *
 * A build opens on its own instance — that is what the flavours are for — and
 * this is the override: chosen on `/instance`, kept in the browser it was
 * chosen in, and read at launch. Nothing about it is an account setting,
 * because it decides *which* account system is being talked to.
 */
export const OFFICIAL_INSTANCE = 'https://app.ontoplano.com';

const KEPT_AT = 'ontoplano:instance';

/** The address chosen here, or null for the app's own files. */
export function storedInstance(): string | null {
	if (typeof localStorage === 'undefined') return null;
	try {
		return localStorage.getItem(KEPT_AT);
	} catch {
		return null;
	}
}

/** Remember it, or forget it — null means "this device is the instance". */
export function rememberInstance(url: string | null): void {
	if (typeof localStorage === 'undefined') return;
	try {
		if (url) localStorage.setItem(KEPT_AT, url);
		else localStorage.removeItem(KEPT_AT);
	} catch {
		/* a browser that refuses storage still gets the app it is looking at */
	}
}
