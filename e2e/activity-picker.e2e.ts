import { expect, test } from '@playwright/test';
import { register, testEmail } from './helpers/account';
import { visit } from './helpers/visit';

/**
 * The activity picker, typed at rather than scrolled through.
 *
 * A `<select>` with forty activities in it is a list you hunt through, and the
 * way anybody finds "learn guitar" is by typing two letters of it. The two
 * things that had to be true: it shows everything the moment it opens — no
 * typing required to see anything — and typing narrows it loosely, so `lr`
 * finds a name whose letters are three words apart.
 */

/** The activity field: the `Picker` with a search box at the top of its list. */
const field = (page: import('@playwright/test').Page) => page.locator('[data-picker="activityId"]');
const face = (page: import('@playwright/test').Page) => field(page).getByRole('button').first();
const search = (page: import('@playwright/test').Page) =>
	field(page).getByRole('searchbox', { name: 'Activity' });
const optionsIn = (page: import('@playwright/test').Page) =>
	field(page).locator('[role="listbox"] [role="option"]');

/** The initials of a multi-word name: the query no substring match would find. */
const initials = (name: string) =>
	name
		.split(/\s+/)
		.map((word) => word[0])
		.join('');

test('the picker shows everything first, then narrows as you type', async ({ page }) => {
	test.setTimeout(150_000);
	await register(page, testEmail('picker'));
	await visit(page, '/tasks/calendar?view=week');
	await page.getByRole('button', { name: 'New task block' }).click();

	// Nothing typed, and the whole list is already there. This is the half a
	// `<datalist>` gets wrong.
	await face(page).click();
	const options = optionsIn(page);
	await expect(options.first()).toBeVisible();
	const all = await options.allInnerTexts();
	expect(all.length).toBeGreaterThan(2);

	// Something whose letters are words apart, so a substring match cannot
	// stand in for a fuzzy one.
	const spread = all.map((t) => t.trim()).find((t) => /\s/.test(t) && t.length > 4);
	expect(spread, `no multi-word activity among ${all.join(', ')}`).toBeTruthy();

	// The search box has the typing already, on a pointer that aims.
	await expect(search(page)).toBeFocused();
	await page.keyboard.type(initials(spread!));
	await expect(options.filter({ hasText: spread! })).toHaveCount(1);

	// Enter takes the one under the cursor, and the form posts an id.
	await page.keyboard.press('Enter');
	await expect(face(page)).toHaveText(spread!);
	await expect(page.locator('input[type=hidden][name=activityId]')).not.toHaveValue('');
	await expect(options).toHaveCount(0);
});

test('a press on the field shuts it as well as opens it', async ({ page }) => {
	test.setTimeout(150_000);
	await register(page, testEmail('picker-toggle'));
	await visit(page, '/tasks/calendar?view=week');
	await page.getByRole('button', { name: 'New task block' }).click();

	await face(page).click();
	await expect(optionsIn(page).first()).toBeVisible();
	await face(page).click();
	await expect(optionsIn(page)).toHaveCount(0);
	await expect(page.getByRole('button', { name: /Add repeating task block/ })).toBeVisible();
});

test('it works from the keyboard alone, and Escape lets go', async ({ page }) => {
	test.setTimeout(150_000);
	await register(page, testEmail('picker-keys'));
	await visit(page, '/tasks/calendar?view=week');
	await page.getByRole('button', { name: 'New task block' }).click();

	await face(page).focus();
	await page.keyboard.press('ArrowDown');
	await expect(optionsIn(page).first()).toBeVisible();

	// Down moves the cursor; Enter takes it.
	await page.keyboard.press('ArrowDown');
	await page.keyboard.press('Enter');
	const taken = (await face(page).innerText()).trim();
	expect(taken).not.toBe('');

	// Reopened and abandoned: the list closes and what was chosen is still there.
	await face(page).click();
	await expect(optionsIn(page).first()).toBeVisible();
	await page.keyboard.press('Escape');
	await expect(optionsIn(page)).toHaveCount(0);
	await expect(face(page)).toHaveText(taken);

	// And Escape on the picker did not also close the form under it.
	await expect(page.getByRole('button', { name: /Add repeating task block/ })).toBeVisible();
});

test('a query that matches nothing says so rather than showing an empty box', async ({ page }) => {
	test.setTimeout(150_000);
	await register(page, testEmail('picker-empty'));
	await visit(page, '/tasks/calendar?view=week');
	await page.getByRole('button', { name: 'New task block' }).click();

	await face(page).click();
	await search(page).fill('zzzzzz');
	await expect(optionsIn(page)).toHaveCount(0);
	await expect(page.getByText('Nothing matches')).toBeVisible();
});
