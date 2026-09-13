import { expect, test } from '@playwright/test';
import { register } from './helpers/account';
import { visit } from './helpers/visit';

/**
 * Changing tab, on a phone: a swipe does it, and it moves.
 *
 * This is the only transition in the app. There was a dissolve over every
 * navigation once and it never earned its place; a row of tabs is the one
 * place where a movement says something true, because going right along the
 * row should look like going right.
 *
 * The gesture matters more than the animation, and it is the part that can
 * silently stop working: the page's own scroll has to win unless the swipe is
 * clearly across it, and the first cut of this handed every gesture to the
 * first ancestor wider than its box — which on a phone is every card, since
 * they all pull out past the column they stand in.
 */
/**
 * A finger, as the browser itself would report one.
 *
 * Through the devtools protocol rather than `dispatchEvent`, and that is not a
 * detail: a hand-made event is delivered whatever the browser thinks the
 * gesture is, while a real one is subject to the browser deciding partway
 * through that this is a scroll. The first cut of the swipe listened for
 * `pointerup`, which a real browser never sends once it has claimed the touch
 * — so every test here passed and nothing happened on the phone.
 */
async function finger(
	page: import('@playwright/test').Page,
	from: { x: number; y: number },
	to: { x: number; y: number }
) {
	const cdp = await page.context().newCDPSession(page);
	const point = (p: { x: number; y: number }) => [{ x: p.x, y: p.y, id: 1 }];
	await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: point(from) });
	for (let i = 1; i <= 4; i++)
		await cdp.send('Input.dispatchTouchEvent', {
			touchPoints: point({
				x: from.x + ((to.x - from.x) * i) / 4,
				y: from.y + ((to.y - from.y) * i) / 4
			}),
			type: 'touchMove'
		});
	await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
	await cdp.detach();
	await page.waitForTimeout(900);
}

async function swipe(page: import('@playwright/test').Page, from: number, to: number) {
	await finger(page, { x: from, y: 400 }, { x: to, y: 410 });
}

test.describe('on a phone', () => {
	test.use({ viewport: { width: 390, height: 800 }, hasTouch: true, isMobile: true });

	test('a sideways swipe walks the tabs, both ways', async ({ page }) => {
		test.setTimeout(180_000);
		await register(page, `tabs-${Date.now()}@test.invalid`);
		await visit(page, '/finance/ledgers');

		await swipe(page, 320, 100);
		await expect(page).toHaveURL(/\/finance\/bills/);

		await swipe(page, 100, 320);
		await expect(page).toHaveURL(/\/finance\/ledgers/);

		// And it stops at the end rather than wrapping round.
		await swipe(page, 100, 320);
		await expect(page).toHaveURL(/\/finance\/ledgers/);
	});

	/**
	 * The whole point of listening on the shell.
	 *
	 * A room is as tall as its content and the rest of the screen is page, so a
	 * swipe down there was landing on nothing. "I can't switch tabs by dragging
	 * the screen — I want to SWIPE the screen ANYWHERE" was exactly this.
	 */
	test('a swipe below the content is still a swipe', async ({ page }) => {
		test.setTimeout(180_000);
		await register(page, `tabs-low-${Date.now()}@test.invalid`);
		await visit(page, '/finance/ledgers');

		/*
		 * The lowest point that is still the page rather than something over it,
		 * tested at the x the finger actually starts from. The bottom bar, the
		 * safe area and the help dock's own button all sit inside the bottom of
		 * `main` — that button is what the first version of this landed on, from
		 * a hundred pixels to the left of where it was looking.
		 */
		/*
		 * Just under the room's content, which is where the page stops drawing
		 * and the shell keeps going — far above the bottom bar and the help
		 * dock's button, both of which sit inside the bottom of `main`.
		 *
		 * The swipe is listened for on the shell, not on the room's own box: a
		 * room is as tall as its content, and a swipe over the page below it is
		 * still a swipe. That was the complaint — "I can't switch tabs by
		 * dragging the screen" — and listening on the content only half worked.
		 */
		const low = await page.evaluate(() => {
			const pane = document.querySelector('main .slide-frame > div')!;
			return Math.ceil(pane.getBoundingClientRect().bottom) + 30;
		});
		expect(low).toBeLessThan(700);

		await finger(page, { x: 300, y: low }, { x: 60, y: low });
		await expect(page).toHaveURL(/\/finance\/bills/);
	});

	test('a short or diagonal gesture is a scroll, not a tab change', async ({ page }) => {
		test.setTimeout(180_000);
		await register(page, `tabs-scroll-${Date.now()}@test.invalid`);
		await visit(page, '/finance/ledgers');

		// Too short to mean anything.
		await swipe(page, 320, 290);
		await expect(page).toHaveURL(/\/finance\/ledgers/);

		// Long, but mostly downwards: that is the page scrolling.
		await finger(page, { x: 320, y: 200 }, { x: 220, y: 500 });
		await expect(page).toHaveURL(/\/finance\/ledgers/);
	});

	/**
	 * A card reaches both edges of the screen, and the tab frame clips at the
	 * screen edge rather than at its own padding — otherwise the slide's clip
	 * shaves the gutter off every card in the app.
	 */
	test('the tab frame does not eat the card bleed', async ({ page }) => {
		test.setTimeout(180_000);
		await register(page, `tabs-bleed-${Date.now()}@test.invalid`);
		const origin = new URL(page.url()).origin;
		await page.request.post('/notebooks?/create', {
			headers: { Origin: origin, 'x-sveltekit-action': 'true' },
			form: { heading: 'Kitchen renovation and the whole downstairs' }
		});
		await visit(page, '/notebooks');

		const card = (await page.locator('.shadow-card').first().boundingBox())!;
		expect(card.x).toBeLessThanOrEqual(1);
		expect(card.x + card.width).toBeGreaterThanOrEqual(389);

		// And nothing sticks out sideways.
		expect(
			await page.evaluate(
				() => document.documentElement.scrollWidth - document.documentElement.clientWidth
			)
		).toBeLessThanOrEqual(0);
	});
});

test.describe('the strip itself', () => {
	test.use({ viewport: { width: 330, height: 800 }, hasTouch: true, isMobile: true });

	test('exactly one tab is lit, on a page that is under one of them', async ({ page }) => {
		test.setTimeout(180_000);
		await register(page, `tabs-lit-${Date.now()}@test.invalid`);

		// Notebooks' first tab is the room's own root, so every page in the room
		// starts with its path — and the strip used to underline both it and the
		// tab you were actually on.
		for (const [path, lit] of [
			['/notebooks/ideas', 'Ideas'],
			['/notebooks/diary', 'Diary'],
			['/notebooks', 'Notebooks']
		]) {
			await visit(page, path);
			const current = page
				.getByRole('navigation', { name: 'Notebooks sections' })
				.locator('[aria-current="page"]');
			await expect(current).toHaveCount(1);
			await expect(current).toHaveText(lit);
		}
	});

	/**
	 * A row that continues says so by fading its own letters out.
	 *
	 * It used to draw a chevron — a button in a strip whose point is that you
	 * drag it — over a rectangle of the page's ground, which had to guess the
	 * colour underneath and never matched.
	 */
	test('the end of the row fades, and there is nothing painted over it', async ({ page }) => {
		test.setTimeout(180_000);
		await register(page, `tabs-fade-${Date.now()}@test.invalid`);
		await visit(page, '/notebooks/ideas');

		const strip = page.getByRole('navigation', { name: 'Notebooks sections' });
		await expect(strip).toHaveAttribute('data-more', 'right');

		const painted = await strip.evaluate((el) => {
			const mask = getComputedStyle(el).maskImage;
			const after = getComputedStyle(el, '::after').backgroundImage;
			return { mask, after };
		});
		expect(painted.mask).toContain('gradient');
		expect(painted.after).toBe('none');

		// And the tab under the fade is still a tab.
		await strip.getByRole('link', { name: 'Weekly notes' }).click();
		await expect(page).toHaveURL(/\/notebooks\/weekly/);
	});
});

/**
 * Rooms are a row too, in the order they sit in the menu.
 *
 * Wide enough that the navigation is on the page, with a touch pointer so the
 * movement applies: what is being checked is the movement, not the breakpoint.
 */
test.describe('between rooms', () => {
	test.use({ viewport: { width: 1100, height: 800 }, hasTouch: true });

	test('the screen leaving goes one way and the one arriving comes the other', async ({ page }) => {
		test.setTimeout(180_000);
		await register(page, `rooms-${Date.now()}@test.invalid`);
		await visit(page, '/tasks/plan');

		/*
		 * Everything the two screens do, recorded as they do it.
		 *
		 * Not a sample at a chosen moment: the movement is a quarter of a second
		 * long, and a machine running the whole suite can miss that window
		 * entirely. This watches every frame and keeps the extremes, so the
		 * assertions are about what happened rather than about when it was
		 * looked at.
		 */
		await page.evaluate(() => {
			const seen = {
				leavingX: 0,
				arrivingX: 0,
				leavingDip: 0,
				tilted: false
			};
			(window as unknown as { __moved: typeof seen }).__moved = seen;

			const watch = () => {
				const frame = document.querySelector('main .slide-frame');
				if (frame) {
					const rest = frame.getBoundingClientRect();
					const middle = rest.top + rest.height / 2;
					const read = (el: Element | null) => {
						if (!el) return null;
						const r = el.getBoundingClientRect();
						return {
							x: r.left - rest.left,
							// The centre, because a tilted box grows: its top edge rises
							// even while the thing itself is on its way down.
							dip: r.top + r.height / 2 - middle,
							tilt: new DOMMatrixReadOnly(getComputedStyle(el).transform).b
						};
					};
					const leaving = read(document.querySelector('main .slide-stage > div'));
					const arriving = read(document.querySelector('main .slide-frame > div'));
					if (leaving) {
						if (leaving.x > seen.leavingX) seen.leavingX = leaving.x;
						if (leaving.dip > seen.leavingDip) seen.leavingDip = leaving.dip;
						if (leaving.tilt !== 0) seen.tilted = true;
					}
					if (arriving && arriving.x < seen.arrivingX) seen.arrivingX = arriving.x;
				}
				requestAnimationFrame(watch);
			};
			requestAnimationFrame(watch);
		});

		// Health sits after Tasks in the menu, and the room movement runs against
		// the menu on purpose — so the screen leaving goes right and the one
		// arriving comes from the left. The opposite of a tab change, which has a
		// finger behind it to follow.
		await page.locator('a[href="/health/habits"]:visible').first().click();
		await page.waitForTimeout(600);

		const moving = await page.evaluate(
			() => (window as unknown as { __moved: Record<string, number | boolean> }).__moved
		);

		// Both of them, and the whole way: a quarter of the width with a fade
		// read as a wobble rather than as one screen replacing another.
		expect(moving.leavingX).toBeGreaterThan(100);
		expect(moving.arrivingX).toBeLessThan(-100);

		/*
		 * And round, not across. The rooms come off the menu wheel, so a screen
		 * on its way out sinks and tilts as it goes rather than sliding level —
		 * which is the difference between this and a tab change.
		 */
		expect(moving.leavingDip).toBeGreaterThan(0);
		expect(moving.tilted).toBe(true);

		// And nothing is left over.
		await page.waitForTimeout(600);
		expect(
			await page.evaluate(() => document.querySelectorAll('main .slide-stage > div').length)
		).toBe(0);
		expect(
			await page.evaluate(() => {
				const pane = document.querySelector('main .slide-frame > div')!;
				const m = new DOMMatrixReadOnly(getComputedStyle(pane).transform);
				return Math.abs(m.m41) + Math.abs(m.m42) + Math.abs(m.b);
			})
		).toBe(0);
	});

	test('changing tab inside a room does not also slide the room', async ({ page }) => {
		test.setTimeout(180_000);
		await register(page, `rooms-tab-${Date.now()}@test.invalid`);
		await visit(page, '/finance/ledgers');

		await page
			.getByRole('navigation', { name: 'Finance sections' })
			.getByRole('link', {
				name: 'Rules'
			})
			.click();
		await page.waitForTimeout(120);

		// One copy on the way out — the room's tab pane — and not two.
		expect(
			await page.evaluate(() => document.querySelectorAll('main .slide-stage > div').length)
		).toBeLessThanOrEqual(1);
	});
});

test.describe('with a mouse', () => {
	test.use({ viewport: { width: 1280, height: 820 } });

	test('the tabs are still links, and the room still says which one', async ({ page }) => {
		test.setTimeout(120_000);
		await register(page, `tabs-desk-${Date.now()}@test.invalid`);
		await visit(page, '/finance/ledgers');

		const strip = page.getByRole('navigation', { name: 'Finance sections' });
		await expect(strip.getByRole('link', { name: 'Ledgers' })).toHaveAttribute(
			'aria-current',
			'page'
		);
		await strip.getByRole('link', { name: 'Rules' }).click();
		await expect(page).toHaveURL(/\/finance\/rules/);
		await expect(strip.getByRole('link', { name: 'Rules' })).toHaveAttribute(
			'aria-current',
			'page'
		);
	});

	/** An open notebook is still under Notebooks, which is not an exact match. */
	test('a page inside a tab keeps that tab lit', async ({ page }) => {
		test.setTimeout(120_000);
		await register(page, `tabs-deep-${Date.now()}@test.invalid`);
		const origin = new URL(page.url()).origin;
		await page.request.post('/notebooks?/create', {
			headers: { Origin: origin, 'x-sveltekit-action': 'true' },
			form: { heading: 'Reading' }
		});
		await visit(page, '/notebooks');
		await page.getByRole('link', { name: /Open/ }).first().click();
		await expect(page).toHaveURL(/\/notebooks\/\d+/);
		await expect(
			page.getByRole('navigation', { name: 'Notebooks sections' }).getByRole('link', {
				name: 'Notebooks'
			})
		).toHaveAttribute('aria-current', 'page');
	});
});
