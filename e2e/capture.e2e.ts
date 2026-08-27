import { expect, test, type Page } from '@playwright/test';
import { register } from './helpers/account';

/**
 * The capture pie.
 *
 * Three ways in, and all three have to reach the same four things: click and
 * pick, press and flick, or the arrow keys. The last of those is also the only
 * one a screen reader has, so it is not a nicety.
 *
 * The write itself matters as much as the menu. The pie lives in the shell, so
 * it posts to another route's action from whatever page you happen to be on —
 * which is exactly the part that silently does nothing if it is wrong.
 */
async function trigger(page: Page) {
	return page.getByRole('button', { name: /write something down/i }).first();
}

async function centreOf(page: Page) {
	const box = await (await trigger(page)).boundingBox();
	if (!box) throw new Error('the capture trigger is not on the page');
	return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

/**
 * Where the pie actually is, which is not where the gesture started.
 *
 * It is pushed back on screen so it clears the navigation bar, so a wedge
 * measured from the trigger is a wedge measured from the wrong point — which is
 * how the first version of this test aimed at Todo and hit Note.
 */
async function pieCentre(page: Page) {
	const box = await page.locator('.pie').boundingBox();
	if (!box) throw new Error('the pie is not open');
	return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

test('click the trigger, then pick a wedge', async ({ page }) => {
	await register(page, `pie-click-${Date.now()}@test.invalid`);
	await page.goto('/goals', { waitUntil: 'networkidle' });

	// A tap is not a gesture: the pie stays open and waits to be clicked.
	const at = await centreOf(page);
	await page.mouse.move(at.x, at.y);
	await page.mouse.down();
	await page.mouse.up();

	await expect(page.getByText('cancel')).toBeVisible();
	await page.getByText('Idea', { exact: true }).click();

	await expect(page.getByRole('heading', { name: /new idea/i })).toBeVisible();
});

test('press, flick and release writes the thing', async ({ page }) => {
	await register(page, `pie-drag-${Date.now()}@test.invalid`);

	// Deliberately not the dashboard: the pie's whole point is being reachable
	// from wherever you already are, posting to a route you are not on.
	await page.goto('/diary/notebooks', { waitUntil: 'networkidle' });

	const at = await centreOf(page);
	await page.mouse.move(at.x, at.y);
	await page.mouse.down();
	await page.mouse.move(at.x, at.y - 4);

	// Wedges run clockwise from noon, so the second one — Todo — is down and to
	// the right.
	const pie = await pieCentre(page);
	await page.mouse.move(pie.x + 70, pie.y + 40, { steps: 8 });
	await page.mouse.up();

	await expect(page.getByRole('heading', { name: /new todo/i })).toBeVisible();
	await page.locator('input[name=title]').fill('buy a bigger pan');
	await page.getByRole('button', { name: 'Save' }).click();

	await expect(page.getByRole('heading', { name: /new todo/i })).toBeHidden();

	// And it is really there, in the list that owns it.
	await page.goto('/planner/todo', { waitUntil: 'networkidle' });
	await expect(page.getByText('buy a bigger pan')).toBeVisible();
});

test('the arrow keys reach every wedge, and escape leaves', async ({ page }) => {
	await register(page, `pie-keys-${Date.now()}@test.invalid`);
	await page.goto('/', { waitUntil: 'networkidle' });

	const at = await centreOf(page);
	await page.mouse.move(at.x, at.y);
	await page.mouse.down();
	await page.mouse.up();

	await expect(page.getByText('cancel')).toBeVisible();
	await page.keyboard.press('Escape');
	await expect(page.getByText('cancel')).toBeHidden();

	// Open again and walk to the third wedge: Note.
	await page.mouse.down();
	await page.mouse.up();
	await page.keyboard.press('ArrowRight');
	await page.keyboard.press('ArrowRight');
	await page.keyboard.press('ArrowRight');
	await page.keyboard.press('Enter');

	await expect(page.getByRole('heading', { name: /new note/i })).toBeVisible();
});

test('letting go in the hole does nothing at all', async ({ page }) => {
	await register(page, `pie-cancel-${Date.now()}@test.invalid`);
	await page.goto('/', { waitUntil: 'networkidle' });

	const at = await centreOf(page);
	await page.mouse.move(at.x, at.y);
	await page.mouse.down();
	await page.mouse.move(at.x, at.y - 4);

	// Out to a wedge and back to the hole: the gesture somebody thinks better of.
	const pie = await pieCentre(page);
	await page.mouse.move(pie.x + 80, pie.y - 80, { steps: 6 });
	await page.mouse.move(pie.x, pie.y, { steps: 6 });
	await page.mouse.up();

	await expect(page.locator('dialog[open]')).toHaveCount(0);
	await expect(page.getByText('cancel')).toBeHidden();
});

test('the thumb trigger is for thumbs, and the header one is for cursors', async ({ page }) => {
	await register(page, `pie-where-${Date.now()}@test.invalid`);
	await page.goto('/', { waitUntil: 'networkidle' });

	const triggers = page.getByRole('button', { name: /write something down/i });

	// A scoped rule beat the Tailwind `lg:hidden` it was written beside once, and
	// a 3.25rem black circle appeared in the middle of a 1440px screen.
	await page.setViewportSize({ width: 1440, height: 900 });
	await expect(triggers).toHaveCount(1);
	const wide = await triggers.first().boundingBox();
	expect(wide!.width).toBeLessThan(48);

	await page.setViewportSize({ width: 390, height: 844 });
	await expect(triggers).toHaveCount(1);
	const narrow = await triggers.first().boundingBox();
	expect(narrow!.y).toBeGreaterThan(500);
});
