import { expect, test } from '@playwright/test';
import { register, testEmail } from './helpers/account';
import { visit } from './helpers/visit';

/**
 * A recording attached to something written.
 *
 * The note and the idea forms both offer it, because both are places somebody
 * has something to say and typing it is the slow way. What lands in the text
 * is an ordinary markdown link; what renders is a player.
 */
test.use({
	launchOptions: {
		args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream']
	},
	permissions: ['microphone']
});

test('records into a note, and the note plays it back', async ({ page }) => {
	test.setTimeout(120_000);
	await register(page, testEmail('note-audio'));
	await visit(page, '/notebooks/diary');

	await page
		.getByRole('button', { name: /new entry/i })
		.first()
		.click();
	// "Record one" is already the answer: it starts recording rather than
	// opening a screen with a Record button in it.
	await page.getByRole('button', { name: 'Record one' }).click();
	await page.waitForTimeout(1200);
	await page.getByRole('button', { name: 'Pause', exact: true }).click();
	await page.getByRole('textbox', { name: 'What to call it' }).fill('said aloud');
	await page.getByRole('button', { name: 'Save', exact: true }).click();

	/*
	 * The line it wrote is the shape everything else reads.
	 *
	 * Given room for the upload rather than the default five seconds: the line
	 * only appears once the audio is stored and has an id, and on a loaded CI
	 * runner that is a network round trip with a blob on it. `pictures.e2e`
	 * waits twenty for the same reason, on a file a fraction of the size.
	 */
	const box = page.locator('textarea[name="content"]').first();
	await expect(box).toHaveValue(/\[said aloud\]\(\/media\/audio\/\d+\)/, { timeout: 20_000 });

	await box.fill(`Before it.\n\n${await box.inputValue()}`);
	await page.getByRole('button', { name: 'Post entry' }).click();

	// And it comes back as a player rather than a link to a file.
	await expect(page.locator('audio.md-audio').first()).toBeVisible();
	await expect(page.locator('audio.md-audio').first()).toHaveAttribute(
		'src',
		/^\/media\/audio\/\d+$/
	);
});

test('an idea takes one too', async ({ page }) => {
	await register(page, testEmail('idea-audio'));
	await visit(page, '/notebooks/ideas');

	// Whichever way this page offers to write one.
	await page
		.getByRole('button', { name: /new idea|add an idea|capture|^\+$/i })
		.first()
		.click();

	await page.getByRole('button', { name: 'Record one' }).click();
	await page.waitForTimeout(1100);
	await page.getByRole('button', { name: 'Pause', exact: true }).click();
	await page.getByRole('button', { name: 'Save', exact: true }).click();

	// Unnamed, so it is filed under the moment — and the line still lands.
	await expect(page.locator('textarea[name="content"]').first()).toHaveValue(
		/\[\d{4}-\d{2}-\d{2}\.\d{2}:\d{2}:\d{2}\]\(\/media\/audio\/\d+\)/
	);
});
