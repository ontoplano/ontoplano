import { expect, test } from '@playwright/test';
import { register, testEmail } from './helpers/account';
import { visit } from './helpers/visit';

/**
 * The next three days, as lists or as timelines — a card's own setting.
 *
 * As timelines the three days share one span — the hours their blocks hold —
 * at one height, so an empty afternoon looks empty. The choice is the
 * account's and survives a reload.
 */
/** The timeline's cap in `+page.svelte` (18rem), at the 16px root. */
const TIMELINE_MAX_PX = 288;

for (const [width, height] of [
	[1440, 900],
	[390, 844]
] as const) {
	test(`the next days can be timelines, and stay timelines (${width}px)`, async ({ page }) => {
		await page.setViewportSize({ width, height });
		await register(page, testEmail(`next-days-${width}`));
		await visit(page, '/');

		const timelines = page.locator('[data-timeline]');
		await expect(timelines).toHaveCount(0);

		const asTimelines = page.getByRole('button', { name: /As timelines/ });
		await asTimelines.click();
		await expect(timelines).toHaveCount(3);
		await expect(asTimelines).toHaveAttribute('aria-pressed', 'true');

		// The three days are one height: the same day, drawn the same size.
		const heights = await timelines.evaluateAll((all) =>
			all.map((one) => Math.round(one.getBoundingClientRect().height))
		);
		expect(new Set(heights).size).toBe(1);
		// Sized by the hours it covers and capped, not the whole day at 26rem.
		expect(heights[0]).toBeLessThanOrEqual(TIMELINE_MAX_PX);

		// A rule down the side, not a box: no corners in either style.
		const radius = await timelines.first().evaluate((el) => {
			const html = document.documentElement;
			const was = html.dataset.style;
			html.dataset.style = 'playful';
			const r = getComputedStyle(el).borderRadius;
			html.dataset.style = was;
			return r;
		});
		expect(radius).toBe('0px');

		// Nothing runs off a phone.
		const overflow = await page.evaluate(
			() => document.documentElement.scrollWidth - document.documentElement.clientWidth
		);
		expect(overflow).toBeLessThanOrEqual(1);

		await expect
			.poll(async () => {
				await visit(page, '/');
				return timelines.count();
			})
			.toBe(3);

		await page.getByRole('button', { name: 'As lists' }).click();
		await expect(timelines).toHaveCount(0);
	});
}

/*
 * Today's timeline draws where the day is now, and only today's does. The
 * browser's clock is pinned to noon of the server's own day (UTC, see
 * playwright.config.ts), which every planner's default hours contain.
 */
test('today’s timeline marks now', async ({ page }) => {
	const noon = new Date(`${new Date().toISOString().slice(0, 10)}T12:00:00Z`);
	await page.clock.setFixedTime(noon);
	await register(page, testEmail('next-days-now'));
	await visit(page, '/');
	await page.getByRole('button', { name: /As timelines/ }).click();

	const timelines = page.locator('[data-timeline]');
	await expect(timelines).toHaveCount(3);
	await expect(page.locator('[data-now]')).toHaveCount(1);
	await expect(timelines.first().locator('[data-now]')).toHaveCount(1);
});
