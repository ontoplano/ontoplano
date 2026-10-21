import { expect, test, type Page } from '@playwright/test';
import { register, testEmail } from './helpers/account';
import { visit } from './helpers/visit';

/**
 * Deleting an activity, used or not.
 *
 * It used to be offered only for an archived activity that nothing named, so
 * the one you wanted rid of was always the one you could not delete. Now it is
 * offered on every row and always asks first: a dialog that lists what still
 * names the activity, says what will happen to it, and lets it be handed to
 * another activity — an existing one, or one made right there.
 *
 * The account takes the remote-worker week, so "Admin" is on five weekdays
 * and "Walk" is on the plan too.
 */

const row = (page: Page, name: string) =>
	page.locator('.list-row').filter({ has: page.getByText(name, { exact: true }) });
const dialog = (page: Page) => page.getByRole('dialog');

async function openDelete(page: Page, name: string) {
	await row(page, name).getByRole('button', { name: 'Delete activity' }).click();
	await expect(dialog(page)).toBeVisible();
	await page.waitForTimeout(500); // `use:armed`
}

for (const viewport of [
	{ width: 390, height: 844 },
	{ width: 1440, height: 900 }
]) {
	test(`an activity is deleted from its dialog at ${viewport.width}px`, async ({ page }) => {
		test.setTimeout(150_000);
		await page.setViewportSize(viewport);
		await register(page, testEmail(`activity-delete-${viewport.width}`));
		await visit(page, '/calendar/activities');

		// One nothing names: the dialog says so, and Delete removes it.
		await page.getByRole('button', { name: 'New activity' }).first().click();
		await page.locator('#activity-name').fill('Typo');
		await page.getByRole('button', { name: 'Create activity' }).click();
		await expect(row(page, 'Typo')).toHaveCount(1);
		await openDelete(page, 'Typo');
		await expect(dialog(page)).toContainText('Nothing uses it');
		await expect(page.getByTestId('activity-usage')).toHaveCount(0);
		await dialog(page).getByRole('button', { name: 'Delete', exact: true }).click();
		await expect(row(page, 'Typo')).toHaveCount(0);

		// One the plan names, active: listed, explained, and archive offered.
		await openDelete(page, 'Admin');
		const usage = page.getByTestId('activity-usage');
		await expect(usage.locator('li')).not.toHaveCount(0);
		await expect(page.getByTestId('delete-outcome')).toContainText('labelled “Admin”');
		await expect(dialog(page).getByRole('button', { name: 'Archive instead' })).toBeVisible();

		// Nothing in the dialog runs off the side of a phone.
		const overflow = await dialog(page).evaluate((d) => d.scrollWidth - d.clientWidth);
		expect(overflow).toBeLessThanOrEqual(0);
		await page.screenshot({
			path: test.info().outputPath(`activity-delete-${viewport.width}.png`)
		});

		// Handed to an activity made on the spot.
		await page.getByTestId('move-to').selectOption({ label: 'A new activity…' });
		const newName = dialog(page).locator('[name=newName]');
		await expect(newName).toBeFocused();
		await newName.fill('Paperwork');
		await expect(page.getByTestId('delete-outcome')).toContainText('the new activity');
		await dialog(page).getByRole('button', { name: 'Move and delete' }).click();
		await expect(dialog(page)).toBeHidden();
		await expect(row(page, 'Admin')).toHaveCount(0);
		await expect(row(page, 'Paperwork')).toHaveCount(1);

		// What named Admin names Paperwork now, so its dialog lists it.
		await openDelete(page, 'Paperwork');
		await expect(page.getByTestId('activity-usage').locator('li')).not.toHaveCount(0);
		await dialog(page).getByRole('button', { name: 'Keep it' }).click();
		await expect(dialog(page)).toBeHidden();

		// Folded into its category, the default.
		await openDelete(page, 'Walk');
		await dialog(page).getByRole('button', { name: 'Delete', exact: true }).click();
		await expect(row(page, 'Walk')).toHaveCount(0);

		// The blocks keep the name it had.
		await visit(page, '/calendar/calendar?view=week');
		await expect(page.getByText('Walk').first()).toBeVisible();
	});
}
