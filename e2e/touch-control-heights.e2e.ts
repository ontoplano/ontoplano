import { expect, test } from '@playwright/test';
import { register } from './helpers/account';
import { visit } from './helpers/visit';

/**
 * A field and the button beside it are the same height on a phone.
 *
 * Touch targets are set in one place — `button` gets 44px under
 * `pointer: coarse` — and text fields were not in that list. So every row that
 * pairs the two drew a short box against a tall one: on the goals card the
 * number you type your progress into stood two thirds the height of the Update
 * button next to it, and the pair sat visibly crooked on a real phone while
 * looking fine on a desktop, which is why it survived so long.
 *
 * The fix is in the rule rather than at the call site, so this asks the
 * question the same way: it measures a real pairing on a real page. Any other
 * form that puts a field beside a button inherits both the fix and, if
 * somebody undoes it, this failure.
 *
 * The second test is the row underneath. Five controls do not fit across a
 * 360px card: without wrapping the browser broke the words inside a button
 * instead — "Tasks (1)" came out over two lines with its chevron floating
 * beside the middle of them — and with wrapping the fifth went to a line of its
 * own. Four fit, and the test is that they are still on one line.
 */
test.use({ viewport: { width: 360, height: 800 }, hasTouch: true, isMobile: true });

test('a goal’s progress field and its Update button are the same height', async ({ page }) => {
	await register(page, `touch-${Date.now()}@test.invalid`);

	// A goal with a target, which is what puts the self-reported progress form
	// on the card. Opening the form is retried: the button exists before the
	// page has hydrated enough to obey it.
	await visit(page, '/goals');
	const heading = page.locator('[name="heading"]');
	await expect(async () => {
		await page
			.getByRole('button', { name: /New goal/ })
			.first()
			.click();
		await expect(heading).toBeVisible({ timeout: 2000 });
	}).toPass({ timeout: 15000 });
	await heading.fill('walk a thousand kilometres');
	await page.locator('[name="targetValue"]').fill('1000');
	await page.locator('[name="unit"]').fill('km');
	await page.getByRole('button', { name: 'Create goal' }).click();
	await page.waitForTimeout(800);

	const field = page.locator('form[action="?/setProgress"] input[name="currentValue"]').first();
	const update = page.locator('form[action="?/setProgress"]').first().getByRole('button');
	await expect(field).toBeVisible();

	const box = await field.boundingBox();
	const button = await update.boundingBox();
	expect(box).not.toBeNull();
	expect(button).not.toBeNull();

	// The same height, and sitting on the same line — a pair that agrees on one
	// but not the other is still crooked.
	expect(Math.abs(box!.height - button!.height)).toBeLessThanOrEqual(1);
	expect(Math.abs(box!.y - button!.y)).toBeLessThanOrEqual(1);

	// And a field a finger has to hit is worth the same 44px every button gets.
	expect(box!.height).toBeGreaterThanOrEqual(44);
});

test('the goal card’s controls sit on one row inside the card', async ({ page }) => {
	await register(page, `touch-rail-${Date.now()}@test.invalid`);

	await visit(page, '/goals');
	const heading = page.locator('[name="heading"]');
	await expect(async () => {
		await page
			.getByRole('button', { name: /New goal/ })
			.first()
			.click();
		await expect(heading).toBeVisible({ timeout: 2000 });
	}).toPass({ timeout: 15000 });
	await heading.fill('finish the book');
	await page.getByRole('button', { name: 'Create goal' }).click();
	await page.waitForTimeout(800);

	const card = page.locator('[id^="goal-"]').first();
	const rail = card.locator('.row-actions');
	await expect(rail).toBeVisible();

	/*
	 * One row, and inside the card.
	 *
	 * The rail wraps rather than squeezing, so a control too many shows up here
	 * as a second line — which is what the old five did, stranding delete on a
	 * line by itself. Measuring the tops rather than the labels is deliberate:
	 * every button carries the 44px touch minimum, so a box taller than its own
	 * text says nothing, and where the boxes *start* says everything.
	 */
	const tops = await rail
		.locator('button')
		.evaluateAll((nodes) =>
			nodes
				.filter((node) => (node as HTMLElement).offsetParent !== null)
				.map((node) => Math.round(node.getBoundingClientRect().top))
		);
	expect(tops.length).toBeGreaterThan(2);
	expect(Math.max(...tops) - Math.min(...tops)).toBeLessThanOrEqual(2);

	// And it does not hang off the side of the card it belongs to.
	const railBox = await rail.boundingBox();
	const cardBox = await card.boundingBox();
	expect(railBox!.x + railBox!.width).toBeLessThanOrEqual(cardBox!.x + cardBox!.width + 1);
});
