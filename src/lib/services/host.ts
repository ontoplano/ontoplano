/**
 * What the surrounding instance does for the services.
 *
 * A handful of things the services fire off are not theirs to implement:
 * delivering a webhook, knowing who shares a family plan, enforcing a paid
 * plan's limits. On the server those are real modules with network access and
 * billing tables behind them; on an isolated instance they have nothing to stand
 * on — and, more to the point, nothing to do.
 *
 * The defaults below ARE the isolated instance, correct by construction rather
 * than by configuration: one account means the family circle is you; no
 * billing means no limits to enforce; no listeners means an event announced
 * to nobody. The server overrides all of it in `$lib/server/host.ts`, bound
 * in the same breath as its database, so a server can no more forget these
 * than forget where its data is.
 */
import type { Ctx } from './ctx.js';
import type { Capabilities } from '../capabilities.js';
import { ValidationError } from './errors.js';
import type { LimitKey } from '../plans.js';
import { DEVICE_MEDIA_LIMITS, type MediaLimits } from './media-limits.js';
import type { WebhookEvent } from '../webhook-events.js';

/** The signed-out door's four facts. */
export type FrontDoor = {
	canRegister: boolean;
	tagline: string;
	siteUrl: string;
	docsUrl: string;
};

/** Off, or asked-and-answered. The same three words the settings row uses. */
export type ClientErrorState = 'off' | 'ask' | 'yes' | 'no';

export interface Host {
	/** Announce that something happened, to whatever is subscribed to hear it. */
	emit(ctx: Ctx, event: WebhookEvent, data: Record<string, unknown>): void;
	/** Everyone whose rows this account may see: the family circle, self included. */
	familyUserIds(userId: string): string[];
	/** Refuse a write that would take a paid plan past what it covers. */
	assertWithinLimit(ctx: Ctx, key: LimitKey, adding?: number): void;
	/**
	 * What this instance allows a picture to be. The server reads its config
	 * file; a device answers with its own numbers.
	 */
	mediaLimits(): MediaLimits;
	/** Refuse an entry that references more pictures than this instance allows. */
	assertEntryWithinLimit(content: string): void;
	/**
	 * A reminder was created, changed, or deleted, so whatever fires them
	 * should look at the schedule again. The server pokes its delivery clock;
	 * an isolated instance will hand the schedule to the device's own alarms.
	 */
	reminderScheduleChanged(): void;
	/**
	 * An address the instance is willing to fetch from, checked before it is
	 * stored. The server refuses anything that could reach into its own
	 * network; a browser only speaks http(s) and enforces the rest itself.
	 */
	assertPublicUrl(raw: string, what: string): URL;
	/** Fetch from the outside world, under the instance's own guard. */
	fetchPublic(url: string, init?: RequestInit): Promise<Response>;
	/**
	 * What the signed-out door says, or null where nobody can be signed out.
	 *
	 * Every part of it is a fact about a deployment — whether registration is
	 * open, the operator's tagline, where this instance's site and docs are —
	 * so the served instance answers and an isolated one has no door at all:
	 * the person holding the device is the account.
	 */
	frontDoor(): FrontDoor | null;
	/**
	 * Whether this instance collects what broke in somebody's browser, and
	 * whether this account has said yes. `off` everywhere the question does
	 * not arise, which is also what hides the row.
	 */
	clientErrorReports(userId: string): ClientErrorState;
	/** Record the answer to that question. Nothing to record where it is `off`. */
	setClientErrorReports(ctx: Ctx, decision: unknown): void;
	/**
	 * Whether a phone holds a key to ring for this instance.
	 *
	 * A phone showing an instance cannot be asked anything by that instance's
	 * pages — the app's plugins reach the copy it carries and no further — so
	 * the reminders page cannot know whether reminders arrive with the app
	 * closed. The instance minted the key, though, so it can answer from the
	 * account. `false` on a device, where the question does not arise: the
	 * copy on the phone IS the phone, and its alarms are its own.
	 */
	ringsOnAPhone(ctx: Ctx): boolean;

	/**
	 * What this deployment can do at all — see `capabilities.ts`.
	 *
	 * Through the seam rather than read from the server's own settings,
	 * because the pages that ask are compiled into the device's worker as
	 * well: one `import` of `$lib/server/*` from a route's server file pulls
	 * `node:os` into a browser bundle and the whole isolated build stops
	 * compiling. A device answers for itself — nothing reaches it and it is
	 * not running when the app is shut — which is the honest answer and not a
	 * placeholder.
	 */
	capabilities(): Capabilities;
}

const localInstance: Host = {
	emit() {},
	familyUserIds(userId) {
		return [userId];
	},
	assertWithinLimit() {},
	ringsOnAPhone: () => false,
	// Nothing can reach a phone, and it is not running when the app is closed.
	capabilities: () => ({ reachable: false, awake: false }),
	mediaLimits: () => DEVICE_MEDIA_LIMITS,
	assertEntryWithinLimit() {},
	reminderScheduleChanged() {},
	assertPublicUrl(raw, what) {
		let url: URL;
		try {
			url = new URL(raw);
		} catch {
			throw new ValidationError(`That is not a URL this ${what} can use`);
		}
		if (url.protocol !== 'http:' && url.protocol !== 'https:')
			throw new ValidationError(`A ${what} address starts with http:// or https://`);
		return url;
	},
	fetchPublic: (url, init) => fetch(url, init),
	// An isolated instance has nobody to sign in and nobody to report to.
	frontDoor: () => null,
	clientErrorReports: () => 'off',
	setClientErrorReports() {}
};

export let host: Host = localInstance;

export function bindHost(instance: Host): void {
	host = instance;
}
