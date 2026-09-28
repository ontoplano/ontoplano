import { expect, test, type Page } from '@playwright/test';
import { register, testEmail } from './helpers/account';
import { choose } from './helpers/choose';
import { visit } from './helpers/visit';

/**
 * The gear beside the capture wheel, and what it changes.
 *
 * Which wedges the wheel holds and in what order, and a notebook every capture
 * form starts in — set from the dialog the gear opens, and from Preferences,
 * which is the same form.
 */
async function openWheel(page: Page) {
	const all = page.locator('[data-tour="capture"]');
	let box = null;
	for (let i = 0; i < (await all.count()); i++) {
		const one = await all.nth(i).boundingBox();
		if (one) box = one;
	}
	if (!box) throw new Error('no capture trigger on this screen');
	await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
	await page.mouse.down();
	await page.waitForTimeout(500);
	// A tap, not a drag: the wheel stays open for a press.
	await page.mouse.up();
	await expect(page.locator('.pie-layer .pie')).toHaveCount(1);
}

async function makeNotebook(page: Page, title: string) {
	const origin = new URL(page.url()).origin;
	await page.request.post('/notebooks?/create', {
		headers: { Origin: origin, 'x-sveltekit-action': 'true' },
		form: { heading: title }
	});
}

const wedges = (page: Page) =>
	page
		.locator('[data-wedge]')
		.evaluateAll((all) => all.map((one) => one.getAttribute('data-wedge')));

for (const size of [
	{ name: 'phone', width: 390, height: 844 },
	{ name: 'desktop', width: 1400, height: 900 }
]) {
	test(`the gear sets the wheel's wedges and its notebook (${size.name})`, async ({ page }) => {
		test.setTimeout(120_000);
		await page.setViewportSize({ width: size.width, height: size.height });
		await register(page, testEmail(`capture-settings-${size.name}`));
		await visit(page, '/');
		await makeNotebook(page, 'Kitchen');
		await visit(page, '/');

		await openWheel(page);
		const wheel = await page.locator('.pie-layer .pie').boundingBox();
		const gear = page.getByRole('button', { name: 'Quick capture settings' });
		await expect(gear).toBeVisible();

		// Beside the wheel, not over it.
		const at = (await gear.boundingBox())!;
		expect(at.x + at.width <= wheel!.x || at.x >= wheel!.x + wheel!.width).toBe(true);
		await expect(page.locator('[data-wedge]')).toHaveCount(6);

		await gear.click();
		const dialog = page.getByRole('dialog', { name: 'Quick capture settings' });
		await expect(dialog).toBeVisible();
		await expect(page.locator('.pie-layer')).toHaveCount(0);

		// Down to one: the last cannot be unticked, and says so.
		for (const kind of ['idea', 'buy', 'picture', 'recording', 'todo']) {
			await dialog.locator(`input[name="on"][value="${kind}"]`).uncheck();
		}
		await expect(dialog.locator('input[type="checkbox"][value="note"]')).toHaveCount(0);
		await expect(dialog.getByText('at least one')).toBeVisible();

		// Two on, the note first.
		await dialog.locator('input[name="on"][value="todo"]').check();
		await dialog.getByRole('button', { name: 'Move Note up' }).click();
		await choose(dialog, 'notebookId', 'Kitchen');
		await page.getByRole('button', { name: 'Save', exact: true }).click();
		await expect(dialog).toBeHidden();

		await openWheel(page);
		expect(await wedges(page)).toEqual(['note', 'todo']);
		await page.locator('[data-wedge="todo"]').click();
		const form = page.getByRole('dialog', { name: 'New task' });
		await expect(form).toBeVisible();
		const kitchen = await form.locator('[name="notebookId"]').inputValue();
		expect(Number(kitchen)).toBeGreaterThan(0);
		await page.keyboard.press('Escape');

		// And Preferences shows the same answer, from the same form.
		await visit(page, '/settings/preferences');
		const prefs = page.locator('form[data-tour="prefs-capture"]');
		await expect(prefs.locator('input[type="checkbox"][value="note"]')).toBeChecked();
		await expect(prefs.locator('input[type="checkbox"][value="idea"]')).not.toBeChecked();
		await expect(prefs.locator('[name="notebookId"]')).toHaveValue(kitchen);
	});
}

test('a notebook on screen wins over the main one', async ({ page }) => {
	test.setTimeout(120_000);
	await page.setViewportSize({ width: 390, height: 844 });
	await register(page, testEmail('capture-settings-here'));
	await visit(page, '/');
	await makeNotebook(page, 'Kitchen');
	await makeNotebook(page, 'Garden');

	await visit(page, '/settings/preferences');
	const prefs = page.locator('form[data-tour="prefs-capture"]');
	await choose(prefs, 'notebookId', 'Kitchen');
	await prefs.getByRole('button', { name: 'Save quick capture' }).click();
	await expect(page.getByText('Quick capture saved.')).toBeVisible();

	await visit(page, '/notebooks');
	await page.getByText('Garden').first().click();
	// On a phone the shelf opens it on its own page, named in the address.
	await page.waitForURL(/\/notebooks\/\d+/);
	const garden = new URL(page.url()).pathname.split('/').pop()!;

	await openWheel(page);
	await page.locator('[data-wedge="note"]').click();
	const form = page.getByRole('dialog', { name: 'New note' });
	await expect(form.locator('[name="notebookId"]')).toHaveValue(garden);
});

test('saving a stranger’s notebook is refused', async ({ page }) => {
	await register(page, testEmail('capture-settings-idor'));
	await visit(page, '/');
	const origin = new URL(page.url()).origin;
	const answer = await page.request.post('/settings/preferences?/saveCapture', {
		headers: { Origin: origin, 'x-sveltekit-action': 'true' },
		form: { notebookId: '999999', kind: 'todo', on: 'todo' }
	});
	expect(await answer.text()).toContain('not_found');
});
