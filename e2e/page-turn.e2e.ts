import { expect, test } from '@playwright/test';
import { register } from './helpers/account';
import { visit } from './helpers/visit';

/**
 * Changing screen turns the page, in two halves, and finishes.
 *
 * Screenshots cannot test this — the dots are drawn by an SVG filter and a
 * headless capture of a mid-turn frame tells you nothing — so what is checked
 * here is the wiring: that the page is filtered the moment a navigation
 * starts, and that nothing is left behind when it lands.
 *
 * Whether the threshold inside the filter actually slides is asked in
 * `tests/page-turn-ramp.test.ts`, with the clock and the frame loop stood in
 * for. It cannot honestly be asked here: a headless browser hands out
 * animation frames when it feels like compositing, and against a dev server on
 * the same machine a whole navigation can land inside one frame — so the turn
 * correctly does nothing, and a test that insisted it had moved would be
 * measuring the machine.
 *
 * That last one is why this file exists. The turn used to be a View
 * Transition, and `onNavigate` held the navigation until it resolved: a burst
 * of navigations left the app unable to move at all, twice, and every other
 * suite failed at once without saying why. Nothing is returned from
 * `onNavigate` any more, and this pins that.
 */
test.use({ viewport: { width: 1280, height: 820 } });

/** Whether the page is being filtered at all. */
async function turning(page: import('@playwright/test').Page) {
	return page.evaluate(() => ({
		filtered: /url\(/.test(
			(document.querySelector('.page-turning') as HTMLElement | null)?.style.filter ?? ''
		)
	}));
}

test('a link to another screen turns the page, then gets out of the way', async ({ page }) => {
	test.setTimeout(90_000);

	await register(page, `page-turn-${Date.now()}@test.invalid`);
	await visit(page, '/');

	const before = await turning(page);
	expect(before.filtered).toBe(false);

	/*
	 * A navigation with a wait in it, because that is the only kind worth
	 * covering. Against a dev server on the same machine the data arrives
	 * inside one frame and there is nothing to hide. Half a second is a phone
	 * on a train.
	 */
	await page.route('**/goals/__data.json*', async (route) => {
		await new Promise((then) => setTimeout(then, 500));
		await route.continue();
	});

	await page.locator('a[href="/goals"]:visible').first().click();

	/*
	 * The filter goes on when the navigation starts, not when it lands.
	 *
	 * This is the half that covers the wait: on a phone the loading bar used to
	 * appear, the page arrive, and only then did the screen dissolve — the
	 * whole effect happening after the thing it was meant to hide.
	 */
	await page.waitForFunction(
		() =>
			/url\(/.test(
				(document.querySelector('.page-turning') as HTMLElement | null)?.style.filter ?? ''
			),
		undefined,
		{ timeout: 5000 }
	);

	await expect(page.locator('h1')).toContainText('Goals');

	// Nothing left over. A page left filtered is a page nobody can press —
	// the stylesheet takes its pointer events away while it turns.
	await expect.poll(async () => (await turning(page)).filtered, { timeout: 5000 }).toBe(false);
});

test('paging within one screen does not turn the page', async ({ page }) => {
	test.setTimeout(90_000);
	await register(page, `page-same-${Date.now()}@test.invalid`);
	await visit(page, '/tasks/plan');

	// The week arrows stay on `/tasks/plan`. Dots between one Tuesday and the
	// next are something somebody would turn off.
	await page.evaluate(() => history.pushState({}, '', '/tasks/plan?from=2026-01-05'));
	await page.waitForTimeout(200);

	expect((await turning(page)).filtered).toBe(false);
});

/**
 * And a burst of navigations still leaves an app that navigates.
 *
 * The onboarding wizard is six presses of Next in a few seconds, and it is
 * what broke — twice — when the turn was allowed to hold a navigation open.
 * It is cheap to state here and it is the case that actually costs an evening.
 */
test('a burst of navigations does not jam the app', async ({ page }) => {
	test.setTimeout(90_000);
	await register(page, `page-burst-${Date.now()}@test.invalid`);
	await visit(page, '/');

	for (const path of ['/goals', '/tasks/todo', '/notebooks', '/goals', '/']) {
		await page.evaluate((to) => history.pushState({}, '', to), path);
	}

	// The app still moves under its own steam afterwards.
	await page.locator('a[href="/goals"]:visible').first().click();
	await expect(page.locator('h1')).toContainText('Goals', { timeout: 15_000 });
});
