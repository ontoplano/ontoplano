import { expect, test, type Page } from '@playwright/test';
import { register, testEmail } from './helpers/account';
import { COLOUR_TOOLS } from './helpers/colour';
import { visit } from './helpers/visit';

/**
 * A note in a colour, and a notebook's notes as cards.
 *
 * The colour is worn — the note's face is the colour, and the words on it are
 * whatever ink the stylesheet works out from that face — so the check is that
 * the title is readable on it in every theme and style, not that some style
 * attribute was written. The cards are a choice the reader makes per notebook
 * and keeps: chosen, reloaded, still cards.
 */

const BLUE = '#1d4ed8';
const PALE = '#fde68a';

/** A notebook, and the address of its own page — the same panel at every width. */
async function makeNotebook(page: Page, title: string): Promise<string> {
	const origin = new URL(page.url()).origin;
	await page.request.post('/notebooks?/create', {
		headers: { Origin: origin, 'x-sveltekit-action': 'true' },
		form: { heading: title }
	});
	await visit(page, '/notebooks');
	await page
		.getByRole('link', { name: new RegExp(title) })
		.first()
		.click();
	await page.waitForURL(/\?notebook=\d+/);
	return `/notebooks/${new URL(page.url()).searchParams.get('notebook')}`;
}

/** Set a colour well the way the browser's picker does. */
async function pick(page: Page, scope: string, colour: string) {
	await page.locator(`${scope} input[type="color"]`).evaluate((input: HTMLInputElement, hex) => {
		input.value = hex;
		input.dispatchEvent(new Event('input', { bubbles: true }));
	}, colour);
}

async function addNote(page: Page, title: string, colour?: string) {
	const composer = 'form[action="?/addEntry"]';
	await page.getByRole('button', { name: /^New note/ }).click();
	await page.locator(`${composer} [name="heading"]`).fill(title);
	await page.locator(`${composer} textarea[name="content"]`).fill(`About ${title}.\n\nMore.`);
	if (colour) {
		await page.locator(composer).getByText('Tags, people').click();
		await pick(page, composer, colour);
	}
	await page.getByRole('button', { name: 'Add note' }).click();
	await expect(page.locator('[data-note-title]').filter({ hasText: title })).toBeVisible();
}

const note = (page: Page, title: string) =>
	page.locator('article').filter({ has: page.locator('[data-note-title]', { hasText: title }) });

/** The title's contrast against what is actually behind it. */
async function titleContrast(page: Page, title: string): Promise<number> {
	return note(page, title)
		.locator('[data-note-title]')
		.evaluate((el, tools) => {
			const { toRGBA, contrast, groundOf } = new Function(tools)();
			return contrast(toRGBA(getComputedStyle(el).color), groundOf(el));
		}, COLOUR_TOOLS);
}

async function paint(page: Page, theme: string, style: string) {
	await page.evaluate(
		([t, s]) => {
			document.documentElement.dataset.theme = t;
			document.documentElement.dataset.style = s;
			return new Promise<void>((resolve) =>
				requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
			);
		},
		[theme, style]
	);
	await page.waitForTimeout(250);
}

for (const width of [1440, 390]) {
	test(`a coloured note, worn and readable, as a card that stays a card (${width}px)`, async ({
		page
	}) => {
		test.setTimeout(150_000);
		await register(page, testEmail(`note-colour-${width}`));
		// Found on the shelf at the desktop width, where its cover is a link.
		const lisbon = await makeNotebook(page, 'Lisbon');
		await page.setViewportSize({ width, height: 900 });
		await visit(page, lisbon);

		await addNote(page, 'The flat', BLUE);
		await addNote(page, 'The adapter', PALE);
		await addNote(page, 'The tram');

		// Worn: the face is the colour; a note given none is drawn plain.
		await expect(note(page, 'The flat')).toHaveClass(/pill-soft/);
		await expect(note(page, 'The flat')).toHaveAttribute('style', new RegExp(`--pill: ?${BLUE}`));
		await expect(note(page, 'The tram')).not.toHaveClass(/pill-soft/);

		// And readable on it, at both ends of the lightness scale, everywhere.
		for (const theme of ['light', 'dark'])
			for (const style of ['sober', 'playful']) {
				await paint(page, theme, style);
				for (const title of ['The flat', 'The adapter'])
					expect(
						await titleContrast(page, title),
						`${title} in ${theme}/${style}`
					).toBeGreaterThanOrEqual(4.5);
			}
		await paint(page, 'light', 'sober');

		// The colour is changed, and taken off, from the note's own editor.
		await note(page, 'The adapter').getByRole('button', { name: 'Edit this note' }).click();
		const editor = 'form[action="?/updateEntry"]';
		await page.locator(editor).getByRole('button', { name: 'No colour' }).click();
		await page.locator(editor).getByRole('button', { name: 'Save' }).click();
		await page.locator(editor).getByRole('button', { name: 'Close' }).click();
		await expect(note(page, 'The adapter')).not.toHaveClass(/pill-soft/);

		// The list is the default; cards are a press away.
		const shelf = page.locator('[data-note-view]');
		await expect(shelf).toHaveAttribute('data-note-view', 'list');
		const asCards = page.getByRole('button', { name: 'Cards', exact: true });
		await asCards.click();
		await expect(shelf).toHaveAttribute('data-note-view', 'grid');
		await expect(asCards).toHaveAttribute('aria-pressed', 'true');

		// One column on a phone; side by side where there is room.
		const left = async (title: string) => (await note(page, title).boundingBox())!.x;
		if (width < 640) expect(await left('The tram')).toBe(await left('The flat'));
		else expect(await left('The tram')).toBeGreaterThan(await left('The flat'));

		// The keys walk the cards as they walked the rows.
		await page.locator('body').click({ position: { x: 2, y: 2 } });
		await page.keyboard.press('j');
		await expect(page.locator('article.kb-cursor')).toHaveCount(1);

		// Kept: the server remembers it for this notebook, so a reload is still cards.
		await expect
			.poll(async () => {
				await visit(page, lisbon);
				return page.locator('[data-note-view]').getAttribute('data-note-view');
			})
			.toBe('grid');
		await expect(note(page, 'The flat')).toHaveClass(/pill-soft/);

		// And back.
		await page.getByRole('button', { name: 'List', exact: true }).click();
		await expect(shelf).toHaveAttribute('data-note-view', 'list');
		await page.screenshot({ path: test.info().outputPath(`notes-${width}.png`) });
	});
}
