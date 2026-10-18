import type { IsolatedEvent } from '$lib/isolated/routes';
import { redirect } from '@sveltejs/kit';
import { buildCtx, localDateOf } from '$lib/services/ctx';
import { formAction } from '$lib/services/scoped-actions';
import { parseSignedMoney } from '$lib/money';
import { ValidationError } from '$lib/services/errors';
import { listPeople } from '$lib/services/people';
import { getCurrency } from '$lib/services/settings';
import { listLedgers } from '$lib/services/ledgers';
import { recentForLinking } from '$lib/services/statements';
import {
	createCommitment,
	updateCommitment,
	getCommitment,
	listCommitments,
	archiveCommitment,
	closeCommitment,
	deleteCommitment,
	listCommitmentEntries,
	addCommitmentEntry,
	deleteCommitmentEntry,
	settleCommitment,
	consumeReserve,
	commitmentTotals
} from '$lib/services/commitments';

/** Stocks and their evidence, kept separate from bank balances and monthly budgets. */
export const load = ({ locals, url }: IsolatedEvent) => {
	const ctx = buildCtx(locals.user!.id);
	const archived = url.searchParams.get('archived') === '1';
	const asked = Number(url.searchParams.get('commitment') || 0);
	const selected = asked ? getCommitment(ctx, asked) : null;
	const ledgers = listLedgers(ctx, { includeArchived: true });
	return {
		commitments: listCommitments(ctx, { includeArchived: archived }),
		archived,
		selected,
		entries: selected ? listCommitmentEntries(ctx, selected.id) : [],
		totals: commitmentTotals(ctx),
		people: listPeople(ctx),
		currency: getCurrency(ctx.userId),
		today: localDateOf(ctx.now, ctx.tz),
		movements: recentForLinking(ctx, 500).map((movement) => ({
			...movement,
			currency: ledgers.find((ledger) => ledger.id === movement.ledgerId)?.currency ?? null
		}))
	};
};

function amount(raw: unknown, currency: string | null): number {
	const result = parseSignedMoney(raw, currency);
	if (result === null)
		throw new ValidationError('Enter an exact signed amount in the commitment currency.');
	return result;
}

export const actions = {
	create: formAction((ctx, form) => {
		createCommitment(ctx, {
			name: form.get('heading'),
			kind: form.get('kind'),
			currency: form.get('currency'),
			openingMinor: amount(form.get('openingAmount'), String(form.get('currency') ?? '')),
			personId: form.get('personId'),
			notes: form.get('notes')
		});
	}),
	update: formAction((ctx, form) => {
		const id = Number(form.get('id'));
		getCommitment(ctx, id);
		updateCommitment(ctx, id, {
			name: form.get('heading'),
			kind: form.get('kind'),
			currency: form.get('currency'),
			openingMinor: amount(form.get('openingAmount'), String(form.get('currency') ?? '')),
			personId: form.get('personId'),
			notes: form.get('notes')
		});
	}),
	archive: formAction((ctx, form) => {
		archiveCommitment(ctx, Number(form.get('id')), form.get('archived') === 'true');
	}),
	close: formAction((ctx, form) => {
		closeCommitment(ctx, Number(form.get('id')), { writeOffNote: form.get('writeOffNote') });
	}),
	delete: async (event) => {
		const result = await formAction((ctx, form) => {
			const permanent = form.get('permanent') === 'true';
			deleteCommitment(ctx, Number(form.get('id')), { permanent });
			return { permanent };
		})(event);
		if ('permanent' in result)
			redirect(303, result.permanent ? '/finance/commitments?archived=1' : '/finance/commitments');
		return result;
	},
	addEntry: formAction((ctx, form) => {
		const stock = getCommitment(ctx, Number(form.get('commitmentId')));
		addCommitmentEntry(ctx, {
			commitmentId: stock.id,
			occurredOn: form.get('occurredOn'),
			amountMinor: amount(form.get('amount'), stock.currency),
			note: form.get('note')
		});
	}),
	deleteEntry: formAction((ctx, form) => {
		deleteCommitmentEntry(ctx, Number(form.get('id')));
	}),
	settle: formAction((ctx, form) => {
		settleCommitment(ctx, {
			commitmentId: form.get('commitmentId'),
			transactionId: form.get('transactionId'),
			note: form.get('note')
		});
	}),
	consume: formAction((ctx, form) => {
		consumeReserve(ctx, {
			commitmentId: form.get('commitmentId'),
			transactionId: form.get('transactionId'),
			note: form.get('note')
		});
	})
};
