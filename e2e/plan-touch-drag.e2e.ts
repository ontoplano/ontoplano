import { expect, test } from '@playwright/test';
import { register } from './helpers/account';
import { visit } from './helpers/visit';

/**
 * A finger on a block scrolls the day; a finger that stays still moves it.
 *
 * This file used to assert the opposite, and the reasoning was sound and the
 * result was wrong. The calendar starts a touch drag after a long press and
 * sets no `touch-action`, so a drag and a scroll could run at once — the block
 * travelled while the grid slid under it. `touch-action: none` on every block
 * stopped that by giving the drag *every* touch that starts on a block.
 *
 * Which is the bug: a block is a big target on a phone, and a full day is a
 * column of them with no gaps. The grid could only be scrolled by finding empty
 * space, and on a busy day there is none — so the afternoon was unreachable.
 *
 * The gesture belongs to the browser until the press has been held. Nothing is
 * lost by that: the calendar starts a drag only after a second of stillness,
 * and from that moment it calls `preventDefault` on every touchmove itself. A
 * scroll cannot have begun by then, because a finger that moved cancelled the
 * press.
 */
// A touch context, because the rule is behind `pointer: coarse` — on a desktop
// browser it correctly does not apply, and a test that asked there would pass
// by testing nothing.
test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 800 } });

test('a block does not take the scroll gesture away from the page', async ({ page }) => {
	await register(page, `touch-${Date.now()}@test.invalid`);
	await visit(page, '/planner/plan');

	const block = page.locator('.ec-event.ec-draggable').first();
	if ((await block.count()) === 0) test.skip(true, 'no blocks on this week to drag');

	const touchAction = await block.evaluate((el) => getComputedStyle(el).touchAction);
	expect(touchAction, 'a finger starting on a block cannot scroll the day').not.toBe('none');
	// And panning is what it is allowed to do: `manipulation` is pan plus pinch,
	// minus the double-tap zoom that would fight a tap on a block.
	expect(touchAction).toBe('manipulation');
});
