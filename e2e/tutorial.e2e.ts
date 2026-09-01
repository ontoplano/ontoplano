import { expect, test } from '@playwright/test';
import { register } from './helpers/account';

/**
 * The guided tour: shown once, dismissed in two, reachable forever after.
 *
 * Three claims, and each of them is a thing somebody would notice immediately
 * if it broke:
 *
 *  - A new account is shown around without asking, on the dashboard.
 *  - Dismissing takes two presses, and the first one is the step that says
 *    where the tour lives afterwards. One press must not end it.
 *  - It never runs unasked again, and the `?` button in the corner opens the
 *    tour for whatever screen is on the screen.
 */

const tourOf = (page: import('@playwright/test').Page) =>
	page.getByRole('dialog', { name: 'Tutorial' });

test('a new account is shown around, and dismisses it in two', async ({ page }) => {
	await page.setViewportSize({ width: 1280, height: 900 });
	await register(page, `tour-${Date.now()}@test.invalid`, 'Smoke Test', true);

	const tour = tourOf(page);
	await expect(tour).toBeVisible();
	await expect(tour.getByText('This is ontoplano')).toBeVisible();

	// Forward, and the tour is somewhere else.
	await tour.getByRole('button', { name: 'Next' }).click();
	await expect(tour.getByText('This is ontoplano')).toHaveCount(0);

	// The first Dismiss is not a dismissal: it goes to the step that says how to
	// get the tour back, and the tour is still up.
	await tour.getByRole('button', { name: 'Dismiss' }).click();
	await expect(tour).toBeVisible();
	await expect(tour.getByText('Click here if you ever need this help')).toBeVisible();
	await expect(tour.getByRole('button', { name: 'Dismiss', exact: true })).toHaveCount(0);

	// The second one ends it.
	await tour.getByRole('button', { name: 'Okay, dismiss!' }).click();
	await expect(tour).toBeHidden();

	// And it stays gone, across a reload — the flag is written, not remembered.
	await page.goto('/', { waitUntil: 'networkidle' });
	await page.waitForTimeout(1200);
	await expect(tour).toBeHidden();
});

test('the button in the corner opens the tour for the screen you are on', async ({ page }) => {
	await page.setViewportSize({ width: 1280, height: 900 });
	await register(page, `tour-corner-${Date.now()}@test.invalid`);

	await page.goto('/ideas', { waitUntil: 'networkidle' });
	await page.getByRole('button', { name: 'Show me around this screen' }).click();

	const tour = tourOf(page);
	await expect(tour).toBeVisible();
	// The screen's own tour, not the app's.
	await expect(tour.getByText('Ideas', { exact: true })).toBeVisible();
	await expect(tour.getByText('Catch it now, judge it later')).toBeVisible();

	// Escape is a dismiss, which means the closing step rather than the end.
	await page.keyboard.press('Escape');
	await expect(tour.getByText('Click here if you ever need this help')).toBeVisible();
	await page.keyboard.press('Escape');
	await expect(tour).toBeHidden();
});

test('a screen with no tour says so instead of opening nothing', async ({ page }) => {
	await page.setViewportSize({ width: 1280, height: 900 });
	await register(page, `tour-missing-${Date.now()}@test.invalid`);

	// Preferences is toured; the instance page deliberately is not — it is read,
	// not learned — so it is what the red button looks like. (A visitor who is
	// not the instance owner gets a 404 there, which is drawn in the same shell
	// and is just as untoured, so this holds either way.)
	await page.goto('/settings/instance', { waitUntil: 'networkidle' });
	const button = page.getByRole('button', { name: 'No tutorial for this screen yet' });
	await expect(button).toBeVisible();
	// `aria-disabled`, so it cannot be pressed and there is nothing to open.
	await expect(button).toBeDisabled();
	await expect(tourOf(page)).toBeHidden();
});

test('the tour follows the phone into the bottom bar', async ({ page }) => {
	await page.setViewportSize({ width: 390, height: 844 });
	await register(page, `tour-phone-${Date.now()}@test.invalid`, 'Smoke Test', true);

	const tour = tourOf(page);
	await expect(tour).toBeVisible();

	/*
	 * Step through the whole thing.
	 *
	 * The point is not any one step: it is that the steps whose targets only
	 * exist on a laptop were dropped rather than pointed nowhere, so a phone
	 * reaches the end without a card floating over the middle of a dark screen.
	 * The bar step is the one that only exists down here.
	 */
	let seenBar = false;
	for (let i = 0; i < 12; i += 1) {
		if (await tour.getByText('The bar').count()) seenBar = true;
		const next = tour.getByRole('button', { name: 'Next' });
		if (!(await next.count())) break;
		await next.click();
	}

	expect(seenBar, 'the phone never met the step about its own bar').toBe(true);
	await expect(tour.getByText('Click here if you ever need this help')).toBeVisible();
	await tour.getByRole('button', { name: 'Okay, dismiss!' }).click();
	await expect(tour).toBeHidden();
});
