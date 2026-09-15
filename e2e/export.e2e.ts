import { expect, test } from '@playwright/test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { register, testEmail } from './helpers/account';
import { visit } from './helpers/visit';

/**
 * The daily export allowance.
 *
 * A plain `<a download>` never re-renders the page, so the count only caught up
 * on a reload and nothing stopped a double-click spending two at once. Both are
 * about *when* the page learns what the server already knows.
 */
test('the allowance updates the moment an export lands', async ({ page }) => {
	await register(page, testEmail('export'));
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
test('a Google Keep export lands as todos and notes in a notebook of its own', async ({ page }) => {
	await register(page, testEmail('import-keep'));

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

	// The checklist line arrived as a task, the text note as a note — and the
	// message says which was which. `.first()`: the toast says it too.
	await expect(page.getByText(/Imported 1 task and 1 note into/).first()).toBeVisible();
	await expect(page.getByText(/Google Keep/).first()).toBeVisible();

	// And they are really there, in one notebook that undoes it.
	await visit(page, '/notebooks');
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
	await register(page, testEmail('import-vault'));
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
	await expect(page.getByText(/Imported 2 notes into/).first()).toBeVisible();
	await expect(page.getByText(/scratch\.md/).first()).toBeVisible();

	await visit(page, '/notebooks');
	await expect(page.getByText('Obsidian').first()).toBeVisible();

	rmSync(vault, { recursive: true, force: true });
});

/**
 * A restore says what it will do before the word that lets it.
 *
 * The preview runs the moment something lands in the box, because a restore
 * empties the account first: whose file it is, what lands, what is left
 * behind, and what would be refused all belong on the screen before REPLACE
 * is typed. And when the file carries something the import refuses, the way
 * through — leave those out, bring in the rest — is offered there rather than
 * discovered as a failure.
 */
test('restoring shows a preview first, and a bad row offers a way through', async ({ page }) => {
	test.setTimeout(120_000);
	await register(page, testEmail('preview'));
	await page.goto('/settings/account/import');

	// A file with one good row and one picture the import will refuse: the
	// bytes say HTML however the row is dressed.
	const doc = Buffer.from('<p>not a picture</p>').toString('base64');
	const file = JSON.stringify({
		exportedAt: '2026-09-01T09:00:00.000Z',
		account: { id: 'x', name: 'Mover', email: 'mover@example.test' },
		data: {
			// The onboarding flag rides along: a restore replaces the settings
			// rows, and an account whose file says nothing about first run looks
			// brand new — the app then bounces to /welcome before the result can
			// be read. A real export always carries it, being a settings row.
			userSettings: [
				{ id: 1, userId: 'x', key: 'ui.tutorialSeen', value: 'true' },
				{ id: 2, userId: 'x', key: 'onboarding.done', value: 'true' }
			],
			ideas: [{ id: 1, userId: 'x', content: 'the idea that travels' }],
			media: [
				{
					id: 1,
					userId: 'x',
					mime: 'image/png',
					filename: 'p.png',
					byteSize: 1,
					sha256: 'x',
					bytes: doc
				}
			]
		}
	});

	const box = page.getByPlaceholder('…or paste the export here');
	await box.fill(file);
	await box.dispatchEvent('input');

	// The preview arrives on its own — nobody pressed anything else.
	await expect(page.getByText(/mover@example\.test/)).toBeVisible({ timeout: 10_000 });
	await expect(page.getByText(/1 ideas/)).toBeVisible();
	await expect(page.getByText(/would refuse/)).toBeVisible();

	// Refusals block the button until they are answered.
	const restore = page.getByRole('button', { name: 'Restore' });
	await expect(restore).toBeDisabled();
	await page.getByText('Leave those out and bring in everything else').click();
	await expect(restore).toBeEnabled();

	await page.locator('[name="confirm"]').fill('REPLACE');
	await restore.click();
	// `.first()`: the sentence appears on the page and in the toast at once.
	await expect(page.getByText(/Imported 3 rows/).first()).toBeVisible({ timeout: 15_000 });
	await expect(page.getByText(/left out on request/).first()).toBeVisible();
});
