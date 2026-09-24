import { expect, test } from '@playwright/test';
import { register, testEmail } from './helpers/account';
import { visit } from './helpers/visit';

/**
 * The receipt after a quick capture, and the way into what it wrote.
 *
 * Capture writes into a room you are not looking at — that is the whole point
 * of it — so "Added to your to-dos" left somebody to go and find the row again
 * to say anything more about it. On a phone, where most quick adds happen,
 * that is the difference between writing a line and writing the thing
 * properly. The receipt carries an Edit, the Edit is a link into the room with
 * the new row's id on it, and the room opens its own editor from that.
 */
test('the receipt offers Edit, and it opens the thing just written', async ({ page }) => {
	test.setTimeout(180_000);
	await page.setViewportSize({ width: 390, height: 844 });
	await register(page, testEmail('capture-edit'));

	await visit(page, '/');
	// The keyboard's way in, rather than the press-and-hold wheel: this test is
	// about what the receipt does afterwards, and `capture.e2e` is where the
	// gesture itself is held to account.
	await page.keyboard.press('t');

	const dialog = page.getByRole('dialog');
	await expect(dialog).toBeVisible({ timeout: 30_000 });
	await dialog.locator('[name="heading"]').fill('ring the plumber');
	await dialog.getByRole('button', { name: /Save/ }).click();

	const edit = page.getByRole('button', { name: 'Edit', exact: true });
	await expect(edit).toBeVisible({ timeout: 30_000 });
	await edit.click();

	// The room, with that task's own editor open on it.
	await page.waitForURL(/\/tasks\/todo/);
	await expect(page.locator('#todo-form [name="heading"]')).toHaveValue('ring the plumber', {
		timeout: 30_000
	});

	/*
	 * And the address stops asking once it has been answered. Left in, coming
	 * back to the room later — from the wheel, from the back button — would
	 * open the editor again over whatever somebody was reading.
	 */
	expect(new URL(page.url()).searchParams.get('edit')).toBeNull();
});

test('the quick sheet says where the task would land, once the rest is unfolded', async ({
	page
}) => {
	test.setTimeout(180_000);
	await page.setViewportSize({ width: 390, height: 844 });
	await register(page, testEmail('capture-place'));

	await visit(page, '/');
	await page.keyboard.press('t');
	await expect(page.getByRole('dialog')).toBeVisible({ timeout: 30_000 });

	/*
	 * A sheet that asks for three numbers and says nothing about what they do
	 * is asking for three numbers. It is the same claim the full editor makes
	 * at its foot, and it is behind the fold because the sheet's whole point is
	 * that one line is enough.
	 */
	const place = page.getByText(/in line/);
	await expect(place).toHaveCount(1);

	await page
		.getByText(/Category, notebook/)
		.first()
		.click();
	await expect(place).toBeVisible({ timeout: 10_000 });
});
