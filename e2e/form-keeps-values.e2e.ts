import { expect, test, type Page } from '@playwright/test';
import { register, testEmail } from './helpers/account';
import { visit } from './helpers/visit';

/**
 * Pressing Save does not empty the form in front of you.
 *
 * SvelteKit's `update()` resets a form and then waits for the page's data to
 * come back, and every dialog here closes after `update()` — so the dialog
 * stood open with its fields blank for a round trip. Edit notebook's title
 * did it; so had others, each fixed on its own with `reset: false` until the
 * next form was written the ordinary way. `$lib/enhance` now resets once the
 * handler is done, which this holds for a form that never opted out.
 */

/** How long the server takes to answer, so a blank field would be on screen. */
const SLOW_ANSWER_MS = 800;

/** Every value the field shows, one per frame, while `act` runs. */
async function watchField(page: Page, selector: string, act: () => Promise<void>) {
	await page.evaluate((sel) => {
		const seen: string[] = [];
		(window as unknown as { seen: string[] }).seen = seen;
		const tick = () => {
			const field = document.querySelector<HTMLTextAreaElement>(sel);
			if (!field) return;
			seen.push(field.value);
			requestAnimationFrame(tick);
		};
		tick();
	}, selector);
	await act();
	return page.evaluate(() => (window as unknown as { seen: string[] }).seen);
}

test('saving Edit notebook never shows its title empty', async ({ page }) => {
	test.setTimeout(180_000);
	await register(page, testEmail('form-keeps-values'));
	await visit(page, '/notebooks');

	await page
		.getByRole('button', { name: /New notebook/ })
		.first()
		.click();
	const creating = page.getByRole('dialog', { name: 'New notebook' });
	await creating.locator('[name="heading"]').fill('Kitchen');
	await creating.getByRole('button', { name: /Create/ }).click();
	await expect(creating).toBeHidden({ timeout: 30_000 });

	await page.getByRole('button', { name: 'Edit Kitchen' }).first().click();
	const dialog = page.getByRole('dialog', { name: 'Edit notebook' });
	const title = 'dialog[open] [name="heading"]';
	await page.locator(title).fill('Kitchen renovation');

	// Only the form's own post: its action is a query, `?/update`.
	await page.route(
		(url) => url.search.startsWith('?/'),
		async (route) => {
			await new Promise((done) => setTimeout(done, SLOW_ANSWER_MS));
			await route.continue();
		}
	);
	const seen = await watchField(page, title, async () => {
		// The dialog steps away on the press, so it is the answer that ends
		// the round trip being watched — and the slowed route has to be done
		// with before it is taken away.
		const answered = page.waitForResponse((response) => response.url().includes('?/update'));
		await dialog.getByRole('button', { name: 'Save', exact: true }).click();
		await expect(dialog).toBeHidden({ timeout: 30_000 });
		await answered;
	});

	expect(seen.length).toBeGreaterThan(0);
	expect(seen.filter((value) => value !== 'Kitchen renovation')).toEqual([]);

	// And a form that is meant to be emptied still is: New notebook opens blank.
	// Once the save has finished — the new title is drawn when the page's data
	// is back: a press while the answer is still being applied lands on the
	// Edit dialog that is stepping away.
	// Waiting for a handler still holding a request, which would otherwise
	// throw "already handled" when it continues one the route no longer owns.
	await page.unrouteAll({ behavior: 'wait' });
	await expect(
		page.getByRole('heading', { level: 1, name: /^Kitchen renovation\b/ })
	).toBeVisible();
	await page
		.getByRole('button', { name: /New notebook/ })
		.first()
		.click();
	await expect(page.locator(title)).toHaveValue('');
});
