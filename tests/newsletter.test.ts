import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import { makeDatabase } from './helpers/db';

/**
 * The mailing list: what it refuses, and what it never says.
 *
 * Pressing the button is the answer — there is no confirming click. That is a
 * deliberate trade: it gives up the guarantee that an address belongs to
 * whoever typed it, and what stands in its place is a rate limit in front of
 * the form and an unsubscribe link in every message.
 *
 * Three properties matter more than the happy path.
 *
 * **Joining is said out loud, once.** A welcome goes to an address that has
 * just joined, because somebody who typed an address into a web page has no
 * other evidence it worked, and an address typed by somebody else has nowhere
 * to complain to until something arrives at it. It asks for nothing and
 * carries the way off.
 *
 * **And only once.** A form on a public page that mails whatever is typed into
 * it is a way to send mail to strangers. Typing an address that is already on
 * the list sends nothing at all, so the form cannot be pressed repeatedly at
 * somebody else's inbox.
 *
 * **The form is not a way to ask who is on the list.** Subscribing answers the
 * same thing whether the address is new, already there, or previously
 * unsubscribed. The moment those answers differ, anybody can check anybody.
 */

const database = makeDatabase();
afterAll(() => database.remove());

type Mail = { to: string; subject: string; text: string };
const sendEmail = vi.fn<(email: Mail) => Promise<{ delivered: boolean; reason?: string }>>(
	async () => ({ delivered: true })
);
/** Whether this instance has anywhere to send mail. See the test at the foot. */
let configured = true;
vi.mock('../src/lib/server/email', () => ({
	sendEmail: (email: Mail) => sendEmail(email),
	isEmailConfigured: () => configured
}));

let enabled = true;
vi.mock('../src/lib/server/config', async (importOriginal) => {
	const actual = await importOriginal<typeof import('../src/lib/server/config')>();
	return {
		...actual,
		loadConfig: () => ({
			...actual.loadConfig(),
			newsletter: { enabled, origin: 'https://example.test' }
		})
	};
});

let list: typeof import('../src/lib/server/services/newsletter');
let errors: typeof import('../src/lib/services/errors');

beforeAll(async () => {
	process.env.ORIGIN = 'https://app.test.invalid';
	list = await import('../src/lib/server/services/newsletter');
	errors = await import('../src/lib/services/errors');
});

beforeEach(() => {
	sendEmail.mockClear();
	sendEmail.mockResolvedValue({ delivered: true });
	enabled = true;
	configured = true;
	database.exec('delete from subscribers');
	database.exec('delete from mail_failures');
});

/** The token that would be in a message's unsubscribe link. */
function tokenOf(email: string): string {
	const row = database.get('select token from subscribers where email = ?', email) as {
		token: string;
	};
	return row.token;
}

describe('subscribing', () => {
	test('puts the address on the list at once, and says so', async () => {
		await list.subscribe('reader@example.test');

		expect(list.counts()).toEqual({ confirmed: 1, pending: 0 });
		expect(list.confirmedAddresses()).toEqual(['reader@example.test']);

		expect(sendEmail).toHaveBeenCalledTimes(1);
		const [sent] = sendEmail.mock.calls[0];
		expect(sent.to).toBe('reader@example.test');
		// It asks for nothing: there is no click to make, and the only link in
		// it that matters is the one out.
		expect(sent.text).not.toMatch(/confirm/i);
		expect(sent.text).toContain(`/newsletter/off?t=${tokenOf('reader@example.test')}`);
	});

	/*
	 * The sentence and the behaviour, held together.
	 *
	 * It said "check your inbox — there is one link to follow" for a while
	 * after the confirming mail stopped being sent, so a stranger was told to
	 * go and find something that was never coming. A welcome arrives now, but
	 * it is not a step: nothing waits on it, so the sentence must not send
	 * anybody off to look for it either.
	 */
	test('what the form answers promises nothing to go and look for', async () => {
		await list.subscribe('reader@example.test');

		expect(list.SUBSCRIBE_ACCEPTED).not.toMatch(/inbox|confirm|link|email|mail/i);
	});

	/*
	 * A welcome that went nowhere is written down.
	 *
	 * A box with no SMTP is a fine thing to be, and `sendLogged` normally
	 * trusts the log for one — except here, where the person on the other end
	 * has been told "You're on the list" and has no other way to find out that
	 * nothing was sent. Without this the failure is invisible in every place
	 * an operator looks: the mail log, /admin, and the warnings /healthz
	 * reports.
	 */
	test('a welcome that could not be sent at all is a failure somebody can see', async () => {
		configured = false;
		sendEmail.mockResolvedValue({
			delivered: false,
			reason: 'SMTP is not configured on this server'
		});

		await list.subscribe('reader@example.test');

		const failure = database.get(
			'select kind, to_email, error from mail_failures where resolved_at is null'
		) as { kind: string; to_email: string; error: string } | undefined;
		expect(failure?.kind).toBe('newsletter-welcome');
		expect(failure?.to_email).toBe('reader@example.test');
		expect(failure?.error).toMatch(/not configured/i);

		// And the address is on the list either way: the row is the list, and a
		// welcome that bounced is not a reason to drop somebody who asked.
		expect(list.counts()).toEqual({ confirmed: 1, pending: 0 });
	});

	test('the same address twice is one row and one mail', async () => {
		await list.subscribe('reader@example.test');
		await list.subscribe('reader@example.test');

		// The second press writes nothing and sends nothing, which is what stops
		// this form being a way to post mail at somebody else's inbox.
		expect(sendEmail).toHaveBeenCalledTimes(1);
		expect(list.counts()).toEqual({ confirmed: 1, pending: 0 });
	});

	test('an address is normalised, so one person is one row', async () => {
		await list.subscribe('Reader@Example.test');
		await list.subscribe('  reader@example.test ');

		expect(list.counts()).toEqual({ confirmed: 1, pending: 0 });
	});

	test('refuses when the instance has no newsletter', async () => {
		enabled = false;
		await expect(list.subscribe('reader@example.test')).rejects.toBeInstanceOf(
			errors.ValidationError
		);
		expect(list.counts()).toEqual({ confirmed: 0, pending: 0 });
	});
});

describe('unsubscribing', () => {
	test('takes the address off the list, and the token still works', async () => {
		await list.subscribe('reader@example.test');
		const token = tokenOf('reader@example.test');

		expect(list.unsubscribe(token)).toBe('reader@example.test');
		expect(list.counts()).toEqual({ confirmed: 0, pending: 0 });
		expect(list.confirmedAddresses()).toEqual([]);
	});

	test('coming back subscribes again', async () => {
		await list.subscribe('reader@example.test');
		list.unsubscribe(tokenOf('reader@example.test'));

		await list.subscribe('reader@example.test');
		expect(list.confirmedAddresses()).toEqual(['reader@example.test']);
	});

	test('a token that is not one takes nobody off', async () => {
		await list.subscribe('reader@example.test');

		expect(list.unsubscribe('made-up')).toBeNull();
		expect(list.unsubscribe('')).toBeNull();
		expect(list.confirmedAddresses()).toEqual(['reader@example.test']);
	});
});

/**
 * Telling the list, which is the only thing it exists for.
 *
 * The property that matters here is that it cannot happen twice: the release
 * it runs from is re-runnable by design, and the step nobody wants repeated is
 * the one that reaches every inbox.
 */
describe('announcing a release', () => {
	const issue = { version: '1.2.3', subject: 'Ontoplano 1.2.3', lines: ['Something shipped.'] };

	beforeEach(() => {
		database.exec('delete from newsletter_issues');
	});

	test('reaches everybody on the list, one message each', async () => {
		await list.subscribe('one@example.test');
		await list.subscribe('two@example.test');
		// Their welcomes have been and gone; this is about the issue.
		sendEmail.mockClear();

		expect(await list.announce(issue)).toEqual({ sent: 2, failed: 0 });
		expect(sendEmail).toHaveBeenCalledTimes(2);
		// One message each, never one message naming everybody: a single mail
		// with the whole list on it discloses it to all of them.
		const to = sendEmail.mock.calls.map(([mail]) => mail.to);
		expect(to.sort()).toEqual(['one@example.test', 'two@example.test']);
	});

	test('every message carries that person’s own way off the list', async () => {
		await list.subscribe('reader@example.test');
		await list.announce(issue);

		expect(sendEmail.mock.calls[0][0].text).toContain(tokenOf('reader@example.test'));
	});

	test('refuses to send the same version twice', async () => {
		await list.subscribe('reader@example.test');
		await list.announce(issue);
		sendEmail.mockClear();

		await expect(list.announce(issue)).rejects.toBeInstanceOf(errors.ValidationError);
		expect(sendEmail).not.toHaveBeenCalled();
	});

	test('says whether a version has gone out, so a re-run can ask', async () => {
		expect(list.announced('1.2.3')).toBe(false);
		await list.subscribe('reader@example.test');
		await list.announce(issue);
		expect(list.announced('1.2.3')).toBe(true);
	});

	test('one address that fails does not stop the rest', async () => {
		await list.subscribe('good@example.test');
		await list.subscribe('bad@example.test');
		sendEmail.mockImplementation(async (mail) => {
			if (mail.to === 'bad@example.test') throw new Error('mailbox full');
			return { delivered: true };
		});

		expect(await list.announce(issue)).toEqual({ sent: 1, failed: 1 });
	});

	test('refuses when the instance has no newsletter', async () => {
		enabled = false;
		await expect(list.announce(issue)).rejects.toBeInstanceOf(errors.ValidationError);
	});
});
