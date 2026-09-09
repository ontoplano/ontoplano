import type { Actions, PageServerLoad } from './$types';

import { ASSISTANT_SCOPES } from '$lib/server/mcp/tools';
import { buildCtx } from '$lib/server/services/ctx';
import { toActionFailure } from '$lib/server/http-errors';
import { listAssistantCalls, putBack } from '$lib/server/services/assistant-log';
import { isCalendarLink, listTokens } from '$lib/server/services/tokens';

export const load: PageServerLoad = async ({ locals, url }) => {
	const ctx = buildCtx(locals.user!.id);

	/*
	 * Whether an assistant could already be connected.
	 *
	 * Not which token — a token's secret is shown once and never again, so this
	 * page cannot put a real one into the command it prints. What it can say is
	 * whether making one is the next step or whether the reader has been here
	 * before, and the two want different words.
	 *
	 * A calendar link is a token too and is not one of these: it carries the
	 * one scope that reads the plan, which is not an assistant.
	 */
	const assistants = listTokens(ctx).filter(
		(t) => !isCalendarLink(t.scopes) && t.scopes.some((s) => ASSISTANT_SCOPES.includes(s))
	);

	return {
		origin: url.origin,
		assistants: assistants.map((t) => ({ id: t.id, name: t.name, lastUsedAt: t.lastUsedAt })),
		assistantCalls: listAssistantCalls(ctx, { limit: 20 })
	};
};

export const actions: Actions = {
	/*
	 * The way back from a call that deleted something.
	 *
	 * The same action the Integrations page has, because the log is drawn on
	 * both and a form posts to the route it is rendered in. It is three lines
	 * either way; sharing it would mean a route that exists to be posted to,
	 * which is worse than saying `putBack` twice.
	 */
	putBack: async ({ request, locals }) => {
		const ctx = buildCtx(locals.user!.id);
		const form = await request.formData();
		const id = Number(form.get('id'));
		try {
			putBack(ctx, id);
		} catch (error) {
			return toActionFailure(error);
		}
		return { success: true };
	}
};
