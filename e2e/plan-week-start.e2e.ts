import { expect, test } from '@playwright/test';
import { register, testEmail } from './helpers/account';
import { visit } from './helpers/visit';

/**
 * Two things about the week grid.
 *
 * Where the week begins: the arrows beside the date step a whole week, so
 * they always land on the same weekday and can never answer *which day does
 * my week start on*. A picker beside them slides the first day to a weekday.
 *
 * And the hover card, which used to outlive the block it was about. Opening a
 * block puts a dialog over the grid, so `eventMouseLeave` never fires; delete
 * the block from there and the card was still standing in the column at the
 * hour the block used to be, with nothing underneath it.
 */

/**
 * The date range the toolbar is naming, as "Sep 19 — Sep 25" whichever way it
 * is printed: "Sep 19 – 25, 2026" or "Sep 27 – Oct 3, 2026".
 */
async function span(page: import('@playwright/test').Page): Promise<string> {
	const text = (await page.locator('[data-tour="plan-toolbar"]').innerText()).replace(/\s+/g, ' ');
	const found = /([A-Z][a-z]{2}) (\d+)\s*[–—-]\s*(?:([A-Z][a-z]{2}) )?(\d+)/.exec(text);
	if (!found) return text;
	const [, month, day, endMonth, endDay] = found;
	return `${month} ${day} — ${endMonth ?? month} ${endDay}`;
}

/** Slide the week so it starts on this weekday, through the toolbar's picker. */
async function startOn(page: import('@playwright/test').Page, weekday: string) {
	await page.getByRole('button', { name: 'Week starts on' }).click();
	await page.getByRole('option', { name: weekday }).click();
}

/**
 * The weekday a "Sep 19 — Sep 25" span starts on, as the picker names it.
 *
 * In the year it is really in — the span is the week around today, so that is
 * this year or the one either side — since `dates` reads every span in a
 * fixed leap year, where the same date falls on another weekday.
 */
function weekdayOf(value: string, shift: number): string {
	const [month, day] = value.split(' — ')[0].split(' ');
	const now = new Date();
	const date = [now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1]
		.map((one) => new Date(`${month} ${day}, ${one}`))
		.reduce((best, one) =>
			Math.abs(one.getTime() - now.getTime()) < Math.abs(best.getTime() - now.getTime())
				? one
				: best
		);
	const names = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
	return names[(date.getDay() + shift + 7) % 7];
}

/** The two dates in a span, with a shared leap year so month ends are real. */
function dates(value: string): [number, number] {
	const months = [
		'Jan',
		'Feb',
		'Mar',
		'Apr',
		'May',
		'Jun',
		'Jul',
		'Aug',
		'Sep',
		'Oct',
		'Nov',
		'Dec'
	];
	const [start, end] = value.split(' — ');
	const date = (part: string, year: number) => {
		const [month, day] = part.split(' ');
		return new Date(Date.UTC(year, months.indexOf(month), Number(day))).getTime();
	};
	const from = date(start, 2024);
	let to = date(end, 2024);
	if (to < from) to = date(end, 2025);
	return [from, to];
}

/** The signed day difference, wrapping at New Year. */
function dayDifference(from: number, to: number): number {
	const difference = Math.round((to - from) / 86_400_000);
	return difference > 182 ? difference - 366 : difference < -182 ? difference + 366 : difference;
}

test('the week can be started a day earlier or a day later', async ({ page }) => {
	test.setTimeout(150_000);
	await register(page, testEmail('plan-week-start'));
	await visit(page, '/tasks/calendar?view=week');

	const started = await span(page);
	expect(started).toMatch(/— /);

	await startOn(page, weekdayOf(started, -1));
	await expect.poll(() => span(page)).not.toBe(started);
	const back = await span(page);

	// Both ends moved by one: this is the window sliding, not growing.
	const [startedFirst, startedLast] = dates(started);
	const [backFirst, backLast] = dates(back);
	expect(dayDifference(startedFirst, backFirst)).toBe(-1);
	expect(dayDifference(startedLast, backLast)).toBe(-1);

	await startOn(page, weekdayOf(started, 0));
	await expect.poll(() => span(page)).toBe(started);
});

test('the picker is not offered where there is no week to start', async ({ page }) => {
	test.setTimeout(150_000);
	await register(page, testEmail('plan-week-start-views'));
	await visit(page, '/tasks/calendar?view=week');
	await expect(page.getByRole('button', { name: 'Week starts on' })).toBeVisible();

	// A single day is the arrow beside it, and a month has no first day to slide.
	// The control keeps its place, invisible, so changing view moves nothing.
	await visit(page, '/tasks/calendar?view=day');
	await expect(page.getByRole('button', { name: 'Week starts on' })).toBeHidden();
	await visit(page, '/tasks/calendar?view=month');
	await expect(page.getByRole('button', { name: 'Week starts on' })).toBeHidden();
});

test('a deleted block does not leave its hover card standing in the grid', async ({ page }) => {
	test.setTimeout(150_000);
	await register(page, testEmail('plan-hover-card'));
	await visit(page, '/tasks/calendar?view=week');

	const block = page.locator('.ec-event').first();
	await expect(block).toBeVisible();

	// Raise the card, the way a pointer crossing the grid does.
	await block.hover();
	await expect(page.locator('[data-block-hover]')).toBeVisible();

	// Opening the editor takes it away: the dialog says everything the card
	// does and more, and no `mouseleave` is ever coming once it is covered.
	await block.click();
	await expect(page.locator('[data-block-hover]')).toHaveCount(0);

	await page.getByRole('button', { name: 'Delete', exact: true }).click();
	await page
		.getByRole('button', { name: /Yes, delete|Delete it|Delete every week/ })
		.first()
		.click();

	// And it is still gone once the dialog has closed over an empty column.
	await expect(page.locator('[data-block-hover]')).toHaveCount(0);
});
