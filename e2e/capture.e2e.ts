import { expect, test, type Page } from '@playwright/test';
import { register } from './helpers/account';
import { visit } from './helpers/visit';

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
	await visit(page, '/goals');

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
	await visit(page, '/diary/notebooks');

	const at = await centreOf(page);
	await page.mouse.move(at.x, at.y);
	await page.mouse.down();
	await page.mouse.move(at.x, at.y - 4);

	// Wedges run anti-clockwise from six o'clock — the first is under a right
	// thumb — so the second one, Todo, is up and to the right. See
	// `$lib/radial.ts` for why that way round.
	const pie = await pieCentre(page);
	await page.mouse.move(pie.x + 70, pie.y - 40, { steps: 8 });
	await page.mouse.up();

	await expect(page.getByRole('heading', { name: /new todo/i })).toBeVisible();
	await page.locator('input[name=title]').fill('buy a bigger pan');
	await page.getByRole('button', { name: 'Save' }).click();

	await expect(page.getByRole('heading', { name: /new todo/i })).toBeHidden();

	// And it is really there, in the list that owns it.
	await visit(page, '/planner/todo');
	await expect(page.getByText('buy a bigger pan')).toBeVisible();
});

test('the arrow keys reach every wedge, and escape leaves', async ({ page }) => {
	await register(page, `pie-keys-${Date.now()}@test.invalid`);
	await visit(page, '/');

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
	await visit(page, '/');

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
	await visit(page, '/');

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

test('the section pie lands you in the room', async ({ page }) => {
	await register(page, `nav-pie-${Date.now()}@test.invalid`);
	await visit(page, '/');

	const jump = page.getByRole('button', { name: /jump to a section/i });
	const box = await jump.boundingBox();
	await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
	await page.mouse.down();
	await page.mouse.up();

	// Every place the navigation bar offers — including Notebooks and People,
	// which the pie simply did not have while it kept a list of its own. No
	// Home: the bar carries that as a plain button, so no wedge is spent on it.
	await expect(page.getByText('cancel')).toBeVisible();
	for (const room of [
		'Planner',
		'Goals',
		'Diary',
		'People',
		'Notebooks',
		'Ideas',
		'Health',
		'Shopping',
		'Recipes'
	]) {
		await expect(page.locator('.pie').getByText(room, { exact: true })).toBeVisible();
	}
	await expect(page.locator('.pie').getByText('Home', { exact: true })).toHaveCount(0);

	await page.locator('.pie').getByText('Shopping', { exact: true }).click();
	await page.waitForURL(/\/shopping/);
});

test.describe('with a finger', () => {
	test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });

	test('a tap opens the pie and it stays open', async ({ page }) => {
		await register(page, `touch-tap-${Date.now()}@test.invalid`);
		await visit(page, '/');

		/**
		 * A tap is pointerdown, pointerup, *then* a click — and the click landed
		 * on the backdrop the pie had just put under the finger, so the menu
		 * opened and shut in the same gesture. From the outside it simply refused
		 * to open.
		 */
		const box = (await (await trigger(page)).boundingBox())!;
		await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);

		await expect(page.getByText('cancel')).toBeVisible();
		await page.waitForTimeout(400);
		await expect(page.getByText('cancel')).toBeVisible();
	});

	test('the pie is not text you can select', async ({ page }) => {
		await register(page, `touch-select-${Date.now()}@test.invalid`);
		await visit(page, '/');

		const box = (await (await trigger(page)).boundingBox())!;
		await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
		await expect(page.getByText('cancel')).toBeVisible();

		// A long press over a wedge used to start a text selection, which took the
		// gesture away and left the release doing nothing.
		const style = await page.locator('.pie-layer').evaluate((el) => {
			const cs = getComputedStyle(el);
			return { select: cs.userSelect || cs.webkitUserSelect, touch: cs.touchAction };
		});
		expect(style.select).toBe('none');
		expect(style.touch).toBe('none');
	});

	test('the section pie is on the phone, where it was asked for', async ({ page }) => {
		await register(page, `touch-nav-${Date.now()}@test.invalid`);
		await visit(page, '/');

		const jump = page.getByRole('button', { name: /go to a section/i });
		const box = (await jump.boundingBox())!;
		await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);

		/*
		 * The wedges carry icons on a phone, not names.
		 *
		 * The name of the one being aimed at is drawn at the top of the screen
		 * instead: the finger covers the wedge it is on, so the label was the
		 * one thing the gesture depends on and the one thing hidden while it was
		 * being made.
		 *
		 * So this aims at each wedge in turn and collects what the screen said —
		 * which asserts the new behaviour without pinning the order, since the
		 * order is a setting.
		 */
		const wedges = page.locator('.pie [role="menuitem"]');
		const count = await wedges.count();
		expect(count).toBeGreaterThan(4);

		const named: string[] = [];
		for (let i = 0; i < count; i += 1) {
			await wedges.nth(i).hover();
			named.push(((await page.locator('.pie-hud').textContent()) ?? '').trim());
		}

		for (const room of ['Planner', 'Goals', 'Diary', 'Shopping']) {
			expect(named, `${room} was never named while it was aimed at`).toContain(room);
		}

		// Settings and search are not wedges — they are destinations, and they sit
		// in the bar beside the two pies rather than hanging off one.
		await page.keyboard.press('Escape');
		await expect(page.getByRole('link', { name: 'Account' })).toBeVisible();
		await expect(page.getByRole('button', { name: 'Search' })).toBeVisible();
	});
});

/**
 * And the one that writes into a different section.
 *
 * Buy posts to the shopping list rather than to the planner, with its own
 * field name — which is exactly the kind of thing a rename breaks silently:
 * the dialog submits, the action reads a field that is not there, and the
 * only symptom is that nothing was added.
 */
test('the Buy capture actually puts something on the shopping list', async ({ page }) => {
	await register(page, `capture-buy-${Date.now()}@test.invalid`);
	await visit(page, '/');

	await page.getByRole('button', { name: /^Buy/ }).first().click();
	// Not `.first()` — Buy's form leads with a hidden field saying which list.
	await page
		.locator('#capture-form input:not([type=hidden]), #capture-form textarea')
		.first()
		.fill('oat milk');
	await page.getByRole('button', { name: 'Save' }).click();

	await visit(page, '/shopping');
	await expect(page.getByText('oat milk')).toBeVisible();
});
