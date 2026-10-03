import { expect, test, type Page } from '@playwright/test';
import { register, testEmail } from './helpers/account';
import { visit } from './helpers/visit';

/**
 * A task's attributes, and the notebook a task block is filed under.
 *
 * Three promises, each at a phone's width and a desk's. A task given an
 * attribute in its form wears an ⓘ first in its row of actions, and that row
 * still never wraps. The ⓘ opens the attributes, where a value is copied or
 * changed in place without moving the rows under it. And a task block filed
 * in a notebook says so on the grid, under its time.
 */

const WIDTHS = [
	{ name: 'phone', viewport: { width: 390, height: 844 } },
	{ name: 'desk', viewport: { width: 1400, height: 900 } }
] as const;

async function action(page: Page) {
	return { Origin: new URL(page.url()).origin, 'x-sveltekit-action': 'true' };
}

for (const { name, viewport } of WIDTHS) {
	test.describe(`at ${name} width`, () => {
		test.use({ viewport });

		test('a task’s attributes are written in its form and read from the ⓘ', async ({
			page,
			context
		}) => {
			test.setTimeout(150_000);
			await context.grantPermissions(['clipboard-read', 'clipboard-write']);
			await register(page, testEmail(`attrs-${name}`));
			await visit(page, '/tasks/todo');

			// Written in the form, in the fold under the tags.
			await page.getByRole('button', { name: 'New task' }).click();
			const form = page.getByRole('dialog').first();
			await form.locator('[name="heading"]').fill('call the dentist');
			await form.locator('summary', { hasText: 'Attributes' }).click();
			await form.locator('[name="attributeKey"]').first().fill('phone');
			await form.locator('[name="attributeValue"]').first().fill('555 0100');
			await form.getByRole('button', { name: 'Create task' }).click();
			await expect(page.getByText('call the dentist').first()).toBeVisible();

			// The ⓘ leads the row, and the row is still one line.
			const info = page.getByRole('button', { name: 'Show its attributes' });
			await expect(info).toHaveCount(1);
			const row = page.locator('.task-actions').filter({ has: info });
			const tops = await row.evaluate((el) =>
				[...el.children].map((child) => Math.round(child.getBoundingClientRect().top))
			);
			expect(new Set(tops).size, 'the action row wrapped').toBe(1);
			const first = await row.evaluate((el) => el.firstElementChild?.getAttribute('aria-label'));
			expect(first).toBe('Show its attributes');
			expect(await row.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);

			// Copied, whole.
			await info.click();
			const dialog = page.getByRole('dialog', { name: 'Attributes' });
			await dialog.getByRole('button', { name: 'Copy phone' }).click();
			expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('555 0100');

			// Changed in place, and nothing under it moves while it is.
			const hint = dialog.locator('p[aria-live="polite"]');
			const before = (await hint.boundingBox())!.y;
			await dialog.getByRole('button', { name: 'Edit phone' }).click();
			// Within half a pixel: a centred dialog lands on sub-pixel rounding.
			expect(Math.abs((await hint.boundingBox())!.y - before)).toBeLessThan(0.5);
			await dialog.locator('[name="value"]').fill('555 0101');
			await dialog.getByRole('button', { name: 'Save' }).click();
			await expect(dialog.getByText('555 0101')).toBeVisible();

			// Escape closes it, and the list is where it was.
			await page.keyboard.press('Escape');
			await expect(dialog).toHaveCount(0);

			// A task with none carries no ⓘ.
			await page.getByRole('button', { name: 'New task' }).click();
			await page.getByRole('dialog').first().locator('[name="heading"]').fill('plain one');
			await page.getByRole('dialog').first().getByRole('button', { name: 'Create task' }).click();
			await expect(page.getByText('plain one').first()).toBeVisible();
			await expect(page.getByRole('button', { name: 'Show its attributes' })).toHaveCount(1);
		});

		test('a task block in a notebook says so, on the grid and in its dialog', async ({ page }) => {
			test.setTimeout(150_000);
			await register(page, testEmail(`block-nb-${name}`));
			const headers = await action(page);
			await page.request.post('/notebooks?/create', { headers, form: { heading: 'Kitchen' } });

			const today = await page.evaluate(() => {
				const d = new Date();
				return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
			});
			await visit(page, `/tasks/plan?view=day&from=${today}`);

			await page.getByRole('button', { name: 'New task block' }).click();
			const form = page.getByRole('dialog').first();
			await form.getByRole('button', { name: 'Once only' }).click();
			await form.locator('[name="startTime"]').fill('10:00');
			await form.getByRole('button', { name: 'Mode', exact: true }).click();
			await page.getByRole('option', { name: 'Category' }).click();
			await form.locator('[name="label"]').fill('measure the worktop');
			await form.getByRole('button', { name: 'Notebook', exact: true }).click();
			await page.getByRole('option', { name: 'Kitchen' }).click();
			await form.locator('summary', { hasText: 'Attributes' }).click();
			await form.locator('[name="attributeKey"]').first().fill('tape');
			await form.locator('[name="attributeValue"]').first().fill('5m');
			await page.getByRole('button', { name: 'Add one-off' }).click();

			const block = page.locator('.ec-event', { hasText: 'measure the worktop' });
			await expect(block).toBeVisible();
			await expect(block.locator('.ec-event-notebook')).toHaveText('Kitchen');

			// And the dialog it opens says the same two things.
			await block.click();
			const again = page.getByRole('dialog').first();
			await expect(again.getByRole('heading', { name: 'Edit task block' })).toBeVisible();
			await expect(again.getByRole('button', { name: 'Notebook', exact: true })).toContainText(
				'Kitchen'
			);
			await expect(again.locator('[name="attributeKey"]').first()).toHaveValue('tape');
			await expect(again.locator('[name="attributeValue"]').first()).toHaveValue('5m');
		});
	});
}
