import { expect, test, type Page } from '@playwright/test';
import { register } from './helpers/account';
import { visit } from './helpers/visit';

/**
 * A block that comes back on something other than a weekday.
 *
 * Every assertion here is made in the day view, which draws exactly one date,
 * so "is it on Wednesday" is a question with one answer rather than a guess at
 * which column an element sits in.
 */

function monday(): Date {
	const d = new Date();
	d.setHours(0, 0, 0, 0);
	d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
	return d;
}

function dayAfter(base: Date, n: number): string {
	const d = new Date(base);
	d.setDate(d.getDate() + n);
	return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

async function onDay(page: Page, date: string, label: string): Promise<number> {
	return countIn(page, `/tasks/plan?view=day&from=${date}`, label);
}

/**
 * How many times a block is drawn in a whole window.
 *
 * The day view answers "is it on this date"; this answers "how many days of
 * the week did it get", which is the question the week view used to get wrong
 * — it drew one occurrence and left the rest of the rhythm invisible.
 */
async function countIn(page: Page, url: string, label: string): Promise<number> {
	await visit(page, url);
	await expect(page.locator('.ec-main')).toBeVisible();
	await page.waitForTimeout(400);
	return page.getByText(label, { exact: true }).count();
}

test('a block that comes back every two days lands on every second day', async ({ page }) => {
	test.setTimeout(180_000);
	await register(page, `rec-days-${Date.now()}@test.invalid`);

	const start = monday();
	const anchor = dayAfter(start, 0);
	await visit(page, `/tasks/plan?from=${anchor}`);

	await page.getByRole('button', { name: '+ New' }).click();
	const form = page.getByRole('dialog');
	await form.getByRole('button', { name: 'Comes back', exact: true }).first().click();
	await form.getByRole('button', { name: 'Every N days', exact: true }).click();
	await form.locator('[name="recurrenceInterval"]').fill('2');
	await form.locator('[name="startTime"]').fill('09:00');
	await form.locator('[name="label"]').fill('every-other-day');
	await form.locator('[name="mode"]').selectOption('category');
	await form.getByRole('button', { name: /Add repeating block|Save block/ }).click();
	await expect(form).toBeHidden({ timeout: 20_000 });

	// Four times in the seven days on screen. The week view used to ask the
	// rule about the window's first date only and draw that one answer, so an
	// every-other-day block appeared exactly once, looking weekly.
	expect(await countIn(page, `/tasks/plan?from=${anchor}`, 'every-other-day')).toBe(4);

	// The anchor day, and every second day after it — not the ones between.
	expect(await onDay(page, dayAfter(start, 0), 'every-other-day')).toBeGreaterThan(0);
	expect(await onDay(page, dayAfter(start, 1), 'every-other-day')).toBe(0);
	expect(await onDay(page, dayAfter(start, 2), 'every-other-day')).toBeGreaterThan(0);
	expect(await onDay(page, dayAfter(start, 4), 'every-other-day')).toBeGreaterThan(0);
	expect(await onDay(page, dayAfter(start, 5), 'every-other-day')).toBe(0);
});

test('a fortnightly block skips the week between', async ({ page }) => {
	test.setTimeout(180_000);
	await register(page, `rec-weeks-${Date.now()}@test.invalid`);

	const start = monday();
	// Built on the Thursday on purpose: a week view that only ever asked about
	// its own first day drew nothing at all for this one.
	await visit(page, `/tasks/plan?view=day&from=${dayAfter(start, 3)}`);

	await page.getByRole('button', { name: '+ New' }).click();
	const form = page.getByRole('dialog');
	await form.getByRole('button', { name: 'Comes back', exact: true }).first().click();
	await form.getByRole('button', { name: 'Every N weeks', exact: true }).click();
	await form.locator('[name="recurrenceInterval"]').fill('2');
	await form.locator('[name="startTime"]').fill('10:00');
	await form.locator('[name="label"]').fill('the-bins');
	await form.locator('[name="mode"]').selectOption('category');
	await form.getByRole('button', { name: /Add repeating block|Save block/ }).click();
	await expect(form).toBeHidden({ timeout: 20_000 });

	expect(await onDay(page, dayAfter(start, 3), 'the-bins')).toBeGreaterThan(0);
	expect(await onDay(page, dayAfter(start, 10), 'the-bins')).toBe(0);
	expect(await onDay(page, dayAfter(start, 17), 'the-bins')).toBeGreaterThan(0);

	// This week's grid shows it once; a fortnight's grid, once; the week
	// between, not at all.
	expect(await countIn(page, `/tasks/plan?from=${dayAfter(start, 0)}`, 'the-bins')).toBe(1);
	expect(await countIn(page, `/tasks/plan?from=${dayAfter(start, 7)}`, 'the-bins')).toBe(0);
	expect(await countIn(page, `/tasks/plan?from=${dayAfter(start, 14)}`, 'the-bins')).toBe(1);
});

test('a monthly block lands on its date and nowhere else', async ({ page }) => {
	test.setTimeout(180_000);
	await register(page, `rec-month-${Date.now()}@test.invalid`);

	const start = monday();
	await visit(page, `/tasks/plan?from=${dayAfter(start, 0)}`);
	// This week's Thursday: inside the week on screen, and never its first day,
	// which is what the week view used to be the only thing it looked at.
	const target = dayAfter(start, 3);
	const monthDay = String(Number(target.slice(8, 10)));

	await page.getByRole('button', { name: '+ New' }).click();
	const form = page.getByRole('dialog');
	await form.getByRole('button', { name: 'Comes back', exact: true }).first().click();
	await form.getByRole('button', { name: 'Monthly', exact: true }).click();
	await form.locator('[name="recurrenceMonthDay"]').fill(monthDay);
	await form.locator('[name="startTime"]').fill('11:00');
	await form.locator('[name="label"]').fill('the-rent');
	await form.locator('[name="mode"]').selectOption('category');
	await form.getByRole('button', { name: /Add repeating block|Save block/ }).click();
	await expect(form).toBeHidden({ timeout: 20_000 });

	expect(await onDay(page, target, 'the-rent')).toBeGreaterThan(0);
	expect(await onDay(page, dayAfter(start, 4), 'the-rent')).toBe(0);

	// The week that contains its date draws it once, wherever in the week that
	// date falls — and the month, exactly once.
	expect(await countIn(page, `/tasks/plan?from=${dayAfter(start, 0)}`, 'the-rent')).toBe(1);
	expect(await countIn(page, `/tasks/plan?view=month&from=${target}`, 'the-rent')).toBe(1);
});

test('skipping one occurrence leaves the block’s other days alone', async ({ page }) => {
	test.setTimeout(180_000);
	await register(page, `rec-skip-${Date.now()}@test.invalid`);

	const start = monday();
	const anchor = dayAfter(start, 0);
	await visit(page, `/tasks/plan?from=${anchor}`);

	await page.getByRole('button', { name: '+ New' }).click();
	const form = page.getByRole('dialog');
	await form.getByRole('button', { name: 'Comes back', exact: true }).first().click();
	await form.getByRole('button', { name: 'Every N days', exact: true }).click();
	await form.locator('[name="recurrenceInterval"]').fill('2');
	await form.locator('[name="startTime"]').fill('09:00');
	await form.locator('[name="label"]').fill('the-stretches');
	await form.locator('[name="mode"]').selectOption('category');
	await form.getByRole('button', { name: /Add repeating block|Save block/ }).click();
	await expect(form).toBeHidden({ timeout: 20_000 });

	// Skip it on the Wednesday, two days after the anchor.
	const wednesday = dayAfter(start, 2);
	await visit(page, `/tasks/plan?view=day&from=${wednesday}`);
	await page.getByText('the-stretches', { exact: true }).first().click();
	const editing = page.getByRole('dialog');
	await editing.getByRole('button', { name: /^Skip on / }).click();
	await expect(editing.getByRole('button', { name: /^Restore on / })).toBeVisible({
		timeout: 20_000
	});
	await page.keyboard.press('Escape');

	// That day only. A skip used to name the block rather than the day, so it
	// either did nothing or faded every occurrence in the week.
	const faded = async (date: string) => {
		await visit(page, `/tasks/plan?view=day&from=${date}`);
		await expect(page.locator('.ec-main')).toBeVisible();
		await page.waitForTimeout(400);
		return page.locator('.og-event--inactive:has-text("the-stretches")').count();
	};
	expect(await faded(wednesday)).toBe(1);
	expect(await faded(anchor)).toBe(0);
	expect(await faded(dayAfter(start, 4))).toBe(0);

	// And in the week grid, exactly one of the four is faded.
	await visit(page, `/tasks/plan?from=${anchor}`);
	await expect(page.locator('.ec-main')).toBeVisible();
	await page.waitForTimeout(500);
	expect(await page.getByText('the-stretches', { exact: true }).count()).toBe(4);
	expect(await page.locator('.og-event--inactive:has-text("the-stretches")').count()).toBe(1);
});

test('editing a block does not quietly shift the rhythm it already had', async ({ page }) => {
	test.setTimeout(180_000);
	await register(page, `rec-edit-${Date.now()}@test.invalid`);

	const start = monday();
	const anchor = dayAfter(start, 0);
	await visit(page, `/tasks/plan?from=${anchor}`);

	await page.getByRole('button', { name: '+ New' }).click();
	const form = page.getByRole('dialog');
	await form.getByRole('button', { name: 'Comes back', exact: true }).first().click();
	await form.getByRole('button', { name: 'Every N days', exact: true }).click();
	await form.locator('[name="recurrenceInterval"]').fill('2');
	await form.locator('[name="startTime"]').fill('09:00');
	await form.locator('[name="label"]').fill('the-walk');
	await form.locator('[name="mode"]').selectOption('category');
	await form.getByRole('button', { name: /Add repeating block|Save block/ }).click();
	await expect(form).toBeHidden({ timeout: 20_000 });

	// Open it from the Wednesday — a day it lands on, but not the one it counts
	// from — and change only its name. The form used to post the day it was
	// opened on as the anchor, moving every future occurrence by a day.
	const wednesday = dayAfter(start, 2);
	await visit(page, `/tasks/plan?view=day&from=${wednesday}`);
	await page.getByText('the-walk', { exact: true }).first().click();
	const editing = page.getByRole('dialog');
	await editing.locator('[name="label"]').fill('the-longer-walk');
	await editing.getByRole('button', { name: /Save block|Add repeating block/ }).click();
	await expect(editing).toBeHidden({ timeout: 20_000 });

	// Still on the even days from the anchor, and still four in the week.
	expect(await onDay(page, dayAfter(start, 0), 'the-longer-walk')).toBeGreaterThan(0);
	expect(await onDay(page, dayAfter(start, 1), 'the-longer-walk')).toBe(0);
	expect(await onDay(page, dayAfter(start, 2), 'the-longer-walk')).toBeGreaterThan(0);
	expect(await countIn(page, `/tasks/plan?from=${anchor}`, 'the-longer-walk')).toBe(4);
});

/**
 * The ghost a drag leaves behind.
 *
 * Dragging out a square on the grid leaves the calendar holding a selection it
 * draws as an event with the time range on it and no title. It counts in the
 * column's layout, so the block just created has to share the width with it
 * and comes out as a sliver down the left edge — the time shows, the rectangle
 * does not. The calendar drops the selection on a click outside, which is why
 * it only sometimes went wrong.
 */
test('a block dragged out on the grid is drawn as a block, not a sliver', async ({ page }) => {
	test.setTimeout(180_000);
	await register(page, `drag-create-${Date.now()}@test.invalid`);

	await visit(page, '/tasks/plan');
	await expect(page.locator('.ec-main')).toBeVisible();
	await page.waitForTimeout(600);

	const body = page.locator('.ec-body').first();
	const box = (await body.boundingBox())!;
	const x = box.x + box.width * 0.45;
	await page.mouse.move(x, box.y + 120);
	await page.mouse.down();
	await page.mouse.move(x, box.y + 200, { steps: 10 });
	await page.mouse.up();

	const form = page.getByRole('dialog');
	await expect(form).toBeVisible({ timeout: 15_000 });
	// The calendar is holding the selection while the form is open, which is
	// what makes this worth testing at all.
	expect(await page.locator('.ec-preview').count()).toBe(1);

	// Abandoning the form used to leave that ghost on the grid for good: a box
	// with a time on it and nothing in it, and the next block dragged out over
	// the same hours had to share the column with it.
	await page.keyboard.press('Escape');
	await expect(form).toBeHidden({ timeout: 10_000 });
	await page.waitForTimeout(400);
	expect(await page.locator('.ec-preview').count()).toBe(0);

	// Now do it for real.
	await page.mouse.move(x, box.y + 120);
	await page.mouse.down();
	await page.mouse.move(x, box.y + 200, { steps: 10 });
	await page.mouse.up();
	await expect(form).toBeVisible({ timeout: 15_000 });

	await form.locator('[name="label"]').fill('dragged-out');
	await form.locator('[name="mode"]').selectOption('category');
	// From the keyboard, so nothing clicks outside the calendar to clear it.
	await form.locator('[name="label"]').press('Enter');
	await expect(form).toBeHidden({ timeout: 20_000 });
	await page.waitForTimeout(600);

	expect(await page.locator('.ec-preview').count()).toBe(0);

	// And the block is a block: as wide as one alone in its column.
	const width = await page
		.locator('.ec-event:has-text("dragged-out")')
		.first()
		.evaluate((el) => (el as HTMLElement).getBoundingClientRect().width);
	const column = await page
		.locator('.ec-day')
		.first()
		.evaluate((el) => (el as HTMLElement).getBoundingClientRect().width);
	expect(width).toBeGreaterThan(column * 0.5);
});
