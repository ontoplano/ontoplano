import type { PlainKey } from '$lib/i18n/keys';

/**
 * Every form answered, said on the screen without each screen saying it.
 *
 * A dialog saved from its footer already says "Saved" (`Modal`). Everything
 * else — an archive on a row, a switch in preferences, a rename in place —
 * answered with nothing but a changed page, and a changed page is easy to
 * miss. So `$lib/enhance` announces every answer it receives and the toast
 * layer turns it into a receipt or a refusal: one mechanism, which a form
 * written next year gets by existing.
 *
 * The receipt is read off the action's own name, by its first word —
 * `?/archiveLedger` is an archive — so nothing has to declare it. A form that
 * is submitted continuously (a divider being dragged, a counter, a field that
 * saves as it is typed) carries `data-quiet` and says nothing.
 */

export const FORM_ANSWERED = 'ontoplano:form-answered';

export type FormAnswer = {
	/** The action's name, `archiveLedger` for `?/archiveLedger`; null for a page's default action. */
	action: string | null;
	outcome: 'success' | 'failure' | 'error' | 'redirect';
	/** What the action said back, when it said something. */
	message: string | null;
	/** A refusal from `hooks.server.ts`, which the root layout already says. */
	refused: boolean;
	/** The page, a dialog, or an undo said something about this press already. */
	answered: boolean;
	/** Saved from a dialog's footer: `Modal` speaks for those. */
	fromDialog: boolean;
	/** `data-quiet` on the form or the button. */
	quiet: boolean;
};

/** The action a submission goes to, from the URL it is posted to. */
export function actionName(url: URL): string | null {
	const match = /^\?\/([A-Za-z0-9_]+)/.exec(url.search);
	return match ? match[1] : null;
}

/** First word of a camelCase action, lower case: `archiveLedger` → `archive`. */
function verbOf(action: string): string {
	return (/^[a-z]+/.exec(action)?.[0] ?? action).toLowerCase();
}

/** What each verb is answered with. A verb not here says nothing. */
const RECEIPTS: Record<string, PlainKey> = {
	create: 'toast.added',
	add: 'toast.added',
	put: 'toast.added',
	update: 'toast.saved',
	save: 'toast.saved',
	edit: 'toast.saved',
	set: 'toast.saved',
	toggle: 'toast.saved',
	rename: 'toast.renamed',
	delete: 'toast.deleted',
	remove: 'toast.removed',
	archive: 'toast.archived',
	move: 'toast.moved',
	schedule: 'toast.scheduled',
	unschedule: 'toast.unscheduled',
	reopen: 'toast.reopened',
	revoke: 'toast.revoked',
	finish: 'toast.done',
	copy: 'toast.copied',
	tag: 'toast.saved',
	untag: 'toast.saved',
	pin: 'toast.pinned'
};

/** The receipt for a successful action, or null where it says nothing. */
export function receiptFor(action: string | null): PlainKey | null {
	if (!action) return null;
	return RECEIPTS[verbOf(action)] ?? null;
}

/**
 * What the toast layer says about one answer: a receipt, a refusal, or
 * nothing. `message` is a translated sentence already, or a key to translate.
 */
export function speechFor(
	answer: FormAnswer
): { kind: 'receipt'; key: PlainKey } | { kind: 'receipt' | 'refusal'; text: string } | null {
	if (answer.quiet || answer.answered || answer.fromDialog || answer.refused) return null;
	if (answer.outcome === 'success') {
		if (answer.message) return { kind: 'receipt', text: answer.message };
		const key = receiptFor(answer.action);
		return key ? { kind: 'receipt', key } : null;
	}
	if (answer.outcome === 'failure' || answer.outcome === 'error') {
		return { kind: 'refusal', text: answer.message ?? '' };
	}
	return null;
}
