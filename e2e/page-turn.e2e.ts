import { expect, test } from '@playwright/test';
import { PAGE_TURN } from '../src/lib/page-turn.js';
import { register } from './helpers/account';
import { visit } from './helpers/visit';

/**
 * Changing screen dissolves, and finishes dissolving.
 *
 * Screenshots cannot test this: the two snapshots a view transition draws live
 * in the browser's top layer, which a headless capture does not see, so the
 * frame comes back blank whatever is happening. What can be tested is the
 * machinery — which animations are running, on which pseudo-elements, with
 * which masks — and, far more importantly, that nothing is left running.
 *
 * That last one is the whole reason this file exists. The transition used to
 * await a promise that never settles when a navigation redirects, which left a
 * picture of the previous page nailed over the live one for ever: the app
 * worked, the DOM was correct, and not one thing on the screen could be
 * clicked. Every other suite failed at once and none of them said why.
 */
test.use({ viewport: { width: 1280, height: 820 } });

test('a link to another screen turns the page, then gets out of the way', async ({ page }) => {
	test.setTimeout(90_000);

	const masks = new Set<string>();
	page.on('request', (r) => {
		if (r.url().includes(`${PAGE_TURN.dir}/`)) masks.add(r.url().split(`${PAGE_TURN.dir}/`)[1]);
	});

	await register(page, `page-turn-${Date.now()}@test.invalid`);
	await visit(page, '/');

	await page.locator('a[href="/goals"]:visible').first().click();

	// Polled rather than slept: the turn starts on the browser's own schedule,
	// and a fixed wait is a flake waiting for a slow machine.
	await page.waitForFunction(
		() =>
			document
				.getAnimations()
				.some((a) =>
					String((a as unknown as { animationName?: string }).animationName).startsWith('page-turn')
				),
		undefined,
		{ timeout: 5000 }
	);

	const running = await page.evaluate(() =>
		document.getAnimations().map((a) => {
			const effect = a.effect as KeyframeEffect | null;
			return `${(a as unknown as { animationName?: string }).animationName}@${effect?.pseudoElement}`;
		})
	);

	// Ours, on both halves — not the browser's own cross-fade, which the
	// stylesheet replaces and which would smear the dots into a blur.
	expect(running).toContain('page-turn-out@::view-transition-old(root)');
	expect(running).toContain('page-turn-in@::view-transition-new(root)');

	await expect(page.locator('h1')).toContainText('Goals');
	await page.waitForTimeout(PAGE_TURN.durationMs + PAGE_TURN.holdMs);

	// Nothing left over. A transition that never ends is one that covers the app.
	expect(await page.evaluate(() => document.getAnimations().length)).toBe(0);

	// Every step of the dissolve resolved to a mask that exists; a 404 here
	// renders as an empty mask, which is a blank screen rather than a bad one.
	// Counted from the config, so changing the number of steps cannot leave
	// this asserting an old one.
	expect(masks.size).toBe(PAGE_TURN.steps * 2);
});

test('paging within one screen does not turn the page', async ({ page }) => {
	test.setTimeout(90_000);
	await register(page, `page-same-${Date.now()}@test.invalid`);
	await visit(page, '/tasks/plan');

	// The week arrows stay on `/tasks/plan`. Half a second of dots between one
	// Tuesday and the next is something somebody would turn off.
	await page.evaluate(() => history.pushState({}, '', '/tasks/plan?from=2026-01-05'));
	await page.waitForTimeout(120);

	const running = await page.evaluate(() =>
		document.getAnimations().map((a) => (a as unknown as { animationName?: string }).animationName)
	);
	expect(running).not.toContain('page-turn-out');
});
