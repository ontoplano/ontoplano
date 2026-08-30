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
	/** Why this jail bans, in words — what the address actually did. */
	reason: string;
};

/*
 * What tripping each jail means. The log only names the jail, and a jail name
 * is configuration, not an explanation — "ontoplano-web" says nothing about
 * WHY an address is gone. These match the jails the-setup-script and the mail
 * setup put on the box; an unknown jail falls back to naming itself.
 */
const REASONS: Record<string, string> = {
	'ontoplano-web': 'hammered the site with errors — 60 failed requests in a minute is a scanner',
	sshd: 'guessed at SSH logins',
	'sshd-ddos': 'flooded the SSH port',
	recidive: 'kept coming back after earlier bans, so banned for longer',
	postfix: 'sent garbage to the mail server',
	'postfix-sasl': 'guessed at mail passwords (SMTP)',
	dovecot: 'guessed at mailbox passwords (IMAP/POP)'
};

function reasonFor(jail: string): string {
	return REASONS[jail] ?? `tripped the ${jail} jail`;
}

export type Protection = {
	/** False when the file is missing or the group is not set — not "no bans". */
	readable: boolean;
	path: string;
	/** Bans in the last 24 hours — a rolling day, not since midnight. */
	lastDay: number;
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
	if (text === null) return { readable: false, path: LOG, lastDay: 0, recent: [] };

	const bans: Ban[] = [];
	for (const line of text.split('\n')) {
		const m = BAN.exec(line);
		if (m) bans.push({ at: m[1], jail: m[2], address: m[3], reason: reasonFor(m[2]) });
	}

	// A rolling 24 hours, not "since midnight": a count of zero above a ban
	// made minutes ago (just before midnight) reads as the page lying. The
	// log's timestamps are local time with no zone, so the cutoff is written
	// the same way. Distinct addresses, not ban lines — one scanner rebanned
	// every half hour is still one address.
	const cutoff = local(new Date(Date.now() - 24 * 60 * 60 * 1000));

	return {
		readable: true,
		path: LOG,
		lastDay: new Set(bans.filter((b) => b.at >= cutoff).map((b) => b.address)).size,
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
