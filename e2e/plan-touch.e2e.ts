import { expect, test } from '@playwright/test';
import { register } from './helpers/account';
import { visit } from './helpers/visit';

/**
 * Making a block with a finger.
 *
 * The grid's way of creating one is to drag a shape over empty space, and on a
 * touch screen that gesture belongs to the page — a finger dragging the grid is
 * scrolling it. So there was no way to add a block by touching the calendar at
 * all, while the hint underneath cheerfully said to drag.
 *
 * A press that stays still is the one gesture a scroll cannot be mistaken for.
 * These pin both halves: a hold opens the form on the spot held, and a swipe
 * does not.
 */
test.describe('with a finger', () => {
	test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

	test('press and hold on the grid opens a new block there', async ({ page }) => {
		await register(page, `plan-hold-${Date.now()}@test.invalid`);
		await visit(page, '/planner/plan');

		const body = page.locator('.ec-body').first();
		await expect(body).toBeVisible();
		const box = (await body.boundingBox())!;

		await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
		await page.dispatchEvent('.ec-body', 'pointerdown', {
			pointerType: 'touch',
			isPrimary: true,
			clientX: box.x + box.width / 2,
			clientY: box.y + box.height / 2
		});
		// Longer than the hold, and then the release the finger would make.
		await page.waitForTimeout(700);
		await page.dispatchEvent('.ec-body', 'pointerup', {
			pointerType: 'touch',
			isPrimary: true,
			clientX: box.x + box.width / 2,
			clientY: box.y + box.height / 2
		});

		await expect(page.getByRole('heading', { name: 'New block' })).toBeVisible();
	});

	test('a swipe over the grid is a scroll, not a new block', async ({ page }) => {
		await register(page, `plan-swipe-${Date.now()}@test.invalid`);
		await visit(page, '/planner/plan');

		const body = page.locator('.ec-body').first();
		const box = (await body.boundingBox())!;
		const x = box.x + box.width / 2;
		const y = box.y + box.height / 2;

		await page.dispatchEvent('.ec-body', 'pointerdown', {
			pointerType: 'touch',
			isPrimary: true,
			clientX: x,
			clientY: y
		});
		await page.dispatchEvent('.ec-body', 'pointermove', {
			pointerType: 'touch',
			isPrimary: true,
			clientX: x,
			clientY: y - 80
		});
		await page.waitForTimeout(700);
		await page.dispatchEvent('.ec-body', 'pointerup', {
			pointerType: 'touch',
			isPrimary: true,
			clientX: x,
			clientY: y - 80
		});

		await expect(page.getByRole('heading', { name: 'New block' })).toHaveCount(0);
	});
});

/** What a tap on a block must not leave behind. */
test.describe('tapping a block', () => {
	test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

	/**
	 *
	 * A tap raises `mouseenter` and never raises `mouseleave`, so the hover card
	 * appeared over the grid on the first tap and stayed for the session —
	 * including after the editor that same tap opened had been cancelled.
	 */
	test('tapping a block leaves no hover card behind', async ({ page }) => {
		await register(page, `plan-hover-${Date.now()}@test.invalid`);
		await visit(page, '/planner/plan');

		const block = page.locator('.ec-event.ec-draggable').first();
		await expect(block).toBeVisible();
		await block.dispatchEvent('mouseenter');
		await page.waitForTimeout(200);

		expect(await page.locator('[data-block-hover]').count()).toBe(0);
	});
});
