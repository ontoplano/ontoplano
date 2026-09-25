import { expect, test } from '@playwright/test';
import { register, testEmail } from './helpers/account';
import { visit } from './helpers/visit';

/**
 * Two things about the week grid.
 *
 * Where the week begins: the arrows beside the date step a whole week, so
 * they always land on the same weekday and can never answer *which day does
 * my week start on*. Two small buttons slide the first day one at a time.
 *
 * And the hover card, which used to outlive the block it was about. Opening a
 * block puts a dialog over the grid, so `eventMouseLeave` never fires; delete
 * the block from there and the card was still standing in the column at the
 * hour the block used to be, with nothing underneath it.
 */

/** The date range the toolbar is naming, e.g. "Sep 19 — Sep 25". */
async function span(page: import('@playwright/test').Page): Promise<string> {
	const text = await page.locator('[data-tour="plan-toolbar"]').innerText();
	return /([A-Z][a-z]{2} \d+ — [A-Z][a-z]{2} \d+)/.exec(text.replace(/\n/g, ' '))?.[1] ?? text;
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
	await visit(page, '/tasks/plan?view=week');

	const started = await span(page);
	expect(started).toMatch(/— /);

	await page.getByRole('button', { name: 'Start the week a day earlier' }).click();
	await expect.poll(() => span(page)).not.toBe(started);
	const back = await span(page);

	// Both ends moved by one: this is the window sliding, not growing.
	const [startedFirst, startedLast] = dates(started);
	const [backFirst, backLast] = dates(back);
	expect(dayDifference(startedFirst, backFirst)).toBe(-1);
	expect(dayDifference(startedLast, backLast)).toBe(-1);

	await page.getByRole('button', { name: 'Start the week a day later' }).click();
	await expect.poll(() => span(page)).toBe(started);
});

test('the buttons are not offered where there is no week to start', async ({ page }) => {
	test.setTimeout(150_000);
	await register(page, testEmail('plan-week-start-views'));
	await visit(page, '/tasks/plan?view=week');
	await expect(page.getByRole('button', { name: 'Start the week a day earlier' })).toBeVisible();

	// A single day is the arrow beside it, and a month has no first day to slide.
	await visit(page, '/tasks/plan?view=day');
	await expect(page.getByRole('button', { name: 'Start the week a day earlier' })).toHaveCount(0);
	await visit(page, '/tasks/plan?view=month');
	await expect(page.getByRole('button', { name: 'Start the week a day earlier' })).toHaveCount(0);
});

test('a deleted block does not leave its hover card standing in the grid', async ({ page }) => {
	test.setTimeout(150_000);
	await register(page, testEmail('plan-hover-card'));
	await visit(page, '/tasks/plan?view=week');

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
