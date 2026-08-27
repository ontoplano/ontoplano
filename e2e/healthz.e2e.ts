import { expect, test } from '@playwright/test';

/**
 * The endpoint something off the box polls.
 *
 * It is the only route with no session, so it is also the only one where
 * "returns 200" and "discloses nothing" have to be checked together.
 */
test('says it is alive, and nothing else, to a stranger', async ({ request }) => {
	const res = await request.get('/healthz');
	expect(res.status()).toBe(200);

	const body = await res.json();
	expect(body.ok).toBe(true);
	expect(body.database).toBe('ok');

	// Disk and memory are what an attacker would most like to know.
	expect(body.resources).toBeUndefined();
	expect(JSON.stringify(body)).not.toContain('diskFreeMb');
});

test('shows the box to a probe holding the token', async ({ request }) => {
	const res = await request.get('/healthz', {
		headers: { 'x-health-token': 'playwright-health-token' }
	});
	expect(res.status()).toBe(200);

	const body = await res.json();
	expect(body.resources.diskUsedPercent).toBeGreaterThanOrEqual(0);
	expect(body.resources.diskUsedPercent).toBeLessThanOrEqual(100);
	expect(body.resources.memoryFreeMb).toBeGreaterThan(0);
	expect(Array.isArray(body.warnings)).toBe(true);
});

test('a wrong token is the same as no token', async ({ request }) => {
	const res = await request.get('/healthz?token=nearly-the-right-one');
	expect(res.status()).toBe(200);
	expect((await res.json()).resources).toBeUndefined();
});
