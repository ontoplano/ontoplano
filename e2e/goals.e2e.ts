import { expect, test } from '@playwright/test';
import { register, testEmail } from './helpers/account';
import { visit } from './helpers/visit';
import { pressUntil } from './helpers/press-until';
import { choose } from './helpers/choose';

/**
 * A done todo stays linked to its goal.
 *
 * `setGoalLinks` replaces the whole set, which is only safe while the form
 * shows a checkbox for everything linked — and it quietly stopped: the page
 * hid finished todos from the choosing modal, so re-saving it (to add a
 * seventh task, say) unlinked every one already done and the progress bar
 * fell from "1 of 6" to "0 of 6" with no explanation on screen.
 */
test('re-saving the choosing modal keeps the done todo linked', async ({ page }) => {
	await register(page, testEmail('goals'));

	// Two todos, through the page's own form.
	await visit(page, '/tasks/todo');
	for (const title of ['first chore', 'second chore']) {
		// `OneLine` is a textarea on purpose (see the component), so the field
		// is found by its label rather than by an input selector.
		const field = page.locator('[name="heading"]');
		await pressUntil(page, page.getByRole('button', { name: /New task/ }).first(), field);
		await field.fill(title);
		await page.getByRole('button', { name: 'Create task' }).click();
		await page.waitForTimeout(500);
	}

	// A goal, and both todos linked to it.
	await visit(page, '/goals');
	{
		const field = page.locator('[name="heading"]');
		await pressUntil(page, page.getByRole('button', { name: /New goal/ }).first(), field);
		await field.fill('ship the thing');
	}
	await page.getByRole('button', { name: 'Create goal' }).click();
	await page.waitForTimeout(600);

	await page
		.locator('button', { hasText: /^Tasks \(/ })
		.first()
		.click();
	await page.getByRole('button', { name: 'Choose tasks' }).click();
	const dialog = page.getByRole('dialog');
	for (const title of ['first chore', 'second chore']) {
		await dialog.locator('label', { hasText: title }).locator('input[type="checkbox"]').check();
	}
	await page.getByRole('button', { name: 'Save links' }).click();
	await page.waitForTimeout(600);

	/*
	 * Make sure the card's own fold is open, and wait for it.
	 *
	 * It is often already open behind the modal that just closed, so this used
	 * to sample its visibility once after a fixed delay and click if the answer
	 * was no. Under a loaded parallel run the sample lands before the page has
	 * settled, the click *closes* a fold that was open, and the test waits
	 * thirty seconds for a checkbox that will never come. Asking with a timeout
	 * and re-checking after the click is the same intent without the race.
	 */
	const fold = page.locator('form[action="?/setTodoStatus"]').first();
	const openFold = async () => {
		for (let attempt = 0; attempt < 3; attempt++) {
			// Wait for it rather than sampling: under load the page has often not
			// finished rendering when the question is asked, and a "no" there
			// makes the click below close a fold that was already open.
			if (await fold.isVisible({ timeout: 2000 }).catch(() => false)) return;
			await page
				.locator('button', { hasText: /^Tasks \(/ })
				.first()
				.click();
		}
		await expect(fold).toBeVisible({ timeout: 15_000 });
	};
	await openFold();
	await page
		.locator('form[action="?/setTodoStatus"]', { hasText: 'first chore' })
		.locator('input[type="checkbox"]')
		.click();
	await page.waitForTimeout(600);
	await expect(page.getByText('1 of 2 done')).toBeVisible();

	// Open the modal again and save it untouched — the regression was here.
	await openFold();
	await page.getByRole('button', { name: 'Choose tasks' }).click();
	// The done todo is still offered, ticked, struck through.
	const done = dialog
		.locator('label', { hasText: 'first chore' })
		.locator('input[type="checkbox"]');
	await expect(done).toBeChecked();
	await page.getByRole('button', { name: 'Save links' }).click();
	await page.waitForTimeout(600);

	// Still 1 of 2 — nothing fell off.
	await expect(page.getByText('1 of 2 done')).toBeVisible();

	// And the other direction: a to-do finished BEFORE it was ever linked can
	// still be linked — the completed list unfolds behind its own button.
	await visit(page, '/tasks/todo');
	{
		const field = page.locator('[name="heading"]');
		await pressUntil(page, page.getByRole('button', { name: /New task/ }).first(), field);
		await field.fill('third chore');
		await page.getByRole('button', { name: 'Create task' }).click();
		await page.waitForTimeout(500);
	}
	// Scoped to its own row: the list's order is not this test's to assume,
	// and the first Mark complete on the page is sometimes another to-do's.
	await page
		.locator('[data-todo-id]', { hasText: 'third chore' })
		.getByRole('button', { name: 'Mark complete' })
		.click();
	await page.waitForTimeout(600);

	await visit(page, '/goals');
	await openFold();
	await page.getByRole('button', { name: 'Choose tasks' }).click();
	// Done and never linked: not offered until the completed list unfolds.
	await expect(dialog.locator('label', { hasText: 'third chore' })).toHaveCount(0);
	await dialog.getByRole('button', { name: 'Show completed to-dos' }).click();
	await dialog
		.locator('label', { hasText: 'third chore' })
		.locator('input[type="checkbox"]')
		.check();
	await page.getByRole('button', { name: 'Save links' }).click();
	await page.waitForTimeout(600);
	await expect(page.getByText('2 of 3 done')).toBeVisible();
});

/**
 * One goal, several things it wants.
 *
 * The whole point of measures being rows: "get the band going" is three gigs
 * and five songs, and neither number is the goal on its own. This drives the
 * form at phone width — where three measure rows have the least room to fit —
 * adds one, records progress against one of them, and checks the goal reads as
 * half done rather than as done.
 */
test('a goal can be measured by several things, and each keeps its own number', async ({
	page
}) => {
	await page.setViewportSize({ width: 390, height: 844 });
	await register(page, testEmail('measures'));

	await visit(page, '/goals');
	const heading = page.locator('[name="heading"]');
	await pressUntil(page, page.getByRole('button', { name: /New goal/ }).first(), heading);

	await heading.fill('get the band going');
	await page.locator('[name="targetValue"]').first().fill('3');
	await page.locator('[name="targetUnit"]').first().fill('gigs');

	// A second measure, on the row the button makes.
	await page.getByRole('button', { name: 'Add measure' }).click();
	await page.locator('[name="targetValue"]').nth(1).fill('5');
	await page.locator('[name="targetUnit"]').nth(1).fill('songs');

	await page.getByRole('button', { name: 'Create goal' }).click();
	await page.waitForTimeout(800);

	// Both measures on the card, each with its own number.
	const rows = page.locator('form[action="?/setProgress"]');
	await expect(rows).toHaveCount(2);
	await expect(page.getByText('/ 3 gigs')).toBeVisible();
	await expect(page.getByText('/ 5 songs')).toBeVisible();
	await expect(page.getByText('2 measures')).toBeVisible();

	/*
	 * Every gig played. Half the goal, not all of it.
	 *
	 * Gigs are counted, so the card offers a plus rather than a field: each
	 * press is the whole gesture — the button carries the new number and
	 * submits — which is why there is no save afterwards.
	 */
	/*
	 * One press at a time, each waited for by what it changes.
	 *
	 * Every press is a form submission and the card redraws from the answer.
	 * Waiting a fixed half-second instead meant that on a loaded machine the
	 * next press could land while the card was still the old one and be
	 * swallowed — three presses, two counted, 33% where the test wanted 50%,
	 * and a failure that says nothing about the app. The percentage beside
	 * "2 measures" is what each press moves, so that is what is waited on.
	 */
	const summary = page.getByText(/\d+ measures · \d+%/);
	for (const reached of ['17%', '33%', '50%']) {
		await rows
			.first()
			.getByRole('button', { name: /One more/ })
			.click();
		await expect(summary).toHaveText(new RegExp(`· ${reached}$`), { timeout: 15_000 });
	}
	await expect(page.getByText('50%')).toBeVisible();

	// Nothing overflows the phone.
	const scrolls = await page.evaluate(
		() => document.documentElement.scrollWidth > document.documentElement.clientWidth
	);
	expect(scrolls).toBe(false);

	// Editing keeps the three gigs already played.
	await page.getByRole('button', { name: 'Edit' }).first().click();
	await expect(heading).toBeVisible();
	await page.locator('[name="targetUnit"]').first().fill('gigs played');
	await page.getByRole('button', { name: 'Save', exact: true }).click();
	await page.waitForTimeout(800);

	await expect(page.getByText('/ 3 gigs played')).toBeVisible();
	/*
	 * And the three already played survive the rename.
	 *
	 * Still 50%: three of three gigs and none of five songs, averaged. A
	 * counted measure carries its number between the minus and the plus, and
	 * the minus being pressable is what says the number is not zero.
	 */
	await expect(page.getByText('50%')).toBeVisible();
	await expect(rows.first().getByRole('button', { name: /One fewer/ })).toBeEnabled();
});

/**
 * A goal row reaches its card's edges, and deleting it asks first.
 *
 * The list used to sit inset in the card's padding, so the hover wash was a
 * square floating inside a rounded card. And delete was a second button where
 * the first had been, which a double press confirmed by itself.
 */
test('a goal row spans its card, and delete asks in a dialog', async ({ page }) => {
	await register(page, testEmail('goal-row'));
	await visit(page, '/goals');
	const heading = page.locator('[name="heading"]');
	await pressUntil(page, page.getByRole('button', { name: /New goal/ }).first(), heading);
	await heading.fill('paint the fence');
	await page.getByRole('button', { name: 'Create goal' }).click();

	const row = page.locator('[id^="goal-"]', { hasText: 'paint the fence' });
	await expect(row).toBeVisible();
	const card = page.locator('section', { has: row });
	const [rowBox, cardBox] = [await row.boundingBox(), await card.boundingBox()];
	// Inside the card's border on both sides, and no further in.
	expect(rowBox!.x - cardBox!.x).toBeLessThanOrEqual(4);
	expect(cardBox!.x + cardBox!.width - (rowBox!.x + rowBox!.width)).toBeLessThanOrEqual(2);

	await row.getByRole('button', { name: 'Delete' }).click();
	const dialog = page.getByRole('dialog');
	await expect(dialog).toContainText('paint the fence');
	await expect(row).toBeVisible();
	await page.waitForTimeout(500);
	await dialog.getByRole('button', { name: 'Delete' }).click();
	await expect(row).toHaveCount(0);
});

/**
 * A long list of parent goals stays on a phone's screen.
 *
 * "Part of" lists every open goal as "Horizon: title", which at 390px ran off
 * the right edge, and the field sits at the bottom of the dialog, so the list
 * opened below the fold. The keyboard picks from it the way it picks from a
 * select, Escape closes only the list, and a pick closes the list rather
 * than reopening it.
 */
test('the parent goal list fits a phone and answers the keyboard', async ({ page }) => {
	await page.setViewportSize({ width: 390, height: 844 });
	await register(page, testEmail('goal-parent-picker'));
	await visit(page, '/goals');
	const heading = page.locator('[name="heading"]');
	const titles = Array.from(
		{ length: 8 },
		(_, i) => `get the band playing again, and record the long album number ${i + 1}`
	);
	for (const title of titles) {
		await pressUntil(page, page.getByRole('button', { name: /New goal/ }).first(), heading);
		await heading.fill(title);
		// A year's goal, so the week's goal made below can sit under it.
		await choose(page.locator('#goal-form'), 'horizon', 'Year');
		await page.getByRole('button', { name: 'Create goal' }).click();
		await expect(heading).toBeHidden();
	}

	await pressUntil(page, page.getByRole('button', { name: /New goal/ }).first(), heading);
	const field = page.locator('#goal-form [data-picker="parentId"]');
	const face = field.getByRole('button').first();
	await face.scrollIntoViewIfNeeded();
	await face.focus();
	await page.keyboard.press('Enter');
	const list = field.getByRole('listbox');
	await expect(list).toBeVisible();

	const box = (await list.boundingBox())!;
	expect(box.x).toBeGreaterThanOrEqual(0);
	expect(box.x + box.width).toBeLessThanOrEqual(390);
	expect(box.y).toBeGreaterThanOrEqual(0);
	expect(box.y + box.height).toBeLessThanOrEqual(844);
	// Taller than it is allowed to be, so it scrolls inside itself.
	expect(await list.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(true);

	// Escape closes the list, not the dialog it is in.
	await page.keyboard.press('Escape');
	await expect(list).toBeHidden();
	await expect(page.locator('#goal-form')).toBeVisible();

	await page.keyboard.press('Enter');
	await expect(list).toBeVisible();
	await page.keyboard.press('ArrowDown');
	await page.keyboard.press('Enter');
	await expect(list).toBeHidden();
	await expect(field.locator('input[name="parentId"]')).not.toHaveValue('');
	await expect(face).toContainText('get the band playing again');
});

/**
 * An area is renamed, recoloured, reordered and removed from the areas
 * dialog, at a phone's width and a desktop's. The order is the area filter's.
 */
for (const [label, viewport] of [
	['desktop', { width: 1400, height: 900 }],
	['phone', { width: 390, height: 844 }]
] as const) {
	test(`goal areas are renamed, recoloured and reordered (${label})`, async ({ page }) => {
		await page.setViewportSize(viewport);
		await register(page, testEmail(`goal-areas-${label}`));
		await visit(page, '/goals');
		const heading = page.locator('[name="heading"]');
		await pressUntil(page, page.getByRole('button', { name: /New goal/ }).first(), heading);
		await heading.fill('run a half marathon');
		await page.getByRole('button', { name: 'Create goal' }).click();
		await expect(heading).toBeHidden();

		const dialog = page.getByRole('dialog');
		await pressUntil(page, page.getByRole('button', { name: 'Areas' }), dialog);
		const field = dialog.locator('[name="label"]');
		for (const name of ['Helth', 'Career']) {
			await field.fill(name);
			await dialog.getByRole('button', { name: 'Add area' }).click();
			await expect(dialog.locator(`[data-area="${name}"]`)).toBeVisible();
		}
		const rows = dialog.locator('[data-area]');
		await expect(rows.nth(0)).toHaveAttribute('data-area', 'Helth');
		await expect(rows.nth(1)).toHaveAttribute('data-area', 'Career');

		// Nothing on the row spills past the dialog at this width.
		const dialogBox = (await dialog.boundingBox())!;
		const rowBox = (await rows.nth(0).boundingBox())!;
		expect(rowBox.x + rowBox.width).toBeLessThanOrEqual(dialogBox.x + dialogBox.width + 1);

		// Rename, and a name another area has is refused.
		await dialog.getByRole('button', { name: 'Rename Helth' }).click();
		const renaming = rows.nth(0).locator('[name="label"]');
		await expect(renaming).toBeFocused();
		await renaming.fill('Career');
		await rows.nth(0).getByRole('button', { name: 'Save' }).click();
		await expect(dialog).toContainText('You already have an area with that name');
		await renaming.fill('Health');
		await rows.nth(0).getByRole('button', { name: 'Save' }).click();
		await expect(dialog.locator('[data-area="Health"]')).toBeVisible();
		await expect(dialog.locator('[data-area="Helth"]')).toHaveCount(0);

		// Recolour: the browser's control, saved as it changes.
		const colour = dialog.getByLabel('Colour of Health');
		await colour.fill('#1d4ed8');
		await expect(colour).toHaveValue('#1d4ed8');

		// Reorder: the first cannot go earlier, the last cannot go later.
		await expect(dialog.getByRole('button', { name: 'Move Health earlier' })).toBeDisabled();
		await expect(dialog.getByRole('button', { name: 'Move Career later' })).toBeDisabled();
		await dialog.getByRole('button', { name: 'Move Career earlier' }).click();
		await expect(rows.nth(0)).toHaveAttribute('data-area', 'Career');
		await dialog.getByRole('button', { name: 'Move Career later' }).click();
		await expect(rows.nth(0)).toHaveAttribute('data-area', 'Health');

		// It all survives a reload, colour included.
		await page.reload();
		await pressUntil(page, page.getByRole('button', { name: 'Areas' }), dialog);
		await expect(rows.nth(0)).toHaveAttribute('data-area', 'Health');
		await expect(dialog.getByLabel('Colour of Health')).toHaveValue('#1d4ed8');
	});
}

/**
 * A goal is reached, not ticked, and it keeps what happened to it.
 *
 * Its rail was a task's tick box. Now it is a ring with a cup that opens a
 * dialog asking how it went; the goal then moves to the History tab with that
 * answer, and a note can be added there afterwards.
 */
test('a goal is reached in its own dialog and lands in History with its notes', async ({
	page
}) => {
	test.setTimeout(120_000);
	await register(page, testEmail('goal-history'));
	await visit(page, '/goals');
	{
		const field = page.locator('[name="heading"]');
		await pressUntil(page, page.getByRole('button', { name: /New goal/ }).first(), field);
		await field.fill('run a half marathon');
	}
	await page.getByRole('button', { name: 'Create goal' }).click();
	await expect(page.getByText('run a half marathon').first()).toBeVisible();

	await page.getByRole('button', { name: 'Achieve run a half marathon' }).click();
	const cheer = page.getByRole('dialog', { name: 'You did it!' });
	await expect(cheer).toBeVisible();
	await cheer.locator('[name="outcome"]').fill('2h05, legs gone at km 18');
	await page.getByRole('button', { name: 'Mark achieved' }).click();
	await expect(cheer).toBeHidden();

	await page
		.getByRole('link', { name: /History/ })
		.first()
		.click();
	await page.waitForURL('**/goals/history');
	const card = page.locator('.goal-row', { hasText: 'run a half marathon' });
	await expect(card).toBeVisible();
	await expect(card.getByText('2h05, legs gone at km 18')).toBeVisible();
	await expect(card.getByText('Achieved').first()).toBeVisible();

	await card.locator('textarea[name="note"]').fill('next: under two hours');
	await card.getByRole('button', { name: 'Add a note' }).click();
	await expect(card.getByText('next: under two hours')).toBeVisible();
	await page.screenshot({ path: 'test-results/shots/goal-history.png' });
});
