import { expect, test } from '@playwright/test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { register } from './helpers/account';
import { visit } from './helpers/visit';

/**
 * The daily export allowance.
 *
 * A plain `<a download>` never re-renders the page, so the count only caught up
 * on a reload and nothing stopped a double-click spending two at once. Both are
 * about *when* the page learns what the server already knows.
 */
test('the allowance updates the moment an export lands', async ({ page }) => {
	await register(page, `export-${Date.now()}@test.invalid`);
	await visit(page, '/settings/account');

	const download = page.getByRole('button', { name: /download/i });
	const count = page.getByText(/exports? left today/i);

	await expect(download).toBeEnabled();
	const before = Number((await count.innerText()).match(/^(\d+)/)![1]);

	const file = page.waitForEvent('download');
	await download.click();
	await file;

	// The number changes without a reload, which is the whole complaint.
	await expect(count).toContainText(`${before - 1} of`);

	// And the button is held, so the second click of a double lands on nothing.
	await expect(download).toBeDisabled();
	await expect(download).toBeEnabled({ timeout: 10_000 });
});

/**
 * Moving in, on the page that exists for it.
 *
 * The forms used to sit at the bottom of the account page; what this holds is
 * that they still work where they now live, and that a Keep export — which is
 * a different product from Google Tasks and arrives as one file per note —
 * is recognised as itself.
 */
test('a Google Keep export lands as todos in a notebook of its own', async ({ page }) => {
	await register(page, `import-keep-${Date.now()}@test.invalid`);

	// Reached from the account page rather than by knowing the address.
	await visit(page, '/settings/account');
	await page.getByRole('link', { name: 'Import' }).click();
	await page.waitForURL(/\/settings\/account\/import/);

	const notes = JSON.stringify([
		{ title: 'Shed', listContent: [{ text: 'wood glue', isChecked: false }], isTrashed: false },
		{ title: 'Call the vet', textContent: 'about the booster', isTrashed: false }
	]);

	await page.getByPlaceholder('…or paste the file here').fill(notes);
	// Scoped to its own form: the page has a second import — a vault — with a
	// button of the same name, and it should.
	await page
		.locator('form[action="?/importTasks"]')
		.getByRole('button', { name: 'Import' })
		.click();

	await expect(page.getByText(/Imported 2 into/)).toBeVisible();
	await expect(page.getByText(/Google Keep/).first()).toBeVisible();

	// And they are really there, as todos, in one notebook that undoes it.
	await visit(page, '/diary/notebooks');
	await expect(page.getByText('Google Keep').first()).toBeVisible();
});

/**
 * A vault, chosen as a folder, becoming entries.
 *
 * The folder picker is the part worth driving in a browser: `webkitdirectory`
 * is the only way a browser hands over a tree, and the path it reports —
 * `webkitRelativePath`, not `name` — is what carries the folder that becomes a
 * tag. A test that set the files by name would pass while the structure was
 * quietly lost.
 */
test('an Obsidian vault lands as entries in a notebook of its own', async ({ page }) => {
	await register(page, `import-vault-${Date.now()}@test.invalid`);
	await visit(page, '/settings/account/import');

	const vault = mkdtempSync(join(tmpdir(), 'vault-'));
	mkdirSync(join(vault, 'Books'), { recursive: true });
	writeFileSync(join(vault, 'Books', 'Republic.md'), '# The Republic\n\nBook one. #philosophy\n');
	writeFileSync(join(vault, 'Lisbon.md'), 'Three days. #travel\n');
	writeFileSync(join(vault, 'scratch.md'), '');

	const form = page.locator('form[action="?/importVault"]');
	await form.locator('input[type=file]').setInputFiles(vault);
	await expect(page.getByText('3 notes ready.')).toBeVisible();

	await form.getByRole('button', { name: 'Import' }).click();

	// Two of the three: the empty one is named as left behind rather than
	// silently dropped.
	await expect(page.getByText(/Imported 2 notes into/)).toBeVisible();
	await expect(page.getByText(/scratch\.md/)).toBeVisible();

	await visit(page, '/diary/notebooks');
	await expect(page.getByText('Obsidian').first()).toBeVisible();

	rmSync(vault, { recursive: true, force: true });
});
