/**
 * The money model, seeded through the real screens.
 *
 * Story 5.4 wants the same acceptance arithmetic driven through the UI in
 * both instances — the adapter-node server and the shipped static build over
 * SQLite-WASM. This helper is that seed and that assertion, shared by
 * `e2e/finance-model.e2e.ts` and `e2e-isolated/finance-model.e2e.ts`, so the
 * numbers they prove cannot drift apart.
 *
 * Every amount is synthetic integer minor units from
 * `planning/finance/acceptance-fixtures.json` (read-only local input). The
 * model deliberately mixes every case Story 5.4 names: a transfer with a
 * supported fee (C01), a custody receipt split with an approved offset and a
 * final settlement (C02), a budget and a reserve consumed by one real payment
 * (C03), a linked partial refund (C04), a cash withdrawal (C05), a
 * cross-currency transfer (C06), a custody settlement (C07), an account with
 * no declared opening (C08), and an import replayed after its rows were
 * classified and split (C09).
 *
 * UI, MCP and REST parity is a served-instance concern: the shipped static
 * build has no server to ask, so that check lives in the served spec.
 */
import { expect, type Page } from '@playwright/test';
import { addLedger } from './finance-balances';
import { visit } from './visit';

/** The month every spending and budget figure below belongs to. */
export const MONTH = '2026-10';

/**
 * The numbers the seeded model must add up to, in the format the screens use.
 *
 * Supported KES funds (one currency, never combined with USD or GBP):
 *   Everyday 30,000.00
 *            − 2,500.00 (C01 out) − 25.00 (C01 fee)
 *            − 2,500.00 (C03 payment)
 *            − 1,200.00 (C04 purchase) + 400.00 (C04 refund)
 *            − 5,000.00 (C05 cash) − 2,600.00 (C06 KES leg)
 *            + 10,000.00 (C02 receipt) − 1,990.00 − 10.00 (C02 offset + fee)
 *            − 7,700.00 (C02 final settlement) − 1,000.00 (C07 offset)
 *            = 15,875.00
 *   Savings     5,000.00 + 2,500.00 (C01 in) = 7,500.00
 *   Replay          0.00 − 10.00 − 20.00 (C09 import) = −30.00
 *   total       15,875.00 + 7,500.00 − 30.00 = 23,345.00
 *   custody     6,000.00 − 1,000.00 (C07) − 5.00 (C09 custody part) = 4,995.00
 *   reserve     4,000.00 − 2,500.00 (C03) = 1,500.00
 *   available   23,345.00 − 4,995.00 − 1,500.00 = 16,850.00
 *   payables    1,000.00 open claim; receivables 500.00 open claim.
 *               Claims are shown separately and never subtracted from funds.
 *   spending    gross 3,750.00 (25.00 + 2,500.00 + 1,200.00 + 10.00 + 15.00)
 *               refunds 400.00, net 3,350.00, income 300.00 (C02 personal part)
 *   budget left 6,000.00 − 2,500.00 = 3,500.00
 * USD: 100.00 + 20.00 (C06 USD leg) = 120.00.
 * GBP: no opening, 25.00 recorded only, so no balance is labelled available.
 */
export const EXPECTED = {
	funds: '23,345.00',
	custody: '4,995.00',
	reserves: '1,500.00',
	committed: '6,495.00',
	available: '16,850.00',
	gross: '3,750.00',
	refunds: '400.00',
	net: '3,350.00',
	income: '300.00',
	cash: '5,000.00',
	left: '3,500.00',
	budget: '6,000.00',
	budgetSpent: '2,500.00',
	payableClaim: '1,000.00',
	receivableClaim: '500.00',
	usdAvailable: '120.00',
	gbpRecordedOnly: '25.00'
} as const;

/**
 * The ledger strip marks its current tab; waiting for that mark is how a pick
 * is known to have finished, because the pick is a client-side `goto` and a
 * click returns before its load does. Acting in that gap closes what was just
 * opened, which on the slower device build is routine.
 */
function ledgerTab(page: Page, name: string) {
	const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	return page
		.getByRole('navigation', { name: 'Ledgers', exact: true })
		.getByRole('button', { name: new RegExp(`^${escaped}(\\b|$)`) });
}

async function selectLedger(page: Page, name: string) {
	const tab = ledgerTab(page, name);
	if ((await tab.getAttribute('aria-current')) === 'page') return;
	await page
		.getByTestId('ledger-balance')
		.filter({ hasText: name })
		.getByRole('button', { name, exact: true })
		.click();
	await expect(tab).toHaveAttribute('aria-current', 'page');
}

/** addLedger, then wait for the pick it ends on to finish loading. */
async function addAccount(page: Page, name: string, opening?: string, currency = 'KES') {
	await addLedger(page, name, opening, currency);
	await expect(ledgerTab(page, name)).toHaveAttribute('aria-current', 'page');
}

/** One bank line through the "New line" form of the selected ledger. */
async function line(
	page: Page,
	description: string,
	amount: string,
	direction: 'in' | 'out',
	day: string
) {
	await page.getByRole('button', { name: /^New line/ }).click();
	const dialog = page.getByRole('dialog', { name: 'New line', exact: true });
	await dialog.locator('[name="heading"]').fill(description);
	await dialog.locator('[name="occurredOn"]').fill(day);
	await dialog.locator('[name="amount"]').fill(amount);
	await dialog.locator('[name="direction"]').selectOption(direction);
	await dialog.getByRole('button', { name: 'Add', exact: true }).click();
	await expect(dialog).toBeHidden();
	await expect(
		page.locator('[data-row]:visible').filter({ hasText: description }).first()
	).toBeVisible();
}

async function openEditor(page: Page, description: string) {
	const row = page.locator('[data-row]:visible').filter({ hasText: description }).first();
	await row.getByRole('button', { name: 'Edit this line', exact: true }).click();
	return page.getByRole('dialog', { name: 'Edit line', exact: true });
}

const KIND_LABEL: Record<string, string> = {
	expense: 'Spending',
	income: 'Income',
	transfer: 'Transfer',
	refund: 'Refund',
	fee: 'Fee',
	cash: 'Cash withdrawal'
};

/** The row's chip, once the action that set it has landed. */
async function expectKind(page: Page, description: string, kind: string) {
	await expect(
		page.locator('[data-row]:visible').filter({ hasText: description }).first()
	).toContainText(KIND_LABEL[kind] ?? kind);
}

async function saveEditor(page: Page) {
	const editor = page.getByRole('dialog', { name: 'Edit line', exact: true });
	await editor.getByRole('button', { name: 'Save', exact: true }).click();
	await expect(editor).toBeHidden();
}

/** Give a line its meaning (fee, cash, transfer, refund…). */
async function setKind(page: Page, description: string, kind: string) {
	await openEditor(page, description);
	const editor = page.getByRole('dialog', { name: 'Edit line', exact: true });
	await editor.locator('[name="kind"]').selectOption(kind);
	await saveEditor(page);
	// The action's reload has to land before the next press: on the slower
	// device build a click inside that window reaches the old row.
	await expectKind(page, description, kind);
}

/** Pair the edited line with its counterpart in another ledger (C01, C06). */
async function linkTransfer(page: Page, description: string, counterpart: string) {
	await setKind(page, description, 'transfer');
	const editor = await openEditor(page, description);
	const option = await editor
		.locator('[name="counterpartId"] option')
		.filter({ hasText: counterpart })
		.getAttribute('value');
	await editor.locator('[name="counterpartId"]').selectOption(option!);
	await editor.getByRole('button', { name: 'Link as transfer', exact: true }).click();
	await expect(editor).toBeHidden();
	await expectKind(page, description, 'transfer');
}

/** Link a credit to the expense it reverses (C04). */
async function linkRefund(page: Page, credit: string, expense: string) {
	const editor = await openEditor(page, credit);
	await editor.locator('[name="relation"]').selectOption('refund');
	const option = await editor
		.locator('[name="parentId"] option')
		.filter({ hasText: expense })
		.getAttribute('value');
	await editor.locator('[name="parentId"]').selectOption(option!);
	await editor.getByRole('button', { name: 'Link to this line', exact: true }).click();
	await expect(editor).toBeHidden();
	await expectKind(page, credit, 'refund');
}

/** Split the edited line into personal and custody parts (C02, C09). */
async function splitLine(
	page: Page,
	description: string,
	parts: { kind: 'personal' | 'custody'; amount: string; commitment?: string }[]
) {
	const editor = await openEditor(page, description);
	const split = page.getByTestId('movement-split');
	const fieldsets = split.locator('fieldset');
	for (const [index, part] of parts.entries()) {
		const fieldset = fieldsets.nth(index);
		await fieldset.locator('[name="partKind"]').selectOption(part.kind);
		await fieldset.locator('[name="amount"]').fill(part.amount);
		if (part.commitment) {
			const option = await fieldset
				.locator('[name="partCommitmentId"] option')
				.filter({ hasText: part.commitment })
				.getAttribute('value');
			await fieldset.locator('[name="partCommitmentId"]').selectOption(option!);
		}
	}
	await expect(split.getByRole('button', { name: 'Save split', exact: true })).toBeEnabled();
	await split.getByRole('button', { name: 'Save split', exact: true }).click();
	await expect(split).toContainText('View commitment history');
	await editor.getByRole('button', { name: 'Cancel', exact: true }).click();
	await expect(editor).toBeHidden();
}

async function createStock(page: Page, name: string, kind: string, opening: string) {
	await page
		.getByRole('button', { name: /^New commitment/ })
		.last()
		.click();
	const dialog = page.getByRole('dialog', { name: 'New commitment', exact: true });
	await dialog.locator('[name="heading"]').fill(name);
	await dialog.locator('[name="kind"]').selectOption(kind);
	await dialog.locator('[name="currency"]').fill('KES');
	await dialog.locator('[name="openingAmount"]').fill(opening);
	await dialog.getByRole('button', { name: 'Create', exact: true }).click();
	await expect(dialog).toBeHidden();
	// On the device build the load behind the closed dialog lands a beat later;
	// the row is the signal that the next press will reach a live screen.
	await expect(page.getByTestId('commitment').filter({ hasText: name })).toBeVisible();
}

/** A description matched as the option's tail, so "Hospital offset" cannot pick its fee. */
function endsWith(text: string): RegExp {
	return new RegExp(`·\\s*${text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`);
}

/** Settle or consume a stock with an existing payment (C02, C03, C07). */
async function payStock(
	page: Page,
	name: string,
	action: string,
	movement: string,
	balance: string
) {
	// Pick the stock by address rather than by a client-side click: on the
	// device build a link pressed while the previous action is still loading
	// can be lost between hit-test and navigation.
	const href = await page
		.getByTestId('commitment')
		.getByRole('link', { name, exact: true })
		.getAttribute('href');
	await visit(page, href!);
	const history = page.getByTestId('commitment-history');
	await expect(history).toContainText(name);
	await history.getByRole('button', { name: action, exact: true }).click();
	const dialog = page.getByRole('dialog', { name: action, exact: true });
	const option = await dialog
		.locator('[name="transactionId"] option')
		.filter({ hasText: endsWith(movement) })
		.getAttribute('value');
	await dialog.locator('[name="transactionId"]').selectOption(option!);
	await dialog.getByRole('button', { name: 'Confirm', exact: true }).click();
	await expect(dialog).toBeHidden();
	await expect(history).toContainText(balance);
}

async function createBudget(page: Page, month: string, amount: string) {
	await page
		.getByRole('button', { name: /^New budget/ })
		.last()
		.click();
	const form = page.getByRole('dialog', { name: 'New budget', exact: true });
	await form.getByLabel('Month', { exact: true }).fill(month);
	await form.getByLabel('Category', { exact: true }).selectOption('Support');
	await form.getByLabel('Currency', { exact: true }).selectOption('KES');
	await form.getByLabel('Allocated amount', { exact: true }).fill(amount);
	await form.getByRole('button', { name: 'Create', exact: true }).click();
	await expect(form).toBeHidden();
	await expect(page.getByTestId('budget-progress')).toContainText(EXPECTED.budget);
}

async function importCsv(page: Page, csv: string) {
	await page.getByRole('button', { name: 'Import', exact: true }).first().click();
	const importer = page.getByRole('dialog', { name: 'Import a statement' });
	await importer.locator('[name="text"]').fill(csv);
	return importer;
}

/** Seed every fixture case through the screens, then assert the money picture. */
export async function financeModelJourney(page: Page) {
	// ── Accounts ────────────────────────────────────────────────────────────
	await visit(page, '/finance/ledgers');
	await addAccount(page, 'Everyday', '30000.00');
	await addAccount(page, 'Savings', '5000.00');
	await addAccount(page, 'Replay', '0.00');
	await addAccount(page, 'Dollars', '100.00', 'USD');
	// GBP deliberately has no opening: C08's recorded-only currency.
	await addAccount(page, 'Unopened', undefined, 'GBP');

	// ── Bank lines ──────────────────────────────────────────────────────────
	await selectLedger(page, 'Everyday');
	await line(page, 'Move to savings', '2500.00', 'out', '2026-10-02'); // C01 out
	await line(page, 'Transfer fee', '25.00', 'out', '2026-10-02'); // C01 fee
	await line(page, 'Support payment', '2500.00', 'out', '2026-10-03'); // C03
	await line(page, 'Shop purchase', '1200.00', 'out', '2026-10-04'); // C04
	await line(page, 'Shop refund', '400.00', 'in', '2026-10-05'); // C04
	await line(page, 'ATM withdrawal', '5000.00', 'out', '2026-10-06'); // C05
	await line(page, 'Move to dollars', '2600.00', 'out', '2026-10-07'); // C06 out
	await line(page, 'Custody receipt', '10000.00', 'in', '2026-10-08'); // C02
	await line(page, 'Hospital offset', '1990.00', 'out', '2026-10-09'); // C02
	await line(page, 'Hospital offset fee', '10.00', 'out', '2026-10-09'); // C02
	await line(page, 'Final custody settlement', '7700.00', 'out', '2026-10-10'); // C02
	await line(page, 'Owner offset', '1000.00', 'out', '2026-10-11'); // C07

	await selectLedger(page, 'Savings');
	await line(page, 'Move from everyday', '2500.00', 'in', '2026-10-02'); // C01 in

	await selectLedger(page, 'Dollars');
	await line(page, 'Dollars received', '20.00', 'in', '2026-10-07'); // C06 in

	await selectLedger(page, 'Unopened');
	await line(page, 'Recorded only', '25.00', 'in', '2026-10-12'); // C08

	// ── Stocks (C02 custody, C03 reserve, C07 custody) ──────────────────────
	await visit(page, '/finance/commitments');
	await createStock(page, 'C02 owner payable', 'payable', '0.00');
	await createStock(page, 'Held for owner', 'custody', '6000.00');
	await createStock(page, 'Family reserve', 'reserve', '4000.00');
	// Open claims: owed to others and owed to me, never funds, never subtracted.
	await createStock(page, 'Open payable claim', 'payable', '1000.00');
	await createStock(page, 'Open receivable claim', 'receivable', '500.00');

	// C02: the mixed receipt splits into custody and personal income.
	await visit(page, '/finance/ledgers');
	await selectLedger(page, 'Everyday');
	await splitLine(page, 'Custody receipt', [
		{ kind: 'personal', amount: '300.00' },
		{ kind: 'custody', amount: '9700.00', commitment: 'C02 owner payable' }
	]);
	await visit(page, '/finance/commitments');
	await expect(
		page.getByTestId('commitment').filter({ hasText: 'C02 owner payable' })
	).toContainText('9,700.00');
	// The owner-approved hospital offset reduces the payable; the fee rides along.
	await payStock(page, 'C02 owner payable', 'Settle', 'Hospital offset', '7,710.00');
	await payStock(page, 'C02 owner payable', 'Settle', 'Hospital offset fee', '7,700.00');
	await payStock(page, 'C02 owner payable', 'Settle', 'Final custody settlement', '0.00');
	// C03: the reserve is consumed once by the real payment.
	await payStock(page, 'Family reserve', 'Consume reserve', 'Support payment', '1,500.00');
	// C07: a custody settlement lowers funds and the stock by the same amount.
	await payStock(page, 'Held for owner', 'Settle', 'Owner offset', '5,000.00');

	// ── Rules and budget (C03) ──────────────────────────────────────────────
	await visit(page, '/finance/rules');
	await page.getByRole('button', { name: 'New category', exact: true }).click();
	const rule = page.getByRole('dialog', { name: 'New rule', exact: true });
	await rule.locator('[name="heading"]').fill('Support');
	await rule.locator('[name="pattern"]').fill('Support');
	await rule.getByRole('button', { name: 'Add', exact: true }).click();
	await expect(rule).toBeHidden();

	await visit(page, `/finance/budgets?month=${MONTH}`);
	await createBudget(page, MONTH, '6000.00');
	await expect(page.getByTestId('budget-progress')).toContainText(EXPECTED.budget);
	await expect(page.getByTestId('budget-progress')).toContainText(EXPECTED.budgetSpent);

	// ── Meanings and links (C01, C04, C05, C06) ─────────────────────────────
	await visit(page, '/finance/ledgers');
	await selectLedger(page, 'Everyday');
	await setKind(page, 'Transfer fee', 'fee'); // C01
	await linkTransfer(page, 'Move to savings', 'Move from everyday'); // C01
	await setKind(page, 'ATM withdrawal', 'cash'); // C05
	await linkTransfer(page, 'Move to dollars', 'Dollars received'); // C06
	await linkRefund(page, 'Shop refund', 'Shop purchase'); // C04

	// ── C09: import, classify, split, replay ────────────────────────────────
	await selectLedger(page, 'Replay');
	const replayCsv =
		'Date,Description,Amount\n2026-10-05,Fixture replay one,-10.00\n2026-10-06,Fixture replay two,-20.00';
	let importer = await importCsv(page, replayCsv);
	await importer.getByRole('button', { name: 'Import', exact: true }).click();
	await expect(importer).toContainText('2 added, 0 already here.');
	// The same file again adds nothing, even before the rows are edited.
	await importer.locator('[name="text"]').fill(replayCsv);
	await importer.getByRole('button', { name: 'Import', exact: true }).click();
	await expect(importer).toContainText('0 added, 2 already here.');
	await importer.getByRole('button', { name: 'Done', exact: true }).click();

	await setKind(page, 'Fixture replay one', 'fee');
	await splitLine(page, 'Fixture replay two', [
		{ kind: 'personal', amount: '-15.00' },
		{ kind: 'custody', amount: '-5.00', commitment: 'Held for owner' }
	]);
	// Replaying after the edits still adds nothing and keeps kind and split.
	importer = await importCsv(page, replayCsv);
	await importer.getByRole('button', { name: 'Import', exact: true }).click();
	await expect(importer).toContainText('0 added, 2 already here.');
	await importer.getByRole('button', { name: 'Done', exact: true }).click();
	await expect(
		page.locator('[data-row]:visible').filter({ hasText: 'Fixture replay one' })
	).toContainText('Fee');
	await expect(
		page.locator('[data-row]:visible').filter({ hasText: 'Fixture replay two' })
	).toContainText('Split this movement');

	// ── The four questions, from the seeded model ───────────────────────────
	await assertMoneyPicture(page);
}

/** The four answers per original currency, and the fixture arithmetic. */
export async function assertMoneyPicture(page: Page) {
	await visit(page, `/finance?month=${MONTH}`);
	const moneySections = page.locator('section[data-tour="finance-overview-money"]');
	// One section per original currency: KES, USD and GBP. No combined total.
	await expect(moneySections).toHaveCount(3);
	const kes = page.getByRole('region', { name: 'KES', exact: true });
	const usd = page.getByRole('region', { name: 'USD', exact: true });
	const gbp = page.getByRole('region', { name: 'GBP', exact: true });

	// What is mine: supported funds less the two subtractions, named beside it.
	await expect(kes.getByTestId('available-formula')).toContainText(EXPECTED.funds);
	await expect(kes.getByTestId('available-formula')).toContainText(EXPECTED.custody);
	await expect(kes.getByTestId('available-formula')).toContainText(EXPECTED.reserves);
	await expect(kes).toContainText(EXPECTED.available);
	// What is committed: custody plus reserves.
	await expect(kes).toContainText(EXPECTED.committed);
	// Payables and receivables are separate claims, beside available, not in it.
	await expect(kes.getByTestId('claims')).toBeVisible();
	await expect(kes.getByTestId('claims')).toContainText(EXPECTED.payableClaim);
	await expect(kes.getByTestId('claims')).toContainText(EXPECTED.receivableClaim);

	// What I spent this month: C01 fee + C03 payment + C04 net + C09 rows,
	// with the transfer, cash and custody amounts excluded but quantified.
	await expect(kes.getByTestId('spending-net')).toContainText(EXPECTED.net);
	await expect(kes.getByTestId('spending-net')).toContainText(EXPECTED.income);
	await expect(kes).toContainText(EXPECTED.gross);
	await expect(kes).toContainText(EXPECTED.refunds);
	await expect(kes.getByTestId('spending-excluded')).toContainText('Transfers: 3');
	await expect(kes.getByTestId('spending-excluded')).toContainText(EXPECTED.cash);

	// What is left against the plans: the one budget's remaining amount.
	await expect(kes).toContainText(EXPECTED.budget);
	await expect(kes).toContainText(EXPECTED.budgetSpent);
	await expect(kes).toContainText(EXPECTED.left);

	// USD is its own total; the cross-currency leg is excluded, not converted.
	await expect(usd).toContainText(EXPECTED.usdAvailable);
	await expect(usd.getByTestId('spending-excluded')).toContainText('Transfers: 1');

	// C08: no declared opening means recorded movements only, never Available.
	await expect(gbp.getByTestId('gap-no-opening')).toBeVisible();
	await expect(gbp).toContainText(EXPECTED.gbpRecordedOnly);
	await expect(gbp.getByText('Available', { exact: true })).toHaveCount(0);

	// C06: unlike money is never added. KES + USD would be 16,970.00.
	await expect(page.getByText(/16,970/)).toHaveCount(0);

	// Nothing overflows the phone width the same way at either width.
	expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}

/** One currency's figures as the summary service and its two read doors answer them. */
type CurrencyPicture = {
	currency: string | null;
	fundsMinor: number | null;
	recordedOnlyMinor: number;
	custodyMinor: number;
	reservesMinor: number;
	availableMinor: number | null;
	payablesMinor: number;
	receivablesMinor: number;
	spending: {
		grossMinor: number;
		refundMinor: number;
		netMinor: number;
		incomeMinor: number;
	};
	budgets: { remainingMinor: number }[];
	gaps: { kind: string; count: number }[];
};
type Overview = { month: string; asOf: string; currencies: CurrencyPicture[] };

/**
 * Served-instance parity: the UI, REST and MCP answer the same month once.
 *
 * The page draws `moneyOverview`; `GET /api/v1/finance/summary` and the MCP
 * `summary` tool call the same function. This proves the three doors return
 * one object, then checks that object's arithmetic is exactly the fixture
 * numbers the page assertions above use — so UI, API and MCP cannot disagree.
 */
export async function assertServedParity(page: Page) {
	const request = page.context().request;
	// A statements:read key minted through the real form action.
	const scopes = new URLSearchParams();
	scopes.set('label', 'finance model parity');
	scopes.append('scopes', 'statements:read');
	const minted = await request.post('/settings/integrations/connections?/createToken', {
		headers: {
			Origin: 'http://localhost:4173',
			'x-sveltekit-action': 'true',
			'content-type': 'application/x-www-form-urlencoded'
		},
		data: scopes.toString()
	});
	const said = await minted.text();
	const token = /onto_[A-Za-z0-9_-]+/.exec(said)?.[0];
	expect(token, `no token: ${said.slice(0, 300)}`).toBeTruthy();

	const rest = await request.get(`/api/v1/finance/summary?month=${MONTH}`, {
		headers: { Authorization: `Bearer ${token}` }
	});
	expect(rest.status()).toBe(200);
	const picture = (await rest.json()) as Overview;

	const rpc = await request.post('/api/mcp', {
		headers: { Authorization: `Bearer ${token}`, 'content-type': 'application/json' },
		data: {
			jsonrpc: '2.0',
			id: 1,
			method: 'tools/call',
			params: { name: 'summary', arguments: { month: MONTH } }
		}
	});
	expect(rpc.status()).toBe(200);
	const reply = (await rpc.json()) as { result?: { structuredContent?: unknown } };
	// One object, three doors: the assistant and the endpoint agree exactly.
	expect(reply.result?.structuredContent).toEqual(picture);

	const find = (currency: string) => picture.currencies.find((row) => row.currency === currency)!;
	const kes = find('KES');
	expect(kes).toMatchObject({
		fundsMinor: 2334500,
		custodyMinor: 499500,
		reservesMinor: 150000,
		availableMinor: 1685000,
		payablesMinor: 100000,
		receivablesMinor: 50000,
		spending: {
			grossMinor: 375000,
			refundMinor: 40000,
			netMinor: 335000,
			incomeMinor: 30000
		}
	});
	expect(kes.budgets[0]).toMatchObject({ remainingMinor: 350000 });
	expect(find('USD')).toMatchObject({ availableMinor: 12000 });
	const gbp = find('GBP');
	expect(gbp).toMatchObject({
		fundsMinor: null,
		availableMinor: null,
		recordedOnlyMinor: 2500
	});
	// The gap is named, and the unopened line is not silently spending money.
	expect(gbp.gaps).toEqual(
		expect.arrayContaining([expect.objectContaining({ kind: 'no-opening', count: 1 })])
	);
}
