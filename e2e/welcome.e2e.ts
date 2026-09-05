import { expect, test } from '@playwright/test';
import { clientAddress } from './helpers/account';
import { visit } from './helpers/visit';

/**
 * First run, one question at a time.
 *
 * It was a page of five fields under one heading, which is the shape people
 * close before answering any of them. The wizard is the same single form — every
 * step stays in the document, so nothing is lost between them and a browser with
 * no JavaScript still sees one page with one button.
 *
 * The room picker is the step worth testing hardest: what it decides is what the
 * whole app looks like afterwards, and getting it backwards would hide the rooms
 * somebody asked for.
 */
async function fresh(page: import('@playwright/test').Page) {
	await page.setExtraHTTPHeaders({ 'x-forwarded-for': clientAddress() });
	await visit(page, '/login?register');

	const register = page.getByRole('button', { name: 'Register' });
	if (await register.count()) await register.click();

	const email = `welcome-${Date.now()}-${Math.floor(Math.random() * 1e6)}@test.invalid`;
	for (const [name, value] of [
		['name', 'Welcome Test'],
		['email', email],
		['password', 'hunter2hunter2'],
		['confirm', 'hunter2hunter2']
	] as const) {
		const field = page.locator(`input[name="${name}"]`);
		if (await field.count()) await field.first().fill(value);
	}
	await page.locator('button[type="submit"]').first().click();
	await page.waitForURL(/\/welcome/, { timeout: 20000 });
}

test('it asks one thing at a time, and the rooms you keep are the rooms you get', async ({
	page
}) => {
	await page.setViewportSize({ width: 1280, height: 900 });
	await fresh(page);

	// One question on screen: the others are in the document and hidden, which
	// is what keeps their answers in the submission.
	await expect(page.getByRole('heading', { name: 'Use it with an AI' })).toBeVisible();
	await expect(page.getByRole('heading', { name: 'Which rooms do you want?' })).toBeHidden();
	await expect(page.getByText('Step 1 of 6')).toBeVisible();

	// One press mints the key and shows the prompt around it — without moving
	// the wizard, whose own answers must survive the round trip.
	await page.getByRole('button', { name: 'Create the key and the prompt' }).click();
	await expect(page.locator('code', { hasText: '/api/mcp' })).toBeVisible();
	await expect(page.locator('code', { hasText: 'onto_' })).toBeVisible();
	await expect(page.getByText('Step 1 of 6')).toBeVisible();

	await page.getByRole('button', { name: 'Next' }).click();
	await expect(page.getByRole('heading', { name: 'Where are you?' })).toBeVisible();

	await page.getByRole('button', { name: 'Next' }).click();
	await expect(page.getByRole('heading', { name: 'When does your week start?' })).toBeVisible();
	await page.getByRole('button', { name: 'Monday', exact: true }).click();

	await page.getByRole('button', { name: 'Next' }).click();
	await expect(page.getByRole('heading', { name: 'Which rooms do you want?' })).toBeVisible();

	// The description follows the pointer: eight names nobody has seen mean
	// nothing on their own.
	await page.getByRole('button', { name: 'Notebooks' }).hover();
	await expect(page.getByText('A subject you write against')).toBeVisible();
	await page.getByRole('button', { name: 'Recipes' }).hover();
	await expect(page.getByText('a list of shopping items with amounts')).toBeVisible();

	// Everything is on to begin with; turn two off.
	await expect(page.getByText('8 of 8 on.')).toBeVisible();
	await page.getByRole('button', { name: 'People' }).click();
	await page.getByRole('button', { name: 'Health' }).click();
	await expect(page.getByText('6 of 8 on.')).toBeVisible();

	await page.getByRole('button', { name: 'Next' }).click();
	await expect(page.getByRole('heading', { name: 'How should it look?' })).toBeVisible();
	await page.getByRole('button', { name: 'Dark', exact: true }).click();
	// Applied as it is picked: a theme you cannot see is not a choice.
	await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

	await page.getByRole('button', { name: 'Next' }).click();
	await expect(page.getByRole('heading', { name: 'Start from a week?' })).toBeVisible();
	// The last step offers the finish rather than another Next.
	await expect(page.getByRole('button', { name: 'Next' })).toHaveCount(0);

	await page.getByRole('button', { name: 'Start planning' }).click();
	await page.waitForURL(/\/tasks\/plan/, { timeout: 20000 });

	// And every answer arrived: the two rooms are gone from the navigation and
	// the six that were kept are not.
	const nav = page.locator('header').first();
	await expect(nav.getByRole('link', { name: 'Notebooks' })).toBeVisible();
	await expect(nav.getByRole('link', { name: 'People' })).toHaveCount(0);
	await expect(nav.getByRole('link', { name: 'Health' })).toHaveCount(0);
	await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
});

test('skipping asks nothing and keeps every room', async ({ page }) => {
	await page.setViewportSize({ width: 1280, height: 900 });
	await fresh(page);

	await page.getByRole('button', { name: /skip/i }).click();
	await page.waitForURL(/\/tasks\/plan/, { timeout: 20000 });

	// Skipping is not a choice about rooms: an account that never answered gets
	// the whole app rather than an empty navigation.
	const nav = page.locator('header').first();
	for (const room of ['Notebooks', 'People', 'Health', 'Shopping', 'Recipes'])
		await expect(nav.getByRole('link', { name: room })).toBeVisible();
});
