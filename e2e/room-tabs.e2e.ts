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
const PANE = '.tab-frame > div';

async function swipe(page: import('@playwright/test').Page, from: number, to: number) {
	const pane = page.locator(PANE).first();
	const at = { pointerType: 'touch', isPrimary: true, pointerId: 1, clientY: 400 };
	await pane.dispatchEvent('pointerdown', { ...at, clientX: from });
	await pane.dispatchEvent('pointerup', { ...at, clientX: to, clientY: 410 });
	await page.waitForTimeout(900);
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

	test('a short or diagonal gesture is a scroll, not a tab change', async ({ page }) => {
		test.setTimeout(180_000);
		await register(page, `tabs-scroll-${Date.now()}@test.invalid`);
		await visit(page, '/finance/ledgers');

		// Too short to mean anything.
		await swipe(page, 320, 290);
		await expect(page).toHaveURL(/\/finance\/ledgers/);

		// Long, but mostly downwards: that is the page scrolling.
		const pane = page.locator(PANE).first();
		const at = { pointerType: 'touch', isPrimary: true, pointerId: 1 };
		await pane.dispatchEvent('pointerdown', { ...at, clientX: 320, clientY: 200 });
		await pane.dispatchEvent('pointerup', { ...at, clientX: 220, clientY: 500 });
		await page.waitForTimeout(600);
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
