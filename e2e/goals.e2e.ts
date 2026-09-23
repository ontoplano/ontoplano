import { expect, test } from '@playwright/test';
import { register, testEmail } from './helpers/account';
import { visit } from './helpers/visit';
import { pressUntil } from './helpers/press-until';

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
		.locator('div.flex.items-stretch', { hasText: 'third chore' })
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
