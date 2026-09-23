import { expect, type Locator, type Page } from '@playwright/test';

/**
 * Press something, and keep pressing until the page shows it worked.
 *
 * `visit` waits for hydration, but a control the *test* creates — the New
 * button that appears once a notebook exists, a row drawn after a form posts —
 * can be on screen a moment before the code behind it is listening. The click
 * lands on markup, nothing happens, and the test then waits its whole timeout
 * for a form that was never opened. Two suites failed that way on a loaded
 * machine while passing on a quiet one, which is the signature of this rather
 * than of a broken screen.
 *
 * Three specs had already written the retry out inline. This is that, once, so
 * the next spec gets it without its author having first met the flake.
 *
 * The per-attempt wait is generous enough that a slow-but-working press is not
 * mistaken for a lost one: pressing a toggle twice would close what the first
 * press opened, and the retry would have caused the failure it is there to
 * prevent.
 */
export async function pressUntil(page: Page, control: Locator, shows: Locator) {
	await expect(async () => {
		await control.click();
		await expect(shows.first()).toBeVisible({ timeout: 3000 });
	}).toPass({ timeout: 45_000 });
}
