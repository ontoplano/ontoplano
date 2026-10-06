import { expect, test, type Page } from '@playwright/test';
import { register, testEmail } from './helpers/account';
import { visit } from './helpers/visit';

/**
 * A dialog saved from its footer leaves before the server answers.
 *
 * Every create and edit form used to stand open for the whole round trip,
 * which made the app feel a second or two slow at the moment it was used
 * most. `$lib/enhance` now has the dialog step away on the press; `Modal`
 * keeps what was typed, and brings it back only if the save is refused.
 */

/*
 * How long the page is given to answer a press on its own.
 *
 * Generous, because it can be: the posts are held until the test lets them
 * go, not merely slowed, so whatever turns up inside this cannot have come
 * from the server. It used to be 500ms against a 1.5s delay, which proved the
 * same thing only as long as the runner was quick.
 */
const ANSWER_MS = 5000;

/**
 * Hold every form post — or only those matching `only` — until the returned
 * function is called, and optionally refuse them then.
 */
async function holdPosts(page: Page, refuse: string | null, only: RegExp = /\?\//) {
	let release!: () => void;
	const released = new Promise<void>((done) => (release = done));
	await page.route(only, async (route) => {
		if (route.request().method() !== 'POST') return route.continue();
		await released;
		if (refuse === null) return route.continue();
		return route.fulfill({
			status: 200,
			contentType: 'application/json',
			body: JSON.stringify({
				type: 'failure',
				status: 400,
				data: JSON.stringify([{ message: 1 }, refuse])
			})
		});
	});
	return release;
}

async function startTask(page: Page, title: string) {
	await page
		.getByRole('button', { name: /New task/ })
		.first()
		.click();
	await page.locator('#todo-form [name="heading"]').fill(title);
}

test('the dialog is gone on the press, and the task arrives behind it', async ({ page }) => {
	test.setTimeout(180_000);
	await register(page, testEmail('dialog-away'));
	await visit(page, '/tasks/todo');
	const release = await holdPosts(page, null);

	await startTask(page, 'sent without waiting');
	await page.getByRole('button', { name: 'Create task' }).click();
	// The post is held: the answer cannot have come yet.
	await expect(page.locator('dialog[open]')).toHaveCount(0, { timeout: ANSWER_MS });
	release();

	await expect(page.getByText('sent without waiting').first()).toBeVisible({ timeout: 30_000 });
	await expect(page.locator('dialog[open]')).toHaveCount(0);
});

test('a refused save brings the dialog back, with what was typed and why', async ({ page }) => {
	test.setTimeout(180_000);
	await register(page, testEmail('dialog-back'));
	await visit(page, '/tasks/todo');
	const release = await holdPosts(page, 'The server said no');

	await startTask(page, 'this one is refused');
	await page.getByRole('button', { name: 'Create task' }).click();
	await expect(page.locator('dialog[open]')).toHaveCount(0, { timeout: ANSWER_MS });
	release();

	const dialog = page.locator('dialog[open]');
	await expect(dialog).toContainText('The server said no', { timeout: 10_000 });
	await expect(dialog.locator('[name="heading"]')).toHaveValue('this one is refused');
});

/**
 * The refusal is said in the dialog and nowhere else.
 *
 * A notebook's own goal dialog was handed no error, so a target of zero came
 * back as a banner under the tabs — the page's own — while the dialog
 * returned saying nothing. The dialog is where the fields are, so the
 * reason belongs in it; and the page's banner stays down while a dialog is
 * away, so the moment before the dialog steps back in cannot flash it.
 */
test('a refusal is said in the dialog, never under the tabs', async ({ page }) => {
	test.setTimeout(180_000);
	await register(page, testEmail('dialog-no-flash'));
	const origin = new URL(page.url()).origin;
	await page.request.post('/notebooks?/create', {
		headers: { Origin: origin, 'x-sveltekit-action': 'true' },
		form: { heading: 'The kitchen', modules: 'notes,tasks,goals' }
	});
	await visit(page, '/notebooks');
	await page.getByRole('button', { name: /^Goals \d/ }).click();
	await page.getByRole('button', { name: 'New goal', exact: true }).click();
	const form = page.locator('#notebook-goal-form');
	await expect(form).toBeVisible({ timeout: 30_000 });
	await form.locator('[name="heading"]').first().fill('Read more');
	await form.getByRole('button', { name: 'Add measure' }).click();
	await form.locator('[name="targetValue"]').first().fill('0');

	// Watched from inside the page, every frame from the press until the
	// refusal is on screen: a screenshot would miss a flash of one frame.
	await page.evaluate(() => {
		const w = window as unknown as { __flashed?: boolean };
		w.__flashed = false;
		const look = () => {
			const onPage = [...document.querySelectorAll('main .banner.error')].some(
				(el) => !el.closest('dialog') && el.textContent?.includes('more than zero')
			);
			if (onPage) w.__flashed = true;
			requestAnimationFrame(look);
		};
		look();
	});
	await page.getByRole('button', { name: 'Create goal' }).click();

	const dialog = page.locator('dialog[open]');
	await expect(dialog).toContainText('Target has to be more than zero', { timeout: 10_000 });
	await expect(dialog.locator('[name="heading"]')).toHaveValue('Read more');
	expect(
		await page.evaluate(() => (window as unknown as { __flashed?: boolean }).__flashed),
		'the refusal showed under the tabs'
	).toBe(false);
});

test('the opener pressed again while the save is out opens a fresh dialog', async ({ page }) => {
	test.setTimeout(180_000);
	await register(page, testEmail('dialog-again'));
	await visit(page, '/tasks/todo');
	const release = await holdPosts(page, null);

	// The next one started before the first is answered: the press used to set
	// `open` to the true it already was, and the answer then shut it.
	await startTask(page, 'the first of two');
	await page.getByRole('button', { name: 'Create task' }).click();
	await expect(page.locator('dialog[open]')).toHaveCount(0, { timeout: ANSWER_MS });
	await page
		.getByRole('button', { name: /New task/ })
		.first()
		.click();
	release();

	await expect(page.getByText('the first of two').first()).toBeVisible({ timeout: 30_000 });
	const dialog = page.locator('dialog[open]');
	await expect(dialog).toHaveCount(1);
	await expect(dialog.locator('[name="heading"]')).toHaveValue('');
});

test('a block saved on the plan says so', async ({ page }) => {
	test.setTimeout(180_000);
	await register(page, testEmail('dialog-plan-toast'));
	await visit(page, '/tasks/plan');
	await page.getByRole('button', { name: 'New task block' }).click();
	await page.getByRole('button', { name: 'Once only' }).click();
	// A category block needs nothing typed: the account's first category is chosen.
	await page.getByRole('button', { name: 'Mode' }).click();
	await page.getByRole('option', { name: 'Category' }).click();
	await page.getByRole('button', { name: 'Add one-off' }).click();
	await expect(page.getByText('Task block added')).toBeVisible({ timeout: 10_000 });
});

test('a confirmed rating and an archived task answer before the server', async ({ page }) => {
	test.setTimeout(180_000);
	await page.setViewportSize({ width: 1280, height: 900 });
	await register(page, testEmail('press-answers'));
	await visit(page, '/tasks/todo');
	for (const title of ['rate me', 'put me away']) {
		await startTask(page, title);
		await page.getByRole('button', { name: 'Create task' }).click();
		await expect(page.getByText(title).first()).toBeVisible({ timeout: 30_000 });
	}
	const release = await holdPosts(page, null);

	const rated = page.locator('.row-card').filter({ hasText: 'rate me' });
	const bars = rated.locator('.rating-bars');
	const box = (await bars.boundingBox())!;
	await page.mouse.click(box.x + box.width * 0.15, box.y + box.height * 0.05);
	const holding = page.getByRole('dialog', { name: 'Confirm' });
	await holding.getByRole('button', { name: 'Confirm' }).click();
	await expect(holding).toBeHidden({ timeout: ANSWER_MS });
	await expect(bars).toHaveAttribute('aria-label', /Urgency 5/, { timeout: ANSWER_MS });

	const away = page.locator('.row-card').filter({ hasText: 'put me away' });
	await away.getByRole('button', { name: 'Put it away' }).click();
	await expect(away).toHaveCount(0, { timeout: ANSWER_MS });
	release();
});

/**
 * A press is held until its own answer, not until any data at all.
 *
 * The rating's save is slow and another press's is not: the other one's
 * reload lands first, and it knows nothing of the rating yet. The bars used
 * to fall back to it — confirmed, then unset, then set again a second later.
 */
test('a confirmed rating outlives a reload some other press asked for', async ({ page }) => {
	test.setTimeout(180_000);
	await page.setViewportSize({ width: 1280, height: 900 });
	await register(page, testEmail('press-outlives'));
	await visit(page, '/tasks/todo');
	for (const title of ['rate me', 'put me away']) {
		await startTask(page, title);
		await page.getByRole('button', { name: 'Create task' }).click();
		await expect(page.getByText(title).first()).toBeVisible({ timeout: 30_000 });
	}
	// Only the rating's save is held; the other press goes straight through.
	const release = await holdPosts(page, null, /\?\/rate$/);

	const rated = page.locator('.row-card').filter({ hasText: 'rate me' });
	const bars = rated.locator('.rating-bars');
	const box = (await bars.boundingBox())!;
	await page.mouse.click(box.x + box.width * 0.15, box.y + box.height * 0.05);
	await page
		.getByRole('dialog', { name: 'Confirm' })
		.getByRole('button', { name: 'Confirm' })
		.click();
	await expect(bars).toHaveAttribute('aria-label', /Urgency 5/, { timeout: ANSWER_MS });

	const reloaded = page.waitForResponse(/__data\.json/);
	await rated
		.page()
		.locator('.row-card')
		.filter({ hasText: 'put me away' })
		.getByRole('button', { name: 'Put it away' })
		.click();
	await reloaded;
	// Read once that reload is drawn, not retried until the rating's own save
	// lands and makes it true anyway.
	await page.evaluate(
		() => new Promise((drawn) => requestAnimationFrame(() => requestAnimationFrame(drawn)))
	);
	expect(await bars.getAttribute('aria-label')).toMatch(/Urgency 5/);
	release();
});
