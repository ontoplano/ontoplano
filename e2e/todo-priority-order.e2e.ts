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
			// Its summary is the three icons; the words are its tooltip.
			.filter({ has: page.locator('summary[title="Urgency, ease, interest"]') })
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

/**
 * A tie in the ratings, broken by hand.
 *
 * Two tasks rated alike used to be queued oldest first, with no way to say
 * otherwise. The arrows beside the bars put them the other way round, and the
 * number in each card's corner says where it now stands.
 */
test('two tasks rated alike can be put the other way round', async ({ page }) => {
	test.setTimeout(180_000);
	await page.setViewportSize({ width: 1280, height: 900 });
	await register(page, testEmail('todo-tie'));
	await visit(page, '/tasks/todo');

	const titles = ['the older of the two', 'the newer of the two'];
	await newTodo(page, titles[0], { Urgency: '3' });
	await newTodo(page, titles[1], { Urgency: '3' });

	await page.getByRole('button', { name: 'Order tasks by' }).click();
	await page.getByRole('option', { name: 'Priority' }).click();
	expect(await order(page, titles)).toEqual(titles);

	const older = page.locator('.row-card').filter({ hasText: titles[0] });
	await expect(older).toContainText('1st');
	await older.getByRole('button', { name: 'Put it behind the one rated the same' }).click();

	await expect.poll(() => order(page, titles)).toEqual([titles[1], titles[0]]);
	await expect(older).toContainText('2nd');
});

/**
 * The ratings changed on the card, and only once they are confirmed.
 *
 * A press on the bars sets the one under it to the height pressed; the card
 * shows the change at once and the box beside it holds it until Confirm. The
 * × throws it away.
 */
test('the bars on a card are pressed to change them, and confirmed beside them', async ({
	page
}) => {
	test.setTimeout(180_000);
	await page.setViewportSize({ width: 1280, height: 900 });
	await register(page, testEmail('todo-rate'));
	await visit(page, '/tasks/todo');
	await newTodo(page, 'weigh this one', {});

	const card = page.locator('.row-card').filter({ hasText: 'weigh this one' });
	const bars = card.locator('.rating-bars');
	const pressAt = async (x: number, y: number) => {
		const box = (await bars.boundingBox())!;
		await page.mouse.click(box.x + box.width * x, box.y + box.height * y);
	};
	const holding = page.getByRole('dialog', { name: 'Confirm' });

	// Near the top of the left column: urgency, five.
	await pressAt(0.3, 0.05);
	await expect(holding).toContainText('5');
	await expect(bars).toHaveAttribute('aria-label', /Urgency 5/);

	// Thrown away.
	await holding.getByRole('button', { name: 'Cancel' }).click();
	await expect(holding).toBeHidden();
	await expect(bars).not.toHaveAttribute('aria-label', /Urgency 5/);

	// Kept.
	await pressAt(0.3, 0.05);
	const confirm = holding.getByRole('button', { name: 'Confirm' });
	await expect(confirm).not.toHaveClass(/is-unarmed/);
	await confirm.click();
	await expect(holding).toBeHidden();
	await visit(page, '/tasks/todo');
	await expect(
		page.locator('.row-card').filter({ hasText: 'weigh this one' }).locator('.rating-bars')
	).toHaveAttribute('aria-label', /Urgency 5/);
});

test('a drag across the bars sets whichever bar is under it, and Edit carries it', async ({
	page
}) => {
	test.setTimeout(180_000);
	await page.setViewportSize({ width: 1280, height: 900 });
	await register(page, testEmail('todo-rate-drag'));
	await visit(page, '/tasks/todo');
	await newTodo(page, 'drag these', {});

	const bars = page.locator('.row-card').filter({ hasText: 'drag these' }).locator('.rating-bars');
	const box = (await bars.boundingBox())!;
	const at = (x: number, y: number) => [box.x + box.width * x, box.y + box.height * y] as const;

	// Down low on urgency, up to the top, then across to interest halfway.
	await page.mouse.move(...at(0.3, 0.9));
	await page.mouse.down();
	await page.mouse.move(...at(0.3, 0.05), { steps: 6 });
	await page.mouse.move(...at(0.9, 0.5), { steps: 6 });
	await page.mouse.up();

	await expect(bars).toHaveAttribute('aria-label', /Urgency 5/);
	await expect(bars).toHaveAttribute('aria-label', /Interest 3/);

	// The box says where it would land, and Edit opens the form with the bars
	// as they were left rather than as they were saved.
	const holding = page.getByRole('dialog', { name: 'Confirm' });
	await expect(holding).toContainText(/in line/);
	await holding.getByRole('button', { name: 'Edit' }).click();
	await expect(holding).toBeHidden();
	await expect(page.locator('#todo-form input[name="urgency"]')).toHaveValue('5');
});

test('the list can say which task you are on, and shows it', async ({ page }) => {
	test.setTimeout(180_000);
	await page.setViewportSize({ width: 1280, height: 900 });
	await register(page, testEmail('todo-doing'));
	await visit(page, '/tasks/todo');

	await page
		.getByRole('button', { name: /New task/ })
		.first()
		.click();
	await page.locator('#todo-form [name="heading"]').fill('ring the plumber');
	await page.getByRole('button', { name: 'Create task' }).click();
	await expect(page.getByText('ring the plumber').first()).toBeVisible({ timeout: 30_000 });

	/*
	 * `doing` has always been a status and the board has always been able to
	 * set it; the list — the one screen people work from — could not, so there
	 * was no way to say "this is the one I am on" where it matters.
	 */
	const row = page.locator('.is-doing');
	await expect(row).toHaveCount(0);

	await page.getByRole('button', { name: 'Say you are on it' }).first().click();
	await expect(row).toHaveCount(1);
	await expect(row).toContainText('ring the plumber');

	// And it is a toggle, not a step in a cycle nobody can go back through.
	await page.getByRole('button', { name: 'Not on it any more' }).first().click();
	await expect(row).toHaveCount(0);
});
