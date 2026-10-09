import { expect, test, type Locator } from '@playwright/test';
import { register, testEmail } from './helpers/account';
import { visit } from './helpers/visit';

async function expectSplitActions(dialog: Locator, save: string) {
	const footer = dialog.locator('[data-modal-footer]');
	const bounds = (await footer.boundingBox())!;
	const cancel = (await footer.getByRole('button', { name: 'Cancel' }).boundingBox())!;
	const submit = (await footer.getByRole('button', { name: save }).boundingBox())!;
	expect(cancel.x - bounds.x).toBeLessThan(32);
	expect(bounds.x + bounds.width - submit.x - submit.width).toBeLessThan(32);
}

test('shared modal actions span the footer in task, notebook, diary, and plan forms', async ({
	page
}) => {
	await page.setViewportSize({ width: 1440, height: 900 });
	await register(page, testEmail('modal-footer'));

	await visit(page, '/tasks/todo');
	await page.getByRole('button', { name: 'New task' }).first().click();
	await expectSplitActions(page.getByRole('dialog', { name: 'New task' }), 'Create task');

	await visit(page, '/notebooks');
	await page.getByRole('button', { name: 'New notebook' }).first().click();
	const notebook = page.getByRole('dialog', { name: 'New notebook' });
	await expectSplitActions(notebook, 'Create notebook');
	await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
	await page.screenshot({ path: 'test-results/modal-notebook-footer.png' });

	await visit(page, '/notebooks/diary');
	await page.getByRole('button', { name: 'New entry' }).first().click();
	await expectSplitActions(page.getByRole('dialog', { name: 'New entry' }), 'Post entry');

	await visit(page, '/tasks/calendar');
	await page.getByRole('button', { name: 'New task block' }).click();
	await expectSplitActions(
		page.getByRole('dialog', { name: 'New task block' }),
		'Add repeating task block'
	);
});
