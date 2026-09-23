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
	const field = await open(within, name);
	await field.getByRole('option', { name: option }).first().click();
	await shut(field);
}

/**
 * The same, by the value the form will post.
 *
 * For the lists whose words depend on the account — the weekdays, which start
 * where somebody's week starts — where naming the option is naming something
 * the test does not control.
 */
export async function chooseValue(
	within: Page | Locator,
	name: string,
	value: string
): Promise<void> {
	const field = await open(within, name);
	await field.locator(`[role="option"][data-value="${value}"]`).first().click();
	await shut(field);
}

/* The list covers whatever is under it, so nothing else can be pressed until
   it has gone. */
async function shut(field: Locator): Promise<void> {
	await expect(field.getByRole('listbox')).toBeHidden({ timeout: 5000 });
}

async function open(within: Page | Locator, name: string): Promise<Locator> {
	const field = within.locator(`[data-picker="${name}"]`);
	await expect(field).toBeVisible({ timeout: 15_000 });
	await field.getByRole('button').first().click();
	return field;
}
