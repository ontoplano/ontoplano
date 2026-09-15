import { expect, test } from '@playwright/test';
import { register, testEmail } from './helpers/account';
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
	await register(page, testEmail('dash-undo'));
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

	// Still tickable, so still not done. The same patience `firstTask` needs:
	// the dashboard fetches its day and then draws it, and under a full
	// parallel run five seconds after a reload is not always enough.
	await expect(page.getByRole('button', { name: `Mark ${title} done`, exact: true })).toBeVisible({
		timeout: 15_000
	});
});

test('pressing it twice is the same as pressing Undo', async ({ page }) => {
	await register(page, testEmail('dash-twice'));
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
	await register(page, testEmail('dash-still'));
	await visit(page, '/');

	const card = page
		.locator('section')
		.filter({ has: page.getByRole('heading', { name: "Today's Tasks" }) });

	const title = await firstTask(page);
	const rows = card.locator('li');
	// The last row rather than the second: how many tasks the starter week
	// puts on today depends on which weekday today is, and the furthest one
	// down the card is the one anything growing above it would move.
	const below = await rows.last().boundingBox();
	const box = await card.boundingBox();

	await page.getByRole('button', { name: `Mark ${title} done`, exact: true }).click();
	await expect(card.getByText('1 done', { exact: true })).toBeVisible();

	// To the pixel: nothing under the press has moved, and the card has not
	// grown under it either — the count going from none to one is a line the
	// card was already paying for.
	expect(await rows.last().boundingBox()).toMatchObject({ y: below!.y });
	expect(await card.boundingBox()).toMatchObject({ y: box!.y, height: box!.height });
});

/*
 * The card at the top used to empty itself when the day ran out of blocks,
 * and everything under it jumped up its whole height — including the list the
 * person had just pressed something in, several seconds after they pressed
 * it. Answering from it must move nothing, whether or not it was the last
 * block of the day, which is why this waits the write out rather than
 * measuring while it is still held.
 */
test('answering the block at the top moves nothing under it', async ({ page }) => {
	await register(page, testEmail('dash-now'));
	await visit(page, '/');

	const card = page
		.locator('section')
		.filter({ has: page.getByRole('heading', { name: "Today's Tasks" }) });
	await expect(card).toBeVisible();
	const before = await card.boundingBox();

	/*
	 * Whether there is a block to answer depends on the day.
	 *
	 * The starter week puts different things on different weekdays, so some
	 * days open with something happening and some do not — and the claim here
	 * holds either way: the card at the top keeps its height, so nothing under
	 * it moves. Answering it is the harder half and is tested when the day
	 * offers one; the other half is that an empty card is still a card, which
	 * is the state that used to collapse and throw the page upwards.
	 */
	const done = page.getByRole('button', { name: 'Done', exact: true });
	const answerable = (await done.count()) > 0 && (await done.isEnabled());
	if (answerable) {
		await done.click();
		// Past the undo window, so the server has answered and the page has been
		// redrawn from it.
		await expect(page.getByText(/^Completed /)).toHaveCount(0, { timeout: 15_000 });

		// Still there with the day answered in it, rather than gone.
		await expect(page.locator('.now-card')).toBeVisible();

		/*
		 * And only then is the day empty — some weekdays hold two.
		 *
		 * This asserted "Nothing else today" outright, which is the state of a
		 * day whose single block has just been answered. The starter week puts
		 * two on some weekdays, so on those the card correctly shows the next
		 * one and the assertion failed on the calendar rather than on anything
		 * the app did. What holds either way is the line above: the card is
		 * still there. The empty copy is checked when the day is actually
		 * empty.
		 */
		if ((await done.count()) === 0)
			await expect(page.getByText('Nothing else today')).toBeVisible();
	}

	// Whatever the day held, the card under the top of the page has not moved.
	await expect(card).toBeVisible();
	expect(await card.boundingBox()).toMatchObject({ y: before!.y });
});

test('letting the window run out really does finish it', async ({ page }) => {
	await register(page, testEmail('dash-done'));
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
