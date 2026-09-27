import { expect, test, type Locator, type Page } from '@playwright/test';
import { register, testEmail } from './helpers/account';
import { visit } from './helpers/visit';

/**
 * The foot of a task card.
 *
 * The actions sit at the card's bottom-right edge, not halfway down beside a
 * rail taller than the words. From `sm` up the labels share that line, with
 * the add-a-label chip after the last one; on a phone the chip stays in the
 * rail and the labels keep their own line.
 */
async function newTodo(page: Page, title: string, tags: string) {
	await page.getByRole('button', { name: 'New task' }).click();
	await page.locator('#todo-form [name="heading"]').fill(title);
	const more = page.getByRole('button', { name: /Category, notebook/ }).first();
	if (await more.count()) await more.click();
	await page.locator('#todo-form input[role="combobox"]').fill(tags);
	await page.getByRole('button', { name: 'Create task' }).click();
	await expect(page.getByText(title).first()).toBeVisible();
}

function rowOf(page: Page, title: string): Locator {
	return page.locator('[data-todo-id]').filter({ hasText: title });
}

async function box(of: Locator) {
	const b = await of.boundingBox();
	if (!b) throw new Error('not on screen');
	return b;
}

for (const [label, viewport] of [
	['desktop', { width: 1440, height: 900 }],
	['phone', { width: 390, height: 844 }]
] as const) {
	test(`the actions sit at the bottom of the card, ${label}`, async ({ page }) => {
		test.setTimeout(150_000);
		await page.setViewportSize(viewport);
		await register(page, testEmail(`todo-foot-${label}`));
		await visit(page, '/tasks/todo');

		await newTodo(page, 'ring the plumber', 'home, call');
		const row = rowOf(page, 'ring the plumber');
		const card = await box(row);
		const actions = await box(row.locator('.task-actions'));
		// The row's bottom padding is all that is between them.
		expect(card.y + card.height - (actions.y + actions.height)).toBeLessThan(16);

		const quick = row.locator('.quick-tag');
		await expect(quick).toHaveCount(1);
		if (label === 'desktop') {
			// After the last label, on the line the buttons are on, and level
			// with them.
			await expect(row.locator('.task-labels .quick-tag')).toHaveCount(1);
			const middle = (b: { y: number; height: number }) => b.y + b.height / 2;
			const lastChip = await box(row.locator('.task-labels .tag-chip').last());
			const add = await box(quick);
			expect(Math.abs(middle(lastChip) - middle(actions))).toBeLessThan(2);
			expect(Math.abs(middle(add) - middle(actions))).toBeLessThan(2);
			expect(add.x).toBeGreaterThan(lastChip.x);
		} else {
			await expect(row.locator('.row-card-rail .quick-tag')).toHaveCount(1);
		}

		// "Pull onto today" is gone from the card.
		await expect(row.getByRole('button', { name: 'Pull onto today' })).toHaveCount(0);

		// Putting it on a day dates the card, as pulling it onto a day did.
		await row.hover();
		await row.getByRole('button', { name: 'Delegate to a day' }).click();
		await page.locator('#delegate-form [name="date"]').fill('2026-10-02');
		await page.getByRole('button', { name: 'Put on the day' }).click();
		await expect(row.getByText('2026-10-02')).toBeVisible();

		// And the day's board has it once, as the block: the task itself was
		// not put on the day, so there is no card beside the block, and nothing
		// is carried on to a later board as overdue.
		const onBoard = (at: string) =>
			visit(page, `/tasks/board?date=${at}`).then(() =>
				page
					.locator('main')
					.getByText('ring the plumber', { exact: true })
					.filter({ visible: true })
			);
		await expect(await onBoard('2026-10-02')).toHaveCount(1);
		await expect(await onBoard('2026-10-05')).toHaveCount(0);
	});
}
