import { expect, test, type APIRequestContext } from '@playwright/test';
import { register, testEmail } from './helpers/account';
import { visit } from './helpers/visit';

/**
 * An assistant can see the pictures in a note it may read.
 *
 * The route that serves a picture took a session and nothing else, so a key
 * granted "read your notebooks" got the words of a note and a 404 for every
 * picture in it — which makes the ordinary way of briefing an assistant, a
 * note full of screenshots, useless.
 *
 * The rule is that a file answers to whatever refers to it: a picture in a
 * note wants `notes:read`, and a picture nothing refers to answers to nobody.
 * These are the four cases that rule has to get right — it works, it is not a
 * skeleton key, it is not a way around confinement, and a session is still a
 * session.
 */
const ORIGIN = process.env.ORIGIN ?? 'http://localhost:4173';
let minted = 0;

async function mint(request: APIRequestContext, cookie: string, scopes: string[]) {
	const form = new URLSearchParams();
	form.set('label', `media test ${++minted}`);
	for (const scope of scopes) form.append('scopes', scope);

	const res = await request.post('/settings/integrations/connections?/createToken', {
		headers: {
			Origin: ORIGIN,
			Cookie: cookie,
			'x-sveltekit-action': 'true',
			'content-type': 'application/x-www-form-urlencoded'
		},
		data: form.toString()
	});
	const token = /onto_[A-Za-z0-9_-]+/.exec(await res.text())?.[0];
	expect(token, 'no token came back').toBeTruthy();
	return token!;
}

/*
 * Two different one-pixel PNGs, and they have to be different.
 *
 * The same picture twice is one row — `store` keys on the sha256 — so posting
 * identical bytes a second time hands back the id of the first, and a test
 * that wanted "a picture nothing refers to" would be asking about the one
 * inside the note. The first version of this did exactly that and passed the
 * wrong assertion.
 */
const TRANSPARENT = Buffer.from(
	'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
	'base64'
);
const RED = Buffer.from(
	'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==',
	'base64'
);

async function uploadPicture(
	request: APIRequestContext,
	cookie: string,
	bytes: Buffer = TRANSPARENT
): Promise<number> {
	const res = await request.post('/media', {
		headers: { Origin: ORIGIN, Cookie: cookie },
		multipart: {
			file: { name: 'shot.png', mimeType: 'image/png', buffer: bytes }
		}
	});
	expect(res.ok(), await res.text()).toBeTruthy();
	const body = await res.json();
	const id = Number(body.id ?? /\/media\/(\d+)/.exec(JSON.stringify(body))?.[1]);
	expect(Number.isInteger(id) && id > 0, `no picture id in ${JSON.stringify(body)}`).toBeTruthy();
	return id;
}

test('a key that may read the notes can see a picture in one', async ({ page, playwright }) => {
	test.setTimeout(180_000);
	await register(page, testEmail('media-reach'));

	const cookie = (await page.context().cookies()).map((c) => `${c.name}=${c.value}`).join('; ');
	const request = await playwright.request.newContext({ baseURL: ORIGIN });

	const pictureId = await uploadPicture(request, cookie);

	// A note that embeds it, written the way the composer writes one.
	const made = await request.post('/notebooks?/create', {
		headers: { Origin: ORIGIN, Cookie: cookie, 'x-sveltekit-action': 'true' },
		form: { heading: 'Briefing' }
	});
	expect(made.ok(), await made.text()).toBeTruthy();

	await visit(page, '/notebooks');
	const href = await page.locator('a[href*="notebook="]').first().getAttribute('href');
	const notebookId = Number(new URL(href ?? '', ORIGIN).searchParams.get('notebook'));

	const wrote = await request.post('/notebooks?/addEntry', {
		headers: { Origin: ORIGIN, Cookie: cookie, 'x-sveltekit-action': 'true' },
		form: {
			heading: 'What to fix',
			content: `look at this ![shot](/media/${pictureId})`,
			notebookId: String(notebookId)
		}
	});
	expect(wrote.ok(), await wrote.text()).toBeTruthy();

	const reader = await mint(request, cookie, ['notes:read']);
	const seen = await request.get(`/media/${pictureId}`, {
		headers: { Authorization: `Bearer ${reader}` }
	});
	expect(seen.status(), 'a notes:read key should see a picture in a note').toBe(200);
	expect(seen.headers()['content-type']).toContain('image/');
	expect((await seen.body()).length).toBe(TRANSPARENT.length);

	/*
	 * And it is not a skeleton key. A picture nothing refers to belongs to no
	 * room, so no grant reaches it — the same 404 as a stranger's id.
	 */
	const loose = await uploadPicture(request, cookie, RED);
	expect(loose, 'the loose picture must be a different row').not.toBe(pictureId);
	const refused = await request.get(`/media/${loose}`, {
		headers: { Authorization: `Bearer ${reader}` }
	});
	expect(refused.status(), 'a picture in nothing answers to nobody').toBe(404);

	// A key for another room does not get in by the back door either.
	const wrongRoom = await mint(request, cookie, ['tasks:read']);
	const wrong = await request.get(`/media/${pictureId}`, {
		headers: { Authorization: `Bearer ${wrongRoom}` }
	});
	expect(wrong.status(), 'tasks:read is not notes:read').toBe(404);

	// No key at all is what it always was.
	const anonymous = await request.get(`/media/${pictureId}`);
	expect(anonymous.status()).toBe(404);

	await request.dispose();
});

test('a picture is still the account’s own, whoever is asking', async ({
	page,
	browser,
	playwright
}) => {
	test.setTimeout(180_000);
	await register(page, testEmail('media-mine'));
	const mineCookie = (await page.context().cookies()).map((c) => `${c.name}=${c.value}`).join('; ');
	const request = await playwright.request.newContext({ baseURL: ORIGIN });
	const pictureId = await uploadPicture(request, mineCookie);

	/*
	 * A second account, with every grant this change could touch, asking for
	 * the first one's id. Its own browser context: registering again in the
	 * first one lands on a page that is already signed in, and there is no
	 * form there to fill in.
	 */
	const other = await browser.newContext();
	const theirPage = await other.newPage();
	await register(theirPage, testEmail('media-theirs'));
	const theirsCookie = (await other.cookies()).map((c) => `${c.name}=${c.value}`).join('; ');
	const stranger = await mint(request, theirsCookie, ['notes:read', 'tasks:read']);

	const refused = await request.get(`/media/${pictureId}`, {
		headers: { Authorization: `Bearer ${stranger}` }
	});
	expect(refused.status(), 'somebody else’s picture is a 404, key or no key').toBe(404);

	await other.close();
	await request.dispose();
});
