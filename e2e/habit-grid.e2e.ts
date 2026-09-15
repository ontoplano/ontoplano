import { expect, test } from '@playwright/test';
import { register, testEmail } from './helpers/account';
import { visit } from './helpers/visit';

/**
 * The habit grid spends the width it is given.
 *
 * Ninety days is thirteen columns, and at a fixed ten pixels a column that is
 * a third of a phone screen with two thirds of nothing beside it — which is
 * what it was. The columns share the width instead. Two things go wrong if
 * that is done carelessly, and both are checked: the days have to stay square,
 * and the blanket 44px touch-target rule has to keep its hands off them, or
 * seven of them in a column are taller than the phone.
 */
async function aHabitWithItsGridOpen(page: import('@playwright/test').Page) {
	await register(page, testEmail('heat'));
	await visit(page, '/health/habits');
	await page.request.post('/health/habits?/create', {
		headers: { Origin: new URL(page.url()).origin, 'x-sveltekit-action': 'true' },
		form: { label: 'doomscrolling', type: 'bad', scheduledDays: '' }
	});
	await page.reload();
	await page.getByRole('button', { name: 'Expand' }).first().click();
	await expect(page.locator('.heat-day').first()).toBeVisible();
}

/** The card the grid sits in, which is the width it is allowed to spend. */
async function gridAndCard(page: import('@playwright/test').Page) {
	const days = page.locator('.heat-day');
	const first = (await days.first().boundingBox())!;
	const last = (await days.last().boundingBox())!;
	const card = (await page.locator('.shadow-card').first().boundingBox())!;
	return { first, spanned: last.x + last.width - first.x, card };
}

test.describe('on a phone', () => {
	test.use({ viewport: { width: 390, height: 800 }, hasTouch: true, isMobile: true });

	test('ninety days fills the card rather than huddling on the left', async ({ page }) => {
		test.setTimeout(120_000);
		await aHabitWithItsGridOpen(page);
		const { first, spanned, card } = await gridAndCard(page);

		// Most of the card, allowing for its padding and the weekday column.
		expect(spanned).toBeGreaterThan(card.width * 0.7);

		// Square, not the pill the touch rule used to stretch it into.
		expect(first.height).toBeCloseTo(first.width, 0);

		// And a day is a real target, which is what the width buys.
		expect(first.width).toBeGreaterThan(16);
	});
});

test.describe('on a desktop', () => {
	test.use({ viewport: { width: 1400, height: 900 } });

	test('a year fits without becoming a wall of tiles', async ({ page }) => {
		test.setTimeout(120_000);
		await aHabitWithItsGridOpen(page);
		const { first, spanned, card } = await gridAndCard(page);

		expect(spanned).toBeLessThanOrEqual(card.width);
		expect(first.height).toBeCloseTo(first.width, 0);

		// The page must not gain a sideways scroll from any of it.
		const overflow = await page.evaluate(() => {
			const main = document.querySelector('main')!;
			return main.scrollWidth - main.clientWidth;
		});
		expect(overflow).toBe(0);
	});
});
