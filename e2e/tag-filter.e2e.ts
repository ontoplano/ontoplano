import { expect, test, type Page } from '@playwright/test';
import { register, testEmail } from './helpers/account';
import { openFilters } from './helpers/filters';
import { visit } from './helpers/visit';

/**
 * Narrowing by labels: some to show, some to hide, any or all.
 *
 * One was not a filter — "the urgent ones about the house" is two labels that
 * must both be there, and "everything not yet marked done" is a label that
 * must not. The control folds into one button that says what it is doing, and
 * the filter lives in the address so a reload keeps it.
 */

const TASKS = [
	['ring the plumber', 'home'],
	['fix the roof', 'home urgent'],
	['read the Republic', 'reading'],
	['sort the shed', '']
] as const;

async function newTask(page: Page, title: string, tags: string) {
	await page
		.getByRole('button', { name: /New task/ })
		.first()
		.click();
	const form = page.getByRole('dialog');
	await form.locator('[name="heading"]').first().fill(title);
	if (tags) {
		await form.locator('input[role="combobox"]').first().fill(tags);
		await form.locator('input[role="combobox"]').first().press('Space');
	}
	await page.getByRole('button', { name: 'Create task' }).click();
	await expect(page.getByText(title).first()).toBeVisible({ timeout: 30_000 });
}

/** Which of the four tasks the list is showing, in their order. */
async function showing(page: Page): Promise<string[]> {
	const out: string[] = [];
	for (const [title] of TASKS) if (await page.getByText(title).first().isVisible()) out.push(title);
	return out;
}

const face = (page: Page) => page.locator('[aria-controls="todo-tags-panel"]');
const panel = (page: Page) => page.locator('#todo-tags-panel');
const box = (page: Page, side: 'include' | 'exclude') =>
	panel(page).locator(`[data-side="${side}"] input[role="combobox"]`);

test('labels to show, labels to hide, any or all — and the address keeps it', async ({ page }) => {
	test.setTimeout(240_000);
	await page.setViewportSize({ width: 1280, height: 900 });
	await register(page, testEmail('tag-filter'));
	await visit(page, '/tasks/todo');
	for (const [title, tags] of TASKS) await newTask(page, title, tags);

	await openFilters(page);
	await expect(face(page)).toHaveAccessibleName('Filter by tag');

	// Where the list starts, and where the button beside the filter is: opening
	// the panel and choosing labels must move neither.
	const tour = await page
		.locator('[data-tour]')
		.filter({ has: page.getByText('ring the plumber') })
		.last()
		.getAttribute('data-tour');
	const list = page.locator(`[data-tour="${tour}"]`);
	const listTop = (await list.first().boundingBox())!.y;
	const faceBox = (await face(page).boundingBox())!;

	await face(page).click();
	await expect(panel(page)).toBeVisible();
	await expect(box(page, 'include')).toBeFocused();

	// Typing narrows the vocabulary; Enter takes the one under the cursor.
	await box(page, 'include').fill('hom');
	await box(page, 'include').press('Enter');
	await expect.poll(() => showing(page)).toEqual(['ring the plumber', 'fix the roof']);

	await box(page, 'include').fill('urgent');
	await box(page, 'include').press('Enter');
	// Any of them, by default.
	await expect.poll(() => showing(page)).toEqual(['ring the plumber', 'fix the roof']);

	await panel(page).getByRole('tab', { name: 'Carrying all of them' }).click();
	await expect.poll(() => showing(page)).toEqual(['fix the roof']);

	expect((await list.first().boundingBox())!.y).toBe(listTop);
	expect(await face(page).boundingBox()).toEqual(faceBox);

	// Escape folds it, back onto the button — which says what is on.
	await page.keyboard.press('Escape');
	await expect(panel(page)).toBeHidden();
	await expect(face(page)).toBeFocused();
	await expect(face(page)).toContainText('+2');
	await expect(face(page)).toHaveAccessibleName(/with all of #home, #urgent/);

	// The address holds it, so a reload comes back the same.
	expect(page.url()).toContain('tag=home&tag=urgent&tagmode=all');
	await page.reload();
	await expect.poll(() => showing(page)).toEqual(['fix the roof']);

	// Hiding: anything carrying #home goes, and so does anything untagged.
	await openFilters(page);
	await face(page).click();
	await panel(page).getByRole('button', { name: 'Clear' }).click();
	await expect.poll(() => showing(page)).toHaveLength(4);
	await box(page, 'exclude').fill('home');
	await box(page, 'exclude').press('Enter');
	await expect.poll(() => showing(page)).toEqual(['read the Republic', 'sort the shed']);
	await box(page, 'exclude').fill('untag');
	await box(page, 'exclude').press('Enter');
	await expect.poll(() => showing(page)).toEqual(['read the Republic']);

	// Backspace in an empty box takes the last chip off, the way any box of
	// chips does; a label hidden here is not offered to show as well.
	await box(page, 'exclude').press('Backspace');
	await expect.poll(() => showing(page)).toEqual(['read the Republic', 'sort the shed']);
	await box(page, 'include').fill('home');
	await expect(panel(page).getByRole('option', { name: 'home', exact: true })).toHaveCount(0);

	// Untagged, shown on its own.
	// Escape takes the word, then the list, off the box — not the panel.
	await box(page, 'include').press('Escape');
	await box(page, 'include').press('Escape');
	await expect(panel(page).getByRole('listbox')).toHaveCount(0);
	await expect(panel(page)).toBeVisible();
	await panel(page).locator('[data-side="exclude"] button[aria-label="Remove #home"]').click();
	await box(page, 'include').fill('untag');
	await box(page, 'include').press('Enter');
	await expect.poll(() => showing(page), { timeout: 20_000 }).toEqual(['sort the shed']);
});

test('at phone width it sits in the filter sheet and stays on the screen', async ({ page }) => {
	test.setTimeout(180_000);
	await page.setViewportSize({ width: 390, height: 844 });
	await register(page, testEmail('tag-filter-phone'));
	await visit(page, '/tasks/todo');
	for (const [title, tags] of TASKS.slice(0, 3)) await newTask(page, title, tags);

	// Arriving on a link that already carries a filter.
	await visit(page, '/tasks/todo?nottag=home');
	await expect.poll(() => showing(page)).toEqual(['read the Republic']);

	// The phone's filter button says something is on.
	await expect(page.locator('.filter-toggle')).toHaveAccessibleName(/#home/);

	await openFilters(page);
	await face(page).click();
	await expect(panel(page)).toBeVisible();
	const at = (await panel(page).boundingBox())!;
	expect(at.x).toBeGreaterThanOrEqual(0);
	expect(at.x + at.width).toBeLessThanOrEqual(390);

	await panel(page).locator('button[aria-label="Remove #home"]').click();
	await expect(face(page)).toHaveAccessibleName('Filter by tag');
	await page.keyboard.press('Escape');
	await expect(panel(page)).toBeHidden();
	// Escape folded the panel and left the sheet it sits in.
	await expect(face(page)).toBeVisible();
});

test('the diary filters by the same control', async ({ page }) => {
	test.setTimeout(180_000);
	await page.setViewportSize({ width: 1280, height: 900 });
	await register(page, testEmail('tag-filter-diary'));
	await visit(page, '/notebooks/diary');

	for (const [content, tags] of [
		['Coffee, and the week ahead.', 'planning'],
		['Ran along the river.', 'running outside'],
		['Rain all day.', 'outside']
	] as const) {
		await page.locator('[data-tour="diary-new"]').click();
		const form = page.locator('#entry-form');
		await form.locator('textarea[name=content]').fill(content);
		await form.locator('input[role="combobox"]').fill(tags);
		const post = page.getByRole('button', { name: 'Post entry', exact: true });
		await post.click();
		await expect(post).toBeHidden();
	}

	const diaryFace = page.locator('[aria-controls="diary-tags-panel"]');
	const diaryPanel = page.locator('#diary-tags-panel');
	await diaryFace.click();
	const hide = diaryPanel.locator('[data-side="exclude"] input[role="combobox"]');
	await hide.fill('runn');
	await hide.press('Enter');
	await page.keyboard.press('Escape');
	await expect(page.getByText('Ran along the river.')).toBeHidden();
	await expect(page.getByText('Rain all day.')).toBeVisible();
	expect(page.url()).toContain('nottag=running');

	// A label on an entry is still a press away from being the filter.
	await page.getByRole('button', { name: '#outside', exact: true }).first().click();
	await expect(page.getByText('Coffee, and the week ahead.')).toBeHidden();
	await expect(page.getByText('Rain all day.')).toBeVisible();
	await expect(diaryFace).toContainText('+1');

	// Narrowed to nothing, the control that did it is still there to undo it.
	await diaryFace.click();
	const show = diaryPanel.locator('[data-side="include"] input[role="combobox"]');
	await show.fill('planning');
	await show.press('Enter');
	await diaryPanel.getByRole('tab', { name: 'Carrying all of them' }).click();
	await page.keyboard.press('Escape');
	await expect(page.getByText('Nothing matches these tags.')).toBeVisible();
	await expect(diaryFace).toBeVisible();
});

test('the suggestions under a box are not cut off at the panel edge', async ({ page }) => {
	test.setTimeout(180_000);
	await page.setViewportSize({ width: 1280, height: 900 });
	await register(page, testEmail('tag-filter-list'));
	await visit(page, '/tasks/todo');
	// Enough labels that the list is longer than the panel is tall.
	await newTask(page, 'label the vocabulary', 'home urgent reading garden money music');

	await openFilters(page);
	await face(page).click();
	await box(page, 'include').click();

	const list = panel(page).locator('[data-side="include"] ul[role="listbox"]');
	await expect(list).toBeVisible();

	// A popover is a scroll container by the browser's own rules, and the list
	// is positioned rather than laid out in flow: clipped, it stopped at the
	// panel's bottom edge and the rest of the labels went behind it. So the
	// list has to reach past that edge...
	const holder = (await panel(page).boundingBox())!;
	const under = (await list.boundingBox())!;
	expect(under.y + under.height).toBeGreaterThan(holder.y + holder.height);

	// ...and the part of it that is past the edge has to be the thing under
	// the pointer there, rather than whatever the panel was covering.
	const reaches = await list.evaluate((el, edge) => {
		const box = el.getBoundingClientRect();
		const below = (box.bottom + edge) / 2;
		return el.contains(document.elementFromPoint(box.left + box.width / 2, below));
	}, holder.y + holder.height);
	expect(reaches).toBe(true);

	// And the label at the far end of it is still a press away.
	await list.getByRole('option', { name: 'urgent', exact: true }).click();
	await expect(face(page)).toContainText('+1');
});

test('a comma or a space takes the word, and the symbol sits where it is typed', async ({
	page
}) => {
	test.setTimeout(180_000);
	await page.setViewportSize({ width: 1280, height: 900 });
	await register(page, testEmail('tag-filter-typing'));
	await visit(page, '/tasks/todo');
	for (const [title, tags] of TASKS) await newTask(page, title, tags);

	await openFilters(page);
	await face(page).click();

	/*
	 * A comma and a space separate two labels everywhere else in the app — the
	 * box on a note takes both — so this one taking only Enter made it the odd
	 * control out, and typing `home, urgent` into it made one label called
	 * "home,".
	 */
	await box(page, 'include').click();
	await page.keyboard.type('home,');
	await page.keyboard.type('urgent ');

	await expect(panel(page).locator('[data-side="include"] .chip')).toHaveCount(2, {
		timeout: 20_000
	});
	await expect(face(page)).toContainText('+2');

	// And what the two of them are doing is said where they were typed, rather
	// than on the button that would change it.
	const symbol = panel(page).locator('[data-side="include"] [title]').first();
	await expect(symbol).toBeVisible();
});
