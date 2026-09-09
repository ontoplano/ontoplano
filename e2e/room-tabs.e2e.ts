import { expect, test } from '@playwright/test';
import { register } from './helpers/account';
import { visit } from './helpers/visit';

/**
 * A room's tabs scroll sideways; they never wrap.
 *
 * Tasks and Settings got the scrolling row — `use:scrollHints`, a fade and a
 * chevron on the side that has more — and Health, Finance and Notebooks were
 * left as a plain flex row. A flex row too narrow for its contents wraps, and
 * wrapping inside a link breaks the word rather than the row, so Health's five
 * tabs came out on a phone as "Hab / its", "Work / outs", "Reci / pes".
 *
 * The width here is deliberately small. At 390px the five fit and the bug is
 * invisible, which is how it survived: it only shows on a narrow phone, and
 * on any phone at all once a room grows a sixth tab — Health does that on its
 * own, since every data stream an account records earns one.
 */
test.use({ viewport: { width: 320, height: 800 }, hasTouch: true, isMobile: true });

for (const [room, path] of [
	['Health', '/health/workouts'],
	['Notebooks', '/notebooks/diary'],
	['Tasks', '/tasks/board']
] as const) {
	test(`the ${room} tabs stay on one row and scroll`, async ({ page }) => {
		await register(page, `tabs-${room.toLowerCase()}-${Date.now()}@test.invalid`);
		await visit(page, path);

		const strip = page.locator('nav[aria-label$="sections"]').first();
		await expect(strip).toBeVisible();
		const tabs = strip.locator('a');
		expect(await tabs.count()).toBeGreaterThan(1);

		// One row: every tab starts at the same height. A wrapped strip puts the
		// later ones on a second line, which is exactly the symptom.
		const tops = await tabs.evaluateAll((nodes) =>
			nodes.map((node) => Math.round(node.getBoundingClientRect().top))
		);
		expect(Math.max(...tops) - Math.min(...tops)).toBeLessThanOrEqual(1);

		// And one line each: a label that broke over two lines is taller than a
		// label that did not, whatever the padding around it.
		const heights = await tabs.evaluateAll((nodes) =>
			nodes.map((node) => Math.round(node.getBoundingClientRect().height))
		);
		expect(Math.max(...heights) - Math.min(...heights)).toBeLessThanOrEqual(1);

		/*
		 * When it does not fit, it says so.
		 *
		 * `scrollHints` writes `data-more`, and the fade and chevron are drawn off
		 * that attribute — so a row that overflows in silence is the failure this
		 * guards, not the overflow itself.
		 */
		const overflowing = await strip.evaluate((el) => el.scrollWidth > el.clientWidth + 1);
		if (overflowing) {
			await expect(strip).toHaveAttribute('data-more', /right|both/);
		}
	});
}
