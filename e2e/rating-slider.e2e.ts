import { expect, test } from '@playwright/test';
import { register, testEmail } from './helpers/account';
import { visit } from './helpers/visit';

/**
 * The three scales a task carries, set by dragging rather than by pressing.
 *
 * They were five numbered buttons each, and "none of them" was a sixth press
 * on whichever one was already on — a gesture nobody guesses. The slider is
 * one control for the whole answer, and its thumb rests in the *middle* when
 * nobody has answered: "no rating" and "the lowest rating" used to be next
 * door to each other at the left end, which made an unanswered question look
 * like a one.
 *
 * What that has to keep doing is the part a control like this quietly breaks:
 * posting the number, posting *nothing* when it has been cleared, and never
 * posting the half-step that only exists so the thumb has somewhere to rest.
 */
async function openTheScales(page: import('@playwright/test').Page, title: string) {
	await visit(page, '/tasks/board');
	await page.keyboard.press('n');

	const heading = page.locator('#card-form [name=heading]');
	await expect(heading).toBeVisible({ timeout: 15_000 });
	await heading.fill(title);

	// The scales live behind the same disclosure as the notes and the category.
	await page
		.getByText(/Category, notebook, tags, notes, ratings/)
		.first()
		.click();
	await expect(page.locator('input[type="range"]')).toHaveCount(3);
}

test('a rating set by the slider is the rating the card keeps', async ({ page }) => {
	await register(page, testEmail('rating'));
	const title = 'A card with a number on it';
	await openTheScales(page, title);

	const urgency = page.getByRole('slider', { name: 'Urgency' });
	await urgency.fill('4');

	// The hidden field is what the form actually posts; the slider is what a
	// person moves. They have to agree, and this is the pair that breaks.
	await expect(page.locator('#card-form input[name="urgency"]')).toHaveValue('4');

	await page.getByRole('button', { name: 'Add card' }).click();
	await expect(page.getByText(title, { exact: true })).toBeVisible();

	/*
	 * And the card carries it afterwards. Read off the board rather than by
	 * reopening the form: what is drawn on the card came back from the
	 * database, so this fails if the number only ever lived in the control.
	 *
	 * The three bars are one object and say all three numbers at once — they
	 * are pressed together and read together, so there is one title over the
	 * group rather than one per bar.
	 */
	await expect(
		page.locator('[title*="Urgency 4"], [aria-label*="Urgency 4"]').first()
	).toBeVisible();
});

test('the button beside it leaves the card unrated', async ({ page }) => {
	await register(page, testEmail('rating-off'));
	const title = 'A card with nothing on it';
	await openTheScales(page, title);

	const ease = page.getByRole('slider', { name: 'Ease' });
	await ease.fill('3');
	await expect(page.locator('#card-form input[name="ease"]')).toHaveValue('3');

	/*
	 * The button is the only way back now: the thumb's resting place is in the
	 * middle of the scale rather than off the end of it, so there is no gesture
	 * that means "forget it" and the way out has to be something to look at.
	 */
	await page.getByRole('button', { name: 'Leave ease unanswered' }).click();
	await expect(page.locator('#card-form input[name="ease"]')).toHaveValue('');

	/*
	 * With nothing to clear it keeps its place and stops being a control: not
	 * removed, so the row does not move as values come and go, and not offered
	 * to a screen reader either — `visibility: hidden` takes it out of the
	 * accessibility tree, which is why this has to find it by selector.
	 */
	await expect(
		page.locator('#card-form button[aria-label="Leave ease unanswered"]')
	).toBeDisabled();

	// Cleared, the thumb rests at 2.5 — where an unset rating counts when the
	// list is sorted, and where the card draws it — and the field posts nothing.
	await expect(ease).toHaveValue('2.5');
	await expect(ease).toHaveAttribute('aria-valuetext', 'not set');

	/*
	 * And the half step is a resting place, not an answer.
	 *
	 * It exists because a native range needs one for the thumb to sit between
	 * two marks. Anything a person does with the control has to land on a whole
	 * number: dragging onto a half is taken to the whole one it was heading for.
	 */
	await ease.fill('3.5');
	await expect(page.locator('#card-form input[name="ease"]')).toHaveValue('4');
	await ease.fill('1.5');
	await expect(page.locator('#card-form input[name="ease"]')).toHaveValue('1');

	await page.getByRole('button', { name: 'Leave ease unanswered' }).click();
	await expect(page.locator('#card-form input[name="ease"]')).toHaveValue('');

	await page.getByRole('button', { name: 'Add card' }).click();
	await expect(page.getByText(title, { exact: true })).toBeVisible();

	// Nothing on the card: an unrated task is a perfectly good task, and it
	// must not arrive wearing the lowest number on the scale.
	await expect(page.getByTitle(/^Ease: /)).toHaveCount(0);
});

/*
 * A quick drag with a mouse stays where the button came up, and moving the
 * mouse afterwards leaves it there.
 *
 * The bar takes the pointer for itself, and the invisible range laid over it
 * used to see the press as well. Firefox runs its own thumb drag off that
 * press, and the capture the bar takes stole the mouseup that ends it — so
 * the native drag never finished, and the next movement of the mouse, after
 * letting go, set the answer to wherever the pointer had wandered: the value
 * flicked back. Firefox is the browser that shows it; the `firefox` project
 * runs this one.
 */
test.describe('with a mouse', () => {
	test('a fast drag keeps where the button came up', async ({ page }) => {
		await register(page, testEmail('rating-mouse'));
		await openTheScales(page, 'Dragged with a mouse');

		const track = page.locator('#card-form [data-rating="urgency"] .rating-track');
		const posted = page.locator('#card-form input[name="urgency"]');
		await track.scrollIntoViewIfNeeded();
		const box = (await track.boundingBox())!;
		const y = box.y + box.height / 2;
		const on = (n: number) => box.x + (box.width * (n - 0.5)) / 5;

		// The pointer is the bar's alone; the range under it is for the keys.
		const under = await page.evaluate(
			([x, y]) => document.elementFromPoint(x, y)?.matches('input[type="range"]'),
			[on(3), y]
		);
		expect(under).toBe(false);

		for (const [from, to, moves] of [
			[1, 5, 1],
			[5, 1, 2],
			[2, 4, 1]
		] as const) {
			await page.mouse.move(on(from), y);
			await page.mouse.down();
			await page.mouse.move(on(to), y, { steps: moves });
			await page.mouse.up();
			await expect(posted).toHaveValue(String(to));

			// Away, as a hand does after letting go — across the bar and off it.
			await page.mouse.move(on(from), y, { steps: 3 });
			await page.mouse.move(on(from), y + 120, { steps: 3 });
			await page.waitForTimeout(300);
			await expect(posted).toHaveValue(String(to));
		}

		// And the keys still move it on from there.
		await page.keyboard.press('ArrowLeft');
		await expect(posted).toHaveValue('3');
	});
});

/*
 * A quick drag across a gauge with a finger stays where the finger left it.
 *
 * The screen swipes between tabs on a sideways finger, listened for on the
 * whole scroller, and the gauge sits inside it. A drag long enough to cross a
 * block or two was also a swipe, so letting go changed tab under the form:
 * the screen flicked away and the answer went with it. A control that takes
 * sideways movement for itself, and anything in an open dialog, is not the
 * page's to swipe.
 */
test.describe('on a phone', () => {
	test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

	test('a fast drag on a gauge keeps the answer and the form', async ({ page }) => {
		await register(page, testEmail('rating-drag'));
		await openTheScales(page, 'Dragged in a hurry');
		const where = page.url();

		const track = page.locator('#card-form [data-rating="urgency"] .rating-track');
		const posted = page.locator('#card-form input[name="urgency"]');
		await track.scrollIntoViewIfNeeded();
		const box = (await track.boundingBox())!;
		const y = box.y + box.height / 2;
		// The middle of the nth block.
		const on = (n: number) => box.x + (box.width * (n - 0.5)) / 5;

		const cdp = await page.context().newCDPSession(page);
		const touch = (type: 'touchStart' | 'touchMove' | 'touchEnd', x?: number) =>
			cdp.send('Input.dispatchTouchEvent', {
				type,
				touchPoints: x === undefined ? [] : [{ x, y, id: 1 }]
			});

		// Across the bar and back, in one to three moves each: fast.
		for (const [from, to, moves] of [
			[1, 5, 3],
			[5, 1, 2],
			[2, 4, 1]
		] as const) {
			await touch('touchStart', on(from));
			for (let i = 1; i <= moves; i++)
				await touch('touchMove', on(from) + ((on(to) - on(from)) * i) / moves);
			await touch('touchEnd');

			await expect(posted).toHaveValue(String(to));
			// And it holds once whatever the gesture set off has settled.
			await page.waitForTimeout(600);
			await expect(posted).toHaveValue(String(to));
			expect(page.url()).toBe(where);
		}
		await cdp.detach();
	});
});
