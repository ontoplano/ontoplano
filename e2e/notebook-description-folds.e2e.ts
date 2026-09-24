import { expect, test, type Page } from '@playwright/test';
import { register, testEmail } from './helpers/account';
import { visit } from './helpers/visit';

/**
 * A notebook's description folds when it is long, and not when it is short.
 *
 * It sits above everything the notebook is for, so one written properly — what
 * the renovation covers, which flat, the measurements — pushed the notes off a
 * phone screen. The half that is easy to get wrong is the other one: a short
 * description with a "Show more" under it is a control that does nothing, and
 * whether it appears can only be decided by measuring, since three lines at
 * 390px are one line on a laptop.
 */
const LONG =
	'Everything about the kitchen renovation: the flat is 62 square metres, the kitchen is 3.4 by ' +
	'2.8, the old cabinets come out in the first week and the plumber has to be booked before the ' +
	'tiler. Budget is whatever is left after the boiler. Measurements, quotes and the three shops ' +
	'worth visiting are all below.';

async function makeNotebook(page: Page, title: string, description: string) {
	const origin = new URL(page.url()).origin;
	await page.request.post('/notebooks?/create', {
		headers: { Origin: origin, 'x-sveltekit-action': 'true' },
		form: { heading: title, description }
	});
}

async function openIt(page: Page, title: string) {
	await visit(page, '/notebooks');
	const href = await page
		.getByRole('link', { name: new RegExp(title) })
		.first()
		.getAttribute('href');
	const id = (href ?? '').split('=')[1] ?? '';
	await visit(page, `/notebooks/${id}`);
}

test('a long notebook description folds, a short one has nothing to press', async ({ page }) => {
	test.setTimeout(150_000);
	await page.setViewportSize({ width: 390, height: 844 });
	await register(page, testEmail('fold'));

	await makeNotebook(page, 'Kitchen renovation', LONG);
	await makeNotebook(page, 'Trip', 'Two weeks in March.');

	await openIt(page, 'Kitchen renovation');
	const more = page.getByRole('button', { name: 'Show more' });
	await expect(more).toBeVisible();

	/*
	 * Folded is a height, not a hidden element: the clamp keeps every word in
	 * the DOM and shows two lines of them, so what proves it is the paragraph
	 * growing when it is asked to.
	 */
	const paragraph = page.getByText(/Everything about the kitchen renovation/);
	const folded = (await paragraph.boundingBox())?.height ?? 0;
	expect(folded).toBeGreaterThan(0);

	await more.click();
	await expect(page.getByRole('button', { name: 'Show less' })).toBeVisible();
	const opened = (await paragraph.boundingBox())?.height ?? 0;
	expect(opened).toBeGreaterThan(folded);

	// And a description that fits is drawn with no control at all.
	await openIt(page, 'Trip');
	await expect(page.getByText('Two weeks in March.')).toBeVisible();
	await expect(page.getByRole('button', { name: 'Show more' })).toHaveCount(0);
});

/**
 * The same description on the shelf's own panel, at phone width.
 *
 * There the title sat in one row with "Open" and "New note", and the row
 * never wrapped: the buttons took the width and the title and description
 * were left a column two letters wide.
 */
test('on the shelf, the title and description get the width and the description folds', async ({
	page
}) => {
	test.setTimeout(150_000);
	await page.setViewportSize({ width: 390, height: 844 });
	await register(page, testEmail('shelf-fold'));
	await makeNotebook(page, 'Kitchen renovation', LONG);

	await visit(page, '/notebooks');
	const href = await page
		.getByRole('link', { name: /Kitchen renovation/ })
		.first()
		.getAttribute('href');
	await visit(page, href ?? '/notebooks');

	const heading = page.getByRole('heading', { name: 'Kitchen renovation' });
	const paragraph = page.getByText(/Everything about the kitchen renovation/);
	await expect(paragraph).toBeVisible();
	/*
	 * Two widths, because whether the squeeze happens depends on how many
	 * buttons the tab below offers: three of them wrapped on their own at
	 * 390px, and it took a phone held a little wider to leave them on the
	 * title's line.
	 */
	for (const width of [390, 480]) {
		await page.setViewportSize({ width, height: 844 });
		await expect
			.poll(async () => (await heading.boundingBox())?.width ?? 0, {
				message: `title at ${width}px`
			})
			.toBeGreaterThan(200);
		expect((await paragraph.boundingBox())?.width ?? 0).toBeGreaterThan(200);
	}
	await page.setViewportSize({ width: 390, height: 844 });

	const folded = (await paragraph.boundingBox())?.height ?? 0;
	await page.getByRole('button', { name: 'Show more' }).click();
	await expect(page.getByRole('button', { name: 'Show less' })).toBeVisible();
	expect((await paragraph.boundingBox())?.height ?? 0).toBeGreaterThan(folded);
});
