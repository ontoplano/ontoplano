import { expect, test, type Page } from '@playwright/test';
import { register, testEmail } from './helpers/account';
import { visit } from './helpers/visit';
import { pressUntil } from './helpers/press-until';

/**
 * The keys a view declares rather than writes.
 *
 * Every list in the app had grown its own `handleKeydown` — the same `j` and
 * `k`, the same guard against firing while somebody is typing, written eight
 * times. A screen says what it has now (`$lib/browse`) and the keys follow, so
 * the next screen gets them without anybody remembering to wire them up.
 *
 * Notebooks is the first to take it: `h`/`l` across the tabs, `j`/`k` down the
 * notes, `Enter` to read one and `e` to edit it.
 */
async function makeNotebook(page: Page, title: string) {
	const origin = new URL(page.url()).origin;
	await page.request.post('/notebooks?/create', {
		headers: { Origin: origin, 'x-sveltekit-action': 'true' },
		form: { heading: title }
	});
}

async function writeNote(page: Page, title: string) {
	await pressUntil(
		page,
		page.getByRole('button', { name: /^(New note|New task|New goal|Cancel)$/ }),
		page.locator('form[action="?/addEntry"] [name="heading"]')
	);
	await page.locator('form[action="?/addEntry"] [name="heading"]').fill(title);
	await page.locator('form[action="?/addEntry"] textarea[name="content"]').fill(`about ${title}`);
	await page.getByRole('button', { name: 'Add note' }).click();
	await expect(page.getByText(title).first()).toBeVisible();
}

test('h and l walk the tabs, j and k walk the notes', async ({ page }) => {
	test.setTimeout(120_000);
	await page.setViewportSize({ width: 1280, height: 1000 });
	await register(page, testEmail('nb-keys'));
	await makeNotebook(page, 'The kitchen');
	await visit(page, '/notebooks');
	await writeNote(page, 'Measurements');
	await writeNote(page, 'Suppliers');

	// Nothing is under the cursor until somebody puts it there.
	await expect(page.locator('article.kb-cursor')).toHaveCount(0);

	await page.keyboard.press('j');
	await expect(page.locator('article.kb-cursor')).toHaveCount(1);
	const first = await page.locator('article.kb-cursor [data-note-title]').innerText();
	await page.keyboard.press('j');
	const second = await page.locator('article.kb-cursor [data-note-title]').innerText();
	expect(second).not.toBe(first);
	await page.keyboard.press('k');
	await expect(page.locator('article.kb-cursor [data-note-title]')).toHaveText(first);

	// It stops at the ends rather than wrapping round.
	await page.keyboard.press('k');
	await expect(page.locator('article.kb-cursor [data-note-title]')).toHaveText(first);

	// Enter reads the one under the cursor, without the form that edits it.
	await page.keyboard.press('Enter');
	await expect(page.locator('article.kb-cursor .md')).toBeVisible();
	await expect(page.locator('form[action="?/updateEntry"]')).toHaveCount(0);

	// `e` is the form.
	await page.keyboard.press('e');
	await expect(page.locator('form[action="?/updateEntry"]')).toBeVisible();
	await page.keyboard.press('Escape');

	// And the tabs, which stop at the ends too.
	await expect(page.getByRole('button', { name: /^Notes \d/ })).toHaveAttribute(
		'class',
		/border-b-2/
	);
	await page.keyboard.press('l');
	await expect(page.getByRole('button', { name: /^Tasks/ })).toHaveAttribute('class', /border-b-2/);
	await page.keyboard.press('l');
	await expect(page.getByRole('button', { name: /^Goals/ })).toHaveAttribute('class', /border-b-2/);
	await page.keyboard.press('l');
	await expect(page.getByRole('button', { name: /^Goals/ })).toHaveAttribute('class', /border-b-2/);
	await page.keyboard.press('h');
	await page.keyboard.press('h');
	await expect(page.getByRole('button', { name: /^Notes \d/ })).toHaveAttribute(
		'class',
		/border-b-2/
	);
});

test('the keys keep out of the way of somebody writing', async ({ page }) => {
	test.setTimeout(120_000);
	await page.setViewportSize({ width: 1280, height: 1000 });
	await register(page, testEmail('nb-keys-typing'));
	await makeNotebook(page, 'The kitchen');
	await visit(page, '/notebooks');

	await page.getByRole('button', { name: 'New note', exact: true }).click();
	const box = page.locator('form[action="?/addEntry"] textarea[name="content"]');
	await box.fill('');
	await box.type('helsinki jokes');
	// Every one of h, l, j, k and e is in that sentence.
	await expect(box).toHaveValue('helsinki jokes');
	await expect(page.locator('article.kb-cursor')).toHaveCount(0);
});

test('the list can be widened, and it stays widened', async ({ page }) => {
	test.setTimeout(120_000);
	await page.setViewportSize({ width: 1280, height: 1000 });
	await register(page, testEmail('nb-split'));
	await makeNotebook(page, 'The kitchen');
	await visit(page, '/notebooks');

	const handle = page.locator('[role="separator"][aria-orientation="vertical"]');
	await expect(handle).toBeVisible();
	const was = Number(await handle.getAttribute('aria-valuenow'));

	// The keyboard's version of the drag, so this does not depend on a mouse.
	await handle.focus();
	await page.keyboard.press('ArrowRight');
	await expect(handle).toHaveAttribute('aria-valuenow', String(was + 1));
	await page.keyboard.press('ArrowRight');
	await expect(handle).toHaveAttribute('aria-valuenow', String(was + 2));

	// Written down once it is let go, so it survives coming back.
	await visit(page, '/');
	await visit(page, '/notebooks');
	await expect(page.locator('[role="separator"][aria-orientation="vertical"]')).toHaveAttribute(
		'aria-valuenow',
		String(was + 2)
	);
});

test('what a notebook is, said only while there are none', async ({ page }) => {
	test.setTimeout(120_000);
	await register(page, testEmail('nb-intro'));
	await visit(page, '/notebooks');

	const intro = page.locator('p.page-intro');
	await expect(intro).toBeVisible();

	await makeNotebook(page, 'The kitchen');
	await visit(page, '/notebooks');
	await expect(page.locator('p.page-intro')).toHaveCount(0);
});
