import type { Actions } from '@sveltejs/kit';
import { formAction } from '$lib/services/scoped-actions';
import { parseSignedMoney } from '$lib/money';
import { ValidationError } from './errors';
import {
	createLedger,
	deleteLedger,
	moveLedger,
	setLedgerArchived,
	updateLedger
} from '$lib/services/ledgers';

function openingFields(form: FormData) {
	const currency =
		String(form.get('currency') ?? '')
			.trim()
			.toUpperCase() || null;
	const amount = form.get('openingAmount');
	const openingMinor =
		amount === null || amount === '' ? undefined : parseSignedMoney(amount, currency);
	if (openingMinor === null)
		throw new ValidationError(
			'Enter an exact opening amount in the ledger currency, or whole minor units when unspecified.'
		);
	return {
		...(form.has('currency') ? { currency } : {}),
		...(form.has('openingOn') ? { openingOn: form.get('openingOn') } : {}),
		...(openingMinor === undefined ? {} : { openingMinor })
	};
}

/**
 * Everything that can be done to a ledger, wherever the row is on screen.
 *
 * The Finance room shows every ledger beside the lines in it; a notebook shows
 * the ones filed under its subject — the account the renovation is being paid
 * from — and naming, archiving or dropping one there has to mean the same
 * thing. The lines themselves stay in the room: a statement is a page, not a
 * panel, and a notebook is not where somebody imports one.
 *
 * Mounted under the room's older names there and under a prefix inside a
 * notebook — see `$lib/ledger-action-names`.
 */
export const ledgerHandlers = {
	create: formAction((ctx, form) => {
		const made = createLedger(ctx, {
			name: form.get('heading'),
			kind: form.get('kind') || 'bank',
			defaultParser: form.get('defaultParser'),
			...openingFields(form),
			// `has` rather than `get`: the room's form says nothing about a
			// notebook and must not be read as taking the ledger out of one.
			...(form.has('notebookId') ? { notebookId: form.get('notebookId') } : {})
		});
		return { success: true, ledgerId: made.id };
	}),

	update: formAction((ctx, form) => {
		updateLedger(ctx, Number(form.get('id')), {
			name: form.get('heading'),
			kind: form.get('kind'),
			defaultParser: form.get('defaultParser'),
			...openingFields(form),
			...(form.has('notebookId') ? { notebookId: form.get('notebookId') } : {})
		});
	}),

	move: formAction((ctx, form) => {
		moveLedger(ctx, Number(form.get('id')), Number(form.get('delta')));
	}),

	/** Put away without losing anything: its lines stay, and its totals with them. */
	archive: formAction((ctx, form) => {
		setLedgerArchived(ctx, Number(form.get('id')), form.get('archived') === 'true');
	}),

	delete: formAction((ctx, form) => {
		deleteLedger(ctx, Number(form.get('id')));
	})
} satisfies Actions;
