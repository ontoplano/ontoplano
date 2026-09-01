import { expect, test } from '@playwright/test';
import { register } from './helpers/account';

/**
 * The recipe loop, in a browser.
 *
 * The service tests cover the rules; this covers the two things only a browser
 * can be wrong about — that writing a recipe fills the shopping list as a side
 * effect, and that cook mode is a mode you can get out of.
 */

async function makeRecipe(page: import('@playwright/test').Page, title: string): Promise<void> {
	// Recipes need a category that holds food before anything can be an
	// ingredient, and that lives behind the shopping list's Categories dialog.
	await page.goto('/shopping', { waitUntil: 'networkidle' });
	await page.getByRole('button', { name: 'Categories' }).click();

	const dialog = page.locator('dialog[open]');
	await dialog.getByRole('button', { name: /new category/i }).click();
	await dialog.locator('input[name=label]').fill('Pantry');
	await dialog.locator('input[name=isFood]').check();
	await dialog.getByRole('button', { name: /add the category/i }).click();
	await page.waitForTimeout(500);

	// Navigating away is how the dialog closes; there is nothing to save.
	await page.goto('/kitchen/recipes', { waitUntil: 'networkidle' });
	await page
		.getByRole('button', { name: /new recipe/i })
		.first()
		.click();

	const form = page.locator('dialog[open]');
	await form.locator('input[name=title]').fill(title);
	await form.locator('input[name=title]').press('Enter');
	await page.waitForURL(/\/kitchen\/recipes\/\d+/, { timeout: 10_000 });
}

test('cook mode covers the page and gives it back', async ({ page }) => {
	await register(page, `cook-${Date.now()}@test.invalid`);
	await makeRecipe(page, 'Tomato pasta');

	// Something to read across a counter.
	await page.getByRole('button', { name: 'Edit' }).first().click();
	const editor = page.locator('dialog[open]');
	await editor.locator('textarea[name=method]').fill('- [ ] boil water\n- [ ] add salt');
	await editor.getByRole('button', { name: /save/i }).first().click();

	// A native <dialog> lives in the top layer, above any z-index, so cook mode
	// is only reachable once this one has actually gone.
	await expect(page.locator('dialog[open]')).toHaveCount(0);

	await page.getByRole('button', { name: /^cook$/i }).click();

	const method = page.locator('.md.cook');
	await expect(method).toBeVisible();
	await expect(method).toContainText('boil water');

	// The type has to actually be bigger, or the mode is decoration.
	const size = await method.evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
	expect(size).toBeGreaterThan(16);

	// The method's checklist is tickable here and nowhere else.
	const step = method.locator('input[type=checkbox]').first();
	await expect(step).toBeEnabled();
	await step.check();
	await expect(step).toBeChecked();

	// And you have to be able to leave, by the button and by the key.
	await page.getByRole('button', { name: /leave cook mode/i }).click();
	await expect(method).toBeHidden();

	await page.getByRole('button', { name: /^cook$/i }).click();
	await expect(method).toBeVisible();
	await page.keyboard.press('Escape');
	await expect(method).toBeHidden();
});

test('a pasted list becomes the ingredients', async ({ page }) => {
	await register(page, `paste-${Date.now()}@test.invalid`);
	await makeRecipe(page, 'Pearl barley stew');

	await page.getByRole('button', { name: /paste a list/i }).click();
	await page
		.locator('textarea[name=list]')
		.fill(
			['Ingredients:', '', '- 300 g pearl barley', '- 2 carrots, diced', '1/2 tsp thyme'].join('\n')
		);
	await page.getByRole('button', { name: /add them/i }).click();

	await expect(page.getByText('Added 3 of them.')).toBeVisible();

	// Every readable line, and neither the heading nor the blank. Scoped to the
	// ingredient list, because the recipe is called "Pearl barley stew" and a
	// page-wide search for "pearl barley" would have found the title.
	const list = page.locator('section', { has: page.getByRole('heading', { name: 'Ingredients' }) });
	for (const name of ['pearl barley', 'carrots', 'thyme']) {
		await expect(list.getByText(name, { exact: false }).first()).toBeVisible();
	}
	await expect(page.getByText('Ingredients:', { exact: true })).toHaveCount(0);

	// And the new ones are on the shopping list, which is the point of the loop.
	// The item's own row and the "used in" backlink both name it now, so this
	// asks for the row rather than the word.
	await page.goto('/shopping', { waitUntil: 'networkidle' });
	await expect(page.getByText('pearl barley').first()).toBeVisible();
});

/**
 * A recipe from a link.
 *
 * The parser is unit-tested against the shapes real sites publish; what this
 * checks is the half that only exists in a running app — that the action is
 * wired up, that a refused address is refused with a sentence rather than a
 * stack trace, and above all that the server will not fetch something on the
 * inside of the network because somebody pasted it.
 */
test.describe('importing a recipe from a URL', () => {
	test('refuses an address on the inside of the network', async ({ page }) => {
		await register(page, `recipe-ssrf-${Date.now()}@test.invalid`);
		await page.goto('/kitchen/recipes', { waitUntil: 'networkidle' });

		// The cloud metadata service, which hands out credentials to whoever
		// asks — and the app's own port, and the loopback name.
		for (const url of [
			'http://169.254.169.254/latest/meta-data/',
			'http://127.0.0.1:1493/settings/account',
			'http://localhost:1493/',
			'file:///etc/passwd'
		]) {
			const result = await page.evaluate(async (target) => {
				const body = new FormData();
				body.append('url', target);
				const res = await fetch('/kitchen/recipes?/importFromUrl', {
					method: 'POST',
					headers: { 'x-sveltekit-action': 'true' },
					body
				});
				// An action reports its own status inside the envelope; the HTTP
				// status of the envelope itself is 200 either way.
				const envelope = await res.json();
				return { status: envelope.status as number, type: envelope.type as string };
			}, url);

			// Refused — never fetched, never redirected to, never parsed.
			expect(result.type, `${url} should be refused`).toBe('failure');
			expect(result.status, `${url} should be refused`).toBe(400);
		}

		// And nothing was created by any of it.
		await page.reload({ waitUntil: 'networkidle' });
		await expect(page.getByText('No recipes yet')).toBeVisible();
	});

	test('and says so plainly when a page has no recipe on it', async ({ page }) => {
		await register(page, `recipe-none-${Date.now()}@test.invalid`);
		await page.goto('/kitchen/recipes', { waitUntil: 'networkidle' });

		// The app's own front page over its public name: a real page, reachable,
		// with no structured recipe in it.
		const result = await page.evaluate(async () => {
			const body = new FormData();
			body.append('url', 'https://example.com/');
			const res = await fetch('/kitchen/recipes?/importFromUrl', {
				method: 'POST',
				headers: { 'x-sveltekit-action': 'true' },
				body
			});
			const envelope = await res.json();
			return { status: envelope.status as number, type: envelope.type as string };
		});

		// Either it could not be reached from this machine — the suite runs with
		// no outbound network — or it was read and held no recipe. Both are a
		// sentence, and neither is a 500 with a stack trace in it.
		expect(result.type).toBe('failure');
		expect([400, 422]).toContain(result.status);
	});
});
