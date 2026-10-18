import type { IsolatedEvent } from '$lib/isolated/routes';
import { buildCtx } from '$lib/services/ctx';
import { pickableNotebooks } from '$lib/services/notebooks';
import { ledgerHandlers } from '$lib/services/ledger-actions';
import { getCurrency } from '$lib/services/settings';
import {
	deleteBalanceCheck,
	getBalanceCheck,
	getLedger,
	listBalanceChecks,
	listLedgers,
	recordBalanceCheck,
	supported
} from '$lib/services/ledgers';
import { parseSignedMoney } from '$lib/money';
import { NotFoundError, ValidationError } from '$lib/services/errors';
import { formAction } from '$lib/services/scoped-actions';
import { listCommitments } from '$lib/services/commitments';
import {
	availableParsers,
	classifyMovements,
	deleteMovement,
	detachMovement,
	importStatement,
	linkMovement,
	linkTransfer,
	getMovementRow,
	listMovements,
	recordMovement,
	splitMovement,
	unsplitMovement,
	recentForLinking,
	monthsWithLines,
	uncategorizedCount,
	unlinkTransfer,
	UNCATEGORIZED,
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
	// Only the lines no category claims — the ones the Rules tab is for.
	const loose = url.searchParams.get('uncategorized') === '1';
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
		funds: supported(ctx),
		commitments: listCommitments(ctx),
		checks: current ? listBalanceChecks(ctx, current.id) : [],
		current,
		query,
		month,
		loose,
		movements: filter
			? listMovements(ctx, {
					...filter,
					limit: 500,
					...(loose ? { category: UNCATEGORIZED, direction: 'out' as const } : {})
				})
			: [],
		/*
		 * The lines a meaning can point at: a transfer's counterpart, the
		 * expense a refund reverses, the payment a fee was charged on. Recent
		 * ones across every ledger — a counterpart is by definition in
		 * another account, so the visible list cannot supply it.
		 */
		counterparts: recentForLinking(ctx),
		months: current ? monthsWithLines(ctx, current.id) : [],
		unsorted: filter ? uncategorizedCount(ctx, filter) : 0
	};
};

export const actions = {
	splitMovement: formAction((ctx, form) => {
		const id = Number(form.get('id'));
		const movement = getMovementRow(ctx, id);
		if (!movement || movement.ledgerId === null) throw new NotFoundError('movement');
		const ledger = getLedger(ctx, movement.ledgerId);
		const parts = form.getAll('partData');
		if (!parts.length || parts.length > 100)
			throw new ValidationError('A split needs between 1 and 100 parts.');
		const allocations = parts.map((raw) => {
			let part;
			try {
				part = JSON.parse(String(raw));
			} catch {
				throw new ValidationError('Unreadable split part.');
			}
			if (!part || typeof part !== 'object' || Array.isArray(part))
				throw new ValidationError('Unreadable split part.');
			const amountMinor = parseSignedMoney(part.amount, ledger.currency);
			if (amountMinor === null)
				throw new ValidationError('Enter an exact signed part in the ledger currency.');
			return {
				kind: part.kind,
				amountMinor,
				category: part.category,
				commitmentId: part.commitmentId,
				note: part.note
			};
		});
		splitMovement(ctx, { id, allocations });
	}),
	unsplitMovement: formAction((ctx, form) => {
		unsplitMovement(ctx, Number(form.get('id')));
	}),
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

	recordBalanceCheck: formAction((ctx, form) => {
		const ledger = getLedger(ctx, Number(form.get('ledgerId')));
		const amount = parseSignedMoney(form.get('observedAmount'), ledger.currency);
		if (amount === null)
			throw new ValidationError(
				'Enter an exact statement closing amount in the ledger currency, or whole minor units when unspecified.'
			);
		recordBalanceCheck(ctx, {
			ledgerId: ledger.id,
			asOf: form.get('asOf'),
			observedMinor: amount,
			note: form.get('note')
		});
	}),
	deleteBalanceCheck: formAction((ctx, form) => {
		const check = getBalanceCheck(ctx, Number(form.get('id')));
		if (!check || check.ledgerId !== Number(form.get('ledgerId')))
			throw new NotFoundError('balance check');
		deleteBalanceCheck(ctx, check.id);
	}),
	import: formAction((ctx, form) => {
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
			mapping = typeof mappingField === 'string' && mappingField ? JSON.parse(mappingField) : null;
		} catch {
			// Unreadable JSON is no mapping at all.
		}

		const result = importStatement(ctx, {
			ledgerId: form.get('ledgerId'),
			source: form.get('source'),
			text: form.get('text'),
			flip: form.get('flip') === 'on',
			mapping
		});
		return { success: true, ...result };
	}),

	addMovement: formAction((ctx, form) => {
		const ledger = getLedger(ctx, Number(form.get('ledgerId')));
		const amount = parseSignedMoney(form.get('amount'), ledger.currency);
		if (amount === null)
			throw new ValidationError(
				'Enter an exact amount in the ledger currency, or whole minor units when unspecified.'
			);
		recordMovement(ctx, {
			ledgerId: form.get('ledgerId'),
			occurredOn: form.get('occurredOn'),
			// A line typed by hand is money leaving unless it says otherwise:
			// the common case is a purchase the bank has not published yet.
			amountCents: form.get('direction') === 'in' ? Math.abs(amount) : -Math.abs(amount),
			description: form.get('heading')
		});
	}),

	updateMovement: formAction((ctx, form) => {
		const amount = form.get('amount');
		updateMovement(ctx, Number(form.get('id')), {
			description: form.get('heading') ?? undefined,
			occurredOn: form.get('occurredOn') ?? undefined,
			ledgerId: form.get('ledgerId') ?? undefined,
			kind: form.get('kind') ?? undefined,
			amountCents:
				amount === null || amount === ''
					? undefined
					: (() => {
							const ledger = getLedger(ctx, Number(form.get('ledgerId')));
							const cents = parseSignedMoney(amount, ledger.currency);
							if (cents === null)
								throw new ValidationError(
									'Enter an exact amount in the ledger currency, or whole minor units when unspecified.'
								);
							return form.get('direction') === 'in' ? Math.abs(cents) : -Math.abs(cents);
						})()
		});
	}),

	/** What several lines were, in one write — the checkbox column's verb. */
	classify: formAction((ctx, form) => {
		const ids = form
			.getAll('ids')
			.map((id) => Number(id))
			.filter((id) => Number.isInteger(id));
		const result = classifyMovements(ctx, { ids, kind: form.get('kind') });
		return { success: true, updated: result.updated };
	}),

	linkTransfer: formAction((ctx, form) => {
		linkTransfer(ctx, {
			id: form.get('id'),
			counterpartId: form.get('counterpartId')
		});
	}),

	unlinkTransfer: formAction((ctx, form) => {
		unlinkTransfer(ctx, Number(form.get('id')));
	}),

	/** A refund reverses an expense; a fee belongs to the payment it was charged on. */
	detachMovement: formAction((ctx, form) => {
		detachMovement(ctx, Number(form.get('id')));
	}),

	linkMovement: formAction((ctx, form) => {
		linkMovement(ctx, {
			id: form.get('id'),
			parentId: form.get('parentId'),
			relation: form.get('relation') === 'fee' ? 'fee' : 'refund'
		});
	}),

	deleteMovement: formAction((ctx, form) => {
		deleteMovement(ctx, Number(form.get('id')));
	})
};
