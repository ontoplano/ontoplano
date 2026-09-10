import type { RequestHandler } from './$types';

import { assertNoPaymentHold } from '$lib/server/api/auth';
import { buildCtx } from '$lib/server/services/ctx';
import { UnauthorizedError } from '$lib/server/services/errors';
import { toJsonError } from '$lib/server/http-errors';
import { authenticateToken } from '$lib/server/services/tokens';
import { PROTOCOL_VERSION, SERVER_INFO, handleBody } from '$lib/server/mcp/protocol';

/**
 * The one address an assistant talks to.
 *
 * Streamable HTTP, in its simplest legal form: a POST carrying one JSON-RPC
 * message (or a batch of them) and a JSON answer. No session id, no event
 * stream, nothing kept between calls — every request carries its own bearer
 * token and is answered on its own.
 *
 * Authentication is the app's existing API token, the same one a plugin uses,
 * with the scopes decided when it was made. A token with no assistant scopes
 * authenticates fine and is offered no tools, which is the honest answer to
 * "what can this do here": nothing.
 *
 * GET answers 405 deliberately. A client that asks to open a server-initiated
 * stream is told there is not one, rather than being left holding a connection
 * that will never carry anything.
 */
export const POST: RequestHandler = async (event) => {
	try {
		const header = event.request.headers.get('authorization') ?? '';
		if (!header.toLowerCase().startsWith('bearer '))
			throw new UnauthorizedError('Send an API token as `Authorization: Bearer …`');

		const token = authenticateToken(header.slice(7).trim(), new Date());
		// The same hold the REST API and the calendar feed enforce: a token is
		// the account, and an expired account does not keep a side door open
		// through the assistant.
		assertNoPaymentHold(token.userId);
		const caller = {
			ctx: buildCtx(token.userId),
			scopes: token.scopes,
			// The same call budget the REST API spends, keyed to this token.
			tokenId: token.tokenId
		};

		let body: unknown;
		try {
			body = await event.request.json();
		} catch {
			return Response.json(
				{ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'That is not JSON.' } },
				{ status: 400 }
			);
		}

		const answer = handleBody(caller, body);

		// Every message was a notification: the protocol asks for an empty 202,
		// not an empty object.
		if (answer === null) return new Response(null, { status: 202 });

		return Response.json(answer, {
			headers: { 'mcp-protocol-version': PROTOCOL_VERSION }
		});
	} catch (e) {
		return toJsonError(e);
	}
};

/**
 * What this is, for anybody who opens the address in a browser.
 *
 * Not the protocol — a GET is how a client asks for a server-initiated event
 * stream, and there is not one. It is a signpost, and it names nothing about
 * the instance beyond what it is.
 */
export const GET: RequestHandler = async () =>
	Response.json(
		{
			server: SERVER_INFO,
			protocolVersion: PROTOCOL_VERSION,
			transport: 'streamable-http',
			how: 'POST a JSON-RPC 2.0 message here with `Authorization: Bearer <API token>`.'
		},
		{ status: 405, headers: { allow: 'POST' } }
	);
