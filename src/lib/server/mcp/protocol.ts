/**
 * Model Context Protocol, as much of it as a tool server needs.
 *
 * MCP is JSON-RPC 2.0 over a transport. The transport here is one HTTP endpoint
 * that answers a POST with a JSON response — which the Streamable HTTP
 * transport explicitly allows, and which means this server keeps no session, no
 * event stream and no state between calls. A stateless server behind the same
 * nginx as everything else is a server that cannot be down for a reason the app
 * is not down for, and cannot leak one caller's stream into another's.
 *
 * There is no SDK here on purpose. The whole of what a tool server has to
 * answer is `initialize`, `tools/list`, `tools/call` and `ping`, and that is
 * four cases and about a hundred lines — against a dependency that would have
 * to be audited, updated and kept from pulling a transport this app does not
 * want. If the protocol grows something this needs, it goes here.
 */
import type { Ctx } from '../services/ctx.js';
import type { Scope } from '../services/tokens.js';
import { ForbiddenError, ServiceError } from '../services/errors.js';
import { TOOLS, TOOLS_BY_NAME } from './tools.js';
import { changed, type Room } from '../live.js';

/** The revision this server speaks. Echoed back at whatever asks. */
export const PROTOCOL_VERSION = '2025-06-18';

export const SERVER_INFO = {
	name: 'ontoplano',
	title: 'Ontoplano',
	version: '1'
};

/** JSON-RPC's own codes, plus the one for a method that does not exist. */
const PARSE_ERROR = -32700;
const INVALID_REQUEST = -32600;
const METHOD_NOT_FOUND = -32601;
const INVALID_PARAMS = -32602;
const INTERNAL_ERROR = -32603;

type Id = string | number | null;

export type RpcRequest = {
	jsonrpc?: unknown;
	id?: Id;
	method?: unknown;
	params?: Record<string, unknown>;
};

export type RpcResponse = {
	jsonrpc: '2.0';
	id: Id;
	result?: unknown;
	error?: { code: number; message: string; data?: unknown };
};

const ok = (id: Id, result: unknown): RpcResponse => ({ jsonrpc: '2.0', id, result });
const fail = (id: Id, code: number, message: string, data?: unknown): RpcResponse => ({
	jsonrpc: '2.0',
	id,
	error: data === undefined ? { code, message } : { code, message, data }
});

/**
 * What the caller is allowed to do, and how a refusal reads.
 *
 * A token is granted scopes when it is made, and a tool names the one it needs.
 * The refusal says which scope was missing — not to be helpful to an attacker,
 * who learns nothing they did not already know, but because the person whose
 * token it is has to be able to fix it without guessing.
 */
export type Caller = {
	ctx: Ctx;
	scopes: readonly string[];
};

function assertScope(caller: Caller, scope: Scope): void {
	if (!caller.scopes.includes(scope))
		throw new ForbiddenError(`This token does not have the \`${scope}\` scope.`);
}

/** The tools this caller can see. A tool it cannot use is not offered to it. */
export function visibleTools(caller: Caller) {
	return TOOLS.filter((t) => caller.scopes.includes(t.scope)).map((t) => ({
		name: t.name,
		title: t.title,
		description: t.description,
		inputSchema: t.input,
		annotations: {
			title: t.title,
			readOnlyHint: !t.writes,
			// Nothing here deletes. Said explicitly so a client does not have to
			// assume the worst about a tool whose name begins with "add".
			destructiveHint: false,
			idempotentHint: !t.writes,
			openWorldHint: false
		}
	}));
}

/**
 * A tool's answer, in the shape a client renders.
 *
 * Structured content *and* the same thing as text: a client that understands
 * `structuredContent` uses it, and one that does not still has something to
 * show. The text is JSON rather than a sentence, because the reader is a model
 * and a model reading JSON is reading the answer rather than a description of
 * it.
 *
 * ## Why a list is wrapped
 *
 * `structuredContent` is an *object* in the protocol, and clients validate it
 * as one. Half the tools here answer with a list — the shopping list, the
 * todos, the notebooks — and handing the bare array over made every one of
 * those reads fail at a strict client with "expected record, received array",
 * while every write went through. It looked like one broken tool and was
 * actually every read.
 *
 * So a list becomes `{ items, count }` and anything else that is not an object
 * becomes `{ result }`. `count` because it is the question that follows a list
 * often enough to be worth answering unasked, and because a model that has been
 * handed a truncated list can see that it was.
 */
function structuredFrom(value: unknown): Record<string, unknown> {
	if (Array.isArray(value)) return { items: value, count: value.length };
	if (value !== null && typeof value === 'object') return value as Record<string, unknown>;
	// A tool that answered with nothing, a number, or a bare string. Rare, and
	// still not allowed to be the top level of a structured result.
	return { result: value ?? null };
}

function toolResult(value: unknown) {
	const structured = structuredFrom(value);
	return {
		// The same object, not the raw value: two encodings of one answer that
		// disagreed about its shape would be worse than either alone.
		content: [{ type: 'text', text: JSON.stringify(structured, null, 2) }],
		structuredContent: structured,
		isError: false
	};
}

/**
 * …and a tool's failure, which is a *result* rather than a protocol error.
 *
 * The distinction matters: a protocol error means the request was malformed and
 * the model can do nothing with it, while a tool that refused — a date it did
 * not like, a scope it did not have — is information the model can act on. So
 * the failure comes back as content the model reads, flagged `isError`.
 */
function toolFailure(message: string) {
	return {
		content: [{ type: 'text', text: message }],
		isError: true
	};
}

function messageOf(e: unknown): string {
	if (e instanceof ServiceError) return e.message;
	if (e instanceof Error) return e.message;
	return 'Something went wrong.';
}

/**
 * One JSON-RPC message in, one out — or nothing, for a notification.
 *
 * A notification (no `id`) gets no response at all, which is the protocol's
 * rule and not an optimisation: answering one is how a client ends up waiting
 * for a reply to something it never asked about.
 */
export function handle(caller: Caller, request: RpcRequest): RpcResponse | null {
	const id = request.id ?? null;
	const isNotification = request.id === undefined;

	if (request.jsonrpc !== '2.0')
		return isNotification ? null : fail(id, INVALID_REQUEST, 'Not a JSON-RPC 2.0 message.');

	const method = typeof request.method === 'string' ? request.method : '';
	const params = (request.params ?? {}) as Record<string, unknown>;

	switch (method) {
		case 'initialize':
			return ok(id, {
				protocolVersion: PROTOCOL_VERSION,
				// Tools and nothing else. No prompts, no resources, no sampling: this
				// server does one thing, and advertising a capability it does not
				// implement is how a client ends up calling something that 404s.
				capabilities: { tools: { listChanged: false } },
				serverInfo: SERVER_INFO,
				instructions:
					'Ontoplano is one app for a whole life: the week as blocks, todos, a diary and ' +
					'notebooks, ideas, goals, habits, the shopping list and recipes. Ask `today` before ' +
					'answering "what should I be doing", and `search` before guessing which room a thing ' +
					'is in. Write in the person’s own words — an entry you compose for them is not their diary.'
			});

		// A client says it has finished starting up. Nothing to do, and nothing
		// to say: it carries no id.
		case 'notifications/initialized':
		case 'notifications/cancelled':
			return null;

		case 'ping':
			return isNotification ? null : ok(id, {});

		case 'tools/list':
			return ok(id, { tools: visibleTools(caller) });

		case 'tools/call': {
			const name = typeof params.name === 'string' ? params.name : '';
			const tool = TOOLS_BY_NAME.get(name);
			if (!tool) return fail(id, INVALID_PARAMS, `No tool called \`${name}\`.`);

			const args = (params.arguments ?? {}) as Record<string, unknown>;
			try {
				assertScope(caller, tool.scope);
				const answer = toolResult(tool.run(caller.ctx, args));

				/*
				 * And the tabs, if that changed anything.
				 *
				 * Here rather than inside each tool, because "a write happened" is
				 * a property of the tool table — `writes: true` — and a rule that
				 * has to be remembered per tool is one a tool added next year will
				 * not have. `rooms` is the tool's own, so a page only reloads when
				 * something it draws actually moved.
				 */
				if (tool.writes) changed(caller.ctx.userId, roomsOf(tool), 'assistant');

				return ok(id, answer);
			} catch (e) {
				// Everything a service throws is a sentence written for a person, so
				// it is the sentence the model gets. Anything else is not.
				if (e instanceof ServiceError) return ok(id, toolFailure(messageOf(e)));
				console.error(`mcp: ${name} failed:`, e);
				return fail(id, INTERNAL_ERROR, 'That did not work.');
			}
		}

		default:
			return isNotification ? null : fail(id, METHOD_NOT_FOUND, `Unknown method: ${method}`);
	}
}

/**
 * A whole request body: one message or a batch of them.
 *
 * Returns what to send back, or `null` when every message was a notification
 * and the answer is an empty 202.
 */
/**
 * Which parts of the app a tool's write touches.
 *
 * Derived from the scope rather than listed per tool: a scope is already the
 * answer to "what does this reach", and a second list beside it would be a
 * second thing to keep in step. A tool with a scope nobody mapped announces
 * nothing, which is the safe way to be wrong.
 */
function roomsOf(tool: { scope: string }): Room[] {
	switch (tool.scope) {
		case 'tasks:write':
			return ['todos', 'planner', 'goals'];
		case 'schedule:write':
			return ['planner'];
		case 'notes:write':
			return ['diary', 'notebooks', 'ideas'];
		case 'shopping:write':
			return ['shopping'];
		case 'kitchen:write':
			return ['kitchen', 'shopping'];
		case 'streams:write':
			return ['health'];
		default:
			return [];
	}
}

export function handleBody(caller: Caller, body: unknown): RpcResponse | RpcResponse[] | null {
	if (Array.isArray(body)) {
		if (body.length === 0) return fail(null, INVALID_REQUEST, 'An empty batch is not a request.');
		const answers = body
			.map((one) => handle(caller, (one ?? {}) as RpcRequest))
			.filter((a): a is RpcResponse => a !== null);
		return answers.length > 0 ? answers : null;
	}

	if (!body || typeof body !== 'object')
		return fail(null, PARSE_ERROR, 'The body is not a JSON-RPC message.');

	return handle(caller, body as RpcRequest);
}
