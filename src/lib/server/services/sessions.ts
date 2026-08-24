import { and, desc, eq, gt } from 'drizzle-orm';

import { db } from '../db/index.js';
import { session } from '../db/schema.js';
import type { Ctx } from './ctx.js';
import { NotFoundError } from './errors.js';

/**
 * The sessions an account currently has open.
 *
 * Session tokens never leave the server: the page addresses a session by its
 * id, and this module is the only thing that turns an id back into the token
 * better-auth needs to revoke it. Putting the tokens in the HTML would make the
 * page a list of working credentials.
 */

export type SessionSummary = {
	id: string;
	/** UTC ISO-8601. */
	createdAt: string;
	/** UTC ISO-8601; better-auth touches the row as the session is used. */
	lastSeen: string;
	device: string;
	ipAddress: string | null;
	/** The session making this request. */
	current: boolean;
};

export function listSessions(ctx: Ctx, currentToken?: string): SessionSummary[] {
	const rows = db
		.select()
		.from(session)
		.where(and(eq(session.userId, ctx.userId), gt(session.expiresAt, ctx.now)))
		.orderBy(desc(session.updatedAt))
		.all();

	return rows.map((row) => ({
		id: row.id,
		createdAt: row.createdAt.toISOString(),
		lastSeen: row.updatedAt.toISOString(),
		device: describeUserAgent(row.userAgent),
		ipAddress: row.ipAddress || null,
		current: !!currentToken && row.token === currentToken
	}));
}

/** The token for one of this account's sessions, or a 404. */
export function sessionTokenById(ctx: Ctx, id: string): string {
	const row = db
		.select({ token: session.token })
		.from(session)
		.where(and(eq(session.id, id), eq(session.userId, ctx.userId)))
		.get();

	if (!row) throw new NotFoundError('session');
	return row.token;
}

/**
 * A user agent as something a person recognises.
 *
 * Deliberately crude — the string is a self-reported free text field, and the
 * job here is only to help someone tell "my phone" from "the laptop I left at
 * the office", not to build a device database.
 */
export function describeUserAgent(ua: string | null | undefined): string {
	if (!ua) return 'Unknown device';

	const browser = /\bEdg\//.test(ua)
		? 'Edge'
		: /\bOPR\/|\bOpera\b/.test(ua)
			? 'Opera'
			: /\bFirefox\//.test(ua)
				? 'Firefox'
				: /\bChrome\//.test(ua)
					? 'Chrome'
					: /\bSafari\//.test(ua)
						? 'Safari'
						: null;

	const platform = /\bAndroid\b/.test(ua)
		? 'Android'
		: /\b(iPhone|iPad|iPod)\b/.test(ua)
			? 'iOS'
			: /\bMac OS X\b/.test(ua)
				? 'macOS'
				: /\bWindows\b/.test(ua)
					? 'Windows'
					: /\bLinux\b/.test(ua)
						? 'Linux'
						: null;

	if (browser && platform) return `${browser} on ${platform}`;
	return browser ?? platform ?? 'Unknown device';
}
