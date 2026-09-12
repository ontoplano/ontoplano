import type { IsolatedEvent } from '$lib/isolated/routes';
import { buildCtx } from '$lib/services/ctx';
import { toActionFailure } from '$lib/http-errors';
import { getCurrency } from '$lib/services/settings';
import { parseMoney } from '$lib/money';
import {
	createLedger,
	deleteLedger,
	listLedgers,
	moveLedger,
	setLedgerArchived,
	updateLedger
} from '$lib/services/ledgers';
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
	createLedger: async ({ request, locals }: IsolatedEvent) => {
		const form = await request.formData();
		try {
			const made = createLedger(buildCtx(locals.user!.id), {
				name: form.get('heading'),
				kind: form.get('kind') || 'bank',
				defaultParser: form.get('defaultParser')
			});
			return { success: true, ledgerId: made.id };
		} catch (e) {
			return toActionFailure(e);
		}
	},

	updateLedger: async ({ request, locals }: IsolatedEvent) => {
		const form = await request.formData();
		try {
			updateLedger(buildCtx(locals.user!.id), Number(form.get('id')), {
				name: form.get('heading'),
				kind: form.get('kind'),
				defaultParser: form.get('defaultParser')
			});
			return { success: true };
		} catch (e) {
			return toActionFailure(e);
		}
	},

	moveLedger: async ({ request, locals }: IsolatedEvent) => {
		const form = await request.formData();
		try {
			moveLedger(buildCtx(locals.user!.id), Number(form.get('id')), Number(form.get('delta')));
			return { success: true };
		} catch (e) {
			return toActionFailure(e);
		}
	},

	archiveLedger: async ({ request, locals }: IsolatedEvent) => {
		const form = await request.formData();
		try {
			setLedgerArchived(
				buildCtx(locals.user!.id),
				Number(form.get('id')),
				form.get('archived') === 'true'
			);
			return { success: true };
		} catch (e) {
			return toActionFailure(e);
		}
	},

	deleteLedger: async ({ request, locals }: IsolatedEvent) => {
		const form = await request.formData();
		try {
			deleteLedger(buildCtx(locals.user!.id), Number(form.get('id')));
			return { success: true };
		} catch (e) {
			return toActionFailure(e);
		}
	},

	import: async ({ request, locals }: IsolatedEvent) => {
		const form = await request.formData();
		try {
			const result = importStatement(buildCtx(locals.user!.id), {
				ledgerId: form.get('ledgerId'),
				source: form.get('source'),
				text: form.get('text'),
				flip: form.get('flip') === 'on'
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
