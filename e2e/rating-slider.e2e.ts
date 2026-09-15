import { expect, test } from '@playwright/test';
import { register } from './helpers/account';
import { visit } from './helpers/visit';

/**
 * The three scales a task carries, set by dragging rather than by pressing.
 *
 * They were five numbered buttons each, and "none of them" was a sixth press
 * on whichever one was already on — a gesture nobody guesses. The slider puts
 * off at the left end of the same track, so setting and clearing are the same
 * motion. What that has to keep doing is the part a control like this quietly
 * breaks: posting the value, and posting *nothing* when it is dragged back to
 * the dot.
 */
async function openTheScales(page: import('@playwright/test').Page, title: string) {
	await visit(page, '/tasks/board');
	await page.keyboard.press('n');

	const heading = page.locator('#card-form [name=heading]');
	await expect(heading).toBeVisible({ timeout: 15_000 });
	await heading.fill(title);

	// The scales live behind the same disclosure as the notes and the category.
	await page
		.getByText(/Category, notebook, notes, ratings/)
		.first()
		.click();
	await expect(page.locator('input[type="range"]')).toHaveCount(3);
}

test('a rating set by the slider is the rating the card keeps', async ({ page }) => {
	await register(page, `rating-${Date.now()}@example.test`);
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

test('dragging it back to the dot leaves the card unrated', async ({ page }) => {
	await register(page, `rating-off-${Date.now()}@example.test`);
	const title = 'A card with nothing on it';
	await openTheScales(page, title);

	const energy = page.getByRole('slider', { name: 'Energy' });
	await energy.fill('3');
	await expect(page.locator('#card-form input[name="energy"]')).toHaveValue('3');

	/*
	 * And the button beside it does the same thing, which is the point of it
	 * being there: dragging to the dot works and cannot be seen, so "how do I
	 * leave this one blank" needs an answer somebody can look at.
	 */
	await page.getByRole('button', { name: 'Leave energy unanswered' }).click();
	await expect(page.locator('#card-form input[name="energy"]')).toHaveValue('');

	/*
	 * With nothing to clear it keeps its place and stops being a control: not
	 * removed, so the row does not move as values come and go, and not offered
	 * to a screen reader either — `visibility: hidden` takes it out of the
	 * accessibility tree, which is why this has to find it by selector.
	 */
	await expect(
		page.locator('#card-form button[aria-label="Leave energy unanswered"]')
	).toBeDisabled();

	// All the way down is not "1". It is the answer somebody gives by not
	// answering, and it has to post an empty field rather than a number.
	await energy.fill('3');
	await energy.fill('0');
	await expect(page.locator('#card-form input[name="energy"]')).toHaveValue('');
	await expect(energy).toHaveAttribute('aria-valuetext', 'not set');

	await page.getByRole('button', { name: 'Add card' }).click();
	await expect(page.getByText(title, { exact: true })).toBeVisible();

	// Nothing on the card: an unrated task is a perfectly good task, and it
	// must not arrive wearing the lowest number on the scale.
	await expect(page.getByTitle(/^Energy: /)).toHaveCount(0);
});
