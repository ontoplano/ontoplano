/**
 * What just happened, said somewhere it can be seen.
 *
 * Every page used to answer at the top of itself — "Sections saved." above the
 * first card. On a phone, somebody who scrolled down to the Sections card and
 * pressed Save is four screens below that, so the app said nothing at all as
 * far as they could tell. The message was there; it was just not where they
 * were.
 *
 * So the answer is fixed to the viewport instead of to the document, and there
 * is one of these for the whole app rather than one per page.
 *
 * Two lifetimes, because the two kinds of message are not the same kind of
 * thing. A confirmation is a receipt — you glance at it and it has done its
 * job, so it leaves on its own after five seconds. A failure is unfinished
 * business: something you asked for did not happen, and a message about that
 * disappearing while you are reading it is how people end up believing a write
 * went through. It stays until it is dismissed.
 *
 * Both can be dismissed by hand. A message you cannot get rid of is its own
 * small insult.
 */

export type NoticeKind = 'success' | 'error' | 'info';

export type Notice = {
	id: number;
	kind: NoticeKind;
	message: string;
	/** When it goes on its own; null for the ones that wait to be dismissed. */
	until: number | null;
};

const SUCCESS_MS = 5000;

/** How many are shown at once. Older ones drop off the end rather than stack forever. */
const MAX = 4;

let nextId = 1;

export const notices = $state<{ items: Notice[] }>({ items: [] });

function push(kind: NoticeKind, message: string): number {
	const text = message.trim();
	if (!text) return 0;

	// The same thing said twice in a row is one thing. Double-submitting a form
	// should not build a column of identical receipts.
	const last = notices.items[notices.items.length - 1];
	if (last && last.kind === kind && last.message === text) {
		dismiss(last.id);
	}

	const id = nextId++;
	notices.items.push({
		id,
		kind,
		message: text,
		until: kind === 'error' ? null : Date.now() + SUCCESS_MS
	});
	if (notices.items.length > MAX) notices.items.splice(0, notices.items.length - MAX);
	return id;
}

export function dismiss(id: number): void {
	const at = notices.items.findIndex((n) => n.id === id);
	if (at !== -1) notices.items.splice(at, 1);
}

export const notify = {
	success: (message: string) => push('success', message),
	error: (message: string) => push('error', message),
	info: (message: string) => push('info', message),
	dismiss
};
