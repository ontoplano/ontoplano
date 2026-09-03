import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import { makeDatabase } from './helpers/db';

/**
 * The mailing list: what it refuses, and what it never says.
 *
 * Two properties matter more than the happy path.
 *
 * **Nothing reaches an address that did not answer.** A form on a public page
 * that sends a mail to whatever is typed into it is a way to send mail to
 * strangers, so a row is created unconfirmed and the only thing ever sent to it
 * is the one confirmation. An address that is already confirmed gets nothing at
 * all — otherwise the form is a button that mails somebody repeatedly.
 *
 * **The form is not a way to ask who is on the list.** Subscribing answers the
 * same thing whether the address is new, confirmed, or previously unsubscribed.
 * The moment those answers differ, anybody can check anybody.
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
let errors: typeof import('../src/lib/server/services/errors');

beforeAll(async () => {
	process.env.ORIGIN = 'https://app.test.invalid';
	list = await import('../src/lib/server/services/newsletter');
	errors = await import('../src/lib/server/services/errors');
});

beforeEach(() => {
	sendEmail.mockClear();
	enabled = true;
	database.exec('delete from subscribers');
});

/** The token out of the confirmation link, the way a person gets it. */
function tokenFrom(mail: Mail): string {
	return mail.text.match(/confirm\?t=([\w-]+)/)![1];
}

describe('subscribing', () => {
	test('sends one confirmation and puts nobody on the list yet', async () => {
		await list.subscribe('Reader@Example.test');

		expect(sendEmail).toHaveBeenCalledTimes(1);
		// Lower-cased on the way in, so one address cannot become two rows.
		expect(sendEmail.mock.calls[0][0].to).toBe('reader@example.test');
		expect(list.counts()).toEqual({ confirmed: 0, pending: 1 });
		expect(list.confirmedAddresses()).toEqual([]);
	});

	test('the same address twice is one row and one more chance to confirm', async () => {
		await list.subscribe('reader@example.test');
		await list.subscribe('reader@example.test');

		expect(list.counts()).toEqual({ confirmed: 0, pending: 1 });
		// Two mails, because the first may never have arrived — but the token is
		// the same one, so the first link still works.
		const tokens = sendEmail.mock.calls.map((c) => tokenFrom(c[0]));
		expect(new Set(tokens).size).toBe(1);
	});

	test('an address already on the list is sent nothing', async () => {
		await list.subscribe('reader@example.test');
		list.confirm(tokenFrom(sendEmail.mock.calls[0][0]));
		sendEmail.mockClear();

		await list.subscribe('reader@example.test');

		// The whole point: the form must not be a button that mails a stranger
		// as many times as somebody presses it.
		expect(sendEmail).not.toHaveBeenCalled();
		expect(list.counts()).toEqual({ confirmed: 1, pending: 0 });
	});

	test('refuses something that is not an address', async () => {
		for (const bad of ['', 'not-an-address', 'a@b', '  ', 'a@b.c '.repeat(60)]) {
			await expect(list.subscribe(bad)).rejects.toBeInstanceOf(errors.ValidationError);
		}
		expect(sendEmail).not.toHaveBeenCalled();
	});

	test('refuses everything when the instance keeps no list', async () => {
		enabled = false;
		await expect(list.subscribe('reader@example.test')).rejects.toBeInstanceOf(
			errors.ValidationError
		);
		expect(sendEmail).not.toHaveBeenCalled();
	});
});

describe('confirming', () => {
	test('the link is what puts an address on the list', async () => {
		await list.subscribe('reader@example.test');
		const token = tokenFrom(sendEmail.mock.calls[0][0]);

		expect(list.confirm(token)).toBe('reader@example.test');
		expect(list.counts()).toEqual({ confirmed: 1, pending: 0 });
		expect(list.confirmedAddresses()).toEqual(['reader@example.test']);
	});

	test('following it twice is following it once', async () => {
		await list.subscribe('reader@example.test');
		const token = tokenFrom(sendEmail.mock.calls[0][0]);

		list.confirm(token);
		// A mail client that prefetches links, or a second click.
		expect(list.confirm(token)).toBe('reader@example.test');
		expect(list.counts()).toEqual({ confirmed: 1, pending: 0 });
	});

	test('a token that is not one confirms nothing', async () => {
		await list.subscribe('reader@example.test');

		expect(list.confirm('made-up')).toBeNull();
		expect(list.confirm('')).toBeNull();
		expect(list.counts()).toEqual({ confirmed: 0, pending: 1 });
	});
});

describe('unsubscribing', () => {
	test('one click, with the token from the same link', async () => {
		await list.subscribe('reader@example.test');
		const token = tokenFrom(sendEmail.mock.calls[0][0]);
		list.confirm(token);

		expect(list.unsubscribe(token)).toBe('reader@example.test');
		expect(list.counts()).toEqual({ confirmed: 0, pending: 0 });
		expect(list.confirmedAddresses()).toEqual([]);
	});

	test('coming back means confirming again', async () => {
		await list.subscribe('reader@example.test');
		const token = tokenFrom(sendEmail.mock.calls[0][0]);
		list.confirm(token);
		list.unsubscribe(token);
		sendEmail.mockClear();

		// The earlier consent was withdrawn, so it is asked for again rather
		// than quietly resumed.
		await list.subscribe('reader@example.test');
		expect(sendEmail).toHaveBeenCalledTimes(1);
		expect(list.counts()).toEqual({ confirmed: 0, pending: 1 });

		list.confirm(token);
		expect(list.counts()).toEqual({ confirmed: 1, pending: 0 });
	});

	test('the same link twice says the same thing', async () => {
		await list.subscribe('reader@example.test');
		const token = tokenFrom(sendEmail.mock.calls[0][0]);
		list.confirm(token);

		expect(list.unsubscribe(token)).toBe('reader@example.test');
		expect(list.unsubscribe(token)).toBe('reader@example.test');
	});
});

describe('the export', () => {
	test('carries only the people who confirmed and stayed', async () => {
		const tokens: string[] = [];
		for (const email of ['a@example.test', 'b@example.test', 'c@example.test']) {
			sendEmail.mockClear();
			await list.subscribe(email);
			tokens.push(tokenFrom(sendEmail.mock.calls[0][0]));
		}

		list.confirm(tokens[0]);
		list.confirm(tokens[1]);
		list.unsubscribe(tokens[1]);
		// tokens[2] never confirmed.

		expect(list.confirmedAddresses()).toEqual(['a@example.test']);
	});
});
