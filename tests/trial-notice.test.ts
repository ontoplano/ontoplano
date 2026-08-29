/**
 * The mail two days before the trial becomes a charge.
 *
 * The interesting questions are who gets it and how many times: only trials
 * that are still running and end within the window, and each exactly once —
 * a nightly job that is not idempotent is a spam cannon on a delay.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import { makeDatabase, OWNER, STRANGER, seedAccounts } from './helpers/db';

const database = makeDatabase();
seedAccounts(database.path);
afterAll(() => database.remove());

const sendEmail = vi.fn(async () => ({ delivered: true }));
vi.mock('../src/lib/server/email', () => ({
	sendEmail: (...args: unknown[]) => sendEmail(...args),
	isEmailConfigured: () => true
}));

let billing: typeof import('../src/lib/server/services/billing');

const now = new Date('2026-08-29T12:00:00Z');
const inDays = (d: number) => new Date(now.getTime() + d * 86400_000).toISOString();

function trial(userId: string, endsInDays: number, extra: Record<string, unknown> = {}) {
	database.exec(
		`insert into subscriptions (user_id, plan, status, provider, trial_ends_at, provider_subscription_id)
		 values (?, 'pro', 'trialing', 'none', ?, ?)`,
		userId,
		inDays(endsInDays),
		(extra.providerSubscriptionId as string) ?? null
	);
}

beforeAll(async () => {
	billing = await import('../src/lib/server/services/billing');
});

beforeEach(() => {
	sendEmail.mockClear();
	database.exec('delete from subscriptions');
});

describe('who is told', () => {
	test('a trial ending within two days, once and only once', async () => {
		trial(OWNER, 1);

		expect(await billing.sendTrialEndingNotices(now)).toBe(1);
		expect(sendEmail).toHaveBeenCalledTimes(1);

		const mail = sendEmail.mock.calls[0][0] as { to: string; subject: string; text: string };
		expect(mail.to).toBe('owner@test.invalid');
		expect(mail.subject).toMatch(/trial ends/);

		// The nightly job runs nightly; the second run must send nothing.
		expect(await billing.sendTrialEndingNotices(now)).toBe(0);
		expect(sendEmail).toHaveBeenCalledTimes(1);
	});

	test('a trial with ten days left is left alone', async () => {
		trial(OWNER, 10);
		expect(await billing.sendTrialEndingNotices(now)).toBe(0);
	});

	test('a trial that already ended is not warned about the past', async () => {
		trial(OWNER, -1);
		expect(await billing.sendTrialEndingNotices(now)).toBe(0);
	});

	test('a card on file changes what the mail says', async () => {
		trial(OWNER, 1, { providerSubscriptionId: 'sub_123' });
		trial(STRANGER, 1);

		await billing.sendTrialEndingNotices(now);

		const texts = sendEmail.mock.calls.map((c) => (c[0] as { text: string }).text);
		expect(texts.find((t) => t.includes('charge'))).toBeTruthy();
		expect(texts.find((t) => t.includes('nothing new can be added'))).toBeTruthy();
	});

	test('a transient failure is retried tomorrow', async () => {
		trial(OWNER, 1);
		sendEmail.mockResolvedValueOnce({ delivered: false });

		expect(await billing.sendTrialEndingNotices(now)).toBe(0);
		// Not stamped, so the next run tries again.
		expect(await billing.sendTrialEndingNotices(now)).toBe(1);
	});
});
