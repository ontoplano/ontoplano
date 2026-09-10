import { expect, test } from '@playwright/test';
import { register } from './helpers/account';
import { visit } from './helpers/visit';

/**
 * Ticking something off Today's tasks, and the few seconds to have meant
 * something else.
 *
 * Everywhere else in the app that finishes a block holds the write for a few
 * seconds first; this list posted a form the moment it was pressed. It is a
 * column of checkboxes beside eight lines of small type — the easiest thing on
 * the dashboard to hit by accident — and what it changes is somebody's record
 * of what they actually did that day.
 *
 * The reload at the end is the real assertion: it proves nothing was written,
 * not merely that nothing redrew.
 */

/**
 * The first thing on the list, whatever the starter week put there.
 *
 * Named by reading it off the page rather than by making one: `register`
 * already installs a week, so the dashboard has tasks, and a test that built
 * its own would be testing the board.
 */
async function firstTask(page: import('@playwright/test').Page): Promise<string> {
	const tick = page.getByRole('button', { name: /^Mark .* done$/ }).first();
	// The dashboard fetches its day and then draws it, so on a loaded run five
	// seconds is not always enough to have a task to read the name off.
	await expect(tick).toBeVisible({ timeout: 15_000 });
	const label = (await tick.getAttribute('aria-label'))!;
	return label.replace(/^Mark /, '').replace(/ done$/, '');
}

test('ticking one off can be undone, and then it never happened', async ({ page }) => {
	await register(page, `dash-undo-${Date.now()}@test.invalid`);
	await visit(page, '/');

	const title = await firstTask(page);
	await page.getByRole('button', { name: `Mark ${title} done`, exact: true }).click();

	// Held, not written: the same button now offers the way back.
	await expect(
		page.getByRole('button', { name: `Undo marking ${title} done`, exact: true })
	).toBeVisible();

	await page.getByRole('button', { name: 'Undo' }).first().click();
	await page.reload({ waitUntil: 'load' });
	await page.waitForSelector('html[data-ready]');

	// Still tickable, so still not done.
	await expect(page.getByRole('button', { name: `Mark ${title} done`, exact: true })).toBeVisible();
});

test('pressing it twice is the same as pressing Undo', async ({ page }) => {
	await register(page, `dash-twice-${Date.now()}@test.invalid`);
	await visit(page, '/');

	const card = page
		.locator('section')
		.filter({ has: page.getByRole('heading', { name: "Today's Tasks" }) });

	const title = await firstTask(page);
	await page.getByRole('button', { name: `Mark ${title} done`, exact: true }).click();

	/*
	 * Wait for the reload before reaching for Undo, because that is where this
	 * went wrong. The tick writes immediately and the page fetches its data
	 * again behind it; the card's list is what is still to do, so the answer
	 * coming back used to take the row — and the Undo on it — off the screen a
	 * couple of hundred milliseconds after it appeared. Fast enough to pass most
	 * of the time and to fail on a loaded machine, which is how CI found it.
	 *
	 * "1 done" is the server's own count, so it is proof the answer landed.
	 */
	await expect(card.getByText('1 done', { exact: true })).toBeVisible();

	// Still there, and still first: the row holds its place for the window.
	await expect(
		card.getByRole('button', { name: /^(Mark|Undo marking) .* done$/ }).first()
	).toHaveAttribute('aria-label', `Undo marking ${title} done`);

	await page.getByRole('button', { name: `Undo marking ${title} done`, exact: true }).click();

	await page.reload({ waitUntil: 'load' });
	await page.waitForSelector('html[data-ready]');
	await expect(page.getByRole('button', { name: `Mark ${title} done`, exact: true })).toBeVisible();
});

test('ticking one off moves nothing on the card', async ({ page }) => {
	await register(page, `dash-still-${Date.now()}@test.invalid`);
	await visit(page, '/');

	const card = page
		.locator('section')
		.filter({ has: page.getByRole('heading', { name: "Today's Tasks" }) });

	const title = await firstTask(page);
	const rows = card.locator('li');
	const below = await rows.nth(1).boundingBox();
	const box = await card.boundingBox();

	await page.getByRole('button', { name: `Mark ${title} done`, exact: true }).click();
	await expect(card.getByText('1 done', { exact: true })).toBeVisible();

	// To the pixel: the row under the one that was pressed has not moved, and
	// the card has not grown under it either — "1 done" appearing at the foot
	// of it is a line the card was already paying for.
	expect(await rows.nth(1).boundingBox()).toMatchObject({ y: below!.y });
	expect(await card.boundingBox()).toMatchObject({ y: box!.y, height: box!.height });
});

test('letting the window run out really does finish it', async ({ page }) => {
	await register(page, `dash-done-${Date.now()}@test.invalid`);
	await visit(page, '/');

	const title = await firstTask(page);
	await page.getByRole('button', { name: `Mark ${title} done`, exact: true }).click();
	await expect(page.getByText(`Completed ${title}`)).toBeVisible();

	// Five seconds by default; wait it out rather than racing it.
	await expect(page.getByText(`Completed ${title}`)).toHaveCount(0, { timeout: 15_000 });
	await page.reload({ waitUntil: 'load' });
	await page.waitForSelector('html[data-ready]');

	// Off the list, because the list is what is still to do.
	await expect(page.getByRole('button', { name: `Mark ${title} done`, exact: true })).toHaveCount(
		0
	);
});
