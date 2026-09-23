import type { IsolatedEvent } from '$lib/isolated/routes';
import { buildCtx } from '$lib/services/ctx';
import { pickableNotebooks } from '$lib/services/notebooks';
import { ledgerHandlers } from '$lib/services/ledger-actions';
import { toActionFailure } from '$lib/http-errors';
import { getCurrency } from '$lib/services/settings';
import { parseMoney } from '$lib/money';
import { listLedgers } from '$lib/services/ledgers';
import {
	availableParsers,
	deleteMovement,
	importStatement,
	listMovements,
	recordMovement,
	monthsWithLines,
	uncategorizedCount,
	updateMovement
} from '$lib/services/statements';

/**
 * Ledgers, and what moved through the one being looked at.
 *
 * The ledger in the URL is the one on screen; with none named it is the
 * first. Everything the page can do to a line — file it elsewhere, correct
 * it, drop it — is here, because a statement that can only be imported and
 * never corrected is a statement somebody stops trusting.
 */
export const load = async ({ locals, url }: IsolatedEvent) => {
	const ctx = buildCtx(locals.user!.id);
	const ledgers = listLedgers(ctx, { includeArchived: true });
	const asked = Number(url.searchParams.get('ledger') || 0);
	const current = ledgers.find((l) => l.id === asked) ?? ledgers.find((l) => !l.archived) ?? null;

	const query = url.searchParams.get('q') ?? '';
	const month = url.searchParams.get('month') ?? '';
	const filter = current
		? { ledgerId: current.id, query: query || undefined, month: month || undefined }
		: null;

	return {
		// The subject a thing belongs to, asked in the room's own form: the
		// notebook's tab opens this same form with its own notebook chosen.
		notebooks: pickableNotebooks(ctx),
		currency: getCurrency(ctx.userId),
		parsers: availableParsers(),
		ledgers,
		current,
		query,
		month,
		movements: filter ? listMovements(ctx, { ...filter, limit: 500 }) : [],
		months: current ? monthsWithLines(ctx, current.id) : [],
		unsorted: filter ? uncategorizedCount(ctx, filter) : 0
	};
};

export const actions = {
	/*
	 * The ledger itself, under the names this room has always used.
	 *
	 * The handlers are in `$lib/services/ledger-actions`, because a notebook's
	 * Ledgers tab runs the same ones — a ledger renamed there is renamed here.
	 * What stays below is this room's own work: importing a statement and
	 * correcting the lines in it.
	 */
	createLedger: ledgerHandlers.create,
	updateLedger: ledgerHandlers.update,
	moveLedger: ledgerHandlers.move,
	archiveLedger: ledgerHandlers.archive,
	deleteLedger: ledgerHandlers.delete,

	import: async ({ request, locals }: IsolatedEvent) => {
		const form = await request.formData();
		try {
			/*
			 * The column mapping, when the screen sent one.
			 *
			 * It travels as JSON in one field rather than as six: the shape is
			 * the generic reader's and it is built there, so a field per column
			 * would be this action knowing about columns it has no other reason
			 * to know about. Unreadable JSON is no mapping at all, which falls
			 * back to the reader's own guess rather than failing the import.
			 */
			const mappingField = form.get('mapping');
			let mapping = null;
			try {
				mapping =
					typeof mappingField === 'string' && mappingField ? JSON.parse(mappingField) : null;
			} catch {
				mapping = null;
			}

			const result = importStatement(buildCtx(locals.user!.id), {
				ledgerId: form.get('ledgerId'),
				source: form.get('source'),
				text: form.get('text'),
				flip: form.get('flip') === 'on',
				mapping
			});
			return { success: true, ...result };
		} catch (e) {
			return toActionFailure(e);
		}
	},

	addMovement: async ({ request, locals }: IsolatedEvent) => {
		const form = await request.formData();
		const ctx = buildCtx(locals.user!.id);
		try {
			const amount = parseMoney(form.get('amount'), getCurrency(ctx.userId)) ?? 0;
			recordMovement(ctx, {
				ledgerId: form.get('ledgerId'),
				occurredOn: form.get('occurredOn'),
				// A line typed by hand is money leaving unless it says otherwise:
				// the common case is a purchase the bank has not published yet.
				amountCents: form.get('direction') === 'in' ? Math.abs(amount) : -Math.abs(amount),
				description: form.get('heading')
			});
			return { success: true };
		} catch (e) {
			return toActionFailure(e);
		}
	},

	updateMovement: async ({ request, locals }: IsolatedEvent) => {
		const form = await request.formData();
		const ctx = buildCtx(locals.user!.id);
		try {
			const amount = form.get('amount');
			updateMovement(ctx, Number(form.get('id')), {
				description: form.get('heading') ?? undefined,
				occurredOn: form.get('occurredOn') ?? undefined,
				ledgerId: form.get('ledgerId') ?? undefined,
				amountCents:
					amount === null || amount === ''
						? undefined
						: (() => {
								const cents = parseMoney(amount, getCurrency(ctx.userId)) ?? 0;
								return form.get('direction') === 'in' ? Math.abs(cents) : -Math.abs(cents);
							})()
			});
			return { success: true };
		} catch (e) {
			return toActionFailure(e);
		}
	},

	deleteMovement: async ({ request, locals }: IsolatedEvent) => {
		const form = await request.formData();
		try {
			deleteMovement(buildCtx(locals.user!.id), Number(form.get('id')));
			return { success: true };
		} catch (e) {
			return toActionFailure(e);
		}
	}
};
