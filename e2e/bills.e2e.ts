import { expect, test } from '@playwright/test';
import { register, testEmail } from './helpers/account';
import { visit } from './helpers/visit';

/**
 * The Finance section's first tab, driven the way a person uses it.
 *
 * A bill is added, marked paid for the amount that was actually paid, and the
 * month summary moves — the expected/paid/gap line is the point of the page,
 * so it is what the test watches. Then the payment is undone, because the undo
 * is the promise: nothing here is a one-way door.
 */
test('a bill can be added, paid for a real amount, and unpaid', async ({ page }) => {
	await register(page, testEmail('bills'));

	await visit(page, '/finance/bills');
	await expect(page.getByRole('heading', { name: 'Finance' })).toBeVisible();

	// Add a monthly bill through the modal.
	await page.getByRole('button', { name: /New bill/ }).click();
	const dialog = page.getByRole('dialog');
	await dialog.locator('[name="heading"]').fill('Rent');
	await dialog.locator('[name="amount"]').fill('1200,00');
	await dialog.locator('[name="dueDay"]').fill('5');
	await dialog.getByRole('button', { name: 'Add', exact: true }).click();

	await expect(page.getByText('Rent')).toBeVisible();

	// Edit it — the amount changes, and the month summary follows.
	await page.locator('li', { hasText: 'Rent' }).getByRole('button', { name: 'Edit Rent' }).click();
	const edit = page.getByRole('dialog');
	await edit.locator('[name="amount"]').fill('1300,00');
	await edit.getByRole('button', { name: 'Save' }).click();
	await expect(page.locator('li', { hasText: 'Rent' }).getByText(/1,300/)).toBeVisible();

	// Mark it paid for a little over — the box takes the real amount.
	await page
		.locator('li', { hasText: 'Rent' })
		.getByRole('button', { name: /^Mark .* paid$/ })
		.click();
	await page.locator('li', { hasText: 'Rent' }).locator('[name="amount"]').fill('1315,00');
	await page
		.locator('li', { hasText: 'Rent' })
		.getByRole('button', { name: 'Paid', exact: true })
		.click();

	// The row says paid, and the month is over plan by the difference.
	await expect(page.locator('li', { hasText: 'Rent' }).getByText('paid')).toBeVisible();
	await expect(page.getByText(/over/)).toBeVisible();

	// Phone size, because this ships on the phone too.
	await page.setViewportSize({ width: 390, height: 844 });
	await expect(page.getByText('Rent')).toBeVisible();
	await page.screenshot({ path: 'test-results/bills-phone.png' });

	// Undo the payment — back to unpaid.
	await page.setViewportSize({ width: 1200, height: 900 });
	await page
		.locator('li', { hasText: 'Rent' })
		.getByRole('button', { name: /^Undo the payment/ })
		.click();
	await expect(
		page.locator('li', { hasText: 'Rent' }).getByRole('button', { name: /^Mark .* paid$/ })
	).toBeVisible();
});

test('a weekly bill settles into its week', async ({ page }) => {
	await register(page, testEmail('bills-weekly'));
	await visit(page, '/finance/bills');

	await page.getByRole('button', { name: /New bill/ }).click();
	const dialog = page.getByRole('dialog');
	await dialog.locator('[name="heading"]').fill('Cleaner');
	await dialog.locator('[name="amount"]').fill('120,00');
	await dialog.locator('[name="rhythm"]').selectOption('weekly');
	await dialog.getByRole('button', { name: 'Add', exact: true }).click();

	await expect(page.getByText('Cleaner')).toBeVisible();
	await expect(page.locator('li', { hasText: 'Cleaner' }).getByText(/Weekly/)).toBeVisible();

	await page
		.locator('li', { hasText: 'Cleaner' })
		.getByRole('button', { name: /^Mark .* paid$/ })
		.click();
	await page
		.locator('li', { hasText: 'Cleaner' })
		.getByRole('button', { name: 'Paid', exact: true })
		.click();
	await expect(page.locator('li', { hasText: 'Cleaner' }).getByText('paid')).toBeVisible();
});

test('an archived bill can be deleted, behind a confirmation', async ({ page }) => {
	await register(page, testEmail('bills-del'));
	await visit(page, '/finance/bills');

	await page.getByRole('button', { name: /New bill/ }).click();
	const add = page.getByRole('dialog');
	await add.locator('[name="heading"]').fill('Old subscription');
	await add.locator('[name="amount"]').fill('9,90');
	await add.getByRole('button', { name: 'Add', exact: true }).click();
	await expect(page.getByText('Old subscription')).toBeVisible();

	// Archive it, then open the archived list.
	await page
		.locator('li', { hasText: 'Old subscription' })
		.getByRole('button', { name: 'Archive Old subscription' })
		.click();
	await page.getByRole('button', { name: /Archived/ }).click();

	// Delete asks first — the confirm button is in its own dialog, not under the
	// trash icon that was clicked.
	await page
		.locator('li', { hasText: 'Old subscription' })
		.getByRole('button', { name: 'Delete Old subscription' })
		.click();
	const confirm = page.getByRole('dialog');
	await expect(confirm.getByText(/deleted for good/)).toBeVisible();
	// The Delete button is armed — a beat before it takes the click.
	await page.waitForTimeout(600);
	await confirm.getByRole('button', { name: 'Delete', exact: true }).click();

	await expect(page.getByText('Old subscription')).toHaveCount(0);
});

/**
 * A bill wants paying before it is due, and the week says so.
 *
 * The due day is the last day it can be paid; the lead is when it actually
 * wants doing. The planner draws that day, and ticking it there is what marks
 * the bill paid — so the money side is a consequence of the week's own
 * gesture rather than a second chore somebody has to remember.
 */
test('a bill with a lead lands on the week, and ticking it there pays it', async ({ page }) => {
	await register(page, testEmail('bills-week'));
	await visit(page, '/finance/bills');

	// Due the 15th, wanted three days earlier.
	await page.getByRole('button', { name: /New bill/ }).click();
	const add = page.getByRole('dialog');
	await add.locator('[name="heading"]').fill('Rent');
	await add.locator('[name="amount"]').fill('1200,00');
	await add.locator('[name="dueDay"]').fill('15');
	await add.locator('[name="payLeadDays"]').fill('3');
	await add.getByRole('button', { name: 'Add', exact: true }).click();

	// The row says both halves.
	await expect(page.locator('li', { hasText: 'Rent' }).getByText(/due the 15/)).toBeVisible();
	await expect(page.locator('li', { hasText: 'Rent' }).getByText(/3 days before/)).toBeVisible();

	// It is on the month's plan, on the 12th rather than the 15th.
	await visit(page, '/tasks/plan?view=month');
	const onGrid = page.getByText('Pay Rent').first();
	await expect(onGrid).toBeVisible();

	// Ticking it there marks the bill paid — the gesture is the week's.
	await onGrid.click();
	await expect(page.getByText(/Rent — paid/).first()).toBeVisible();

	await visit(page, '/finance/bills');
	await expect(page.locator('li', { hasText: 'Rent' }).getByText('paid')).toBeVisible();
});

test('an archived bill can still be corrected', async ({ page }) => {
	await register(page, testEmail('bills-arch-edit'));
	await visit(page, '/finance/bills');

	await page.getByRole('button', { name: /New bill/ }).click();
	const add = page.getByRole('dialog');
	await add.locator('[name="heading"]').fill('Old service');
	await add.locator('[name="amount"]').fill('50,00');
	await add.getByRole('button', { name: 'Add', exact: true }).click();

	await page
		.locator('li', { hasText: 'Old service' })
		.getByRole('button', { name: 'Archive Old service' })
		.click();
	await page.getByRole('button', { name: /Archived/ }).click();

	// The edit button is there in the archived list, and it works.
	await page
		.locator('li', { hasText: 'Old service' })
		.getByRole('button', { name: 'Edit Old service' })
		.click();
	const edit = page.getByRole('dialog');
	await edit.locator('[name="heading"]').fill('Old service (cancelled)');
	await edit.getByRole('button', { name: 'Save' }).click();

	await expect(page.getByText('Old service (cancelled)')).toBeVisible();
});

/** The two sizes this ships at: the phone app is the same code. */
const SIZES = [
	{ name: 'phone', width: 390, height: 844 },
	{ name: 'desktop', width: 1400, height: 900 }
] as const;

for (const size of SIZES) {
	/**
	 * A subscription on a card asks for nothing.
	 *
	 * Ticking Automatic disables the lead beside it and says so under it, and
	 * moves nothing on the form — the field is disabled rather than removed and
	 * the two hints share a cell. The bill then never turns up on the week.
	 */
	test(`an automatic bill is never asked for (${size.name})`, async ({ page }) => {
		test.setTimeout(120_000);
		await page.setViewportSize({ width: size.width, height: size.height });
		await register(page, testEmail(`bills-auto-${size.name}`));
		await visit(page, '/finance/bills');

		await page
			.getByRole('button', { name: /New bill/ })
			.first()
			.click();
		const dialog = page.getByRole('dialog', { name: 'New bill' });
		await dialog.locator('[name="heading"]').fill('Film streaming');
		await dialog.locator('[name="amount"]').fill('15,99');
		await dialog.locator('[name="dueDay"]').fill('14');

		const lead = dialog.getByRole('spinbutton', { name: 'Pay it this many days before' });
		await expect(lead).toBeEnabled();
		await expect(dialog.getByText("You won't be reminded to pay it.")).toBeHidden();

		// What sits below must not move when the box is ticked.
		const below = dialog.getByRole('button', { name: 'Notebook', exact: true });
		const before = await below.boundingBox();
		await dialog.getByRole('checkbox', { name: 'Automatic' }).check();
		await expect(lead).toBeDisabled();
		await expect(dialog.getByText("You won't be reminded to pay it.")).toBeVisible();
		expect((await below.boundingBox())?.y).toBe(before?.y);

		await dialog.getByRole('button', { name: 'Add', exact: true }).click();
		const row = page.locator('li', { hasText: 'Film streaming' });
		await expect(row.getByText('Automatic')).toBeVisible();
		await page.screenshot({ path: `test-results/bills-automatic-${size.name}.png` });

		// Editing it opens with the box ticked, and unticking it gives the lead back.
		await row.getByRole('button', { name: 'Edit Film streaming' }).click();
		const edit = page.getByRole('dialog', { name: 'Edit bill' });
		await expect(edit.getByRole('checkbox', { name: 'Automatic' })).toBeChecked();
		await edit.getByRole('button', { name: 'Cancel' }).click();

		// Not on the week: it pays itself.
		await visit(page, '/tasks/plan?view=month');
		await expect(page.getByText('Pay Film streaming')).toHaveCount(0);
	});

	/**
	 * A period can be skipped, and a row opens onto its history.
	 *
	 * Skipped is its own state — not paid, not overdue — and undoing it is one
	 * press. The history lists each period with its amount and whether it was
	 * paid or skipped, with the average per period over the ones paid.
	 */
	test(`a period can be skipped, undone, and read back in the history (${size.name})`, async ({
		page
	}) => {
		test.setTimeout(120_000);
		await page.setViewportSize({ width: size.width, height: size.height });
		await register(page, testEmail(`bills-skip-${size.name}`));
		await visit(page, '/finance/bills');

		await page
			.getByRole('button', { name: /New bill/ })
			.first()
			.click();
		const add = page.getByRole('dialog', { name: 'New bill' });
		await add.locator('[name="heading"]').fill('Climbing gym');
		await add.locator('[name="amount"]').fill('140,00');
		await add.getByRole('button', { name: 'Add', exact: true }).click();

		const row = page.locator('li', { hasText: 'Climbing gym' });
		await row.getByRole('button', { name: 'Skip Climbing gym this period' }).click();
		await expect(row.getByText('skipped', { exact: true })).toBeVisible();

		// The history says so, and nothing was paid.
		await row.getByRole('button', { name: 'History of Climbing gym' }).click();
		const history = row.locator('[id^="bill-history-"]');
		await expect(history.getByText('Skipped', { exact: true })).toBeVisible();
		await page.screenshot({ path: `test-results/bills-history-${size.name}.png` });

		// Undo the skip, then pay it: the average is what was paid.
		await row.getByRole('button', { name: 'Undo the skip for Climbing gym' }).click();
		await expect(row.getByText('skipped', { exact: true })).toHaveCount(0);
		await row.getByRole('button', { name: 'Mark Climbing gym paid' }).click();
		await row.locator('[name="amount"]').fill('150,00');
		await row.getByRole('button', { name: 'Paid', exact: true }).click();
		await expect(row.getByText('paid', { exact: true })).toBeVisible();
		await expect(history.getByText('Average per month')).toBeVisible();
		await expect(history.getByText(/150/).first()).toBeVisible();

		// Nothing sideways at this size.
		const overflow = await page.evaluate(
			() => document.documentElement.scrollWidth > document.documentElement.clientWidth
		);
		expect(overflow).toBe(false);
	});
}

/**
 * A notebook's Bills tab is the room's list: the same row, the same form.
 *
 * It had pay, undo and archive but no edit — the room's form lived in the
 * room's page. Now edit, skip, and delete from the archived list are there too.
 */
test('a bill in a notebook can be edited, skipped, archived and deleted there', async ({
	page
}) => {
	test.setTimeout(150_000);
	await register(page, testEmail('bills-notebook'));

	await visit(page, '/notebooks');
	await page.getByRole('button', { name: 'New notebook' }).first().click();
	await page.getByLabel('Title').fill('Flat');
	await page.getByRole('button', { name: 'Create notebook' }).click();
	await page.waitForTimeout(600);
	await page.getByRole('link', { name: 'Flat' }).first().click();
	await page.waitForURL(/\?notebook=\d+/);
	const id = new URL(page.url()).searchParams.get('notebook');
	await visit(page, `/notebooks/${id}`);
	await page.getByRole('button', { name: 'Rename' }).click();
	await page.getByRole('checkbox', { name: 'Bills' }).check();
	await page.getByRole('button', { name: 'Save' }).click();
	await page.waitForTimeout(600);

	await page.getByRole('button', { name: /^Bills/ }).click();
	await page.getByRole('button', { name: 'New bill' }).click();
	const add = page.getByRole('dialog', { name: 'New bill' });
	await add.getByLabel('Name').fill('Service charge');
	await add.locator('[name="amount"]').fill('90,00');
	await add.getByRole('button', { name: 'Add', exact: true }).click();

	const row = page.locator('li', { hasText: 'Service charge' });
	await row.getByRole('button', { name: 'Edit Service charge' }).click();
	const edit = page.getByRole('dialog', { name: 'Edit bill' });
	await edit.getByLabel('Name').fill('Service charge (block B)');
	await edit.getByRole('button', { name: 'Save', exact: true }).click();
	const renamed = page.locator('li', { hasText: 'Service charge (block B)' });
	await expect(renamed).toBeVisible();

	await renamed.getByRole('button', { name: 'Skip Service charge (block B) this period' }).click();
	await expect(renamed.getByText('skipped', { exact: true })).toBeVisible();

	await renamed.getByRole('button', { name: 'Archive Service charge (block B)' }).click();
	await page.getByRole('button', { name: /Archived/ }).click();
	await page
		.locator('li', { hasText: 'Service charge (block B)' })
		.getByRole('button', { name: 'Delete Service charge (block B)' })
		.click();
	const confirm = page.getByRole('dialog', { name: 'Delete this bill?' });
	await page.waitForTimeout(600);
	await confirm.getByRole('button', { name: 'Delete', exact: true }).click();
	await expect(page.getByText('Service charge (block B)')).toHaveCount(0);
});
