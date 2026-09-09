import { fail } from '@sveltejs/kit';

import type { Actions, PageServerLoad } from './$types';

import { ASSISTANT_SCOPES } from '$lib/server/mcp/tools';
import { buildCtx } from '$lib/server/services/ctx';
import { docsUrl } from '$lib/server/settings';
import { toActionFailure } from '$lib/server/http-errors';
import { listAssistantCalls, putBack } from '$lib/server/services/assistant-log';
import { SCOPES, createToken, isCalendarLink, listTokens } from '$lib/server/services/tokens';

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
		// The hoster's own docs, not ontoplano.com's — a self-hosted copy that
		// publishes its own should send its own people there.
		docsUrl: docsUrl(),
		assistants: assistants.map((t) => ({ id: t.id, name: t.name, createdAt: t.createdAt })),
		/*
		 * What an assistant is given, in the app's own words.
		 *
		 * Read from the tools rather than listed here, so a tool added later is
		 * described without anybody remembering — and only the ones an assistant
		 * actually uses. Declaring a plugin, managing webhooks and handing out a
		 * calendar address are not things an assistant does, and offering them on
		 * this page is asking somebody to decide something they have no way to
		 * decide.
		 */
		grants: ASSISTANT_SCOPES.map((key) => ({ key, description: SCOPES[key] })),
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
	 * decide. Deleting is not offered either: an assistant that can remove a
	 * person, a habit's history or a goal is a bad trade for the one time it
	 * would have been convenient, and the Integrations tab still grants it to
	 * anybody who disagrees.
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
		const scopes = ASSISTANT_SCOPES.filter((scope) => asked.includes(scope));
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
