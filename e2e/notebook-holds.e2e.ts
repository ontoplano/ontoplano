import { expect, test, type Page } from '@playwright/test';
import { register, testEmail } from './helpers/account';
import { visit } from './helpers/visit';

/**
 * A form offers only the notebooks with a tab for what it files.
 *
 * A task filed into a notebook with no Tasks tab is shown nowhere inside it,
 * and the server refuses it — so the picker must not offer it in the first
 * place. Every filing form draws the same `NotebookField`, so the task form
 * stands for them all.
 */
async function makeNotebook(page: Page, title: string, modules?: string[]) {
	const origin = new URL(page.url()).origin;
	const form = new URLSearchParams({ heading: title });
	for (const one of modules ?? []) form.append('modules', one);
	await page.request.post('/notebooks?/create', {
		headers: {
			Origin: origin,
			'x-sveltekit-action': 'true',
			'content-type': 'application/x-www-form-urlencoded'
		},
		data: form.toString()
	});
}

for (const size of [
	{ name: 'phone', width: 390, height: 844 },
	{ name: 'desktop', width: 1400, height: 900 }
]) {
	test(`the task form does not offer a notebook without a Tasks tab (${size.name})`, async ({
		page
	}) => {
		test.setTimeout(120_000);
		await page.setViewportSize({ width: size.width, height: size.height });
		await register(page, testEmail(`notebook-holds-${size.name}`));
		await visit(page, '/');
		await makeNotebook(page, 'Kitchen');
		await makeNotebook(page, 'Just writing', ['notes']);

		await visit(page, '/tasks/todo');
		await page.getByRole('button', { name: 'New task' }).first().click();
		const picker = page.locator('[data-picker="notebookId"]').first();
		await expect(picker).toBeVisible();
		await picker.getByRole('button').first().click();

		await expect(picker.getByRole('option', { name: 'Kitchen' })).toHaveCount(1);
		await expect(picker.getByRole('option', { name: 'Just writing' })).toHaveCount(0);
		await page.screenshot({ path: `test-results/notebook-holds-${size.name}.png` });
	});
}
