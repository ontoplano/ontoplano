import { fail } from '@sveltejs/kit';

import type { Actions, PageServerLoad } from './$types';

import { ASSISTANT_SCOPES } from '$lib/server/mcp/tools';
import { buildCtx } from '$lib/server/services/ctx';
import { toActionFailure } from '$lib/server/http-errors';
import { listAssistantCalls, putBack } from '$lib/server/services/assistant-log';
import { SCOPES, createToken, isCalendarLink, listTokens } from '$lib/server/services/tokens';

/** What each family of permissions is called, in the words the app uses. */
const SUBJECT_LABELS: Record<string, string> = {
	tasks: 'To-do list',
	schedule: 'Your week',
	today: "Today's plan",
	habits: 'Habits',
	notes: 'Diary and notebooks',
	ideas: 'Ideas',
	shopping: 'Shopping list',
	inventory: 'Where things live',
	kitchen: 'Recipes',
	workouts: 'Workouts',
	bills: 'Bills',
	people: 'People',
	streams: 'Data streams',
	search: 'Search'
};

function assistantGrid() {
	const rows = new Map<
		string,
		{ subject: string; label: string; read: string | null; write: string | null; says: string[] }
	>();

	for (const scope of ASSISTANT_SCOPES) {
		const [subject, verb] = scope.split(':');
		const row = rows.get(subject) ?? {
			subject,
			label: SUBJECT_LABELS[subject] ?? subject,
			read: null,
			write: null,
			says: []
		};
		if (verb === 'read') row.read = scope;
		else row.write = scope;
		const says = SCOPES[scope as keyof typeof SCOPES];
		if (says) row.says.push(says);
		rows.set(subject, row);
	}

	// In the order the labels are written, which is roughly how much of somebody's
	// life each one is; anything unlabelled falls in after them rather than out.
	const order = Object.keys(SUBJECT_LABELS);
	return [...rows.values()].sort((a, b) => {
		const ai = order.indexOf(a.subject);
		const bi = order.indexOf(b.subject);
		return (ai === -1 ? order.length : ai) - (bi === -1 ? order.length : bi);
	});
}

export const load: PageServerLoad = async ({ locals, url }) => {
	const ctx = buildCtx(locals.user!.id);

	/*
	 * The keys that would already work, so the page can say whether making one
	 * is the next thing to do.
	 *
	 * Not which key: a key's secret is shown once and never again. A calendar
	 * link is a key too and is not one of these — it carries the single scope
	 * that reads the plan, which is not an assistant.
	 */
	const assistants = listTokens(ctx).filter(
		(t) => !isCalendarLink(t.scopes) && t.scopes.some((s) => ASSISTANT_SCOPES.includes(s))
	);

	return {
		origin: url.origin,
		assistants: assistants.map((t) => ({ id: t.id, name: t.name, createdAt: t.createdAt })),
		/*
		 * What an assistant may do, as a grid rather than a column of sentences.
		 *
		 * Every grant is "<thing>:read" or "<thing>:write", and drawn as a list of
		 * full sentences that came out as twenty-six lines of prose nobody reads —
		 * which is the same as not showing it. One row per thing and a column each
		 * for reading and writing is the same information in fourteen rows you can
		 * scan down, and the sentence is still there on the row for anybody who
		 * wants it.
		 *
		 * Built from the tools rather than listed, so a tool added later brings its
		 * permission with it. A subject nobody has named yet gets its own key as a
		 * label instead of being dropped: a grant that is granted and not shown is
		 * the one mistake this screen must not make.
		 */
		permissions: assistantGrid(),
		assistantCalls: listAssistantCalls(ctx, { limit: 20 })
	};
};

export const actions: Actions = {
	/*
	 * A key for an assistant, and nothing else.
	 *
	 * The full form — every scope, an expiry, the wider grants — is on the
	 * Integrations tab, for somebody wiring up a script. Here the list is the
	 * one an assistant actually uses — declaring a plugin, managing webhooks
	 * and handing out a calendar address are not things an assistant does, and
	 * offering them is asking somebody to decide something they have no way to
	 * decide. Deleting is offered, on its own line at the bottom and unticked:
	 * an assistant that can remove a person or a habit's history is a bad trade
	 * for most people most of the time, which makes it a thing to reach for
	 * rather than a thing to opt out of.
	 */
	createKey: async ({ request, locals }) => {
		const ctx = buildCtx(locals.user!.id);
		const form = await request.formData();

		/*
		 * What was ticked, clamped to what this form is for.
		 *
		 * The boxes are the caller's to untick — somebody who does not want an
		 * assistant reading their diary should be able to say so, and that is
		 * the whole point of showing them. The clamp is not about the boxes: a
		 * form post is anybody's to compose, and this route must not become a
		 * way to mint a key that deletes things when the page it belongs to
		 * never offers that.
		 */
		const asked = form.getAll('scopes').map(String);
		const offered = [...ASSISTANT_SCOPES, 'destructive'];
		const scopes = offered.filter((scope) => asked.includes(scope));
		if (scopes.length === 0) {
			return fail(400, { message: 'Tick at least one thing the assistant may do.' });
		}

		try {
			const token = createToken(ctx, {
				name: String(form.get('label') ?? '').trim() || 'AI assistant',
				scopes
			});
			// The secret is returned exactly once, here. It is not stored and
			// cannot be shown again.
			return { success: true, token };
		} catch (error) {
			return toActionFailure(error);
		}
	},

	/*
	 * The way back from a call that deleted something.
	 *
	 * The same action the Integrations tab has, because the record is drawn on
	 * both and a form posts to the route it is rendered in.
	 */
	putBack: async ({ request, locals }) => {
		const ctx = buildCtx(locals.user!.id);
		const form = await request.formData();
		try {
			putBack(ctx, Number(form.get('id')));
		} catch (error) {
			return toActionFailure(error);
		}
		return { success: true };
	}
};
