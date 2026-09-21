import { expect, type Locator, type Page } from '@playwright/test';

/**
 * Choose from one of the app's own dropdowns.
 *
 * A form field that used to be a `<select>` is a `Picker` now — a button that
 * says what is chosen and a list it draws itself — because the popup a browser
 * opens cannot be styled, and on a dark screen it arrived white with the
 * operating system's blue bar across it. `selectOption` has nothing to talk to;
 * this is the same two presses a person makes.
 */
export async function choose(
	within: Page | Locator,
	name: string,
	option: string | RegExp
): Promise<void> {
	const field = within.locator(`[data-picker="${name}"]`);
	await expect(field).toBeVisible({ timeout: 15_000 });
	await field.getByRole('button').first().click();
	await field.getByRole('option', { name: option }).first().click();
}
