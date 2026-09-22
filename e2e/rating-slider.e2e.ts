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

	// And the card carries it afterwards. Read off the board rather than by
	// reopening the form: what is drawn on the card came back from the
	// database, so this fails if the number only ever lived in the control.
	await expect(page.getByTitle('Urgency: 4 of 5').first()).toBeVisible();
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
