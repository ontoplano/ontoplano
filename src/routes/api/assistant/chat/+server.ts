import { error } from '@sveltejs/kit';

import type { RequestHandler } from './$types';

import { SESSION_BUDGET_KEY, assertNoPaymentHold } from '$lib/server/api/auth';
import { buildCtx } from '$lib/services/ctx';
import { chatResponse, chatScopes } from '$lib/server/services/assistant-chat';
import { configuredModelKey } from '$lib/server/services/model-keys';
import { CHAT_IN_APP } from '$lib/features';
import type { UIMessage } from 'ai';

/**
 * The in-app chat's own door, and the one route that streams an answer.
 *
 * Session-only on purpose: this is the signed-in person talking to their own
 * account, so there is no token to mint. What it may do is still the account's
 * to decide: every assistant grant, and `destructive` where the Chat tab says
 * so — see `chatScopes`. An external assistant keeps using `/api/mcp`.
 *
 * A POST rather than a form action because the answer is a stream — the same
 * reason `/api/live` is an endpoint.
 *
 * **Switched off.** The in-app chat is parked — `CHAT_IN_APP` in
 * `$lib/features` — and this answers 404 until it comes back. An assistant
 * reaching in from outside is unaffected: that is `/api/mcp`.
 */

/** The same 256 KB every other endpoint takes. */
const MAX_CHAT_BODY_BYTES = 256 * 1024;
/** A conversation, not an archive: what rides up with every message. */
const MAX_MESSAGES = 200;

export const POST: RequestHandler = async ({ request, locals }) => {
	/*
	 * The door is shut while the chat is parked — see `$lib/features`.
	 *
	 * Hiding the room and leaving the endpoint open would leave the whole
	 * thing running for anybody who had saved a key and knows the address,
	 * which is not switched off in any sense that matters.
	 */
	if (!CHAT_IN_APP) throw error(404);

	if (!locals.user) throw error(401);
	assertNoPaymentHold(locals.user.id);

	const ctx = buildCtx(locals.user.id);
	const row = configuredModelKey(ctx);
	// Gone mid-conversation — removed from another tab. 409 rather than 404:
	// the route exists, the state does not.
	if (!row) throw error(409, 'No provider key is configured.');

	const raw = await request.text();
	if (raw.length > MAX_CHAT_BODY_BYTES) throw error(413, 'That message is too large.');

	let messages: UIMessage[];
	try {
		const body = JSON.parse(raw) as { messages?: unknown };
		if (!Array.isArray(body.messages) || body.messages.length === 0) throw new Error();
		if (body.messages.length > MAX_MESSAGES) throw new Error();
		messages = body.messages as UIMessage[];
	} catch {
		throw error(400, 'Send { messages: [...] }.');
	}

	const caller = {
		ctx,
		scopes: chatScopes(ctx),
		tokenId: SESSION_BUDGET_KEY
	};

	return chatResponse(caller, row, messages);
};
