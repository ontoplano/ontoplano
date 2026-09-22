import { expect, test, type Page } from '@playwright/test';
import { register, testEmail } from './helpers/account';
import { visit } from './helpers/visit';

/**
 * "Priority" is the three ratings read together, in the to-do list.
 *
 * The arithmetic is `$lib/ratings` and `tests/ratings-order.test.ts` pins it;
 * what this walks is the wiring, which is the part that fails silently — an
 * order in the picker that sorts by the wrong field, or by none at all, looks
 * exactly like a list that happened to be in that order already.
 *
 * The four it writes are chosen so every rule shows: urgency decides first,
 * ease breaks the tie between the two urgent ones towards the easier, and the
 * one nobody weighed still beats a task deliberately marked at the bottom of
 * the scale — which is nought, the answer that says "not at all".
 */
async function newTodo(page: Page, title: string, ratings: Record<string, string>) {
	await page.getByRole('button', { name: 'New task' }).click();
	await page.locator('#todo-form [name="heading"]').fill(title);

	if (Object.keys(ratings).length > 0) {
		/*
		 * The scales are behind a disclosure, and which one depends on the form:
		 * the room's full form folds them on their own, the compact one folds
		 * them in with everything else. Either is one press.
		 */
		const form = page.locator('#todo-form');
		/*
		 * Opened if it is not already, rather than pressed.
		 *
		 * The three scales start open now, so a press on the summary closed them
		 * and the sliders went with them. Asking for the state wanted rather than
		 * toggling is the version that survives the default changing again.
		 */
		const fold = form
			.locator('details')
			.filter({ hasText: /Urgency, ease, interest/ })
			.first();
		if ((await fold.count()) > 0 && !(await fold.evaluate((d: HTMLDetailsElement) => d.open))) {
			await fold.locator('summary').first().click();
		} else if ((await fold.count()) === 0) {
			// The compact form folds them in with everything else.
			await form
				.getByText(/Category, notebook/)
				.first()
				.click();
		}
		for (const [name, value] of Object.entries(ratings)) {
			// The slider is what a person moves; the hidden field beside it is
			// what the form posts. See `e2e/rating-slider.e2e.ts`.
			await form.getByRole('slider', { name }).fill(value);
			await expect(form.locator(`input[name="${name.toLowerCase()}"]`)).toHaveValue(value);
		}
	}

	await page.getByRole('button', { name: 'Create task' }).click();
	await expect(page.getByText(title).first()).toBeVisible();
}

/** Where each title sits down the page — which is what "in this order" means. */
async function order(page: Page, titles: string[]): Promise<string[]> {
	const placed = [];
	for (const title of titles) {
		const box = await page.getByText(title, { exact: true }).first().boundingBox();
		if (!box) throw new Error(`"${title}" is not on the page`);
		placed.push({ title, y: box.y });
	}
	return placed.sort((a, b) => a.y - b.y).map((one) => one.title);
}

test('the to-do list can be ordered by priority', async ({ page }) => {
	test.setTimeout(150_000);
	await register(page, testEmail('todo-priority'));
	await visit(page, '/tasks/todo');

	const titles = [
		'whenever and easy',
		'urgent and draining',
		'nobody weighed this',
		'urgent and light'
	];
	// Written in an order that is nobody's priority order, so passing cannot be
	// an accident of when they were added.
	// Nought for the first one: the bottom of the scale is a real answer, and
	// this is the walk that proves a form can post it and the database keep it.
	await newTodo(page, titles[0], { Urgency: '0', Ease: '5' });
	await newTodo(page, titles[1], { Urgency: '5', Ease: '1' });
	await newTodo(page, titles[2], {});
	await newTodo(page, titles[3], { Urgency: '5', Ease: '5' });

	// The order control says what it is ordering, not what it is set to; the
	// current order is the word on it.
	await page.getByRole('button', { name: 'Order tasks by' }).click();
	await page.getByRole('option', { name: 'Priority' }).click();

	expect(await order(page, titles)).toEqual([
		// Both urgent; the easier one first.
		'urgent and light',
		'urgent and draining',
		// Unrated counts as the middle of the scale, which is above a
		// deliberate nought.
		'nobody weighed this',
		'whenever and easy'
	]);
});
