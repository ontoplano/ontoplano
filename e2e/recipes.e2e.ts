import { expect, test } from '@playwright/test';
import { register } from './helpers/account';
import { visit } from './helpers/visit';

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
	await visit(page, '/inventory/list');
	await page.getByRole('button', { name: 'Categories' }).click();

	const dialog = page.locator('dialog[open]');
	await dialog.getByRole('button', { name: /new category/i }).click();
	await dialog.locator('[name=label]').fill('Pantry');
	await dialog.locator('input[name=isFood]').check();
	await dialog.getByRole('button', { name: /add the category/i }).click();
	await page.waitForTimeout(500);

	// Navigating away is how the dialog closes; there is nothing to save.
	await visit(page, '/health/recipes');
	await page
		.getByRole('button', { name: /new recipe/i })
		.first()
		.click();

	const form = page.locator('dialog[open]');
	await form.locator('[name=heading]').fill(title);
	await form.locator('[name=heading]').press('Enter');
	await page.waitForURL(/\/health\/recipes\/\d+/, { timeout: 10_000 });
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
	await visit(page, '/inventory/list');
	await expect(page.getByText('pearl barley').first()).toBeVisible();
});

/**
 * A recipe out of a pasted page.
 *
 * The parser is unit-tested against the shapes real sites publish; what this
 * checks is the half that only exists in a running app — that the action is
 * wired up, that the recipe and its ingredients land together, and that a
 * paste with no recipe in it comes back as a sentence rather than a stack
 * trace.
 *
 * There is deliberately no URL here to refuse. This used to fetch the page
 * server-side, guarded against every private address; the guard was sound and
 * the door was still a door, so the door is gone.
 */
test.describe('importing a recipe from a pasted page', () => {
	const PAGE = `<!doctype html><html><head><script type="application/ld+json">${JSON.stringify({
		'@context': 'https://schema.org',
		'@type': 'Recipe',
		name: 'Pasted pancakes',
		recipeIngredient: ['200g plain flour', '2 eggs', '300ml milk'],
		recipeInstructions: [
			{ '@type': 'HowToStep', text: 'Whisk it.' },
			{ '@type': 'HowToStep', text: 'Fry it.' }
		],
		recipeYield: '4',
		totalTime: 'PT25M'
	})}</script></head><body></body></html>`;

	test('reads the recipe, its ingredients and its timing', async ({ page }) => {
		await register(page, `recipe-paste-${Date.now()}@test.invalid`);
		await visit(page, '/health/recipes');

		await page.getByRole('button', { name: 'New recipe' }).first().click();
		await page.getByPlaceholder('Paste the page here').fill(PAGE);
		await page.getByRole('button', { name: 'Read it' }).click();

		await page.waitForURL(/\/health\/recipes\/\d+/);
		await expect(page.getByText('Pasted pancakes').first()).toBeVisible();
		await expect(page.getByText('Whisk it.').first()).toBeVisible();

		// The ingredients went through the same parser a pasted list uses, so
		// they are rows in the list rather than the text that was pasted.
		const list = page.locator('section', {
			has: page.getByRole('heading', { name: 'Ingredients' })
		});
		for (const name of ['flour', 'eggs', 'milk'])
			await expect(list.getByText(name, { exact: false }).first()).toBeVisible();
	});

	test('says so plainly when there is no recipe in the paste', async ({ page }) => {
		await register(page, `recipe-none-${Date.now()}@test.invalid`);
		await visit(page, '/health/recipes');

		const result = await page.evaluate(async () => {
			const body = new FormData();
			body.append('page', '<html><body>a blog post about a holiday</body></html>');
			const res = await fetch('/health/recipes?/importFromPage', {
				method: 'POST',
				headers: { 'x-sveltekit-action': 'true' },
				body
			});
			// An action reports its own status inside the envelope; the HTTP
			// status of the envelope itself is 200 either way.
			const envelope = await res.json();
			return { status: envelope.status as number, type: envelope.type as string };
		});

		expect(result.type).toBe('failure');
		expect(result.status).toBe(422);

		await page.reload({ waitUntil: 'load' });
		await page.waitForSelector('html[data-ready]');
		await expect(page.getByText('No recipes yet')).toBeVisible();
	});
});

/**
 * The claim the whole kitchen half exists to make.
 *
 * "Put a recipe on a day and its ingredients land on the list — only what you
 * have run out of." Work planners ignore food and meal planners ignore the rest
 * of the week; this is the seam, and it is the sentence on the front page. It
 * crosses four pages and three tables, so it is exactly the kind of claim that
 * can quietly stop being true while every page still looks right.
 */
test('a recipe put on a day turns into shopping', async ({ page }) => {
	await register(page, `seam-${Date.now()}@test.invalid`);

	// A food category, because an ingredient is a shopping item and a shopping
	// item lives in one.
	await visit(page, '/inventory/list');
	await page.evaluate(async () => {
		const body = new FormData();
		body.append('label', 'Cupboard');
		await fetch('/inventory/list?/createCategory', {
			method: 'POST',
			headers: { 'x-sveltekit-action': 'true' },
			body
		});
	});
	await visit(page, '/inventory/list');
	// The food ticks live in the Categories dialog, so it has to be open for
	// them to exist at all.
	await page.getByRole('button', { name: 'Categories' }).click();
	const food = await page.evaluate(async () => {
		// Every category this account has, ticked as food. An ingredient is a
		// shopping item, and a shopping item that is not food cannot be one.
		const boxes = [...document.querySelectorAll('input[name=food]')] as HTMLInputElement[];
		const body = new FormData();
		for (const box of boxes) body.append('food', box.value);
		const res = await fetch('/inventory/list?/saveCategories', {
			method: 'POST',
			headers: { 'x-sveltekit-action': 'true' },
			body
		});
		return { boxes: boxes.length, type: (await res.json()).type as string };
	});
	expect(food.boxes, 'the shopping page should offer a food tick per category').toBeGreaterThan(0);
	expect(food.type).toBe('success');

	// A recipe with two ingredients.
	await visit(page, '/health/recipes');
	await page
		.getByRole('button', { name: /new recipe/i })
		.first()
		.click();
	await page.locator('#recipe-form [name=heading]').fill('Leek soup');
	await page.getByRole('button', { name: 'Create', exact: true }).click();
	await page.waitForURL(/\/health\/recipes\/\d+/);

	const recipeId = page.url().split('/').pop()!;
	const imported = await page.evaluate(async (id) => {
		const body = new FormData();
		body.append('recipeId', id);
		body.append('list', 'leeks\npotatoes');
		const res = await fetch(`/health/recipes/${id}?/importIngredients`, {
			method: 'POST',
			headers: { 'x-sveltekit-action': 'true' },
			body
		});
		return await res.text();
	}, recipeId);
	// `importIngredients` skips a line it cannot use rather than failing, so
	// "success" alone would pass with nothing added.
	expect(imported, 'importing the ingredients').toContain('success');
	expect(imported, 'both lines should have become ingredients').toContain('2');

	// On a day. It becomes an ordinary block on the grid with the recipe on it,
	// which is what makes "what does this week need" a join rather than a second
	// calendar.
	const today = new Date().toISOString().slice(0, 10);
	const scheduled = await page.evaluate(
		async ({ id, date }) => {
			const body = new FormData();
			body.append('recipeId', id);
			body.append('date', date);
			body.append('startTime', '19:00');
			body.append('durationMinutes', '45');
			body.append('label', 'Leek soup');
			const res = await fetch(`/health/recipes/${id}?/schedule`, {
				method: 'POST',
				headers: { 'x-sveltekit-action': 'true' },
				body
			});
			return (await res.json()).type as string;
		},
		{ id: recipeId, date: today }
	);
	expect(scheduled, 'putting the recipe on a day').toBe('success');

	// And what it needs is on the shopping list — which is the whole claim, and
	// the reason the meals week that used to restate it is gone.
	await visit(page, '/inventory/list');
	await expect(page.getByText('leeks')).toBeVisible();
	await expect(page.getByText('potatoes')).toBeVisible();
});

/**
 * Putting a recipe on a day, from the list.
 *
 * There used to be a Meals tab: a read-only week and a copy of the shopping
 * list, with no way to put anything on a day from it. The act it existed for
 * is a button on the recipe now — the same one a workout has — and the week
 * that tab drew is the plan, which draws meals beside everything else.
 */
test('the calendar button on a recipe puts it on a day', async ({ page }) => {
	await register(page, `plan-recipe-${Date.now()}@test.invalid`);

	await visit(page, '/health/recipes');
	await page
		.getByRole('button', { name: /New recipe/ })
		.first()
		.click();
	const create = page.getByRole('dialog');
	await create.locator('[name="heading"]').fill('Leek soup');
	await create.getByRole('button', { name: 'Create' }).click();

	await visit(page, '/health/recipes');
	await page.getByRole('button', { name: 'Put Leek soup on a day' }).click();

	const plan = page.getByRole('dialog');
	await plan.locator('[name="startTime"]').fill('19:30');
	await plan.getByRole('button', { name: 'Put it on the plan' }).click();
	await expect(plan).toBeHidden();

	// It is a block on the plan like anything else, which is the whole claim.
	await visit(page, '/tasks/plan');
	await expect(page.getByText('Leek soup').first()).toBeVisible();
});

/** The tab is gone, and its address goes where the act lives. */
test('the old meals address lands on the recipes', async ({ page }) => {
	await register(page, `meals-gone-${Date.now()}@test.invalid`);
	await visit(page, '/health/meals');
	await expect(page).toHaveURL(/\/health\/recipes/);
});
