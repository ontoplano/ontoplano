import { expect, test } from '@playwright/test';
import { register } from './helpers/account';
import { visit } from './helpers/visit';

/**
 * The whole day is reachable, whatever hours it is set to.
 *
 * event-calendar renders its scroll container as `<section class="ec-main">`
 * and gives it `overflow: auto`. This app rounds the corners of every card by
 * clipping `section, aside, article` — one selector, more specific than a
 * class — so the calendar's scroller silently became `overflow: clip`.
 *
 * What that looked like: a day set to end at midnight drew as far as five in
 * the afternoon and stopped, with no scrollbar and no way to reach the rest.
 * Worse on a short viewport and worse again at high zoom, because what you got
 * was however many hours happened to fit — which is why nothing caught it: on a
 * tall screen with the default hours it looks perfectly fine.
 *
 * So this asks the only question that matters: can the last hour of the day be
 * scrolled to.
 */
test('a day ending at midnight can be scrolled to midnight', async ({ page }) => {
	await register(page, `grid-scroll-${Date.now()}@test.invalid`);

	// The hours somebody actually sets when they work late.
	await visit(page, '/settings/preferences');
	await page.locator('select[name="start"]').selectOption('6');
	await page.locator('select[name="end"]').selectOption('24');
	await page
		.locator('form[action="?/saveGridHours"]')
		.getByRole('button', { name: 'Save' })
		.click();

	await visit(page, '/planner/plan');
	const main = page.locator('.ec-main');
	await expect(main).toBeVisible();

	const geometry = async () =>
		main.evaluate((el) => ({
			scroll: el.scrollHeight,
			visible: el.clientHeight,
			overflow: getComputedStyle(el).overflowY
		}));

	const before = await geometry();
	// Eighteen hours never fit in a viewport, so there is always more than is
	// shown — that is the precondition, not the assertion.
	expect(before.scroll).toBeGreaterThan(before.visible);
	expect(before.overflow, 'the grid must scroll, not clip').not.toBe('clip');
	expect(before.overflow).not.toBe('hidden');

	// And it really moves.
	await main.evaluate((el) => el.scrollTo({ top: el.scrollHeight }));
	const scrolled = await main.evaluate((el) => el.scrollTop);
	expect(scrolled, 'the grid did not scroll').toBeGreaterThan(0);

	// The last hour of the day is on screen once it has.
	await expect(page.locator('.ec-main').getByText('23:00', { exact: true })).toBeVisible();
});
