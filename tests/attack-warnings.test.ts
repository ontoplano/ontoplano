import { afterEach, describe, expect, it } from 'vitest';
import {
	ATTACK,
	attackWarnings,
	recordFailedSignIn,
	recordPasswordReset,
	recordServerError,
	resetAttackWatch
} from '$lib/server/services/attack-watch';

/**
 * The attacks that are invisible one address at a time.
 *
 * Everything below the app sees a single client: the throttle in
 * `hooks.server.ts`, the banning layer reading nginx, the firewall. A password
 * list tried from three hundred addresses, a few attempts each, is impeccable
 * behaviour from every one of them — and is the attack this exists to name.
 *
 * So the cases below are mostly about NOT speaking: an ordinary bad morning
 * (one person mistyping, a handful of 500s from a real bug) has to stay
 * silent, or the sentence that matters arrives in a channel nobody reads.
 */
describe('app-layer attack warnings', () => {
	afterEach(() => resetAttackWatch());

	it('says nothing on an ordinary day', () => {
		recordFailedSignIn('203.0.113.5', 'someone@example.com');
		recordFailedSignIn('203.0.113.5', 'someone@example.com');
		recordFailedSignIn('203.0.113.5', 'someone@example.com');
		recordPasswordReset('203.0.113.5', 'someone@example.com');
		recordServerError('/planner/plan');
		expect(attackWarnings()).toEqual([]);
	});

	it('is silent about one address working through many accounts', () => {
		// Not because it is harmless — because the per-address throttle already
		// stops it, and a warning about something already handled is noise.
		for (let i = 0; i < 40; i++) recordFailedSignIn('203.0.113.5', `person${i}@example.com`);
		expect(attackWarnings()).toEqual([]);
	});

	it('names a password list being tried across many addresses and accounts', () => {
		for (let i = 0; i < ATTACK.stuffingAddresses + 2; i++) {
			for (let j = 0; j < ATTACK.stuffingAccounts + 2; j++) {
				recordFailedSignIn(`198.51.100.${i}`, `person${j}@example.com`);
			}
		}
		const [warning] = attackWarnings();
		expect(warning).toMatch(/refused sign-ins/);
		expect(warning).toMatch(/addresses/);
		expect(warning).toMatch(/accounts/);
	});

	it('never puts an address or an account name in a warning', () => {
		for (let i = 0; i < ATTACK.stuffingAddresses + 2; i++) {
			for (let j = 0; j < ATTACK.stuffingAccounts + 2; j++) {
				recordFailedSignIn(`198.51.100.${i}`, `person${j}@example.com`);
			}
		}
		for (const line of attackWarnings()) {
			expect(line).not.toMatch(/198\.51\.100/);
			expect(line).not.toMatch(/@example\.com/);
		}
	});

	it('tells being targeted apart from a list being tried', () => {
		for (let i = 0; i < ATTACK.targetedAddresses + 1; i++) {
			recordFailedSignIn(`198.51.100.${i}`, 'victim@example.com');
		}
		expect(attackWarnings()[0]).toMatch(/all against one account/);
	});

	it('counts an account the same however it was spelled', () => {
		// A list will arrive with whatever capitalisation it was leaked in, and
		// two spellings of one address must not read as two accounts.
		for (let i = 0; i < ATTACK.targetedAddresses + 1; i++) {
			recordFailedSignIn(`198.51.100.${i}`, i % 2 ? 'Victim@Example.com' : 'victim@example.com');
		}
		expect(attackWarnings()[0]).toMatch(/all against one account/);
	});

	it('says when the reset door is being used to send mail', () => {
		for (let i = 0; i < ATTACK.resets; i++)
			recordPasswordReset('198.51.100.7', `p${i}@example.com`);
		expect(attackWarnings().join(' ')).toMatch(/password-reset requests/);
	});

	it('says when errors stop being a bug and start being an incident', () => {
		for (let i = 0; i < ATTACK.serverErrors; i++) recordServerError('/api/import');
		const line = attackWarnings().join(' ');
		expect(line).toMatch(/server errors/);
		// Which path, because "31 server errors" and "31 of them on one path"
		// are a different morning's work.
		expect(line).toMatch(/\/api\/import/);
	});

	it('forgets what happened before the window', () => {
		const now = Date.now();
		for (let i = 0; i < ATTACK.stuffingAddresses + 2; i++) {
			for (let j = 0; j < ATTACK.stuffingAccounts + 2; j++) {
				recordFailedSignIn(`198.51.100.${i}`, `person${j}@example.com`);
			}
		}
		expect(attackWarnings(now)).not.toEqual([]);
		expect(attackWarnings(now + ATTACK.windowMs + 1000)).toEqual([]);
	});

	it('cannot be made to hold an unbounded amount of an attacker′s data', () => {
		for (let i = 0; i < ATTACK.keep * 2; i++) {
			recordFailedSignIn(`198.51.100.${i % 250}`, `person${i}@example.com`);
		}
		// Still answers, and still answers quickly — the ceiling costs accuracy
		// in exactly the case where the answer is already obvious.
		const started = Date.now();
		expect(attackWarnings()).not.toEqual([]);
		expect(Date.now() - started).toBeLessThan(1000);
	});
});
