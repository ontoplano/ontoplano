/**
 * @vitest-environment happy-dom
 */
/**
 * The launch's half of "this phone would like to ring for you".
 *
 * `handOverRingerKey` runs on every launch of an instance in the phone app,
 * at the worst possible moment to show anybody an error — so its contract is
 * as much about when it does nothing as about what it does. It asks only when
 * the launch said to ask, it mints through the one action that exists for it,
 * and every failure ends with the app simply opening as it always did.
 */
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { APP_USER_AGENT, DEVICE_ORIGIN } from '../src/lib/instance-choice';
import { handOverRingerKey } from '../src/lib/ringer-handshake';

const IN_APP = `Mozilla/5.0 (Linux; Android 14) ${APP_USER_AGENT}`;
const IN_BROWSER = 'Mozilla/5.0 (Linux; Android 14) Chrome/120.0';

function pretendUserAgent(value: string) {
	Object.defineProperty(navigator, 'userAgent', { value, configurable: true });
}

/** What the action answers, around the one field the handshake reads. */
function actionAnswer(body: string, ok = true): Response {
	return { ok, text: async () => body } as Response;
}

let fetched: ReturnType<typeof vi.fn>;
let replaced: ReturnType<typeof vi.fn>;

beforeEach(() => {
	fetched = vi.fn();
	replaced = vi.fn();
	vi.stubGlobal('fetch', fetched);
	vi.stubGlobal('location', { replace: replaced });
});

afterEach(() => {
	vi.unstubAllGlobals();
});

const LAUNCH = new URL('https://my.ontoplano.example/tasks/todo?ring=1');

describe('when it stays quiet', () => {
	test('a browser is never asked to ring', async () => {
		pretendUserAgent(IN_BROWSER);
		await handOverRingerKey(LAUNCH);
		expect(fetched).not.toHaveBeenCalled();
	});

	test('a launch that did not say ring mints nothing', async () => {
		pretendUserAgent(IN_APP);
		await handOverRingerKey(new URL('https://my.ontoplano.example/tasks/todo'));
		expect(fetched).not.toHaveBeenCalled();
	});
});

describe('the hand-over', () => {
	beforeEach(() => pretendUserAgent(IN_APP));

	test('mints through the ringOnThisPhone action and carries the key to /ring', async () => {
		fetched.mockResolvedValue(actionAnswer('{"success":true,"key":"onto_abc-123_x"}'));

		await handOverRingerKey(LAUNCH);

		// The address is the contract: rename the action and every phone stops
		// getting its key with nothing on any screen to say so.
		expect(fetched).toHaveBeenCalledWith(
			'/settings/integrations?/ringOnThisPhone',
			expect.objectContaining({ method: 'POST' })
		);

		expect(replaced).toHaveBeenCalledTimes(1);
		const went = new URL(replaced.mock.calls[0][0] as string);
		expect(went.origin).toBe(DEVICE_ORIGIN);
		expect(went.pathname).toBe('/ring');
		expect(went.searchParams.get('at')).toBe('https://my.ontoplano.example');
		expect(went.searchParams.get('key')).toBe('onto_abc-123_x');
	});

	test('an answer with no key in it — a sign-in page, an error — goes nowhere', async () => {
		fetched.mockResolvedValue(actionAnswer('<!doctype html><title>Sign in</title>'));
		await handOverRingerKey(LAUNCH);
		expect(replaced).not.toHaveBeenCalled();
	});

	test('a refusal goes nowhere', async () => {
		fetched.mockResolvedValue(actionAnswer('{"key":"onto_should_not_be_read"}', false));
		await handOverRingerKey(LAUNCH);
		expect(replaced).not.toHaveBeenCalled();
	});

	test('being offline is not an error, on a launch least of all', async () => {
		fetched.mockRejectedValue(new TypeError('Failed to fetch'));
		await expect(handOverRingerKey(LAUNCH)).resolves.toBeUndefined();
		expect(replaced).not.toHaveBeenCalled();
	});
});
