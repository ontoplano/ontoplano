import { expect, test } from '@playwright/test';
import { register, testEmail } from './helpers/account';
import { visit } from './helpers/visit';

/**
 * A data stream's page is one of Health's tabs, and draws Health's strip.
 *
 * Health lists every stream the account has beside Habits, Workouts and
 * Recipes, but a stream's page answers at `/data/<slug>` — so pressing Sleep
 * took the strip away and the page read as belonging to nothing.
 */
for (const size of [
	{ name: 'desktop', width: 1440, height: 900 },
	{ name: 'phone', width: 390, height: 844 }
]) {
	test(`a stream page keeps Health's tabs, with its own underlined (${size.name})`, async ({
		page
	}) => {
		test.setTimeout(180_000);
		await page.setViewportSize({ width: size.width, height: size.height });
		await register(page, testEmail(`stream-belongs-${size.name}`));

		/*
		 * A stream to look at, made the way streams are actually made: by
		 * pushing a reading at one. The browser's own session mints the token.
		 */
		const form = new URLSearchParams();
		form.set('label', 'sleep');
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
			data: { slug: 'sleep', name: 'Sleep', source: 'phone', kind: 'measurement', unit: 'h' }
		});
		expect(declared.ok(), await declared.text()).toBeTruthy();

		const pushed = await page.request.post('/api/v1/streams/sleep/points', {
			headers: { Authorization: `Bearer ${token}` },
			data: { points: [{ at: '2026-01-02T10:00:00.000Z', value: 7.5 }] }
		});
		expect(pushed.ok(), await pushed.text()).toBeTruthy();

		await visit(page, '/data/sleep');

		// Health's own strip, in its order, with this stream's tab underlined.
		const strip = page.locator('.room-bar nav');
		const sleep = strip.getByRole('link', { name: 'Sleep', exact: true });
		await expect(sleep).toBeVisible({ timeout: 15_000 });
		await expect(strip.getByRole('link')).toHaveText(['Habits', 'Workouts', 'Recipes', 'Sleep']);
		await expect(sleep).toHaveAttribute('aria-current', 'page');
		await expect(strip.getByRole('link', { name: 'Connections' })).toHaveCount(0);
		await page.screenshot({ path: `test-results/stream-page-belongs-${size.name}.png` });

		// Shift+H walks that strip: back one is Recipes, and forward again is Sleep.
		await page
			.locator('h1, body')
			.first()
			.click({ position: { x: 5, y: 5 } });
		await page.keyboard.press('Shift+H');
		await expect(page).toHaveURL(/\/health\/recipes/, { timeout: 30_000 });
		await page.keyboard.press('Shift+L');
		await expect(page).toHaveURL(/\/data\/sleep/, { timeout: 30_000 });
	});
}
