import type { Actions, RequestEvent } from '@sveltejs/kit';
import { buildCtx } from '$lib/services/ctx';
import { toActionFailure } from '$lib/http-errors';
import {
	createLedger,
	deleteLedger,
	moveLedger,
	setLedgerArchived,
	updateLedger
} from '$lib/services/ledgers';

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
 * notebook — see `$lib/module-actions`.
 */
type Event = Pick<RequestEvent, 'request'> & { locals: App.Locals };

export const ledgerHandlers = {
	create: async ({ request, locals }: Event) => {
		const form = await request.formData();
		try {
			const made = createLedger(buildCtx(locals.user!.id), {
				name: form.get('heading'),
				kind: form.get('kind') || 'bank',
				defaultParser: form.get('defaultParser'),
				// `has` rather than `get`: the room's form says nothing about a
				// notebook and must not be read as taking the ledger out of one.
				...(form.has('notebookId') ? { notebookId: form.get('notebookId') } : {})
			});
			return { success: true, ledgerId: made.id };
		} catch (e) {
			return toActionFailure(e);
		}
	},

	update: async ({ request, locals }: Event) => {
		const form = await request.formData();
		try {
			updateLedger(buildCtx(locals.user!.id), Number(form.get('id')), {
				name: form.get('heading'),
				kind: form.get('kind'),
				defaultParser: form.get('defaultParser'),
				...(form.has('notebookId') ? { notebookId: form.get('notebookId') } : {})
			});
			return { success: true };
		} catch (e) {
			return toActionFailure(e);
		}
	},

	move: async ({ request, locals }: Event) => {
		const form = await request.formData();
		try {
			moveLedger(buildCtx(locals.user!.id), Number(form.get('id')), Number(form.get('delta')));
			return { success: true };
		} catch (e) {
			return toActionFailure(e);
		}
	},

	/** Put away without losing anything: its lines stay, and its totals with them. */
	archive: async ({ request, locals }: Event) => {
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

	delete: async ({ request, locals }: Event) => {
		const form = await request.formData();
		try {
			deleteLedger(buildCtx(locals.user!.id), Number(form.get('id')));
			return { success: true };
		} catch (e) {
			return toActionFailure(e);
		}
	}
} satisfies Actions;
