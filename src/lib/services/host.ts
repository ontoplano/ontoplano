/**
 * What the surrounding instance does for the services.
 *
 * A handful of things the services fire off are not theirs to implement:
 * delivering a webhook, knowing who shares a family plan, enforcing a paid
 * plan's limits. On the server those are real modules with network access and
 * billing tables behind them; on a self-contained instance they have nothing to stand
 * on — and, more to the point, nothing to do.
 *
 * The defaults below ARE the self-contained instance, correct by construction rather
 * than by configuration: one account means the family circle is you; no
 * billing means no limits to enforce; no listeners means an event announced
 * to nobody. The server overrides all of it in `$lib/server/host.ts`, bound
 * in the same breath as its database, so a server can no more forget these
 * than forget where its data is.
 */
import type { Ctx } from './ctx.js';
import { ValidationError } from './errors.js';
import type { LimitKey } from '../plans.js';
import type { WebhookEvent } from '../webhook-events.js';

export interface Host {
	/** Announce that something happened, to whatever is subscribed to hear it. */
	emit(ctx: Ctx, event: WebhookEvent, data: Record<string, unknown>): void;
	/** Everyone whose rows this account may see: the family circle, self included. */
	familyUserIds(userId: string): string[];
	/** Refuse a write that would take a paid plan past what it covers. */
	assertWithinLimit(ctx: Ctx, key: LimitKey, adding?: number): void;
	/** Refuse an entry that references more pictures than this instance allows. */
	assertEntryWithinLimit(content: string): void;
	/**
	 * A reminder was created, changed, or deleted, so whatever fires them
	 * should look at the schedule again. The server pokes its delivery clock;
	 * a self-contained instance will hand the schedule to the device's own alarms.
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
}

const localInstance: Host = {
	emit() {},
	familyUserIds(userId) {
		return [userId];
	},
	assertWithinLimit() {},
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
	fetchPublic: (url, init) => fetch(url, init)
};

export let host: Host = localInstance;

export function bindHost(instance: Host): void {
	host = instance;
}
