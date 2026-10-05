/**
 * Taking your data out, and closing your account — and what this instance
 * allows of both.
 *
 * The walk over every table holding user data is in
 * `$lib/services/account-data.ts`, which a device runs too. What is here is
 * the part that needs a server behind it: how many exports a plan allows in a
 * day, the log that counts them, and the audit line each one writes. Both
 * halves are re-exported from here so the rest of the server keeps one import.
 */

import { getUserSetting, setUserSetting } from '../settings.js';
import { PLANS } from '../../plans.js';
import { record as audit } from '$lib/services/audit.js';
import { RateLimitedError } from '$lib/services/errors.js';
import { resolvePlan } from './subscriptions.js';
import { build } from './version.js';
import {
	PICTURE_TABLES,
	USER_TABLES,
	hoursUntil,
	type AccountExport,
	accountRow
} from '$lib/services/account-data.js';

export * from '$lib/services/account-data.js';

/**
 * How many exports are left today, and when the next one unlocks.
 *
 * An export is every row this account owns in one file. Two a day is plenty for
 * a person and mean for anything scraping the endpoint in a loop, which is the
 * only other reason to ask for it repeatedly.
 */
/**
 * How many exports a day.
 *
 * The plan decides; this is the floor a plan cannot go below and what an
 * instance without billing uses.
 */
/**
 * How many exports a day.
 *
 * The plan decides — this is the fallback for an instance that sells nothing,
 * and the number the free plan happens to use.
 */
export const EXPORTS_PER_DAY = 2;

/** How many exports this account's plan allows in a day. */
export function exportsAllowedFor(userId: string, now: Date = new Date()): number {
	const entitlement = resolvePlan(userId, now);
	return PLANS[entitlement.plan].limits.exportsPerDay ?? EXPORTS_PER_DAY;
}
const EXPORT_WINDOW_MS = 24 * 60 * 60 * 1000;
const EXPORT_LOG_KEY = 'export.log';

export type ExportAllowance = {
	remaining: number;
	/** When the oldest export in the window falls out of it. Null when unused. */
	nextAt: string | null;
};

/**
 * One export in the log, and the key of the press that asked for it.
 *
 * A GET is a request the browser may send twice: when the answer to the first
 * never arrives — a keep-alive socket closed under it — Chromium repeats it on
 * its own, and the page sees one request where the server saw two. Counting
 * each would spend two of the day's exports on one press, so the page names
 * its press and a name already in the log is not charged again. Entries
 * written before keys existed are bare timestamps.
 */
type LoggedExport = { at: string; key: string | null };

/** What a press may call itself: short, and nothing that needs escaping. */
const EXPORT_KEY = /^[A-Za-z0-9-]{8,64}$/;

function exportLog(userId: string, now: Date): LoggedExport[] {
	const raw = getUserSetting(userId, EXPORT_LOG_KEY);
	if (!raw) return [];

	try {
		const parsed: unknown = JSON.parse(raw);
		if (!Array.isArray(parsed)) return [];
		return parsed
			.map((v): LoggedExport | null => {
				if (typeof v === 'string') return { at: v, key: null };
				if (v && typeof v === 'object' && typeof v.at === 'string')
					return { at: v.at, key: typeof v.key === 'string' ? v.key : null };
				return null;
			})
			.filter((v): v is LoggedExport => v !== null)
			.filter(({ at }) => now.getTime() - new Date(at).getTime() < EXPORT_WINDOW_MS)
			.sort((a, b) => a.at.localeCompare(b.at));
	} catch {
		return [];
	}
}

export function exportAllowance(userId: string, now: Date = new Date()): ExportAllowance {
	const log = exportLog(userId, now);
	const remaining = Math.max(0, exportsAllowedFor(userId, now) - log.length);
	const oldest = log[0]?.at;

	return {
		remaining,
		nextAt: oldest ? new Date(new Date(oldest).getTime() + EXPORT_WINDOW_MS).toISOString() : null
	};
}

function recordExport(userId: string, now: Date, key: string | null): void {
	const log = [...exportLog(userId, now), { at: now.toISOString(), key }].slice(
		-exportsAllowedFor(userId, now)
	);
	setUserSetting(userId, EXPORT_LOG_KEY, JSON.stringify(log));
}

export function exportAccount(
	userId: string,
	now: Date = new Date(),
	opts: { withoutPictures?: boolean; key?: string | null } = {}
): AccountExport {
	const account = accountRow(userId);

	const key = opts.key && EXPORT_KEY.test(opts.key) ? opts.key : null;
	const repeated = key !== null && exportLog(userId, now).some((e) => e.key === key);

	if (!repeated) {
		const allowance = exportAllowance(userId, now);
		if (allowance.remaining <= 0)
			throw new RateLimitedError(
				`You have used both of today's exports. The next one unlocks ${hoursUntil(allowance.nextAt, now)}.`
			);

		recordExport(userId, now, key);
		audit(userId, 'data_exported');
	}

	/*
	 * Without pictures, on request. Base64 makes the bytes a third bigger than
	 * they are, and an account with a gallery in it passes any small instance's
	 * body limit without trying — 16MB against a 12MB ceiling is the one that
	 * prompted this. The structure is what moves between instances; the
	 * pictures can follow by hand, or not at all.
	 */
	const leaveOut = new Set<string>(opts.withoutPictures ? PICTURE_TABLES : []);

	const data: Record<string, unknown[]> = {};
	for (const table of USER_TABLES)
		data[table.name] = leaveOut.has(table.name) ? [] : table.rows(userId);

	return { exportedAt: now.toISOString(), version: build().version, account, data };
}
