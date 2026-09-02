import { expect, test } from '@playwright/test';
import { register } from './helpers/account';
import { visit } from './helpers/visit';

/**
 * Dragging a block with a finger must not also scroll the page.
 *
 * The calendar starts a touch drag on a long press and sets no `touch-action`,
 * so the browser scrolled at the same time: the block moved, the grid moved
 * under it, and neither gesture finished. The rule is one line of CSS and
 * invisible on a desktop browser, which is why it is pinned here.
 */
// A touch context, because the rule is behind `pointer: coarse` — on a desktop
// browser it correctly does not apply, and a test that asked there would pass
// by testing nothing.
test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 800 } });

test('a draggable block refuses the browser its own gesture', async ({ page }) => {
	await register(page, `touch-${Date.now()}@test.invalid`);
	await visit(page, '/planner/plan');

	const block = page.locator('.ec-event.ec-draggable').first();
	if ((await block.count()) === 0) test.skip(true, 'no blocks on this week to drag');

	const touchAction = await block.evaluate((el) => getComputedStyle(el).touchAction);
	expect(touchAction).toBe('none');
});
