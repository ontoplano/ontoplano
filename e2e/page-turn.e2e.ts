import { expect, test } from '@playwright/test';
import { PAGE_TURN } from '../src/lib/page-turn';
import { register } from './helpers/account';
import { visit } from './helpers/visit';

/**
 * Changing screen dissolves, and finishes dissolving.
 *
 * Screenshots cannot test this: the two snapshots a view transition draws live
 * in the browser's top layer, which a headless capture does not see, so the
 * frame comes back blank whatever is happening. What can be tested is the
 * machinery — that the turn is held open, that the threshold inside the filter
 * actually moves — and, far more importantly, that nothing is left running.
 *
 * That last one is the whole reason this file exists. The turn used to await a
 * promise that never settles when a navigation redirects, which left a picture
 * of the previous screen nailed over the live one for ever: the app worked,
 * the DOM was correct, and not one thing on it could be clicked. Every other
 * suite failed at once and none of them said why.
 */
test.use({ viewport: { width: 1280, height: 820 } });

/** Where the dissolve's threshold currently sits, on both halves. */
async function ramps(page: import('@playwright/test').Page) {
	return page.evaluate(
		([out, into]) => ({
			out: document.getElementById(`${out}-ramp`)?.getAttribute('intercept') ?? null,
			into: document.getElementById(`${into}-ramp`)?.getAttribute('intercept') ?? null
		}),
		[PAGE_TURN.outFilter, PAGE_TURN.inFilter]
	);
}

test('a link to another screen turns the page, then gets out of the way', async ({ page }) => {
	test.setTimeout(90_000);

	await register(page, `page-turn-${Date.now()}@test.invalid`);
	await visit(page, '/');

	const before = await ramps(page);

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

	// What holds the turn open. A view transition ends when the animations on
	// its pseudo-elements do, so with none at all it is over before it starts —
	// and the browser's own cross-fade, which the stylesheet replaces, would
	// smear the dots into a blur.
	expect(running).toContain('page-turn-hold@::view-transition-old(root)');
	expect(running).toContain('page-turn-hold@::view-transition-new(root)');

	// And the threshold is actually being slid: the filters are what draw the
	// dots, and a hold animation on its own would just be a hard cut.
	const during = await ramps(page);
	expect(during.out).not.toBe(before.out);
	expect(during.into).not.toBe(before.into);

	await expect(page.locator('h1')).toContainText('Goals');
	await page.waitForTimeout(PAGE_TURN.durationMs + PAGE_TURN.holdMs);

	// Nothing left over. A turn that never ends is one that covers the app.
	expect(await page.evaluate(() => document.getAnimations().length)).toBe(0);
});

test('paging within one screen does not turn the page', async ({ page }) => {
	test.setTimeout(90_000);
	await register(page, `page-same-${Date.now()}@test.invalid`);
	await visit(page, '/tasks/plan');

	// The week arrows stay on `/tasks/plan`. Dots between one Tuesday and the
	// next are something somebody would turn off.
	await page.evaluate(() => history.pushState({}, '', '/tasks/plan?from=2026-01-05'));
	await page.waitForTimeout(120);

	const running = await page.evaluate(() =>
		document.getAnimations().map((a) => (a as unknown as { animationName?: string }).animationName)
	);
	expect(running).not.toContain('page-turn-hold');
});
