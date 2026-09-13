import { expect, test } from '@playwright/test';
import { PAGE_TURN_DEFAULTS as PAGE_TURN } from '../src/lib/page-turn';
import { register } from './helpers/account';
import { visit } from './helpers/visit';

/**
 * Changing screen turns the page, in two halves, and finishes.
 *
 * Screenshots cannot test this — the dots are drawn by an SVG filter and a
 * headless capture of a mid-turn frame tells you nothing — so what is checked
 * is the machinery: that the page is filtered the moment a navigation starts,
 * that the threshold inside the filter actually moves, and that nothing is
 * left behind.
 *
 * That last one is why this file exists. The turn used to be a View
 * Transition, and `onNavigate` held the navigation until it resolved: a burst
 * of navigations left the app unable to move at all, twice, and every other
 * suite failed at once without saying why. Nothing is returned from
 * `onNavigate` any more, and this pins that.
 */
test.use({ viewport: { width: 1280, height: 820 } });

/** Where the threshold sits, and whether the page is being filtered at all. */
async function turning(page: import('@playwright/test').Page) {
	return page.evaluate(
		(out) => ({
			intercept: document.getElementById(`${out}-ramp`)?.getAttribute('intercept') ?? null,
			filtered: /url\(/.test(
				(document.querySelector('.page-turning') as HTMLElement | null)?.style.filter ?? ''
			)
		}),
		PAGE_TURN.outFilter
	);
}

test('a link to another screen turns the page, then gets out of the way', async ({ page }) => {
	test.setTimeout(90_000);

	await register(page, `page-turn-${Date.now()}@test.invalid`);
	await visit(page, '/');

	const before = await turning(page);
	expect(before.filtered).toBe(false);

	/*
	 * Every value the threshold takes, recorded as it takes them.
	 *
	 * Sampling it once mid-navigation cannot work: the first frame writes the
	 * value it started from, and on a machine with nothing else to do the whole
	 * turn can be over before the sample is read — both of which read as "it
	 * never moved". The filter lives in the root layout, so the observer
	 * survives the navigation.
	 */
	await page.evaluate((out) => {
		const seen: string[] = [];
		(window as unknown as { __ramp: string[] }).__ramp = seen;
		new MutationObserver((records) => {
			for (const record of records)
				if ((record.target as Element).id === `${out}-ramp`)
					seen.push(
						`${Math.round(performance.now())}:${(record.target as Element).getAttribute('intercept')}`
					);
		}).observe(document.documentElement, {
			attributes: true,
			subtree: true,
			attributeFilter: ['intercept']
		});
	}, PAGE_TURN.outFilter);

	/*
	 * A navigation with a wait in it, because that is the only kind worth
	 * covering. Against a dev server on the same machine the data arrives
	 * inside one frame, the turn starts and finishes at "whole", and the
	 * dissolve correctly never happens — nothing was hidden because nothing
	 * took any time. Half a second is a phone on a train.
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

	// And the threshold was slid: a filter that does not move is a page that
	// simply vanishes.
	const seen = await page.evaluate(() => (window as unknown as { __ramp: string[] }).__ramp ?? []);
	expect(new Set(seen).size, JSON.stringify(seen).slice(0, 400)).toBeGreaterThan(1);

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
