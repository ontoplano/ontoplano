import { expect, test } from '@playwright/test';
import { register, testEmail } from './helpers/account';
import { visit } from './helpers/visit';

/**
 * How the three ratings are drawn on a card.
 *
 * They nest: urgency three columns wide behind, ease two in front of it,
 * interest one in front of that, all sharing a baseline and a right edge. What
 * you read is the sliver each one leaves showing, and those have to be one
 * width — a bar in front that is rounded at the foot bites a crescent out of
 * the one behind it at exactly the height where two slivers are compared, and
 * a task rated 5 on all three then drew three slivers nobody would call
 * equal. Beside them, a strip of the ruler that nothing ever covers.
 */
async function cardWithRatings(
	page: import('@playwright/test').Page,
	title: string,
	values: { urgency: string; ease: string; interest: string }
) {
	await visit(page, '/tasks/board');
	await page.keyboard.press('n');

	const heading = page.locator('#card-form [name=heading]');
	await expect(heading).toBeVisible({ timeout: 15_000 });
	await heading.fill(title);

	await page
		.getByText(/Category, notebook, tags, notes, ratings/)
		.first()
		.click();
	await expect(page.locator('input[type="range"]')).toHaveCount(3);

	await page.getByRole('slider', { name: 'Urgency' }).fill(values.urgency);
	await page.getByRole('slider', { name: 'Ease' }).fill(values.ease);
	await page.getByRole('slider', { name: 'Interest' }).fill(values.interest);

	await page.getByRole('button', { name: 'Add card' }).click();
	await expect(page.getByText(title, { exact: true })).toBeVisible();
}

test('the slivers are one width, and the ruler is never covered', async ({ page }) => {
	test.setTimeout(180_000);
	await register(page, testEmail('gauges'));

	// Five on all three: every bar is full height, so every junction between two
	// slivers is on show for its whole length. This is the one he reported.
	await cardWithRatings(page, 'Five on all three', {
		urgency: '5',
		ease: '5',
		interest: '5'
	});

	const drawn = await page
		.locator('.rating-bars')
		.first()
		.evaluate((group) => {
			const bars = [...group.querySelectorAll('.rating-bar')];
			const widths = bars.map((bar) => bar.getBoundingClientRect().width);
			const stack = group.querySelector('.rating-stack')!.getBoundingClientRect();
			const box = group.getBoundingClientRect();
			return {
				widths,
				// What each one leaves showing: the step down to the next, and the
				// narrowest bar entire.
				slivers: widths.map((wide, at) => (at === bars.length - 1 ? wide : wide - widths[at + 1])),
				// Whether a bar in front can cut into the one behind it at the foot.
				feet: bars.map((bar) => getComputedStyle(bar).borderBottomLeftRadius),
				stack: stack.width,
				group: box.width,
				right: box.right - stack.right
			};
		});

	// Nested, widest first: three columns, then two, then one.
	expect(drawn.widths[0]).toBeGreaterThan(drawn.widths[1]);
	expect(drawn.widths[1]).toBeGreaterThan(drawn.widths[2]);

	const said = drawn.slivers.map((n) => n.toFixed(2)).join(', ');
	for (const sliver of drawn.slivers.slice(1))
		expect(sliver, `slivers differ: ${said}`).toBeCloseTo(drawn.slivers[0], 1);

	// Square at the foot, or the sliver behind gains back a crescent of exactly
	// what the arithmetic above just proved even.
	for (const foot of drawn.feet) expect(foot).toBe('0px');

	// And the ruler reaches a column further left than the bars do, so a task
	// rated 5 across the board still has something to be read against.
	expect(drawn.group - drawn.stack).toBeCloseTo(drawn.widths[2], 1);
	expect(drawn.right).toBeCloseTo(0, 1);
});
