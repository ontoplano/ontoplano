import { expect, test } from '@playwright/test';
import { register } from './helpers/account';
import { visit } from './helpers/visit';

/** Wait until nothing on the flower is still moving. */
async function settled(page: import('@playwright/test').Page): Promise<void> {
	await page
		.locator('.fan')
		.evaluate((el) => Promise.all(el.getAnimations({ subtree: true }).map((a) => a.finished)));
}

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

/**
 * And the way a phone actually gets between rooms, which is the pie.
 *
 * Worth its own case because the room movement did nothing there for a while
 * and the wide-screen test above was green throughout: on a phone the way
 * between two rooms is the dashboard or the pie, and anywhere that is not a
 * room was being treated as "not a room change" rather than as the hub the
 * wheel turns around. Every hop had the hub at one end, so every hop was
 * discarded.
 */
test.describe('on a phone, through the pie', () => {
	test.use({ viewport: { width: 390, height: 800 }, hasTouch: true, isMobile: true });

	test('picking a room off the pie turns the wheel', async ({ page }) => {
		test.setTimeout(180_000);
		await register(page, `pie-arc-${Date.now()}@test.invalid`);
		await visit(page, '/');

		await page.evaluate(() => {
			const seen = { travelled: 0, tilt: 0 };
			(window as unknown as { __wheel: typeof seen }).__wheel = seen;
			const watch = () => {
				const frame = document.querySelector('main .slide-frame');
				const clone = document.querySelector('main .slide-stage > div');
				if (frame && clone) {
					const rest = frame.getBoundingClientRect();
					seen.travelled = Math.max(
						seen.travelled,
						Math.abs(clone.getBoundingClientRect().left - rest.left)
					);
					seen.tilt = Math.max(
						seen.tilt,
						Math.abs(new DOMMatrixReadOnly(getComputedStyle(clone).transform).b)
					);
				}
				requestAnimationFrame(watch);
			};
			requestAnimationFrame(watch);
		});

		await page
			.locator('nav')
			.last()
			.getByRole('button', { name: 'Go to a section' })
			.dispatchEvent('pointerdown', { pointerId: 1, clientX: 195, clientY: 780 });
		const wedges = page.locator('.pie [role="menuitem"]');
		await expect(wedges.first()).toBeVisible();
		await wedges.nth(3).click();
		await page.waitForTimeout(900);

		const wheel = await page.evaluate(
			() => (window as unknown as { __wheel: { travelled: number; tilt: number } }).__wheel
		);
		// The whole width of the screen, and off level on the way.
		expect(wheel.travelled).toBeGreaterThan(300);
		expect(wheel.tilt).toBeGreaterThan(0);
	});

	/**
	 * Nothing of the old screen is left standing when the new one is there.
	 *
	 * On a wheel, how far a point travels depends on how far it is from the
	 * hub — and the hub is below, so the bottom of the screen moves least. Sized
	 * from the centre, the bottom fell short of the edge and a wedge of the old
	 * screen sat in the corner until its copy was removed a frame later. Very
	 * quick, and ugly.
	 */
	test('the screen that left is off the screen before it is taken away', async ({ page }) => {
		test.setTimeout(180_000);
		await register(page, `pie-clear-${Date.now()}@test.invalid`);
		await visit(page, '/');

		/*
		 * The copy is caught the moment it appears, held still, and walked
		 * through the end of its movement by hand.
		 *
		 * This used to sample the copy's position frame by frame while it moved,
		 * and that cannot be made reliable: the movement is a Web Animation,
		 * which the browser runs on the compositor, while `getBoundingClientRect`
		 * reports what the main thread last worked out. On a loaded machine the
		 * two come apart — the animation's own clock says two thirds through
		 * while the rect still describes the opening frames — and the test fails
		 * for a reason that has nothing to do with the app. Neither a longer wait
		 * nor a better gate helps, because the number read is stale rather than
		 * early.
		 *
		 * Paused, there is one definite position, `getBoundingClientRect` forces
		 * the style that produces it, and the answer is the same on any machine
		 * at any load.
		 */
		await page.evaluate(() => {
			const seen = { worst: -Infinity, samples: 0 };
			(window as unknown as { __clear: typeof seen }).__clear = seen;

			const grab = () => {
				const clone = document.querySelector('main .slide-stage > div');
				const move = clone?.getAnimations?.()[0];
				const span = Number(move?.effect?.getComputedTiming().duration ?? 0);

				const frame = document.querySelector('main .slide-frame');

				if (clone && move && span && frame) {
					move.pause();
					// From where the movement should have cleared the screen
					// through to the end of it, which is when the copy is taken
					// away.
					for (const part of [2 / 3, 0.8, 0.9, 1]) {
						move.currentTime = span * part;

						/*
						 * How much of the old screen is still on the screen.
						 *
						 * Two things make this harder than a rectangle overlap, and
						 * getting either wrong reads as a failure that has nothing
						 * to do with the app.
						 *
						 * The movement is a rotation, so what `getBoundingClientRect`
						 * gives back is the upright box the tilted page fits inside.
						 * Its right edge is a real corner — but on a page two
						 * thousand pixels long that corner is far below the window,
						 * swung out to the right by the tilt and visible to nobody.
						 * Measuring it sideways alone therefore fails on a full room
						 * and passes on an empty one.
						 *
						 * So the four corners are worked out from the transform and
						 * clipped against the window, both axes. What survives is
						 * what a person could actually see of the screen they left.
						 */
						const size = { w: clone.offsetWidth, h: clone.offsetHeight };
						const where = (clone.parentElement as HTMLElement).getBoundingClientRect();
						const style = getComputedStyle(clone);
						const m = new DOMMatrix(style.transform === 'none' ? undefined : style.transform);
						const [ox, oy] = style.transformOrigin.split(' ').map(parseFloat);

						const corners = [
							[0, 0],
							[size.w, 0],
							[size.w, size.h],
							[0, size.h]
						].map(([x, y]) => {
							const p = m.transformPoint(new DOMPoint(x - ox, y - oy));
							return { x: p.x + ox + where.left, y: p.y + oy + where.top };
						});

						// Sutherland–Hodgman, against the four sides of the window.
						const sides: [(p: { x: number; y: number }) => boolean, 'x' | 'y', number][] = [
							[(p) => p.x >= 0, 'x', 0],
							[(p) => p.x <= window.innerWidth, 'x', window.innerWidth],
							[(p) => p.y >= 0, 'y', 0],
							[(p) => p.y <= window.innerHeight, 'y', window.innerHeight]
						];
						let shape = corners;
						for (const [inside, axis, edge] of sides) {
							const kept: { x: number; y: number }[] = [];
							for (let i = 0; i < shape.length; i += 1) {
								const a = shape[i];
								const b = shape[(i + 1) % shape.length];
								const aIn = inside(a);
								const bIn = inside(b);
								if (aIn) kept.push(a);
								if (aIn !== bIn) {
									const t = (edge - a[axis]) / (b[axis] - a[axis]);
									kept.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
								}
							}
							shape = kept;
							if (!shape.length) break;
						}

						const seenWide = shape.length
							? Math.max(...shape.map((p) => p.x)) - Math.min(...shape.map((p) => p.x))
							: 0;
						if (seenWide > seen.worst) seen.worst = seenWide;
						seen.samples += 1;
					}
					// And on its way, so it is retired like any other.
					move.play();
					return;
				}
				requestAnimationFrame(grab);
			};
			requestAnimationFrame(grab);
		});

		await page
			.locator('nav')
			.last()
			.getByRole('button', { name: 'Go to a section' })
			.dispatchEvent('pointerdown', { pointerId: 1, clientX: 195, clientY: 780 });
		const wedges = page.locator('.pie [role="menuitem"]');
		await expect(wedges.first()).toBeVisible();
		await wedges.nth(3).click();
		await page.waitForTimeout(900);

		const clear = await page.evaluate(
			() => (window as unknown as { __clear: { worst: number; samples: number } }).__clear
		);
		expect(clear.samples, 'the movement was never seen').toBeGreaterThan(0);
		// A pixel of slack for rounding; a wedge is tens of them.
		expect(clear.worst).toBeLessThanOrEqual(2);
	});

	/**
	 * The screens either side of the wheel move too.
	 *
	 * Home, Search and the account screen are not rooms, and all three answered
	 * "not a room" — so a hop between any two of them had the same non-answer at
	 * both ends and was discarded. They have places in the row now: the
	 * dashboard is the hub the wheel turns around, and the rest follow it.
	 */
	test('the dashboard and the screens beside the wheel are places too', async ({ page }) => {
		test.setTimeout(180_000);
		await register(page, `bar-arc-${Date.now()}@test.invalid`);
		await visit(page, '/');

		await page.evaluate(() => {
			const seen = { travelled: 0 };
			(window as unknown as { __bar: typeof seen }).__bar = seen;
			const watch = () => {
				const frame = document.querySelector('main .slide-frame');
				const clone = document.querySelector('main .slide-stage > div');
				if (frame && clone)
					seen.travelled = Math.max(
						seen.travelled,
						Math.abs(clone.getBoundingClientRect().left - frame.getBoundingClientRect().left)
					);
				requestAnimationFrame(watch);
			};
			requestAnimationFrame(watch);
		});

		// Through the bar, which is a client navigation — `visit` reloads the
		// page, and a reload is not a move along anything.
		// The account is not a link in the bar any more: the last button opens
		// the flower of small things, and the account is the one in its middle.
		await page.locator('nav').last().getByRole('button', { name: 'Account and help' }).click();
		await settled(page);
		await page.getByRole('menuitem', { name: 'Account' }).click();
		await page.waitForTimeout(700);

		const moved = await page.evaluate(
			() => (window as unknown as { __bar: { travelled: number } }).__bar.travelled
		);
		expect(moved).toBeGreaterThan(100);
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

/**
 * A screen that loads slower than the slide still ARRIVES.
 *
 * Both halves of the movement run at the press: the old room's copy leaves,
 * and the empty panel comes in behind it. When the data outlives that slide,
 * the room used to be revealed in place — a screen appearing out of nowhere
 * after its neighbour left in an arc. `landOn` plays the arrival again with
 * the room finally in it, and this holds a navigation open past the slide to
 * see that it does.
 */
test.describe('with a coarse pointer on a wide screen', () => {
	test.use({ hasTouch: true });

	test('a room that arrives after the slide still slides in', async ({ page }) => {
		await register(page, `late-arrival-${Date.now()}@test.invalid`);
		await visit(page, '/tasks/todo');

		// Requests the app's service worker makes cannot be held by interception.
		await page.evaluate(async () => {
			const registrations = await navigator.serviceWorker.getRegistrations();
			await Promise.all(registrations.map((r) => r.unregister()));
		});
		await visit(page, '/tasks/todo');

		let release: () => void = () => {};
		const held = new Promise<void>((resolve) => (release = resolve));
		await page.route('**/goals**', async (route) => {
			await held;
			await route.continue();
		});

		const pane = page.locator('.slide-frame > div').first();

		await page.getByRole('link', { name: 'Goals' }).click();
		// Let the empty panel's own arrival finish: the slide is over, the data
		// is not, and the old content is hidden where it stands.
		await page.waitForTimeout(700);
		expect(await pane.evaluate((el) => getComputedStyle(el).transform)).toBe('none');

		release();
		// The landing plays the arrival again: the pane leaves its resting place
		// for the far side and travels back — never a reveal in place.
		await expect
			.poll(async () => pane.evaluate((el) => el.style.transform), { timeout: 2000 })
			.toMatch(/rotate/);
		// And it settles: transform handed back, the room standing where it landed.
		await expect
			.poll(async () => pane.evaluate((el) => el.style.transform), { timeout: 2000 })
			.toBe('');
	});
});

/**
 * And with a mouse, no movement at all — not even the landing.
 *
 * `slidesHere()` says a fine pointer gets none of this. The landing that
 * replays a late arrival briefly forgot that: the direction survived the
 * skipped slide, and the desktop caught an arrival animation on a screen
 * that never slid.
 */
test('a mouse gets no movement, however slow the load', async ({ page }) => {
	await register(page, `no-slide-${Date.now()}@test.invalid`);
	await visit(page, '/tasks/todo');
	await page.evaluate(async () => {
		const registrations = await navigator.serviceWorker.getRegistrations();
		await Promise.all(registrations.map((r) => r.unregister()));
	});
	await visit(page, '/tasks/todo');

	let release: () => void = () => {};
	const held = new Promise<void>((resolve) => (release = resolve));
	await page.route('**/goals**', async (route) => {
		await held;
		await route.continue();
	});

	const pane = page.locator('.slide-frame > div').first();
	const body = pane.locator('> div').first();

	await page.getByRole('link', { name: 'Goals' }).click();
	await page.waitForTimeout(400);
	// Mid-load: nothing hidden, nothing moved.
	expect(await body.evaluate((el) => (el as HTMLElement).style.visibility)).toBe('');
	expect(await pane.evaluate((el) => (el as HTMLElement).style.transform)).toBe('');

	release();
	await page.waitForURL('**/goals');
	await page.waitForTimeout(400);
	// Landed: still nothing.
	expect(await pane.evaluate((el) => (el as HTMLElement).style.transform)).toBe('');
});
