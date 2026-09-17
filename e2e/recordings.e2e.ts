import { expect, test } from '@playwright/test';
import { register, testEmail } from './helpers/account';
import { visit } from './helpers/visit';

/**
 * A recording, made in the app and kept.
 *
 * The whole point of this feature is the part a unit test cannot reach: a
 * microphone, a `MediaRecorder`, and a blob that only exists in the page until
 * somebody presses Save. Chromium will fake a microphone on request, which
 * makes the real path — record, pause, stop, hear it, name it, save — a thing
 * that can actually be walked.
 *
 * The service's refusals are `tests/audio.test.ts`; this is the road to them.
 */
test.use({
	// A generated tone instead of hardware, and the permission prompt answered
	// before it is asked — a dialog nothing can click is a hung test.
	launchOptions: {
		args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream']
	},
	permissions: ['microphone']
});

test('records, keeps it under a name, renames it and deletes it', async ({ page }) => {
	await register(page, testEmail('recordings'));
	await visit(page, '/media/audios');

	// The room is Media, and Recordings is the tab it lands on.
	await expect(page.getByRole('heading', { name: 'Media' }).first()).toBeVisible();
	await expect(page.getByText('Nothing recorded yet.')).toBeVisible();

	await page.getByRole('button', { name: 'Record' }).click();

	/*
	 * Pausing gives everything at once.
	 *
	 * It used to be three presses to file one sentence — pause, stop and keep,
	 * save. Pause now hands over the transport, the name and Save together, so
	 * keeping a recording is the second press and Save closes the recording on
	 * its way.
	 */
	const pause = page.getByRole('button', { name: 'Pause', exact: true });
	await expect(pause).toBeVisible();
	await page.waitForTimeout(1500);
	await pause.click();

	// Heard before it is kept: a transport and a scrub bar.
	await expect(page.getByRole('button', { name: 'Play' })).toBeVisible();
	await expect(page.getByRole('slider', { name: 'Where it is playing from' })).toBeVisible();

	/*
	 * The placeholder is the name it will be given.
	 *
	 * Leaving the field alone and typing what it shows have to be the same
	 * act, or the placeholder is telling somebody something untrue — so it is
	 * the timestamp the service falls back to, in the account's own clock.
	 */
	const name = page.getByRole('textbox', { name: 'What to call it' });
	await expect(name).toHaveAttribute('placeholder', /^\d{4}-\d{2}-\d{2}\.\d{2}:\d{2}:\d{2}$/);

	await name.fill('a thing I said');
	await page.getByRole('button', { name: 'Save', exact: true }).click();

	const row = page.locator('li').filter({ hasText: 'a thing I said' });
	await expect(row).toBeVisible();
	// And it plays from its own URL rather than from the blob that made it.
	await expect(row.locator('audio')).toHaveAttribute('src', /^\/media\/audio\/\d+$/);

	/*
	 * Renaming turns the row's name into an input, so the row can no longer be
	 * found by the text it used to show — there is one recording here, and it
	 * is the row.
	 */
	const only = page.locator('ul li').first();
	await only.getByRole('button', { name: 'Rename' }).click();
	await only.getByRole('textbox', { name: 'What to call it' }).fill('what I actually said');
	await only.getByRole('button', { name: 'Save', exact: true }).click();
	await expect(page.locator('ul li').first()).toContainText('what I actually said');

	// Deleting is asked in a dialog, and the dialog's own button answers it.
	await page.locator('ul li').first().getByRole('button', { name: 'Delete' }).click();
	const asked = page.getByRole('dialog');
	await expect(asked).toContainText('Delete this recording?');
	await asked.getByRole('button', { name: 'Delete' }).click();

	await expect(page.getByText('Nothing recorded yet.')).toBeVisible();
});

test('the recording never leaves the page until it is saved', async ({ page }) => {
	await register(page, testEmail('recordings-discard'));
	await visit(page, '/media/audios');

	const posts: string[] = [];
	page.on('request', (one) => {
		if (one.method() === 'POST') posts.push(one.url());
	});

	await page.getByRole('button', { name: 'Record' }).click();
	await page.waitForTimeout(1200);
	await page.getByRole('button', { name: 'Pause', exact: true }).click();
	await page.getByRole('button', { name: 'Discard' }).click();

	// Back to the start, with nothing kept and nothing sent.
	await expect(page.getByRole('button', { name: 'Record' })).toBeVisible();
	await expect(page.getByText('Nothing recorded yet.')).toBeVisible();
	expect(posts.filter((url) => url.includes('/media/audio'))).toEqual([]);
});
