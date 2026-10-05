import { expect, test } from '@playwright/test';

/**
 * `/metrics` is for the box's own collector, and nobody else.
 *
 * Which routes are slow and what the process weighs tells a stranger which
 * request to send a thousand times, so without the token it is not there.
 */
const TOKEN = 'playwright-health-token';

test('the numbers are behind the health token', async ({ request }) => {
	expect((await request.get('/metrics')).status()).toBe(404);
	expect(
		(await request.get('/metrics', { headers: { authorization: 'Bearer wrong' } })).status()
	).toBe(404);

	// A request first, so there is a route to count.
	await request.get('/login');
	const res = await request.get('/metrics', { headers: { authorization: `Bearer ${TOKEN}` } });
	expect(res.status()).toBe(200);
	const body = await res.text();
	expect(body).toContain('process_cpu_seconds_total');
	expect(body).toMatch(/ontoplano_http_request_duration_seconds_count\{[^}]*route="\/login"/);
	expect(body).toContain('ontoplano_sql_statement_runs_total');
});
