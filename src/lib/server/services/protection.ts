import { openSync, closeSync, fstatSync, readSync, constants } from 'node:fs';

/**
 * What the box has blocked, read from fail2ban's own log.
 *
 * The administration page can say who has been signing in and who registered,
 * because the app did those things itself. It could say nothing at all about
 * the layer in front of it — which is where most of what happens to a public
 * instance actually happens.
 *
 * fail2ban's socket belongs to root and `fail2ban-client` is a command this
 * process has no business being able to run. Its log is `root:adm` and
 * read-only to the group, so the answer is a group membership and a file read:
 * nothing to escalate, no shelling out.
 *
 *   sudo usermod -aG adm <the user the app runs as>
 *
 * Unreadable is a first-class answer. "No bans" and "cannot see bans" look
 * identical in a list and mean opposite things, so the page is told which it
 * is looking at.
 */

/** Where fail2ban writes. Debian and Ubuntu put it here; a box that differs can say so. */
const LOG = process.env.ONTOPLANO_FAIL2BAN_LOG || '/var/log/fail2ban.log';

/**
 * How much of the tail to read.
 *
 * The log is append-only and rotates, but on a machine being scanned hard it
 * can still be tens of megabytes between rotations. A page load reads the last
 * chunk of it and no more; a quarter of a megabyte is a few thousand lines,
 * which is far more than the handful this displays.
 */
const TAIL_BYTES = 256 * 1024;

export type Ban = {
	jail: string;
	address: string;
	at: string;
};

export type Protection = {
	/** False when the file is missing or the group is not set — not "no bans". */
	readable: boolean;
	path: string;
	/** Bans since midnight, local time, which is how a person reads "today". */
	today: number;
	recent: Ban[];
};

/**
 * The last `bytes` of a file, as text.
 *
 * Positional reads rather than a stream: this is a page load, the file may be
 * enormous, and everything interesting is at the end of it. A partial first
 * line is expected and the parser drops anything that does not match.
 */
function tail(path: string, bytes: number): string | null {
	let fd: number | undefined;
	try {
		fd = openSync(path, constants.O_RDONLY);
		const size = fstatSync(fd).size;
		const length = Math.min(size, bytes);
		const buffer = Buffer.allocUnsafe(length);
		readSync(fd, buffer, 0, length, Math.max(0, size - length));
		return buffer.toString('utf8');
	} catch {
		return null;
	} finally {
		if (fd !== undefined) closeSync(fd);
	}
}

/*
 * 2026-08-28 17:01:00,123 fail2ban.actions [1234]: NOTICE  [ontoplano-web] Ban 203.0.113.4
 *
 * Only bans. Unbans are the timer expiring, which is not news, and mixing the
 * two into one list makes it read like an argument rather than a record.
 */
// The greedy `.*` is doing real work: the line carries the process id in
// brackets too, and the jail is the LAST bracketed thing before the verb.
const BAN = /^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}).*\[([^\]]+)\] Ban ([0-9a-fA-F.:]+)/;

export function protection(limit = 8): Protection {
	const text = tail(LOG, TAIL_BYTES);
	if (text === null) return { readable: false, path: LOG, today: 0, recent: [] };

	const bans: Ban[] = [];
	for (const line of text.split('\n')) {
		const m = BAN.exec(line);
		if (m) bans.push({ at: m[1], jail: m[2], address: m[3] });
	}

	// The log's timestamps are local time with no zone, which is what
	// `toISOString` on a local midnight compares against once it is sliced back
	// to the same shape.
	const midnight = new Date();
	midnight.setHours(0, 0, 0, 0);
	const startOfDay = local(midnight);

	return {
		readable: true,
		path: LOG,
		today: bans.filter((b) => b.at >= startOfDay).length,
		recent: bans.slice(-limit).reverse()
	};
}

/** A Date as the log writes one: local time, `YYYY-MM-DD HH:MM:SS`. */
function local(date: Date): string {
	const pad = (n: number) => String(n).padStart(2, '0');
	return (
		`${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ` +
		`${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
	);
}
