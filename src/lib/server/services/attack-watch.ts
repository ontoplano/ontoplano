/**
 * What an attack on the app itself looks like from inside the process.
 *
 * The box already notices the attacks that are visible from outside it: the
 * banning layer reads nginx and jails an address that knocks too often, and
 * the firewall drops the ones the whole internet has already seen. Both of
 * those are per-address, and the interesting attacks on an app are not.
 *
 * Credential stuffing with a list of leaked passwords comes from hundreds of
 * addresses, a handful of attempts each, against hundreds of accounts. Every
 * individual address behaves impeccably. Nothing below the app can see it,
 * because the shape of it is only visible to the thing that knows an attempt
 * was a sign-in, and that it failed, and whose account it was for.
 *
 * So this counts three things in a rolling window and says when the shape is
 * wrong. It decides nothing and blocks nobody — the throttle in
 * `hooks.server.ts` does the blocking, per address, as it always did. This is
 * the sentence that reaches a phone, through the warnings `/healthz` already
 * publishes and the watcher already relays.
 *
 * In memory, like `rate-limit.ts` and for the same reason: this is one node
 * process with a SQLite file beside it, and a table would be writes on the
 * attacker's schedule. What is lost on a restart is a quarter of an hour of
 * counting, and an attack that is still happening is counted again by the
 * next window.
 *
 * No address or account name is ever in a warning — only how many of each.
 * The counts are what tells you it is happening; the identities are in the
 * logs, where somebody looking for them has to go deliberately.
 */

/**
 * The window, the ceiling, and what counts as wrong.
 *
 * The thresholds are deliberately high enough that an ordinary day is silent.
 * An alerting channel that cries wolf is one nobody reads on the day it is
 * right, and these arrive in the same place as "disk 94% full".
 */
export const ATTACK = {
	/** How far back anything is counted. */
	windowMs: 15 * 60 * 1000,
	/**
	 * How many events are kept at most.
	 *
	 * An attacker decides how fast this fills, so it cannot be unbounded —
	 * past the ceiling the oldest go, which costs accuracy in exactly the
	 * situation where the answer is already "yes, obviously".
	 */
	keep: 4096,
	/**
	 * Distributed credential stuffing: many addresses AND many accounts.
	 *
	 * Both halves are the definition. One address against many accounts is
	 * already jailed by the throttle; many addresses against ONE account is a
	 * person being targeted, which is the second sentence below; many against
	 * many is the leaked-password-list attack that nothing else here sees.
	 */
	stuffingAddresses: 8,
	stuffingAccounts: 8,
	/** Many addresses at one account — somebody's account in particular. */
	targetedAddresses: 10,
	/** Password reset is a mail-sending door, so a flood is also a mail bill. */
	resets: 20,
	/** Requests this instance answered with a 5xx in the window. */
	serverErrors: 25
} as const;

type Kind = 'sign-in' | 'reset' | 'error';

type Attempt = {
	at: number;
	kind: Kind;
	/** The client address, as `clientKey` resolved it. */
	from: string;
	/** The account it was aimed at, or the path that broke. */
	subject: string;
};

const attempts: Attempt[] = [];

function push(kind: Kind, from: string, subject: string, now = Date.now()): void {
	attempts.push({ at: now, kind, from, subject: subject.toLowerCase() });
	// Pruned on write rather than on a timer: the process has no scheduler of
	// its own for this, and the only moment the list can grow is this one.
	const cutoff = now - ATTACK.windowMs;
	let stale = 0;
	while (stale < attempts.length && attempts[stale].at < cutoff) stale++;
	if (stale > 0) attempts.splice(0, stale);
	if (attempts.length > ATTACK.keep) attempts.splice(0, attempts.length - ATTACK.keep);
}

/** A sign-in that was refused. The password is never passed in, or wanted. */
export function recordFailedSignIn(from: string, account: string): void {
	push('sign-in', from, account);
}

/** A password-reset request, whether or not the address has an account. */
export function recordPasswordReset(from: string, account: string): void {
	push('reset', from, account);
}

/** A request this instance answered with a 5xx. */
export function recordServerError(path: string): void {
	push('error', '', path);
}

/** Only for tests, and for a suite that must not inherit the last file's counts. */
export function resetAttackWatch(): void {
	attempts.length = 0;
}

function since(now: number, kind: Kind): Attempt[] {
	const cutoff = now - ATTACK.windowMs;
	return attempts.filter((a) => a.kind === kind && a.at >= cutoff);
}

const distinct = (rows: Attempt[], field: 'from' | 'subject') =>
	new Set(rows.map((r) => r[field]).filter(Boolean)).size;

/**
 * Whatever the shape of the last quarter of an hour says, as sentences.
 *
 * Returned in the same form as the resource warnings beside them, because
 * they travel the same way: into `/healthz`, out through the watcher, into a
 * chat message with no context around it. Each one has to stand alone and say
 * what to do next.
 */
export function attackWarnings(now = Date.now()): string[] {
	const out: string[] = [];
	const minutes = Math.round(ATTACK.windowMs / 60_000);

	const failed = since(now, 'sign-in');
	const addresses = distinct(failed, 'from');
	const accounts = distinct(failed, 'subject');

	if (addresses >= ATTACK.stuffingAddresses && accounts >= ATTACK.stuffingAccounts) {
		out.push(
			`${failed.length} refused sign-ins in ${minutes} min, from ${addresses} addresses ` +
				`against ${accounts} accounts — the shape of a password list being tried. ` +
				'Per-address throttling does not stop this one.'
		);
	} else if (accounts === 1 && addresses >= ATTACK.targetedAddresses) {
		// One account, many addresses: not the list attack, and worth saying
		// differently — this is somebody choosing a person.
		out.push(
			`${failed.length} refused sign-ins in ${minutes} min from ${addresses} addresses, ` +
				'all against one account.'
		);
	}

	const resets = since(now, 'reset');
	if (resets.length >= ATTACK.resets) {
		out.push(
			`${resets.length} password-reset requests in ${minutes} min ` +
				`from ${distinct(resets, 'from')} address(es) for ${distinct(resets, 'subject')} account(s) — ` +
				'every one of them sends mail.'
		);
	}

	const errors = since(now, 'error');
	if (errors.length >= ATTACK.serverErrors) {
		// Which path, because "31 server errors" and "31 server errors, all on
		// /api/x" are a different morning's work.
		const worst = [...new Set(errors.map((e) => e.subject))]
			.map((path) => ({ path, n: errors.filter((e) => e.subject === path).length }))
			.sort((a, b) => b.n - a.n)[0];
		out.push(
			`${errors.length} server errors in ${minutes} min — ` +
				`most on ${worst.path} (${worst.n}). The id on each one is in the log.`
		);
	}

	return out;
}
