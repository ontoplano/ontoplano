import { expect, test } from '@playwright/test';
import { register, testEmail } from './helpers/account';
import { visit } from './helpers/visit';

/**
 * A data stream's page is part of Integrations, wherever it answers.
 *
 * It lives at `/data/<slug>` because that address is what a script pushes to
 * and what somebody pastes into a graph, but it is reached from Connections —
 * so without the room's strip it read as a page belonging to nothing: "the tab
 * selector is gone and I don't see it as part of something anymore but an
 * isolated page".
 */
test('a stream page keeps the room’s tabs, under Connections', async ({ page }) => {
	test.setTimeout(180_000);
	await register(page, testEmail('stream-belongs'));

	/*
	 * A stream to look at, made the way streams are actually made: by pushing
	 * a reading at one. The browser's own session mints the token.
	 */
	const form = new URLSearchParams();
	form.set('label', 'steps');
	form.append('scopes', 'streams:write');
	const minted = await page.request.post('/settings/integrations/connections?/createToken', {
		headers: {
			Origin: new URL(page.url()).origin,
			'x-sveltekit-action': 'true',
			'content-type': 'application/x-www-form-urlencoded'
		},
		data: form.toString()
	});
	const token = /onto_[A-Za-z0-9_-]+/.exec(await minted.text())?.[0];
	expect(token, 'no token to push a reading with').toBeTruthy();

	const declared = await page.request.post('/api/v1/streams', {
		headers: { Authorization: `Bearer ${token}` },
		data: { slug: 'steps', name: 'Steps', source: 'phone', kind: 'measurement', unit: 'steps' }
	});
	expect(declared.ok(), await declared.text()).toBeTruthy();

	const pushed = await page.request.post('/api/v1/streams/steps/points', {
		headers: { Authorization: `Bearer ${token}` },
		data: { points: [{ at: '2026-01-02T10:00:00.000Z', value: 4213 }] }
	});
	expect(pushed.ok(), await pushed.text()).toBeTruthy();

	await visit(page, '/data/steps');

	// The room's own strip, not the menu that is on every page.
	const strip = page.locator('.room-bar');
	const connections = strip.getByRole('link', { name: 'Integrations', exact: true });
	await expect(connections).toBeVisible({ timeout: 15_000 });
	await expect(strip.getByRole('link', { name: 'AI', exact: true })).toBeVisible();

	// And it says which of them this page is under.
	await expect(connections).toHaveAttribute('aria-current', 'page');
});
