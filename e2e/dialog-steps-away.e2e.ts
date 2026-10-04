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

/** Hold every form post for a while, and optionally refuse it. */
/** How long the rating's save is kept from the server while another press lands. */
const RATING_SAVE_HELD_MS = 4000;

async function slowPosts(page: Page, refuse: string | null) {
	await page.route(/\?\//, async (route) => {
		if (route.request().method() !== 'POST') return route.continue();
		await new Promise((done) => setTimeout(done, 1500));
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
	await slowPosts(page, null);

	await startTask(page, 'sent without waiting');
	await page.getByRole('button', { name: 'Create task' }).click();
	// Well inside the held 1.5s: the answer cannot have come yet.
	await expect(page.locator('dialog[open]')).toHaveCount(0, { timeout: 500 });

	await expect(page.getByText('sent without waiting').first()).toBeVisible({ timeout: 30_000 });
	await expect(page.locator('dialog[open]')).toHaveCount(0);
});

test('a refused save brings the dialog back, with what was typed and why', async ({ page }) => {
	test.setTimeout(180_000);
	await register(page, testEmail('dialog-back'));
	await visit(page, '/tasks/todo');
	await slowPosts(page, 'The server said no');

	await startTask(page, 'this one is refused');
	await page.getByRole('button', { name: 'Create task' }).click();
	await expect(page.locator('dialog[open]')).toHaveCount(0, { timeout: 500 });

	const dialog = page.locator('dialog[open]');
	await expect(dialog).toContainText('The server said no', { timeout: 10_000 });
	await expect(dialog.locator('[name="heading"]')).toHaveValue('this one is refused');
});

test('the opener pressed again while the save is out opens a fresh dialog', async ({ page }) => {
	test.setTimeout(180_000);
	await register(page, testEmail('dialog-again'));
	await visit(page, '/tasks/todo');
	await slowPosts(page, null);

	// The next one started before the first is answered: the press used to set
	// `open` to the true it already was, and the answer then shut it.
	await startTask(page, 'the first of two');
	await page.getByRole('button', { name: 'Create task' }).click();
	await expect(page.locator('dialog[open]')).toHaveCount(0, { timeout: 500 });
	await page
		.getByRole('button', { name: /New task/ })
		.first()
		.click();

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
	await slowPosts(page, null);

	const rated = page.locator('.row-card').filter({ hasText: 'rate me' });
	const bars = rated.locator('.rating-bars');
	const box = (await bars.boundingBox())!;
	await page.mouse.click(box.x + box.width * 0.15, box.y + box.height * 0.05);
	const holding = page.getByRole('dialog', { name: 'Confirm' });
	await holding.getByRole('button', { name: 'Confirm' }).click();
	await expect(holding).toBeHidden({ timeout: 500 });
	await expect(bars).toHaveAttribute('aria-label', /Urgency 5/, { timeout: 500 });

	const away = page.locator('.row-card').filter({ hasText: 'put me away' });
	await away.getByRole('button', { name: 'Put it away' }).click();
	await expect(away).toHaveCount(0, { timeout: 500 });
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
	const ratingSaved = { done: false };
	await page.route(/\?\/rate$/, async (route) => {
		await new Promise((done) => setTimeout(done, RATING_SAVE_HELD_MS));
		await route.continue();
		ratingSaved.done = true;
	});

	const rated = page.locator('.row-card').filter({ hasText: 'rate me' });
	const bars = rated.locator('.rating-bars');
	const box = (await bars.boundingBox())!;
	await page.mouse.click(box.x + box.width * 0.15, box.y + box.height * 0.05);
	await page
		.getByRole('dialog', { name: 'Confirm' })
		.getByRole('button', { name: 'Confirm' })
		.click();
	await expect(bars).toHaveAttribute('aria-label', /Urgency 5/, { timeout: 500 });

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
	expect(ratingSaved.done, 'the other press answered first').toBe(false);
	expect(await bars.getAttribute('aria-label')).toMatch(/Urgency 5/);
});
