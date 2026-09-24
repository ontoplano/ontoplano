import { expect, test, type Page } from '@playwright/test';
import { register, testEmail } from './helpers/account';
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
	/*
	 * After it has stopped moving.
	 *
	 * The wheel grows out of the button that opened it, so for the first fifth
	 * of a second it is small and sitting over that button — and a box measured
	 * then has its middle nowhere near where the wheel is going to be. Every
	 * gesture in this file is aimed from this point, so measuring it early aims
	 * them at a wedge and the test releases on something it meant to avoid.
	 */
	await page
		.locator('[data-pie="capture"] .pie')
		.evaluate((el) => Promise.all(el.getAnimations().map((a) => a.finished)));
	const box = await page.locator('[data-pie="capture"] .pie').boundingBox();
	if (!box) throw new Error('the pie is not open');
	return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

/**
 * Point at each wedge until the HUD announces the name, then click it.
 *
 * The wedges say their icon alone; the name is said once, large, at the top
 * of the screen — so a test finds a wedge the way a person does. The HUD sets
 * the letters in capitals; the comparison folds case rather than matching
 * style. Returns whether the name was ever announced.
 */
async function pickWedge(page: Page, name: string, wheel = 'capture'): Promise<boolean> {
	// Which wheel: the plus opens two, and the rooms wheel is a third. Each
	// layer carries its own name, so a helper shared between them has to be
	// told which one it is pointing at.
	const wedges = page.locator(`[data-pie="${wheel}"] [role=menuitem]`);
	// The name alone: the rooms wheel also says what is inside the room under
	// it, and that line is not what a wedge is called.
	const hud = page.locator(`[data-pie="${wheel}"] .pie-hud-name`);
	// Nothing is named until a wedge is pointed at, and an absent element has
	// no `innerText` to read.
	const said = async () => ((await hud.allInnerTexts())[0] ?? '').trim().toLowerCase();

	const count = await wedges.count();
	let before = await said();

	for (let i = 0; i < count; i++) {
		await wedges.nth(i).hover();
		/*
		 * Wait for the HUD to answer this wedge rather than reading it flat.
		 *
		 * The name is drawn by the pointer move, so a read in the same tick can
		 * still hold the *previous* wedge's name — and under a loaded parallel
		 * run it usually does. That does not fail here: it fails four lines
		 * later, having clicked a wedge that never announced itself, with the
		 * wrong dialogue open and a message about a heading. Waiting for the
		 * text to change is what makes "point at it, then read it" true.
		 */
		const from = before;
		try {
			await expect.poll(said, { timeout: 3000 }).not.toBe(from);
		} catch {
			// It never answered: not this wedge, or not this pointer. Move on.
			continue;
		}
		before = await said();
		if (before === name.toLowerCase()) {
			await wedges.nth(i).click();
			return true;
		}
	}
	return false;
}

test('click the trigger, then pick a wedge', async ({ page }) => {
	await register(page, testEmail('pie-click'));
	await visit(page, '/goals');

	// A tap is not a gesture: the pie stays open and waits to be clicked.
	const at = await centreOf(page);
	await page.mouse.move(at.x, at.y);
	await page.mouse.down();
	await page.mouse.up();

	await expect(page.locator('[data-pie="capture"] .pie-hole')).toBeVisible();
	expect(await pickWedge(page, 'Idea'), 'no wedge announced itself as Idea').toBe(true);

	await expect(page.getByRole('heading', { name: /new idea/i })).toBeVisible();
});

test('press, flick and release writes the thing', async ({ page }) => {
	await register(page, testEmail('pie-drag'));

	// Deliberately not the dashboard: the pie's whole point is being reachable
	// from wherever you already are, posting to a route you are not on.
	await visit(page, '/notebooks');

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

	await expect(page.getByRole('heading', { name: /new task/i })).toBeVisible();
	await page.locator('[name=heading]').fill('buy a bigger pan');
	await page.getByRole('button', { name: 'Save' }).click();

	await expect(page.getByRole('heading', { name: /new task/i })).toBeHidden();

	// And it is really there, in the list that owns it.
	await visit(page, '/tasks/todo');
	await expect(page.getByText('buy a bigger pan')).toBeVisible();
});

test('the arrow keys reach every wedge, and escape leaves', async ({ page }) => {
	await register(page, testEmail('pie-keys'));
	await visit(page, '/');

	const at = await centreOf(page);
	await page.mouse.move(at.x, at.y);
	await page.mouse.down();
	await page.mouse.up();

	await expect(page.locator('[data-pie="capture"] .pie-hole')).toBeVisible();
	await page.keyboard.press('Escape');
	await expect(page.locator('[data-pie="capture"] .pie-hole')).toBeHidden();

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
	await register(page, testEmail('pie-cancel'));
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
	await expect(page.locator('[data-pie="capture"] .pie-hole')).toBeHidden();
});

test('the thumb trigger is for thumbs, and the header one is for cursors', async ({ page }) => {
	await register(page, testEmail('pie-where'));
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
	await register(page, testEmail('nav-pie'));
	await visit(page, '/');

	const jump = page.getByRole('button', { name: /jump to a section/i });
	const box = await jump.boundingBox();
	await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
	await page.mouse.down();
	await page.mouse.up();

	// Every place the navigation bar offers, each announcing itself through
	// the HUD when pointed at. No People or Recipes wedge: they are tabs
	// inside Notebooks and Health now, not rooms of their own. No Home either
	// — the bar carries that as a plain button, so no wedge is spent on it.
	await expect(page.locator('[data-pie="rooms"] .pie-hole')).toBeVisible();
	const wedges = page.locator('[data-pie="rooms"] [role=menuitem]');
	const announced: string[] = [];
	for (let i = 0; i < (await wedges.count()); i++) {
		await wedges.nth(i).hover();
		announced.push(
			(await page.locator('[data-pie="rooms"] .pie-hud-name').innerText()).trim().toLowerCase()
		);
	}
	for (const room of ['Tasks', 'Goals', 'Notebooks', 'Health', 'Finance', 'Inventory']) {
		expect(announced).toContain(room.toLowerCase());
	}
	expect(announced).not.toContain('home');

	expect(await pickWedge(page, 'Inventory', 'rooms')).toBe(true);
	await page.waitForURL(/\/inventory/);
});

test.describe('with a finger', () => {
	test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });

	test('a tap opens the pie and it stays open', async ({ page }) => {
		await register(page, testEmail('touch-tap'));
		await visit(page, '/');

		/**
		 * A tap is pointerdown, pointerup, *then* a click — and the click landed
		 * on the backdrop the pie had just put under the finger, so the menu
		 * opened and shut in the same gesture. From the outside it simply refused
		 * to open.
		 */
		const box = (await (await trigger(page)).boundingBox())!;
		await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);

		await expect(page.locator('[data-pie="capture"] .pie-hole')).toBeVisible();
		await page.waitForTimeout(400);
		await expect(page.locator('[data-pie="capture"] .pie-hole')).toBeVisible();
	});

	test('the pie is not text you can select', async ({ page }) => {
		await register(page, testEmail('touch-select'));
		await visit(page, '/');

		const box = (await (await trigger(page)).boundingBox())!;
		await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
		await expect(page.locator('[data-pie="capture"] .pie-hole')).toBeVisible();

		// A long press over a wedge used to start a text selection, which took the
		// gesture away and left the release doing nothing.
		const style = await page.locator('[data-pie="capture"]').evaluate((el) => {
			const cs = getComputedStyle(el);
			return { select: cs.userSelect || cs.webkitUserSelect, touch: cs.touchAction };
		});
		expect(style.select).toBe('none');
		expect(style.touch).toBe('none');
	});

	test('the section pie is on the phone, where it was asked for', async ({ page }) => {
		await register(page, testEmail('touch-nav'));
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
		const wedges = page.locator('[data-pie="rooms"] [role="menuitem"]');
		const count = await wedges.count();
		expect(count).toBeGreaterThan(4);

		const named: string[] = [];
		for (let i = 0; i < count; i += 1) {
			await wedges.nth(i).hover();
			named.push(
				((await page.locator('[data-pie="rooms"] .pie-hud-name').textContent()) ?? '').trim()
			);
		}

		for (const room of ['Tasks', 'Goals', 'Notebooks', 'Inventory']) {
			expect(named, `${room} was never named while it was aimed at`).toContain(room);
		}

		// The account and search are not wedges — they sit in the bar beside the
		// two pies rather than hanging off one. The account's is a button rather
		// than a link: it fans out the five small things, `fan.e2e.ts`.
		await page.keyboard.press('Escape');
		await expect(page.getByRole('button', { name: 'Account and help' })).toBeVisible();
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
	await register(page, testEmail('capture-buy'));
	await visit(page, '/');

	await page.getByRole('button', { name: /^Buy/ }).first().click();
	// Not `.first()` — Buy's form leads with a hidden field saying which list.
	await page
		.locator('#capture-form input:not([type=hidden]), #capture-form textarea')
		.first()
		.fill('oat milk');
	await page.getByRole('button', { name: 'Save' }).click();

	await visit(page, '/inventory');
	// Generous: the capture writes and this page reads, and under a full
	// parallel run the two are not instantaneous.
	await expect(page.getByText('oat milk')).toBeVisible({ timeout: 15_000 });
});

/**
 * A receipt, because nothing on the screen you are looking at changed.
 *
 * Capture exists so you can write something down without going to the room it
 * belongs in. So the dialog closing is the whole of what happens, and on the
 * dashboard — or on whatever page the pie was opened from — nothing moved.
 * That reads as nothing having happened, and the only way to find out was to
 * go and look, which is the work capture was avoiding.
 */
test('a quick add says where the thing went, and quotes it', async ({ page }) => {
	await register(page, testEmail('capture-toast'));
	await visit(page, '/');

	await page.getByRole('button', { name: /^Idea/ }).first().click();
	await page
		.locator('#capture-form input:not([type=hidden]), #capture-form textarea')
		.first()
		.fill('a lathe for the shed');
	await page.getByRole('button', { name: 'Save' }).click();

	// The room it went to, which is the part that cannot be seen from here, and
	// the thing itself, so it is recognisable as the one just written.
	await expect(page.getByText(/Added to your ideas: a lathe for the shed/)).toBeVisible({
		timeout: 15_000
	});
});

/**
 * And the same receipt from the pie, which is a different component.
 *
 * It was a different dialog too, with its own form and its own `enhance` — two
 * copies of one thing, which is how the pie's copy came to have no error
 * banner at all. One dialog now; this is what holds that.
 */
test('the pie says it too, from a page that is not the dashboard', async ({ page }) => {
	await register(page, testEmail('capture-toast-pie'));
	await visit(page, '/tasks/plan');

	await (await trigger(page)).click();
	// The way a person finds a wedge: point at each until the HUD says its name.
	expect(await pickWedge(page, 'Task'), 'no wedge announced itself as Task').toBe(true);

	// Generous: the wheel closes, the dialogue mounts and the options behind it
	// are fetched, and under a full parallel run that is not instant.
	await expect(page.getByRole('heading', { name: /new task/i })).toBeVisible({
		timeout: 30_000
	});
	await page.locator('[name=heading]').fill('ring the dentist');
	await page.getByRole('button', { name: 'Save' }).click();

	await expect(page.getByText(/Added to your to-dos: ring the dentist/)).toBeVisible({
		timeout: 15_000
	});
});
