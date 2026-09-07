import { expect, test, type APIRequestContext, type PlaywrightWorkerArgs } from '@playwright/test';
import { clientAddress } from './helpers/account';

/**
 * Nothing unbounded reaches the database.
 *
 * `str()` and `optionalStr()` take a required `max`, so every value that goes
 * through them is capped — but the guarantee is only worth as much as the next
 * form that forgets to use them. This posts an absurd string at one field per
 * entity and expects the same answer every time: refused, with a message that
 * says how long it may be.
 */

const ORIGIN = 'http://localhost:4173';

/** Longer than any cap in the app, and long enough to be obviously wrong. */
const TOO_LONG = 'x'.repeat(60_000);

const CASES: { name: string; path: string; form: Record<string, string> }[] = [
	{ name: 'diary entry', path: '/notebooks/diary?/create', form: { content: TOO_LONG } },
	{
		name: 'diary tags',
		path: '/notebooks/diary?/create',
		form: { content: 'fine', tags: TOO_LONG }
	},
	{ name: 'todo title', path: '/tasks/todo?/create', form: { heading: TOO_LONG } },
	{ name: 'todo notes', path: '/tasks/todo?/create', form: { heading: 'fine', notes: TOO_LONG } },
	{
		name: 'notebook title',
		path: '/notebooks?/create',
		form: { heading: TOO_LONG }
	},
	{ name: 'person name', path: '/notebooks/people?/create', form: { label: TOO_LONG } },
	{
		name: 'habit name',
		path: '/health/habits?/create',
		form: { label: TOO_LONG, type: 'good', scheduledDays: '' }
	},
	{
		name: 'goal title',
		path: '/goals?/create',
		form: { heading: TOO_LONG, horizon: 'week' }
	},
	{ name: 'idea', path: '/ideas?/create', form: { content: TOO_LONG } },
	{ name: 'shopping item', path: '/inventory?/create', form: { label: TOO_LONG } },
	{
		name: 'quote',
		path: '/settings/preferences?/addQuote',
		form: { text: TOO_LONG }
	},
	{
		name: 'api token name',
		path: '/settings/integrations?/createToken',
		form: { label: TOO_LONG, scopes: 'schedule:read' }
	},
	{
		name: 'timezone',
		path: '/settings/preferences?/saveWeek',
		form: { firstDay: '0', generateDay: '6', timezone: TOO_LONG }
	}
];

async function signedIn(playwright: PlaywrightWorkerArgs['playwright']): Promise<{
	request: APIRequestContext;
	cookie: string;
}> {
	const request = await playwright.request.newContext({ baseURL: ORIGIN });
	const email = `caps-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.test`;

	const signUp = await request.post('/api/auth/sign-up/email', {
		headers: { Origin: ORIGIN, 'x-forwarded-for': clientAddress() },
		data: { email, password: 'hunter2hunter2', name: 'Caps' }
	});
	expect(signUp.ok(), await signUp.text()).toBeTruthy();

	const cookie = (
		signUp.headersArray().find((h) => h.name.toLowerCase() === 'set-cookie')?.value ?? ''
	)
		.split(';')[0]
		.trim();

	await request.post('/welcome?/finish', {
		headers: { Origin: ORIGIN, Cookie: cookie, 'x-sveltekit-action': 'true' },
		form: { timezone: 'America/Sao_Paulo', firstDay: '0', generateDay: '6', template: 'remote' }
	});

	return { request, cookie };
}

test('an absurd string is refused everywhere it can be typed', async ({ playwright }) => {
	const { request, cookie } = await signedIn(playwright);

	for (const testCase of CASES) {
		const res = await request.post(testCase.path, {
			headers: { Origin: ORIGIN, Cookie: cookie, 'x-sveltekit-action': 'true' },
			form: testCase.form
		});

		const body = await res.text();
		expect(body, `${testCase.name}: was accepted`).toContain('failure');
		// The message says the limit rather than "invalid": a person who pasted
		// too much should be told how much is too much.
		expect(body, `${testCase.name}: refused without saying the limit`).toMatch(
			/characters or fewer|at most|longer than|more tags than|Unknown timezone/
		);
	}

	await request.dispose();
});
