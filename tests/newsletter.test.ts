import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import { makeDatabase } from './helpers/db';

/**
 * The mailing list: what it refuses, and what it never says.
 *
 * Pressing the button is the answer — there is no confirming click, and
 * nothing is sent when somebody subscribes. That is a deliberate trade: it
 * gives up the guarantee that an address belongs to whoever typed it, and what
 * stands in its place is a rate limit in front of the form and an unsubscribe
 * link in every message.
 *
 * Two properties matter more than the happy path.
 *
 * **Subscribing sends nothing.** A form on a public page that mails whatever
 * is typed into it is a way to send mail to strangers. This one writes a row
 * and says nothing to anybody.
 *
 * **The form is not a way to ask who is on the list.** Subscribing answers the
 * same thing whether the address is new, already there, or previously
 * unsubscribed. The moment those answers differ, anybody can check anybody.
 */

const database = makeDatabase();
afterAll(() => database.remove());

type Mail = { to: string; subject: string; text: string };
const sendEmail = vi.fn<(email: Mail) => Promise<{ delivered: boolean }>>(async () => ({
	delivered: true
}));
vi.mock('../src/lib/server/email', () => ({
	sendEmail: (email: Mail) => sendEmail(email),
	isEmailConfigured: () => true
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
	enabled = true;
	database.exec('delete from subscribers');
});

/** The token that would be in a message's unsubscribe link. */
function tokenOf(email: string): string {
	const row = database.get('select token from subscribers where email = ?', email) as {
		token: string;
	};
	return row.token;
}

describe('subscribing', () => {
	test('puts the address on the list at once, and sends nothing', async () => {
		await list.subscribe('reader@example.test');

		expect(sendEmail).not.toHaveBeenCalled();
		expect(list.counts()).toEqual({ confirmed: 1, pending: 0 });
		expect(list.confirmedAddresses()).toEqual(['reader@example.test']);
	});

	test('the same address twice is one row and still no mail', async () => {
		await list.subscribe('reader@example.test');
		await list.subscribe('reader@example.test');

		expect(sendEmail).not.toHaveBeenCalled();
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
