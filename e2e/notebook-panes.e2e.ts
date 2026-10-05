import { expect, test, type Page } from '@playwright/test';
import { register, testEmail } from './helpers/account';
import { visit } from './helpers/visit';

/**
 * A notebook on the whole screen, on a desk: its column drags wider or
 * narrower, a tab dragged to the right edge opens beside the others, each pane
 * has a × and the bars between them share out the width, and the keys go to
 * the pane last pressed.
 */
async function makeNotebook(page: Page, title: string) {
	const origin = new URL(page.url()).origin;
	await page.request.post('/notebooks?/create', {
		headers: { Origin: origin, 'x-sveltekit-action': 'true' },
		form: { heading: title, modules: 'notes,tasks,goals' }
	});
}

test('the full screen widens, splits into panes, and the keys follow the pane', async ({
	page
}) => {
	await page.setViewportSize({ width: 1600, height: 950 });
	await register(page, testEmail('nb-panes'));
	await makeNotebook(page, 'The kitchen');
	await visit(page, '/notebooks');
	await page.getByRole('button', { name: 'The whole screen' }).first().click();
	const surface = page.locator('dialog.nb-surface[open]');
	await expect(surface).toBeVisible();

	// Wider, by its right edge — and the width is the device's to keep.
	const body = surface.locator('.nb-body');
	const before = (await body.boundingBox())!.width;
	const grip = (await surface.locator('.nb-grip-right').boundingBox())!;
	await page.mouse.move(grip.x + grip.width / 2, grip.y + 300);
	await page.mouse.down();
	await page.mouse.move(grip.x + 200, grip.y + 300, { steps: 5 });
	await page.mouse.up();
	await expect.poll(async () => (await body.boundingBox())!.width).toBeGreaterThan(before + 300);
	expect(await page.evaluate(() => localStorage.getItem('notebook.width'))).not.toBeNull();

	// Goals dragged to the right edge opens beside Notes.
	const strip = surface.locator('nav[aria-label="What this notebook holds"]').first();
	await strip
		.getByRole('button', { name: /Goals/ })
		.dragTo(page.locator('body'), { targetPosition: { x: 1570, y: 500 } });
	const panes = surface.locator('.nb-pane');
	await expect(panes).toHaveCount(2);
	await expect(surface.locator('.nb-pane-active')).toHaveAttribute('aria-label', /Goals/);

	// The divider shares the width out.
	const left = (await panes.nth(0).boundingBox())!.width;
	const bar = (await surface.locator('.nb-divider').boundingBox())!;
	await page.mouse.move(bar.x + bar.width / 2, bar.y + 300);
	await page.mouse.down();
	await page.mouse.move(bar.x + 150, bar.y + 300, { steps: 5 });
	await page.mouse.up();
	await expect
		.poll(async () => (await panes.nth(0).boundingBox())!.width)
		.toBeGreaterThan(left + 100);

	// A press in the left pane gives it the keys: `l` moves its tab, not the other's.
	const box = (await panes.nth(0).boundingBox())!;
	await page.mouse.click(box.x + box.width / 2, box.y + box.height - 20);
	await expect(surface.locator('.nb-pane-active')).toHaveAttribute('aria-label', /Notes/);
	await page.keyboard.press('l');
	await expect(surface.locator('.nb-pane-active')).toHaveAttribute('aria-label', /Tasks/);
	await expect(panes.nth(1)).toHaveAttribute('aria-label', /Goals/);

	// Its × closes a pane, and one tab is left on the screen.
	await panes.nth(1).getByRole('button', { name: 'Close this pane' }).click();
	await expect(surface.locator('.nb-pane')).toHaveCount(0);
	await expect(strip.getByRole('button', { name: /Tasks/ })).toHaveAttribute(
		'aria-current',
		'page'
	);
});
