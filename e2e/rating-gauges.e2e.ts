import { expect, test } from '@playwright/test';
import { register, testEmail } from './helpers/account';
import { visit } from './helpers/visit';

/**
 * How the three ratings are drawn on a card.
 *
 * They nested once — urgency a full-width rectangle behind, ease narrower in
 * front of it — so above the top of a short interest, ease was two columns
 * wide and the same answer looked like twice as much as urgency beside it.
 * Whoever was comparing two rows was comparing the wrong thing. So: three
 * columns of one width, and a strip of the ruler that nothing ever covers.
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

test('the three columns are one width, whatever the numbers are', async ({ page }) => {
	test.setTimeout(180_000);
	await register(page, testEmail('gauges'));

	// The shape the old drawing got wrong: two tall and one short.
	await cardWithRatings(page, 'Two tall and one short', {
		urgency: '4',
		ease: '4',
		interest: '1'
	});

	const drawn = await page
		.locator('.rating-bars')
		.first()
		.evaluate((group) => {
			const widths = [...group.querySelectorAll('.rating-bar')].map(
				(bar) => Math.round(bar.getBoundingClientRect().width * 100) / 100
			);
			const stack = group.querySelector('.rating-stack')!.getBoundingClientRect();
			const box = group.getBoundingClientRect();
			return { widths, stack: stack.width, group: box.width, right: box.right - stack.right };
		});

	expect(drawn.widths).toHaveLength(3);
	expect(new Set(drawn.widths).size, `columns differ: ${drawn.widths.join(', ')}`).toBe(1);

	// And the ruler reaches a column further left than they do, so a task rated
	// 5 across the board still has something to be read against.
	expect(drawn.group - drawn.stack).toBeCloseTo(drawn.widths[0], 1);
	expect(drawn.right).toBeCloseTo(0, 1);
});
