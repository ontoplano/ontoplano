import { expect, test, type ConsoleMessage, type Page } from '@playwright/test';
import { register } from './helpers/account';

/**
 * Every page, looked at.
 *
 * This exists because a round of hand-testing turned up a pile of things no
 * assertion would have caught: a page that reported "Unexpected error" while
 * succeeding, a row pushed off the side of a phone by a long word, a page that
 * threw in the console and reloaded forever. None of them are about behaviour —
 * they are about what the page *is* when it renders — so this walks the whole
 * app and checks the things that are true of every page.
 *
 * It is deliberately not clever. A slow, dull test that visits everything is
 * worth more than a fast one that visits the three routes somebody remembered.
 */
const ROUTES = [
	'/',
	'/planner/plan',
	'/planner/plan?view=day',
	'/planner/plan?view=month',
	'/planner/board',
	'/planner/todo',
	'/planner/activities',
	'/planner/history',
	'/planner/review',
	'/goals',
	'/diary',
	'/diary/notebooks',
	'/diary/people',
	'/ideas',
	'/health/habits',
	'/health/weight',
	'/shopping',
	'/kitchen/recipes',
	'/kitchen/meals',
	'/search?q=a+thing',
	'/settings/account',
	'/settings/preferences',
	'/settings/integrations'
];

/** Messages the app does not control and that say nothing about it. */
function isOurs(message: ConsoleMessage): boolean {
	const text = message.text();
	if (/favicon|manifest|Download the .* devtools/i.test(text)) return false;
	// A browser extension in somebody's profile is not this app's problem.
	return !/moz-extension|chrome-extension/.test(text);
}

type Watcher = { problems: string[] };

function watch(page: Page): Watcher {
	const problems: string[] = [];

	page.on('pageerror', (e) => problems.push(`threw: ${e.message}`));
	page.on('console', (m) => {
		if (m.type() === 'error' && isOurs(m)) problems.push(`console: ${m.text().slice(0, 200)}`);
	});
	page.on('response', (r) => {
		if (r.status() >= 500) problems.push(`${r.status()} ${new URL(r.url()).pathname}`);
	});

	return { problems };
}

/**
 * Nothing may stick out sideways.
 *
 * The app shell does not scroll horizontally, so anything wider than the window
 * is not merely ugly — it is unreachable. This is how "a notebook named with no
 * spaces hides its own buttons" gets caught.
 */
async function assertNoSidewaysScroll(page: Page, where: string): Promise<void> {
	const overflow = await page.evaluate(() => ({
		content: document.documentElement.scrollWidth,
		window: window.innerWidth
	}));

	expect(overflow.content, `${where} is wider than the window`).toBeLessThanOrEqual(
		overflow.window + 1
	);
}

for (const shape of ['desktop', 'mobile'] as const) {
	test.describe(`${shape}`, () => {
		test.use(
			shape === 'mobile'
				? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }
				: { viewport: { width: 1440, height: 900 } }
		);

		test(`every page renders and says nothing alarming (${shape})`, async ({ page }) => {
			const watcher = watch(page);
			await register(page, `smoke-${shape}-${Date.now()}@test.invalid`);

			for (const route of ROUTES) {
				const response = await page.goto(route, { waitUntil: 'networkidle' });
				expect(response?.status(), `${route} answered ${response?.status()}`).toBeLessThan(400);

				const body = await page.locator('body').innerText();
				expect(body, `${route} shows an internal error`).not.toMatch(
					/Unexpected error|Internal Error|500 —/i
				);

				await assertNoSidewaysScroll(page, route);
			}

			expect(watcher.problems, 'the browser complained').toEqual([]);
		});
	});
}

test('a long unbroken name does not push its controls off the screen', async ({ page }) => {
	await page.setViewportSize({ width: 390, height: 844 });
	await register(page, `longword-${Date.now()}@test.invalid`);

	await page.goto('/diary/notebooks', { waitUntil: 'networkidle' });
	await page.getByRole('button', { name: 'New notebook' }).first().click();
	await page.fill('input[name=title]', 'a'.repeat(64));
	await page
		.getByRole('button', { name: /Create|Save|Add/ })
		.last()
		.click();
	await page.waitForTimeout(1200);

	await assertNoSidewaysScroll(page, 'the notebook list with a 64-character word');

	// And nothing was pushed past the edge, which is the thing that actually
	// broke: the page did not scroll, the controls simply left. Reported by name
	// so a failure says which control went.
	const escaped = await page.evaluate(() =>
		[...document.querySelectorAll('button, a')]
			.filter((el) => {
				const rect = el.getBoundingClientRect();
				return rect.width > 0 && rect.right > window.innerWidth + 1;
			})
			.map((el) => el.getAttribute('aria-label') || el.textContent?.trim().slice(0, 30) || '?')
	);

	expect(escaped, 'controls pushed off the right edge').toEqual([]);
});

test('a page title is never squeezed into one word per line', async ({ page }) => {
	await register(page, `titles-${Date.now()}@test.invalid`);
	await page.setViewportSize({ width: 390, height: 844 });

	/**
	 * The first complaint anybody made about this app was that a row of buttons
	 * squeezed the text beside it into a vertical ribbon. A heading in a flex row
	 * with a wrapping button group will always lose that fight unless it is told
	 * not to shrink, and every section's header is built that way.
	 */
	const squeezed: string[] = [];

	for (const route of ROUTES) {
		await page.goto(route, { waitUntil: 'networkidle' });

		const bad = await page.evaluate(() => {
			const out: string[] = [];
			for (const h of document.querySelectorAll('h1, h2')) {
				const text = h.textContent?.trim() ?? '';
				if (!text || text.split(/\s+/).length < 2) continue;

				const cs = getComputedStyle(h);
				const line = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.2;
				const lines = Math.round(h.getBoundingClientRect().height / line);

				// Two lines is a long title on a narrow screen. Three or more, for a
				// heading of a few words, means it is being squeezed rather than wrapped.
				if (lines > 2 && text.split(/\s+/).length <= 4) out.push(`${text} — ${lines} lines`);
			}
			return out;
		});

		squeezed.push(...bad.map((b) => `${route}: ${b}`));
	}

	expect(squeezed, 'headings crushed by whatever sits beside them').toEqual([]);
});
