import { timingSafeEqual } from 'node:crypto';
import { freemem, loadavg, totalmem } from 'node:os';
import { statSync, statfsSync } from 'node:fs';
import { sql } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { loadConfig } from '$lib/server/config';
import { openFailureCount } from './mail-log.js';

/**
 * Can this process actually reach the database?
 *
 * Lives here rather than in the route because routes do not query (I2), and
 * because "listening" and "able to serve" are different questions: a locked or
 * missing SQLite file leaves the port open and every page 500ing.
 *
 * Returns `'ok'`, or the reason, trimmed — a probe that prints a stack trace to
 * the public internet is a probe that describes the filesystem to strangers.
 */
export function databaseReachable(): string {
	try {
		db.get(sql`select 1`);
		return 'ok';
	} catch (error) {
		return error instanceof Error ? error.message.slice(0, 200) : 'unavailable';
	}
}

/**
 * What the box looks like from inside, for whatever is watching it.
 *
 * `/healthz` answers "can this process serve a request", which is necessary and
 * not enough: the interesting failures on a small VPS are slow ones. The disk
 * fills — and SQLite plus its WAL plus a nightly snapshot is a database that
 * only grows — or memory goes and the kernel starts killing things. Both are
 * visible hours before they take the site down, and invisible to a check that
 * only asks whether the port answers.
 *
 * Deliberately cheap: three syscalls, no queries, nothing cached. Something is
 * going to call this every minute forever.
 */
export interface Resources {
	/** Free space on the filesystem holding the database, in MB. */
	diskFreeMb: number;
	/** How full that filesystem is, 0–100. */
	diskUsedPercent: number;
	/** The database file itself, in MB — the number that grows on its own. */
	databaseMb: number;
	/** Memory the kernel would give a new process, in MB. */
	memoryFreeMb: number;
	memoryUsedPercent: number;
	/** One-minute load average. Compare against the core count, not against 1. */
	load1: number;
	/** This process, in MB — the half of memory pressure the app owns. */
	heapUsedMb: number;
}

const mb = (bytes: number) => Math.round(bytes / 1_048_576);

export function resources(): Resources {
	const path = loadConfig().database.path;

	// A database that has never been created is not an error here: the answer
	// "zero bytes" is true and more useful than a thrown ENOENT in a probe.
	let databaseBytes: number;
	try {
		databaseBytes = statSync(path).size;
	} catch {
		databaseBytes = 0;
	}

	// `statfs` reports the filesystem the path is on, which is the one that
	// matters — /home and / are often different volumes, and free space on the
	// wrong one is a comforting lie.
	let diskFreeMb: number;
	let diskUsedPercent: number;
	try {
		const fs = statfsSync(path);
		const total = fs.blocks * fs.bsize;
		// `bavail` rather than `bfree`: the reserved blocks are not ours.
		const free = fs.bavail * fs.bsize;
		diskFreeMb = mb(free);
		diskUsedPercent = total > 0 ? Math.round(((total - free) / total) * 100) : 0;
	} catch {
		diskFreeMb = 0;
		diskUsedPercent = 0;
	}

	const free = freemem();
	const total = totalmem();

	return {
		diskFreeMb,
		diskUsedPercent,
		databaseMb: mb(databaseBytes),
		memoryFreeMb: mb(free),
		memoryUsedPercent: total > 0 ? Math.round(((total - free) / total) * 100) : 0,
		load1: Math.round(loadavg()[0] * 100) / 100,
		heapUsedMb: mb(process.memoryUsage().heapUsed)
	};
}

/**
 * The thresholds a watcher should shout about, kept here so the box and
 * whatever is polling it cannot disagree about what "nearly full" means.
 *
 * The absolute floor matters more than the percentage, and both are here
 * because either alone is wrong. A percentage alone cries wolf on a big disk —
 * 91% of two terabytes is still 139GB free — and a floor alone stays quiet on
 * a small one right up until it is too late. What has to be true is that there
 * is room for a SQLite WAL and a checkpoint, for `db:snapshot` copying the
 * whole database beside itself, and for an apt upgrade. That is gigabytes, not
 * a fraction.
 */
export const LIMITS = {
	/** Below this much free space, say so whatever the percentage claims. */
	diskFreeMb: 2048,
	/** And this full is worth mentioning too, unless there is plenty left. */
	diskUsedPercent: 90,
	/** Beyond which the kernel is about to start choosing what to kill. */
	memoryUsedPercent: 92
} as const;

/** Whatever is currently over the line, as sentences a person can read. */
export function warnings(r: Resources = resources()): string[] {
	const out: string[] = [];

	const tight =
		r.diskFreeMb <= LIMITS.diskFreeMb ||
		(r.diskUsedPercent >= LIMITS.diskUsedPercent && r.diskFreeMb < 10_240);
	if (tight) {
		out.push(`disk ${r.diskUsedPercent}% full, ${r.diskFreeMb}MB left`);
	}
	if (r.memoryUsedPercent >= LIMITS.memoryUsedPercent) {
		out.push(`memory ${r.memoryUsedPercent}% used, ${r.memoryFreeMb}MB free`);
	}
	// Failed mail belongs here because this is the channel somebody is already
	// watching: the guard timer and the off-box watcher alert on a warning
	// appearing, so a broken mailer reaches a phone instead of only a log.
	try {
		const failed = openFailureCount();
		if (failed > 0) {
			out.push(
				failed === 1
					? 'one mail failed to send — /admin lists it'
					: `${failed} mails failed to send — /admin lists them`
			);
		}
	} catch {
		// A database mid-migration must not take the probe down with it.
	}
	return out;
}

/**
 * Constant-time token comparison.
 *
 * A probe token is not a password, but `===` on a secret leaks its length and
 * then its bytes to anyone patient enough to time the endpoint, and the fix is
 * four lines.
 */
export function tokenMatches(want: string | null, given: string | null): boolean {
	if (want === null || given === null) return false;
	const a = Buffer.from(want);
	const b = Buffer.from(given);
	if (a.length !== b.length) return false;
	return timingSafeEqual(a, b);
}
