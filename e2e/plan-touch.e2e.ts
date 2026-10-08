import { expect, test } from '@playwright/test';
import { register, testEmail } from './helpers/account';
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

	test('a tap opens a short new-activity sheet with save visible', async ({ page }) => {
		await register(page, testEmail('plan-tap'));
		await visit(page, '/tasks/plan');
		await expect(page.getByRole('button', { name: 'More' })).toHaveAttribute(
			'aria-expanded',
			'false'
		);
		await expect(page.getByRole('button', { name: 'Schemes' })).toBeHidden();
		const fullscreen = page.getByRole('button', { name: 'Full screen' });
		await expect(fullscreen).toBeVisible();
		const fullscreenBefore = (await fullscreen.boundingBox())!;
		const more = page.getByRole('button', { name: 'More' });
		const before = (await more.boundingBox())!;
		await page.screenshot({ path: 'test-results/plan-phone-collapsed.png' });
		await more.click();
		await expect(page.getByRole('button', { name: 'Schemes' })).toBeVisible();
		const list = page.getByRole('button', { name: 'Show as a list' });
		await expect(list).toBeVisible();
		const listBox = (await list.boundingBox())!;
		const fullscreenAfter = (await fullscreen.boundingBox())!;
		expect(listBox.y).toBeGreaterThan(fullscreenAfter.y);
		expect(Math.abs(fullscreenAfter.x - fullscreenBefore.x)).toBeLessThan(1);
		const after = (await more.boundingBox())!;
		expect(Math.abs(after.x - before.x)).toBeLessThan(1);
		await more.click();
		await page.setViewportSize({ width: 630, height: 844 });
		const wideBefore = (await fullscreen.boundingBox())!;
		await more.click();
		const wideAfter = (await fullscreen.boundingBox())!;
		const wideList = (await list.boundingBox())!;
		expect(wideList.x).toBeLessThan(wideAfter.x);
		expect(Math.abs(wideAfter.x - wideBefore.x)).toBeLessThan(1);
		await more.click();
		await page.setViewportSize({ width: 390, height: 844 });

		const main = page.locator('.ec-main');
		await expect(main).toBeVisible();
		expect(await main.evaluate((el) => getComputedStyle(el).overflowY)).toBe('visible');
		const pageScroll = page.locator('.page-gutter');
		await pageScroll.evaluate((el) => el.scrollTo({ top: el.scrollHeight }));
		await expect.poll(() => pageScroll.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
		expect(await main.evaluate((el) => el.scrollTop)).toBe(0);
		await pageScroll.evaluate((el) => el.scrollTo({ top: 0 }));
		const body = page.locator('.ec-body').first();
		const box = (await body.boundingBox())!;
		const x = box.x + box.width / 2;
		const y = box.y + 60;
		await page.dispatchEvent('.ec-body', 'pointerdown', {
			pointerType: 'touch',
			isPrimary: true,
			clientX: x,
			clientY: y
		});
		await page.dispatchEvent('.ec-body', 'pointerup', {
			pointerType: 'touch',
			isPrimary: true,
			clientX: x,
			clientY: y
		});

		const dialog = page.getByRole('dialog', { name: 'New task block' });
		await expect(dialog).toBeVisible();
		await expect(dialog.locator('[name="newActivityName"]')).toBeVisible();
		await expect(dialog.locator('[name="newActivityName"]')).toBeFocused();
		const fieldBox = (await dialog.locator('[name="newActivityName"]').boundingBox())!;
		const bodyBox = (await dialog.locator('.overflow-y-auto').boundingBox())!;
		expect(fieldBox.y).toBeGreaterThanOrEqual(bodyBox.y);
		expect(fieldBox.y + fieldBox.height).toBeLessThanOrEqual(bodyBox.y + bodyBox.height);
		await expect(dialog).toHaveClass(/peek/);
		await expect(dialog.locator('[name="durationMinutes"]')).toHaveValue('60');
		await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeVisible();
		await expect(dialog.getByRole('button', { name: 'Add repeating task block' })).toBeVisible();
		const footerBox = (await dialog.locator('[data-modal-footer]').boundingBox())!;
		const cancelBox = (await dialog.getByRole('button', { name: 'Cancel' }).boundingBox())!;
		const saveBox = (await dialog
			.getByRole('button', { name: 'Add repeating task block' })
			.boundingBox())!;
		expect(cancelBox.x - footerBox.x).toBeLessThan(30);
		expect(footerBox.x + footerBox.width - saveBox.x - saveBox.width).toBeLessThan(30);
		await expect
			.poll(() =>
				dialog.locator('[data-modal-footer]').evaluate((el) => el.getBoundingClientRect().bottom)
			)
			.toBeLessThanOrEqual(844);
		await page.screenshot({ path: 'test-results/plan-phone-sheet.png' });
		const height = await dialog
			.locator('.panel')
			.evaluate((el) => el.getBoundingClientRect().height);
		expect(height).toBeLessThanOrEqual(844 * 0.55);
		await dialog.locator('[name="newActivityName"]').fill('Garden planning');
		await expect(dialog).toHaveClass(/peek/);
		await dialog.locator('[name="durationMinutes"]').focus();
		await expect(dialog).not.toHaveClass(/peek/);
		await dialog.getByRole('button', { name: 'Add repeating task block' }).click();
		await expect(dialog).toBeHidden();
		await expect(page.locator('.ec-event').filter({ hasText: 'Garden planning' })).toBeVisible();
	});

	test('press and hold on the grid opens a new block there', async ({ page }) => {
		await register(page, testEmail('plan-hold'));
		await visit(page, '/tasks/plan');

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

		await expect(page.getByRole('heading', { name: 'New task block' })).toBeVisible();
	});

	test('a swipe over the grid is a scroll, not a new block', async ({ page }) => {
		await register(page, testEmail('plan-swipe'));
		await visit(page, '/tasks/plan');

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

		await expect(page.getByRole('heading', { name: 'New task block' })).toHaveCount(0);
	});
});

test('dragging a block asks whether to move or copy it', async ({ page }) => {
	test.setTimeout(180_000);
	await page.setViewportSize({ width: 1280, height: 900 });
	await register(page, testEmail('plan-drag-choice'));
	await visit(page, '/tasks/plan?view=week');
	await page.getByRole('button', { name: 'New task block' }).click();
	const editor = page.getByRole('dialog', { name: 'New task block' });
	await editor.locator('[name="newActivityName"]').fill('Move or copy me');
	await editor.getByRole('button', { name: 'Add repeating task block' }).click();
	await expect(editor).toBeHidden();
	const block = page
		.locator('.ec-event.ec-draggable')
		.filter({ hasText: 'Move or copy me' })
		.first();
	await expect(block).toBeVisible();
	const box = (await block.boundingBox())!;
	const x = box.x + box.width / 2;
	const y = box.y + Math.min(20, box.height / 2);
	await page.mouse.move(x, y);
	await page.mouse.down();
	await page.mouse.move(x, y + 80, { steps: 12 });
	await page.mouse.up();
	const choice = page.getByRole('dialog', { name: 'Place task block' });
	await expect(choice).toBeVisible();
	await expect(choice.getByRole('button', { name: 'Copy' })).toBeVisible();
	await expect(choice.getByRole('button', { name: 'Move here' })).toBeVisible();
	await choice.getByRole('button', { name: 'Cancel' }).click();
	await expect(choice).toBeHidden();
	await expect(block).toBeVisible();
	const original = (await block.boundingBox())!;
	await page.mouse.move(original.x + original.width / 2, original.y + 20);
	await page.mouse.down();
	await page.mouse.move(original.x + original.width / 2, original.y + 100, { steps: 12 });
	await page.mouse.up();
	await expect(choice).toBeVisible();
	await choice.getByRole('button', { name: 'Copy' }).click();
	await expect(choice).toBeHidden();
	await expect
		.poll(() =>
			page.locator('.ec-event.ec-draggable').filter({ hasText: 'Move or copy me' }).count()
		)
		.toBe(2);
	const moving = page
		.locator('.ec-event.ec-draggable')
		.filter({ hasText: 'Move or copy me' })
		.first();
	const beforeMove = (await moving.boundingBox())!;
	await page.mouse.move(beforeMove.x + beforeMove.width / 2, beforeMove.y + 20);
	await page.mouse.down();
	await page.mouse.move(beforeMove.x + beforeMove.width / 2, beforeMove.y + 100, { steps: 12 });
	await page.mouse.up();
	await expect(choice).toBeVisible();
	await choice.getByRole('button', { name: 'Move here' }).click();
	await expect(choice).toBeHidden();
	await expect
		.poll(() =>
			page.locator('.ec-event.ec-draggable').filter({ hasText: 'Move or copy me' }).count()
		)
		.toBe(2);
	await expect.poll(async () => (await moving.boundingBox())?.y ?? 0).not.toBe(beforeMove.y);
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
		await register(page, testEmail('plan-hover'));
		await visit(page, '/tasks/plan');

		const block = page.locator('.ec-event.ec-draggable').first();
		await expect(block).toBeVisible();
		await block.dispatchEvent('mouseenter');
		await page.waitForTimeout(200);

		expect(await page.locator('[data-block-hover]').count()).toBe(0);
	});
});

/**
 * Saving an edit does not blank the form on the way out.
 *
 * `update()` resets the form element by default, and on a phone the round trip
 * is long enough to watch it: every field empties, and then the dialog closes
 * over the empty form it has just made. Nothing wanted that — the form is
 * destroyed on close, and on a failure the reset would throw away what somebody
 * typed.
 */
test.describe('saving a block', () => {
	test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

	test('the fields keep their values until the form is gone', async ({ page }) => {
		await register(page, testEmail('plan-save'));
		await visit(page, '/tasks/plan');

		const block = page.locator('.ec-event').first();
		await expect(block).toBeVisible();
		await block.click();

		const label = page.locator('#block-form [name="label"]');
		await expect(label).toBeVisible();
		await label.fill('Renamed on a phone');

		/*
		 * Watch for the reset rather than for the frame it draws.
		 *
		 * The blank is a frame or two on a fast connection, so racing it from
		 * outside proves nothing — a test that reads the field at the wrong
		 * microsecond passes against the bug, which this one did. But
		 * `form.reset()` dispatches a `reset` event, and that is the thing
		 * itself: one fires if the form is emptied, none if it is left alone.
		 */
		await page.evaluate(() => {
			const form = document.getElementById('block-form');
			(window as unknown as { __reset: boolean }).__reset = false;
			form?.addEventListener('reset', () => {
				(window as unknown as { __reset: boolean }).__reset = true;
			});
		});

		await page.getByRole('button', { name: 'Save' }).click();
		await expect(page.locator('#block-form')).toHaveCount(0);

		const wasReset = await page.evaluate(() => (window as unknown as { __reset: boolean }).__reset);
		expect(wasReset, 'the form was blanked while it was still on screen').toBe(false);
	});
});

/**
 * A todo given a time from the block form.
 *
 * Dragging between the grid and the todo strip was the only way on a phone,
 * and a drag on a phone opened a hundred todos over the calendar it was
 * meant to move a block in. The form asks instead: the mode "Existing task"
 * picks one, and saving puts it on the day.
 */
test.describe('an existing task', () => {
	test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

	test('is put on the day from the new block form', async ({ page }) => {
		test.setTimeout(180_000);
		await register(page, testEmail('plan-existing-task'));
		await visit(page, '/tasks/todo');
		await page
			.getByRole('button', { name: /New task/ })
			.first()
			.click();
		await page.locator('#todo-form [name="heading"]').fill('call the glazier');
		await page.getByRole('button', { name: 'Create task' }).click();
		await expect(page.getByText('call the glazier').first()).toBeVisible({ timeout: 30_000 });

		await visit(page, '/tasks/plan');
		await page.getByRole('button', { name: 'New task block' }).click();
		await page.getByRole('button', { name: 'Mode' }).click();
		await page.getByRole('option', { name: 'Existing task' }).click();
		await page.getByRole('button', { name: 'Existing task' }).click();
		await page.getByRole('option', { name: 'call the glazier' }).click();
		// A todo happens once, so the form says so without being asked.
		await expect(page.getByRole('button', { name: 'Once only' })).toHaveAttribute(
			'aria-pressed',
			'true'
		);
		await page.getByRole('button', { name: 'Add one-off' }).click();

		await expect(page.locator('.ec-event').filter({ hasText: 'call the glazier' })).toBeVisible();
	});
});
