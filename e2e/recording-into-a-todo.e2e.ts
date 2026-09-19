import { expect, test } from '@playwright/test';
import { register, testEmail } from './helpers/account';
import { visit } from './helpers/visit';

/**
 * A recording on a task, and a recording that becomes an idea.
 *
 * "Ring the plumber about the thing behind the boiler" is quicker said than
 * typed, so a to-do takes a recording the way a note and an idea already do —
 * and it comes back as a player rather than as the address of a file.
 *
 * The other half is the moment a recording is finished: going to Ideas
 * afterwards and reaching back for the file is three steps between a thought
 * and writing it down, so the recordings tab offers to make one there and then.
 */
test.use({
	launchOptions: {
		args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream']
	},
	permissions: ['microphone']
});

test('a to-do takes a recording, and plays it back on the row', async ({ page }) => {
	test.setTimeout(120_000);
	await register(page, testEmail('todo-audio'));
	await visit(page, '/tasks/todo');

	await page.getByRole('button', { name: 'New to-do' }).click();
	await page.locator('#todo-form [name="heading"]').fill('ring the plumber');

	// The notes box and its attachment live behind the disclosure on this form.
	const more = page.getByRole('button', { name: /Category, notebook|Urgency, interest/ }).first();
	if (await more.count()) await more.click();

	await page.getByRole('button', { name: 'Record one' }).click();
	await page.waitForTimeout(1200);
	await page.getByRole('button', { name: 'Pause', exact: true }).click();
	await page.getByRole('textbox', { name: 'What to call it' }).fill('what he said');
	await page.getByRole('button', { name: 'Save', exact: true }).click();

	// The line it writes is the same shape a note and an idea get.
	await expect(page.locator('#todo-form textarea[name="notes"]')).toHaveValue(
		/\[what he said\]\(\/media\/audio\/\d+\)/
	);

	await page.getByRole('button', { name: 'Create todo' }).click();
	await expect(page.getByText('ring the plumber').first()).toBeVisible();

	// On the row: a player, and no markdown link left lying in the text.
	// The `<audio>` element itself is the app's transport's engine and is not
	// drawn; what a person sees is the Play button beside the scrubber.
	await expect(page.locator('audio[src^="/media/audio/"]')).toHaveCount(1);
	await expect(page.getByRole('button', { name: 'Play' }).first()).toBeVisible();
	await expect(page.getByText('/media/audio/')).toHaveCount(0);
});

test('a recording just made can become an idea without leaving the page', async ({ page }) => {
	test.setTimeout(120_000);
	await register(page, testEmail('audio-idea'));
	await visit(page, '/media/audios');

	await page.getByRole('button', { name: 'Record' }).first().click();
	await page.waitForTimeout(1200);
	await page.getByRole('button', { name: 'Pause', exact: true }).click();
	await page.getByRole('textbox', { name: 'What to call it' }).fill('the thought');
	await page.getByRole('button', { name: 'Save', exact: true }).click();

	// Offered straight away — as a strip above the list, not a dialog standing
	// over it: this page is where somebody records five things in a row.
	await expect(page.getByText('Recorded the thought.')).toBeVisible();
	await expect(page.locator('#audio-idea-form')).toHaveCount(0);

	await page.getByRole('button', { name: 'Make an idea of it' }).first().click();
	const box = page.locator('#audio-idea-form textarea[name="content"]');
	await expect(box).toBeVisible();
	await expect(box).toHaveValue(/\[the thought\]\(\/media\/audio\/\d+\)/);

	await box.fill(`${await box.inputValue()}\nthe bit I could not say`);
	await page.getByRole('button', { name: 'Keep the idea' }).click();
	await expect(box).toHaveCount(0);

	await visit(page, '/notebooks/ideas');
	await expect(page.getByText('the bit I could not say').first()).toBeVisible();
	await expect(page.locator('audio[src^="/media/audio/"]')).toHaveCount(1);
});

test('an older recording can be made into an idea too', async ({ page }) => {
	test.setTimeout(120_000);
	await register(page, testEmail('audio-idea-old'));
	await visit(page, '/media/audios');

	await page.getByRole('button', { name: 'Record' }).first().click();
	await page.waitForTimeout(1100);
	await page.getByRole('button', { name: 'Pause', exact: true }).click();
	await page.getByRole('button', { name: 'Save', exact: true }).click();

	// Waved away: the recording is kept, the offer goes, nothing was blocked.
	await page.getByRole('button', { name: 'Dismiss' }).click();
	await expect(page.getByText(/^Recorded /)).toHaveCount(0);
	await expect(page.locator('#audio-idea-form')).toHaveCount(0);

	// And the row offers the same thing afterwards, so an old recording is not
	// a lesser one than the one that was just made.
	await page.getByRole('button', { name: 'Make an idea of it' }).first().click();
	await expect(page.locator('#audio-idea-form textarea[name="content"]')).toHaveValue(
		/\(\/media\/audio\/\d+\)/
	);

	// And the composer can be left without making one.
	await page.getByRole('button', { name: 'Not now' }).click();
	await expect(page.locator('#audio-idea-form')).toHaveCount(0);
});
