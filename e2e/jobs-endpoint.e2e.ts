import { expect, test } from '@playwright/test';

/**
 * The minutely job, done by the process that is already running.
 *
 * It used to be `npx tsx` once a minute: a fresh Node, a fresh compile of every
 * service it touches and a fresh database handle — three seconds of CPU and a
 * hundred megabytes to usually send nothing. Four per cent of a core,
 * permanently, on a box that costs money.
 *
 * What matters about the endpoint that replaced it is that it is not open. It
 * writes, and it sends: unauthenticated it must be indistinguishable from a
 * route that does not exist.
 */
test('the reminders job refuses anybody without the health token', async ({ request }) => {
	const bare = await request.post('/api/jobs/reminders');
	expect(bare.status(), 'an unauthenticated caller can run the job').toBe(404);

	const wrong = await request.post('/api/jobs/reminders', {
		headers: { 'x-health-token': 'not-the-token' }
	});
	expect(wrong.status()).toBe(404);

	// A GET is not a way round it either.
	const read = await request.get('/api/jobs/reminders');
	expect([404, 405]).toContain(read.status());
});

/**
 * And that it does the work when it is allowed to — the same answer the script
 * prints, so a journal line and a curl say the same thing.
 */
test('and does the round with it', async ({ request }) => {
	const ran = await request.post('/api/jobs/reminders', {
		headers: { 'x-health-token': 'playwright-health-token' }
	});

	expect(ran.status(), await ran.text()).toBe(200);
	const body = (await ran.json()) as {
		ok: boolean;
		devices: number;
		accounts: number;
		configured: boolean;
	};
	expect(body.ok).toBe(true);
	// The counts the journal prints: how many devices could be reached at all,
	// which is the number that answers "why did nothing arrive".
	expect(typeof body.devices).toBe('number');
	expect(typeof body.accounts).toBe('number');
	expect(typeof body.configured).toBe('boolean');
});
