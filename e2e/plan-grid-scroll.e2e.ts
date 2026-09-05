import { expect, test } from '@playwright/test';
import { register } from './helpers/account';
import { visit } from './helpers/visit';

/**
 * The whole day is reachable, whatever hours it is set to.
 *
 * event-calendar renders its scroll container as `<section class="ec-main">`
 * and gives it `overflow: auto`. This app rounds the corners of every card by
 * clipping `section, aside, article` — one selector, more specific than a
 * class — so the calendar's scroller silently became `overflow: clip`.
 *
 * What that looked like: a day set to end at midnight drew as far as five in
 * the afternoon and stopped, with no scrollbar and no way to reach the rest.
 * Worse on a short viewport and worse again at high zoom, because what you got
 * was however many hours happened to fit — which is why nothing caught it: on a
 * tall screen with the default hours it looks perfectly fine.
 *
 * So this asks the only question that matters: can the last hour of the day be
 * scrolled to.
 */
test('a day ending at midnight can be scrolled to midnight', async ({ page }) => {
	await register(page, `grid-scroll-${Date.now()}@test.invalid`);

	// The hours somebody actually sets when they work late.
	await visit(page, '/settings/preferences');
	await page.locator('select[name="start"]').selectOption('6');
	await page.locator('select[name="end"]').selectOption('24');
	await page
		.locator('form[action="?/saveGridHours"]')
		.getByRole('button', { name: 'Save' })
		.click();

	await visit(page, '/tasks/plan');
	const main = page.locator('.ec-main');
	await expect(main).toBeVisible();

	const geometry = async () =>
		main.evaluate((el) => ({
			scroll: el.scrollHeight,
			visible: el.clientHeight,
			overflow: getComputedStyle(el).overflowY
		}));

	const before = await geometry();
	// Eighteen hours never fit in a viewport, so there is always more than is
	// shown — that is the precondition, not the assertion.
	expect(before.scroll).toBeGreaterThan(before.visible);
	expect(before.overflow, 'the grid must scroll, not clip').not.toBe('clip');
	expect(before.overflow).not.toBe('hidden');

	// And it really moves.
	await main.evaluate((el) => el.scrollTo({ top: el.scrollHeight }));
	const scrolled = await main.evaluate((el) => el.scrollTop);
	expect(scrolled, 'the grid did not scroll').toBeGreaterThan(0);

	// The last hour of the day is on screen once it has.
	await expect(page.locator('.ec-main').getByText('23:00', { exact: true })).toBeVisible();
});

/**
 * Zooming keeps the hour you were looking at.
 *
 * The grid's own zoom — the control beside it, and Ctrl+wheel over it — makes
 * every hour taller or shorter. Left alone the scroller kept its pixel offset,
 * which after a zoom is a different time: from an evening you were examining
 * back to first thing in the morning, on every press. That made the zoom
 * useless for the one thing it is for, looking closely at a busy afternoon.
 *
 * The assertion is about the time under the viewport rather than the number of
 * pixels: what has to be preserved is where you were, and the pixels are how it
 * happens to be stored.
 */
test('zooming keeps the part of the day you were looking at', async ({ page }) => {
	await register(page, `grid-zoom-${Date.now()}@test.invalid`);

	await visit(page, '/tasks/plan');
	const main = page.locator('.ec-main');
	await expect(main).toBeVisible();

	// Well into the evening, and not at either end where clamping would hide a
	// mistake.
	const where = await main.evaluate((el) => {
		el.scrollTop = (el.scrollHeight - el.clientHeight) * 0.6;
		return {
			// The fraction of the day at the middle of the viewport: the only
			// thing that has to survive.
			middle: (el.scrollTop + el.clientHeight / 2) / el.scrollHeight
		};
	});

	await page.getByRole('button', { name: 'Zoom in' }).click();
	// The grid re-lays out over a few frames; measuring inside them measures a
	// half-drawn grid rather than the answer.
	await page.waitForTimeout(400);

	const after = await main.evaluate((el) => ({
		middle: (el.scrollTop + el.clientHeight / 2) / el.scrollHeight,
		top: el.scrollTop
	}));

	expect(
		after.top,
		`the grid jumped back to the top of the day: ${JSON.stringify(after)}`
	).toBeGreaterThan(0);
	/*
	 * Tight on purpose. A zoom step is around 40% taller, so a scroller that
	 * simply kept its pixel offset lands about a tenth of the day out — which is
	 * both the bug and close enough to pass a loose bound. Two per cent is
	 * roughly twenty minutes of an eighteen-hour day: the rounding, and nothing
	 * else.
	 */
	expect(Math.abs(after.middle - where.middle)).toBeLessThan(0.02);
});

/**
 * A block scrolled half out of view keeps its name over its time.
 *
 * The library pins the title alone — `position: sticky` inside the time grid —
 * so a block whose top had gone past the edge kept its name at the edge while
 * the time stayed where it was drawn. As the block left, the two met on the
 * same line and read as one bundled string. Both lines are pinned as one now.
 */
test('a half-scrolled block does not fold its time into its title', async ({ page }) => {
	await register(page, `grid-sticky-${Date.now()}@test.invalid`);

	// Something long enough to still be on screen once its top is not. Posted
	// to the action rather than driven through the form: this test is about
	// what a block looks like when scrolled, not about creating one.
	await visit(page, '/tasks/plan');
	const options = await page.request.get('/api/capture-options');
	const categoryId = ((await options.json()) as { categories: { id: number }[] }).categories[0]?.id;
	const today = new Date().toISOString().slice(0, 10);
	const created = await page.request.post('/tasks/plan?/createExceptional', {
		headers: { origin: new URL(page.url()).origin },
		form: {
			date: today,
			startTime: '09:00',
			durationMinutes: '240',
			mode: 'category',
			categoryId: String(categoryId),
			label: 'a long block'
		}
	});
	expect(created.ok(), `the block was created: ${created.status()}`).toBe(true);

	await visit(page, '/tasks/plan?view=day');
	await expect(page.locator('.ec-event').filter({ hasText: 'a long block' })).toBeVisible();

	const main = page.locator('.ec-main');
	// Far enough that the block's own top is above the top of the scroller.
	await main.evaluate((el) => {
		const event = [...el.querySelectorAll('.ec-event')].find((e) =>
			e.textContent?.includes('a long block')
		);
		el.scrollTop = event.offsetTop + 60;
	});
	await page.waitForTimeout(300);

	const boxes = await main.evaluate((el) => {
		const event = [...el.querySelectorAll('.ec-event')].find((e) =>
			e.textContent?.includes('a long block')
		);
		const rect = (sel) => {
			const r = event.querySelector(sel).getBoundingClientRect();
			return { top: r.top, bottom: r.bottom };
		};
		return { title: rect('.ec-event-title'), time: rect('.ec-event-time') };
	});

	// The time is under the title, and they do not share a line.
	expect(boxes.time.top).toBeGreaterThanOrEqual(boxes.title.bottom - 1);
});

/**
 * The plan goes backwards, and says what happened there.
 *
 * The window used to clamp to today: `from` in the past was silently the
 * present, and the back button was disabled on the current week. So the one
 * question somebody brings to a planner on a Monday — what did last week
 * actually look like — was the one it could not answer.
 */
test('the plan can be walked into last week', async ({ page }) => {
	await register(page, `grid-back-${Date.now()}@test.invalid`);
	await visit(page, '/tasks/plan?view=week');

	const back = page.getByRole('button', { name: 'Back one week' });
	await expect(back).toBeEnabled();
	await back.click();

	// A week earlier, and the page says so rather than bouncing to today.
	await expect(page).toHaveURL(/from=\d{4}-\d{2}-\d{2}/);
	const from = new URL(page.url()).searchParams.get('from')!;
	const today = new Date();
	expect(new Date(`${from}T00:00:00`).getTime()).toBeLessThan(today.getTime());

	// Those days are drawn as days that have been.
	await expect(page.locator('.og-past').first()).toBeAttached();

	// And there is a way home.
	await page.getByRole('button', { name: 'Today' }).click();
	await expect(page.locator('.og-past')).toHaveCount(0);
});

/**
 * Ticking a block off from its own form.
 *
 * The board is where a day is worked; this is for the glance at the plan that
 * ends with "that did happen". The button sits next to Skip, leads, and undoes
 * itself — and the grid answers with the tick in the block's corner.
 */
test('a block can be marked done from the plan, and undone', async ({ page }) => {
	await register(page, `grid-tick-${Date.now()}@test.invalid`);
	await visit(page, '/tasks/plan?view=day');

	const options = await page.request.get('/api/capture-options');
	const categoryId = ((await options.json()) as { categories: { id: number }[] }).categories[0]?.id;
	const today = new Date().toISOString().slice(0, 10);
	const created = await page.request.post('/tasks/plan?/createExceptional', {
		headers: { origin: new URL(page.url()).origin },
		form: {
			date: today,
			startTime: '09:00',
			durationMinutes: '90',
			mode: 'category',
			categoryId: String(categoryId),
			label: 'tick me'
		}
	});
	expect(created.ok(), `the block was created: ${created.status()}`).toBe(true);

	await visit(page, '/tasks/plan?view=day');
	await page.locator('.ec-event').filter({ hasText: 'tick me' }).click();

	const done = page.getByRole('button', { name: 'Mark as done' });
	await expect(done).toBeVisible();
	await done.click();

	// The form knows, and offers the way back.
	await expect(page.getByRole('button', { name: /Done ✓ — undo/ })).toBeVisible();
	// And the grid says so in the block's corner.
	await expect(
		page.locator('.ec-event').filter({ hasText: 'tick me' }).locator('.ec-event-mark--done')
	).toBeVisible();

	await page.getByRole('button', { name: /Done ✓ — undo/ }).click();
	await expect(page.getByRole('button', { name: 'Mark as done' })).toBeVisible();
});

/**
 * History's tab is gone; its bookmarks are not.
 */
test('an old history link lands on the plan, a week back', async ({ page }) => {
	await register(page, `grid-hist-${Date.now()}@test.invalid`);

	await page.goto('/tasks/history?week=2026-08-24');
	await expect(page).toHaveURL(/tasks\/plan\?view=week&from=2026-08-24/);
	// And the tab row does not offer what no longer exists.
	await expect(page.getByRole('link', { name: 'History' })).toHaveCount(0);
});
