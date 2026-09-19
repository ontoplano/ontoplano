import { expect, test, type Page } from '@playwright/test';
import { register, testEmail } from './helpers/account';
import { pngOfSize } from './helpers/png';
import { visit } from './helpers/visit';

/**
 * Adding a picture, and being told when one is too big.
 *
 * Both halves of this were reported from a real instance and both were bad in
 * the same way — they cost somebody a step or a sentence:
 *
 *  - choosing a file did nothing until a second button was pressed;
 *  - a 1.1MB photograph produced a 500 page reading `JSON.parse: unexpected
 *    character at line 1 column 1`, because a body over the Node adapter's
 *    limit is refused before this app runs and what comes back is not the JSON
 *    the form is waiting for;
 *  - and a refusal the server *did* explain arrived as "That picture would not
 *    upload", because the client read the wrong field of the error.
 *
 * So the rules are: choosing is the whole gesture, an over-large file is
 * refused in the browser before it is sent, and the sentence names the numbers.
 */

const SMALL = { ...pngOfSize(24, 8), name: 'small.png' };
const HUGE = { ...pngOfSize(24, 1100), name: 'huge.png' };

async function newRecipe(page: Page, title: string) {
	await visit(page, '/health/recipes');
	await page
		.getByRole('button', { name: /new recipe/i })
		.first()
		.click();
	await page.locator('[name="heading"]').first().fill(title);
	await page.locator('button[type="submit"]').first().click();
	await page.waitForURL(/\/health\/recipes\/\d+/, { timeout: 20000 });
}

test('a recipe takes a picture the moment one is chosen', async ({ page }) => {
	await page.setViewportSize({ width: 1280, height: 1000 });
	await register(page, testEmail('pics'));
	await newRecipe(page, 'Photographed');

	const gallery = page.locator('[data-tour="recipe-pictures"]');
	await expect(gallery).toBeVisible();
	// There is no second button. Choosing the file is the whole gesture.
	await expect(gallery.getByRole('button', { name: /^add$/i })).toHaveCount(0);

	await gallery.locator('input[type="file"]').setInputFiles(SMALL);
	await expect(gallery.locator('img')).toHaveCount(1, { timeout: 20000 });
	// The first one stands for the recipe without being asked.
	await expect(gallery.getByText('Main')).toBeVisible();
});

test('an over-large picture is refused in words, and the page survives', async ({ page }) => {
	await page.setViewportSize({ width: 1280, height: 1000 });
	await register(page, testEmail('huge'));
	await newRecipe(page, 'Too big');

	const gallery = page.locator('[data-tour="recipe-pictures"]');
	await gallery.locator('input[type="file"]').setInputFiles(HUGE);

	// The sentence names both numbers, and it is on the page rather than on a
	// 500 screen: nothing was sent, so nothing could fail to parse.
	await expect(page.getByText(/at most \d+KB, and huge\.png is \d+KB/)).toBeVisible();
	await expect(page).toHaveURL(/\/health\/recipes\/\d+/);
	await expect(gallery.locator('img')).toHaveCount(0);

	// …and the input is empty again, so the next choice is a fresh one.
	await expect(gallery.locator('input[type="file"]')).toHaveValue('');
});

test('a note takes one too, and says why when it will not', async ({ page }) => {
	await page.setViewportSize({ width: 1280, height: 1000 });
	await register(page, testEmail('note-pics'));

	await visit(page, '/notebooks/diary');
	await page
		.getByRole('button', { name: /new entry/i })
		.first()
		.click();

	const box = page.locator('textarea[name="content"]');
	await box.fill('A note.');

	// Too big: the writing is left exactly as it was, with no half-written
	// placeholder for a picture that never arrived.
	await page.locator('input[type="file"]').first().setInputFiles(HUGE);
	await expect(page.getByText(/at most \d+KB, and huge\.png is \d+KB/)).toBeVisible();
	await expect(box).toHaveValue('A note.');

	// And one that fits writes itself into the text as markdown.
	await page.locator('input[type="file"]').first().setInputFiles(SMALL);
	await expect(box).toHaveValue(/!\[small\.png\]\(\/media\/\d+\)/, { timeout: 20000 });
});

test('a person gets one face, and it shows in the list', async ({ page }) => {
	await page.setViewportSize({ width: 1280, height: 1000 });
	await register(page, testEmail('face'));

	await visit(page, '/notebooks/people');
	await page
		.getByRole('button', { name: /new person/i })
		.first()
		.click();
	await page.locator('[name="label"]').first().fill('Ana');
	await page.getByRole('button', { name: /add person/i }).click();
	await expect(page.getByRole('link', { name: /^Ana/ })).toBeVisible();

	// The control lives in the edit form: a picture belongs to a person who
	// exists, and there is nowhere to put one before that.
	await page.getByRole('button', { name: /edit/i }).first().click();
	await page.locator('input[name="file"]').setInputFiles(SMALL);

	await expect(page.locator('[data-tour="people-list"] img')).toHaveCount(1, { timeout: 20000 });
});

test('a note written in a notebook takes one too', async ({ page }) => {
	// Reported as "I don't see how to add media to a notebook note": the control
	// was on the diary's note form and nowhere else, so pictures looked like a
	// property of one screen rather than of notes.
	await page.setViewportSize({ width: 1280, height: 1000 });
	await register(page, testEmail('nb-pics'));

	await visit(page, '/notebooks');
	await page
		.getByRole('button', { name: /new notebook/i })
		.first()
		.click();
	await page.locator('[name="heading"]').first().fill('Kitchen');
	// By name: the dialogue carries the importer's own submit too, and "the
	// first submit button on the page" stopped meaning this one.
	await page.getByRole('button', { name: 'Create notebook' }).click();
	// The composer stands behind a button now, on every screen: a form open
	// above the notes took the top of the notebook whether or not anybody was
	// writing.
	await page.getByRole('button', { name: 'New note', exact: true }).first().click();
	await expect(page.getByPlaceholder('Write a note about Kitchen')).toBeVisible();

	const box = page.getByPlaceholder('Write a note about Kitchen');
	await box.fill('The tiles.');
	await page.locator('input[type="file"]').first().setInputFiles(SMALL);
	await expect(box).toHaveValue(/!\[small\.png\]\(\/media\/\d+\)/, { timeout: 20000 });
});

test('a person’s face is the way in to their picture', async ({ page }) => {
	// The control only existed inside the edit form, which nobody opens to add a
	// picture. The face is where somebody looks when they want to change it.
	await page.setViewportSize({ width: 1280, height: 1000 });
	await register(page, testEmail('face-open'));

	await visit(page, '/notebooks/people');
	await page
		.getByRole('button', { name: /new person/i })
		.first()
		.click();
	await page.locator('[name="label"]').first().fill('Ana');
	await page.getByRole('button', { name: /add person/i }).click();
	await expect(page.getByRole('link', { name: /^Ana/ })).toBeVisible();

	await page.getByRole('button', { name: /add a picture of ana/i }).click();
	await page.locator('input[name="file"]').setInputFiles(SMALL);
	await expect(page.locator('[data-tour="people-list"] img')).toHaveCount(1, { timeout: 20000 });
});
