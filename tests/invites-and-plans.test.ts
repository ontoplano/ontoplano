/**
 * Who gets in, and what they are entitled to once they are.
 *
 * An invitation is the one credential this app hands out, so the rules around
 * it are the ones a stranger would probe: it works exactly once, an expired one
 * does not work at all, and revoking an unused one destroys it while a used one
 * is history and stays.
 *
 * The plan is the other half — what an account may do — and the case that
 * matters is the seam: somebody who cancels and comes back gets the days that
 * were left of their trial and not a fresh fourteen.
 */
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { makeDatabase, OWNER, seedAccounts, STRANGER } from './helpers/db';

const database = makeDatabase();
seedAccounts(database.path);
afterAll(() => database.remove());

let registration: typeof import('../src/lib/server/services/registration');
let subscriptions: typeof import('../src/lib/server/services/subscriptions');
let mailLog: typeof import('../src/lib/server/services/mail-log');
const now = new Date('2026-08-17T09:00:00Z');

beforeAll(async () => {
	registration = await import('../src/lib/server/services/registration');
	subscriptions = await import('../src/lib/server/services/subscriptions');
	mailLog = await import('../src/lib/server/services/mail-log');
});

describe('an invitation', () => {
	test('is a code long enough that guessing is not a strategy', () => {
		const invite = registration.createInvite(OWNER, { note: 'for Ana' }, now);
		expect(invite.code.length).toBeGreaterThanOrEqual(16);
		expect(invite.note).toBe('for Ana');
		expect(invite.expiresAt).toBeNull();
	});

	test('can be given a life, within reason', () => {
		const invite = registration.createInvite(OWNER, { expiresInDays: 7 }, now);
		expect(new Date(invite.expiresAt!).getTime()).toBeGreaterThan(now.getTime());

		expect(() => registration.createInvite(OWNER, { expiresInDays: 0 }, now)).toThrow();
		expect(() => registration.createInvite(OWNER, { expiresInDays: 400 }, now)).toThrow();
		expect(() => registration.createInvite(OWNER, { expiresInDays: 1.5 }, now)).toThrow();
	});

	test('works exactly once', () => {
		registration.setRegistrationMode('invite');
		const invite = registration.createInvite(OWNER, {}, now);

		const first = registration.checkSignUpAllowed(invite.code, now);
		expect(first.invite?.id).toBe(invite.id);

		registration.consumeInvite(invite.id, STRANGER, now);
		expect(() => registration.checkSignUpAllowed(invite.code, now)).toThrow();
	});

	test('does not work after it has expired', () => {
		registration.setRegistrationMode('invite');
		const invite = registration.createInvite(OWNER, { expiresInDays: 1 }, now);
		const later = new Date(now.getTime() + 3 * 86400_000);

		expect(() => registration.checkSignUpAllowed(invite.code, later)).toThrow();
	});

	test('and a code nobody issued does not work either', () => {
		registration.setRegistrationMode('invite');
		expect(() => registration.checkSignUpAllowed('not-a-real-code', now)).toThrow();
		expect(() => registration.checkSignUpAllowed('', now)).toThrow();
	});

	test('an unused one is destroyed by revoking', () => {
		registration.setRegistrationMode('invite');
		const spare = registration.createInvite(OWNER, { note: 'spare' }, now);
		registration.revokeInvite(spare.id);
		expect(registration.listInvites().some((i) => i.id === spare.id)).toBe(false);
	});

	test('a used one is history, and refuses to be revoked', () => {
		registration.setRegistrationMode('invite');
		const used = registration.createInvite(OWNER, { note: 'used' }, now);
		registration.consumeInvite(used.id, STRANGER, now);

		// It records that somebody was let in, which is a fact about the past
		// rather than a key still lying around.
		expect(() => registration.revokeInvite(used.id)).toThrow();
		expect(registration.listInvites().some((i) => i.id === used.id)).toBe(true);
	});

	test('is counted while it is still open', () => {
		const before = registration.openInviteCount();
		registration.createInvite(OWNER, {}, now);
		expect(registration.openInviteCount()).toBe(before + 1);
	});
});

describe('who may register at all', () => {
	test('open lets anybody in without a code', () => {
		registration.setRegistrationMode('open');
		expect(() => registration.checkSignUpAllowed(undefined, now)).not.toThrow();
		expect(registration.registrationMode()).toBe('open');
	});

	test('closed refuses even a valid code', () => {
		registration.setRegistrationMode('invite');
		const invite = registration.createInvite(OWNER, {}, now);

		registration.setRegistrationMode('closed');
		expect(() => registration.checkSignUpAllowed(invite.code, now)).toThrow();
	});

	test('but an instance with nobody in it always takes the first account', () => {
		// Otherwise a fresh install locks its owner out of their own box.
		expect(typeof registration.instanceIsEmpty()).toBe('boolean');
	});
});

/**
 * An invitation on an instance that already lets anybody in.
 *
 * The code stopped meaning anything the moment registration opened: the mode
 * check returned before ever looking at it, so somebody sent a link promising a
 * free month met the checkout like everybody else. Open registration is where
 * an invitation is *most* useful, because there it is not permission — it is
 * the month itself.
 */
describe('an invitation under open registration', () => {
	test('is consumed rather than ignored', () => {
		registration.setRegistrationMode('open');
		const invite = registration.createInvite(OWNER, { grantsUntil: '2026-10-01' }, now);

		const allowed = registration.checkSignUpAllowed(invite.code, now);
		expect(allowed.invite?.id).toBe(invite.id);
		expect(allowed.invite?.grantsUntil).toBe(new Date('2026-10-01T23:59:59.999Z').toISOString());
	});

	test('carries a month by default, decided by the form rather than the code', () => {
		const until = registration.defaultGrantUntil(now);
		const days = (new Date(until).getTime() - now.getTime()) / 86_400_000;
		expect(Math.round(days)).toBe(registration.DEFAULT_GRANT_DAYS);
	});

	test('refuses a code that does not work rather than quietly dropping it', () => {
		// Charging somebody who was told they had a free month is the worse
		// failure by far, and there is nothing to leak about an open instance.
		registration.setRegistrationMode('open');
		expect(() => registration.checkSignUpAllowed('not-a-real-code', now)).toThrow();
	});

	test('and no code at all is still fine, because the instance is open', () => {
		registration.setRegistrationMode('open');
		expect(() => registration.checkSignUpAllowed('', now)).not.toThrow();
	});

	test('will not hand over a month that has already ended', () => {
		expect(() => registration.createInvite(OWNER, { grantsUntil: '2020-01-01' }, now)).toThrow();
	});
});

describe('coming back after cancelling', () => {
	// The suite runs self-hosted so plan ceilings never interfere; billing is
	// the one thing that does not exist under it, so this block turns it off.
	beforeAll(() => {
		process.env.ONTOPLANO_SELF_HOST = 'false';
	});
	afterAll(() => {
		process.env.ONTOPLANO_SELF_HOST = 'true';
	});

	test('carries over what is left of the trial rather than starting a fresh one', () => {
		subscriptions.startTrial(OWNER, now);

		const fourDaysBeforeItEnds = new Date(now.getTime() + 10 * 86400_000);
		const carry = subscriptions.trialCarryover(OWNER, fourDaysBeforeItEnds);

		expect(carry.hasHistory).toBe(true);
		expect(carry.remainingDays).toBeGreaterThan(0);
		expect(carry.remainingDays).toBeLessThanOrEqual(14);
	});

	test('offers nothing to carry when the trial is long gone', () => {
		const wellAfter = new Date(now.getTime() + 400 * 86400_000);
		expect(subscriptions.trialCarryover(OWNER, wellAfter).remainingDays).toBe(0);
	});

	test('and nothing at all to an account that never had one', () => {
		const carry = subscriptions.trialCarryover(STRANGER, now);
		expect(carry.hasHistory).toBe(false);
		expect(carry.remainingDays).toBe(0);
	});

	test('knows whether an account has ever had a plan', () => {
		expect(subscriptions.hasPlanHistory(OWNER)).toBe(true);
		expect(subscriptions.hasPlanHistory(STRANGER)).toBe(false);
	});

	test('counts what is stored against each ceiling', () => {
		const counts = subscriptions.usage(OWNER);
		expect(typeof counts).toBe('object');
		for (const value of Object.values(counts)) expect(typeof value).toBe('number');
	});
});

describe('mail that did not go out', () => {
	test('is nothing to report on an instance that has sent none', () => {
		expect(mailLog.openFailureCount()).toBe(mailLog.openFailures().length);
	});

	test('and dismissing one that is already gone says so', () => {
		// The admin page offers the button on a list that may have moved on, and
		// a silent no-op there reads as "it worked" for a row somebody else
		// already dealt with.
		expect(() => mailLog.dismissFailure(999_999)).toThrow(/gone/);
	});
});
