import { expect, test } from '@playwright/test';
import { register } from './helpers/account';
import { visit } from './helpers/visit';

/**
 * A reminder actually reaching somebody.
 *
 * The three things a browser has to do, in the order it does them: notice the
 * reminder is due, put it on the screen, and — where permission has been given
 * — raise a system notification. The fourth, reaching a phone with the app
 * closed, needs the browser vendor's push service and cannot be exercised
 * offline; `tests/reminders-push.test.ts` covers the server half of it and the
 * service worker's `push` handler is asserted below by reading the worker the
 * browser actually registered.
 *
 * `Notification` is replaced before any app code runs rather than checked
 * afterwards: a real one is drawn by the operating system, where Playwright
 * cannot see it, so what is testable is that the app asked for it and with
 * what.
 */

/**
 * A reminder that is already due, made the way the app makes one.
 *
 * Through the real forms rather than a test-only endpoint: a one-off block that
 * started a few minutes ago, and the board's own "remind me before this"
 * control set to a lead that lands in the past. A backdoor that manufactured
 * the row would prove the card renders and nothing about the path that fills
 * it.
 */
async function dueReminder(page: import('@playwright/test').Page, message: string) {
	await visit(page, '/tasks/plan');

	const now = new Date();
	const pad = (n: number) => String(n).padStart(2, '0');
	// Far enough back that the lead below is comfortably past. The block's
	// date comes from that moment, not from now: run between 00:00 and 00:20
	// UTC, "twenty minutes ago" is yesterday, and stamping it with today's
	// date put the reminder in the future — the suite failed for twenty
	// minutes every midnight.
	const started = new Date(now.getTime() - 20 * 60_000);
	const today = `${started.getFullYear()}-${pad(started.getMonth() + 1)}-${pad(started.getDate())}`;
	const startTime = `${pad(started.getHours())}:${pad(started.getMinutes())}`;

	// Whatever category this account was set up with; the block needs one and
	// which one it is does not matter here. Asked of the endpoint the capture
	// dialogs use, because the block form's own select is only in the DOM once
	// that form is open.
	const options = await page.request.get('/api/capture-options');
	const categoryId = ((await options.json()) as { categories: { id: number }[] }).categories[0]?.id;
	expect(categoryId, 'the account has a category to file a block under').toBeTruthy();

	// The origin header is what SvelteKit checks a form POST against; a request
	// made through the API client does not carry one by itself.
	// One post: the block and the "remind me five minutes before it" together.
	// A block that started twenty minutes ago therefore has a reminder that fell
	// due fifteen minutes ago, which is exactly the state being tested.
	const created = await page.request.post('/tasks/plan?/createExceptional', {
		// The origin header is what SvelteKit checks a form POST against; a
		// request made through the API client does not carry one by itself.
		headers: { origin: new URL(page.url()).origin },
		form: {
			date: today,
			startTime,
			durationMinutes: '60',
			remindLeadMinutes: '5',
			mode: 'category',
			categoryId: String(categoryId),
			label: message
		}
	});
	expect(created.ok(), `the block was created: ${created.status()}`).toBe(true);

	/*
	 * Occurrences are made when a day is first looked at, and the reminder rows
	 * are made with them — so the block above is not yet a thing that can fall
	 * due. Opening the day is what turns it into one, which is also what happens
	 * in life: nobody sets a reminder for a day they never open.
	 */
	await visit(page, `/tasks/board?date=${today}`);
}

test('a due reminder arrives on the page, and as a notification', async ({ page, context }) => {
	await context.grantPermissions(['notifications']);

	// Before the app loads: the page reads `Notification.permission` on mount.
	await page.addInitScript(() => {
		const raised: { title: string; tag?: string }[] = [];
		(window as unknown as { __notifications: typeof raised }).__notifications = raised;

		class Recorded {
			static permission = 'granted';
			static requestPermission = async () => 'granted';
			constructor(title: string, options?: { tag?: string }) {
				raised.push({ title, tag: options?.tag });
			}
		}
		Object.defineProperty(window, 'Notification', { value: Recorded, configurable: true });
	});

	await register(page, `reminders-${Date.now()}@test.invalid`);
	await dueReminder(page, 'Stretch before the call');

	// The card, which is the channel that needs no permission at all.
	const card = page.getByRole('status').filter({ hasText: 'Stretch before the call' });
	await expect(card).toBeVisible({ timeout: 90_000 });

	// And the system notification, asked for with the same words.
	const raised = await page.evaluate(
		() => (window as unknown as { __notifications: { title: string }[] }).__notifications
	);
	expect(raised.map((n) => n.title)).toContain('Stretch before the call');
});

/**
 * The bug in the screenshot: a reminder card lying across the middle of the
 * radial menu, hiding the wedges being aimed at. Both are fixed layers and both
 * are right to be — so what floats gets out of the way for the length of the
 * gesture.
 */
test('a reminder card does not sit on top of the menu', async ({ page }) => {
	await register(page, `reminder-pie-${Date.now()}@test.invalid`);
	await dueReminder(page, 'Something is due');

	const card = page.getByRole('status').filter({ hasText: 'Something is due' });
	await expect(card).toBeVisible({ timeout: 90_000 });

	// The rooms pie, opened the way a finger opens it: a press on the handle in
	// the middle of the bar.
	const handle = page.locator('[data-tour="rooms"]:visible').first();
	await handle.hover();
	await page.mouse.down();
	await page.mouse.up();
	const pie = page.locator('.pie-layer');
	await expect(pie).toBeVisible();

	await expect(card).not.toBeVisible();

	await page.keyboard.press('Escape');
	await expect(pie).not.toBeVisible();
	await expect(card).toBeVisible();
});

/**
 * The worker is what a phone runs with the app closed, so the handler being
 * there is the difference between reminders that arrive and reminders that do
 * not. Read from the file the browser registered rather than from source: a
 * build that dropped it would still have it in `src`.
 */
test('the registered service worker handles a push', async ({ page }) => {
	await register(page, `sw-push-${Date.now()}@test.invalid`);

	const url = await page.evaluate(async () => {
		const registration = await navigator.serviceWorker.ready;
		return registration.active?.scriptURL ?? null;
	});
	expect(url, 'the app registered a service worker').not.toBeNull();

	const source = await page.evaluate(async (at: string) => (await fetch(at)).text(), url!);
	expect(source).toContain('push');
	expect(source).toContain('showNotification');
	expect(source).toContain('notificationclick');
});
