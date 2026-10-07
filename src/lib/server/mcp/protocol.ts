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
import type { Ctx } from '$lib/services/ctx.js';
import type { Scope } from '../services/tokens.js';
import { ForbiddenError, ServiceError, type ErrorCode } from '$lib/services/errors.js';
import { translator, type MessageKey, type MessageValues } from '$lib/i18n/core.js';
import { messages as englishMessages } from '$lib/i18n/catalogues/en.js';
import { TOOLS, TOOLS_BY_NAME, type Tool } from './tools.js';
import { argumentProblem, describeProblem } from './arguments.js';
import { assertRefs, madeRow, resolveRef, type Reach, type Ref } from './refs.js';
import {
	confine,
	describeConfinement,
	reachOf,
	withinConfinement,
	type Confinement
} from './confinement.js';
import { assertUnchanged, stampOf, stampedRef } from './concurrency.js';
import {
	fingerprintOf,
	rememberAnswer,
	replayOf,
	requestIdOf
} from '../services/request-replays.js';
import { changed, type Room } from '../live.js';
import { spendCallBudget } from '../api/auth.js';
import { recordAssistantCall } from '../services/assistant-log.js';
import { db } from '$lib/db/index.js';

/** The revision this server speaks. Echoed back at whatever asks. */
export const PROTOCOL_VERSION = '2025-06-18';

import { build } from '../services/version.js';

/**
 * The app's own version, not a literal: a client that logs what it connected
 * to logs something true, and a self-hoster reporting "my saved prompts broke
 * after upgrading" can say from which version to which. The tool surface's
 * compatibility rules live in `manifest.json` beside the tools.
 */
export const SERVER_INFO = {
	name: 'ontoplano',
	title: 'Ontoplano',
	version: build().version
};

/** JSON-RPC's own codes, plus the one for a method that does not exist. */
export const PARSE_ERROR = -32700;
export const INVALID_REQUEST = -32600;
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
	/**
	 * The token's own id, for the call budget it shares with the REST API.
	 * Absent in unit tests, which are not the thing the budget is about.
	 */
	tokenId?: number;
	/**
	 * The one thing this key may work on, where it has one.
	 *
	 * A confined key sees a smaller surface and a smaller account: tools that
	 * are about the whole of it are not offered and are refused if called
	 * anyway, and the rows a kind resolves against are the ones inside the
	 * confinement. See `confinement.ts`.
	 */
	confinement?: Confinement;
};

function assertScope(caller: Caller, scope: Scope): void {
	if (!caller.scopes.includes(scope))
		throw new ForbiddenError(`This token does not have the \`${scope}\` scope.`);
}

/**
 * Everything a tool demands of the token, not only its room.
 *
 * A deleting tool needs the room's write scope *and* the `destructive` grant:
 * a wrong write is data that is wrong, a wrong delete is data that is gone,
 * and they are not the same thing to hand an assistant.
 */
function assertAllowed(caller: Caller, tool: Tool): void {
	/*
	 * A tool whose permission can come from any of several grants — `media`,
	 * where a file answers to whatever refers to it — is allowed by holding
	 * one of them. The refusal names the tool's primary scope, which is the
	 * one somebody reaching for it most likely meant to grant.
	 */
	if (tool.anyScope) {
		if (!tool.anyScope.some((one) => caller.scopes.includes(one)))
			throw new ForbiddenError(
				`This token does not have any of: ${tool.anyScope.map((one) => `\`${one}\``).join(', ')}.`
			);
	} else {
		assertScope(caller, tool.scope);
	}
	if (tool.alsoNeeds) assertScope(caller, tool.alsoNeeds);
	if (tool.destroys) assertScope(caller, 'destructive');
}

function offered(caller: Caller, tool: Tool): boolean {
	if (tool.anyScope) {
		if (!tool.anyScope.some((one) => caller.scopes.includes(one))) return false;
	} else if (!caller.scopes.includes(tool.scope)) return false;
	if (tool.alsoNeeds && !caller.scopes.includes(tool.alsoNeeds)) return false;
	if (tool.destroys && !caller.scopes.includes('destructive')) return false;
	// A confined key is not shown what it cannot call. A model offered a tool
	// that always refuses spends its turn discovering that — and the reverse
	// costs more: a tool hidden from a key that may use it is a capability
	// nobody can find, which is how `media` became invisible to every confined
	// key while the screen went on promising the pictures in the notebook.
	if (caller.confinement && !tool.confinesItself && !withinConfinement(caller.confinement, tool))
		return false;
	return true;
}

/**
 * What this caller is not being offered, and the grant that would offer it.
 *
 * An absence says nothing. A tool missing from the list could be a permission
 * this token does not hold, or a feature this build does not have, and an
 * assistant cannot tell those apart — so the careful ones stop and do
 * something worse quietly, and the person never learns their key was narrow.
 *
 * Named here so the answer can say it: the tool, and the scope to ask for.
 * Nothing about what it does — that is what the offered list is for, and a
 * catalogue of everything the app can do is not this endpoint's business.
 */
export function withheldTools(caller: Caller): { name: string; needs: string }[] {
	return TOOLS.filter((t) => !offered(caller, t)).map((t) => ({
		name: t.name,
		needs: t.destroys && !caller.scopes.includes('destructive') ? 'destructive' : t.scope
	}));
}

/** The tools this caller can see. A tool it cannot use is not offered to it. */
export function visibleTools(caller: Caller) {
	return TOOLS.filter((t) => offered(caller, t)).map((t) => ({
		name: t.name,
		title: t.title,
		description: t.description,
		inputSchema: t.input,
		annotations: {
			title: t.title,
			readOnlyHint: !t.writes,
			// True exactly where a call removes a row for good — the same tools the
			// `destructive` grant gates — so a client that warns before a
			// destructive call warns about the right ones.
			destructiveHint: Boolean(t.destroys),
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

/**
 * A file, as the protocol carries one.
 *
 * `media` answers with bytes rather than a row, and a model cannot look at
 * JSON: MCP has `image` and `audio` content blocks for exactly this, so the
 * picture arrives as a picture. The structured half still says what it is, so
 * a client that only reads that is not left with nothing.
 */
type Bytes = { media: { mime: string; base64: string } };

function isBytes(value: unknown): value is Bytes {
	if (value === null || typeof value !== 'object' || !('media' in value)) return false;
	const media = (value as Bytes).media;
	return (
		typeof media === 'object' &&
		media !== null &&
		typeof media.mime === 'string' &&
		typeof media.base64 === 'string'
	);
}

function fileResult(value: Bytes) {
	const { mime, base64 } = value.media;
	return {
		content: [
			{
				type: mime.startsWith('audio/') ? 'audio' : 'image',
				data: base64,
				mimeType: mime
			}
		],
		structuredContent: { mime, bytes: Math.ceil((base64.length * 3) / 4) },
		isError: false
	};
}

/** The id a create answered with, wherever it put it. */
/**
 * The one thing a write made or changed, for the log — and so for the
 * notification that says what an assistant did, which opens it. A create's is
 * the row it answered with; anything else's is the argument its refs mark as
 * the subject, or the one called `id`. Null where a call names no one thing.
 */
function subjectOf(
	tool: Tool,
	args: Record<string, unknown>,
	createdId: unknown
): { kind: string; id: string } | null {
	const plain = (id: unknown) =>
		typeof id === 'number' || (typeof id === 'string' && id !== '') ? String(id) : null;
	if (tool.creates) {
		const id = plain(createdId);
		return id === null ? null : { kind: tool.creates, id };
	}
	const ref = tool.refs?.find((one) => one.subject) ?? tool.refs?.find((one) => one.arg === 'id');
	if (!ref || ref.arg.includes('.') || ref.arg.includes('[')) return null;
	const id = plain(args[ref.arg]);
	return id === null ? null : { kind: ref.kind, id };
}

function idOf(value: unknown): unknown {
	return value && typeof value === 'object' ? (value as { id?: unknown }).id : undefined;
}

function toolResult(value: unknown, mutation?: { before: unknown; after: unknown }) {
	if (!mutation && isBytes(value)) return fileResult(value);
	const structured = mutation ? { ...structuredFrom(value), ...mutation } : structuredFrom(value);
	return {
		// The same object, not the raw value: two encodings of one answer that
		// disagreed about its shape would be worse than either alone.
		content: [{ type: 'text', text: JSON.stringify(structured, null, 2) }],
		structuredContent: structured,
		isError: false
	};
}

/** A replayed answer: the first one, word for word, marked as a replay. */
function replayResult(earlier: Record<string, unknown>) {
	const structured = { ...earlier, replayed: true };
	return {
		content: [{ type: 'text', text: JSON.stringify(structured, null, 2) }],
		structuredContent: structured,
		isError: false
	};
}

/**
 * The state of the thing a write is about.
 *
 * A tool's own `subject` where it has one — a few are richer than a single
 * row: a bill with its payments, a habit's tick for a particular day.
 * Otherwise the thing the call is about, which the tool has already declared
 * in `refs` and the dispatcher has already resolved. That is the argument
 * marked `subject`, or the one plainly called `id` — a create files its
 * reference under where the new thing goes (`notebookId`, `goalId`), and has
 * no before to read.
 *
 * Null when there is nothing to read: a create had no subject to begin with,
 * and a delete has none afterwards. Nothing a peek does may fail the call —
 * this is bookkeeping around the write, and bookkeeping that breaks a write is
 * worse than a gap in the books.
 */
function peek(tool: Tool, ctx: Ctx, args: Record<string, unknown>, reach?: Reach): unknown {
	const about = tool.refs?.find((ref) => ref.subject) ?? tool.refs?.find((ref) => ref.arg === 'id');
	const read = tool.subject ?? (about ? subjectOfRef(about, reach) : null);
	if (!read) return null;
	try {
		return read(ctx, args) ?? null;
	} catch {
		return null;
	}
}

const subjectOfRef =
	(ref: Ref, reach?: Reach) =>
	(ctx: Ctx, args: Record<string, unknown>): unknown =>
		resolveRef(ctx, ref, args, reach);

/**
 * …and a tool's failure, which is a *result* rather than a protocol error.
 *
 * The distinction matters: a protocol error means the request was malformed and
 * the model can do nothing with it, while a tool that refused — a date it did
 * not like, a scope it did not have — is information the model can act on. So
 * the failure comes back as content the model reads, flagged `isError`.
 *
 * The sentence is for the model; `structuredContent` is for the client code
 * around it, which has to branch without parsing English. `code` is the same
 * vocabulary the JSON API answers with (`not_found`, `conflict`,
 * `validation_error`, `plan_limit`, `forbidden`, `rate_limited`, …), and
 * `details` is whatever the refusal knows beyond its sentence — the row's
 * current `updatedAt` on a conflict.
 */
function toolFailure(e: ServiceError) {
	const message = messageOf(e);
	return {
		content: [{ type: 'text', text: message }],
		structuredContent: {
			code: e.code,
			message,
			...(e.details === undefined ? {} : { details: e.details })
		},
		isError: true
	};
}

/**
 * The tools speak English, whatever the account reads the app in — so a
 * refusal that carries a message key is read out of the English catalogue
 * here rather than handed over as `errors.schedule.aDayLooksLike2026`.
 */
const english = translator('en', englishMessages) as (
	key: MessageKey,
	values?: MessageValues
) => string;

function messageOf(e: unknown): string {
	if (e instanceof ServiceError) return e.key ? english(e.key, e.values) : e.message;
	if (e instanceof Error) return e.message;
	return 'Something went wrong.';
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** An id JSON-RPC allows: a string, a whole number, or null. */
function validId(id: unknown): id is Id | undefined {
	return (
		id === undefined ||
		id === null ||
		typeof id === 'string' ||
		(typeof id === 'number' && Number.isSafeInteger(id))
	);
}

/** The members a request may have; anything else is not one. */
const ENVELOPE = new Set(['jsonrpc', 'id', 'method', 'params']);

/**
 * What is wrong with a message as a JSON-RPC 2.0 request, or null.
 *
 * The envelope is checked whole before anything reads it: a `method` that
 * is a number, `params` that are a list, an id that is an object. Each used
 * to fall through to a default — an empty method, empty params — which
 * answered a question the client had not asked.
 */
function envelopeProblem(request: unknown): string | null {
	if (!isPlainObject(request)) return 'A JSON-RPC message is an object.';
	if (request.jsonrpc !== '2.0') return 'Not a JSON-RPC 2.0 message.';
	const extra = Object.keys(request).find((key) => !ENVELOPE.has(key));
	if (extra) return `\`${extra}\` is not part of a JSON-RPC request.`;
	if (!validId(request.id)) return 'An id is a string, a whole number or null.';
	if (typeof request.method !== 'string' || !request.method)
		return '`method` is required, and is a string.';
	if (request.params !== undefined && !isPlainObject(request.params))
		return '`params` has to be an object.';
	return null;
}

/**
 * One JSON-RPC message in, one out — or nothing, for a notification.
 *
 * A notification (no `id`) gets no response at all, which is the protocol's
 * rule and not an optimisation: answering one is how a client ends up waiting
 * for a reply to something it never asked about.
 */
export function handle(caller: Caller, request: RpcRequest): RpcResponse | null {
	const refused = envelopeProblem(request);
	// A message that is not a request is answered, notification or not, and
	// with a null id unless the id it carried was a legal one (JSON-RPC 2.0 §5).
	if (refused)
		return fail(validId(request.id) ? (request.id ?? null) : null, INVALID_REQUEST, refused);

	const id = request.id ?? null;
	const isNotification = request.id === undefined;
	const method = request.method as string;
	const params = (request.params ?? {}) as Record<string, unknown>;

	switch (method) {
		case 'initialize':
			return ok(id, {
				protocolVersion: PROTOCOL_VERSION,
				// A client cannot infer the token's boundary from the visible tool names.
				// This extension describes the boundary without disclosing the token.
				_access: caller.confinement
					? {
							kind: caller.confinement.kind,
							id: caller.confinement.id,
							...(caller.confinement.kind === 'notebook' && caller.scopes.includes('notes:read')
								? { label: describeConfinement(caller.ctx, caller.confinement) }
								: {})
						}
					: { kind: 'account' },
				// Tools and nothing else. No prompts, no resources, no sampling: this
				// server does one thing, and advertising a capability it does not
				// implement is how a client ends up calling something that 404s.
				capabilities: { tools: { listChanged: false } },
				serverInfo: SERVER_INFO,
				instructions:
					'Ontoplano is one app for a whole life: the week as blocks — one-off and repeating — ' +
					'todos, a diary and notebooks, ideas, goals, habits, reminders, the people in it, ' +
					'the weekly review, three daily wins, data streams, the shopping list and recipes. ' +
					'Ask `today` before answering "what should I be doing", and `search` before guessing ' +
					'which room a thing is in. The full `tools/list` response follows the token\u2019s grants; ' +
					'a client may show a model a smaller set per turn, so absence from one turn proves nothing. ' +
					'`tools/list` says which ones are being held back and the grant each needs, so ask ' +
					'for the grant rather than working around the gap. An argument a tool accepts is in ' +
					'its schema; where the answer looks cut short, `verbose` or `fields` is why. ' +
					'Asked to write a diary entry, write it — keeping their words where you have them. Just never invent one unasked. ' +
					'When you tell the person about a task or a note, name it by its `seq` — the number the app shows them, ' +
					'written `TASK:#4` or `#4` — and its title, never by `id`: the id is only for passing back to a tool, ' +
					'and they cannot see it anywhere.'
			});

		// A client says it has finished starting up. Nothing to do, and nothing
		// to say: it carries no id.
		case 'notifications/initialized':
		case 'notifications/cancelled':
			return null;

		case 'ping':
			return isNotification ? null : ok(id, {});

		case 'tools/list': {
			/*
			 * What is offered, and what is being held back.
			 *
			 * `_withheld` is ours rather than the protocol's, which is why it
			 * wears an underscore: a client that has never heard of it ignores
			 * an unknown field, and one that reads it can tell an assistant the
			 * difference between "this app cannot do that" and "your key may
			 * not". An assistant that cannot tell those apart stops and does
			 * something worse without saying why — and the person never finds
			 * out their key was narrow.
			 */
			const withheld = withheldTools(caller);
			return ok(id, {
				tools: visibleTools(caller),
				...(withheld.length > 0 ? { _withheld: withheld } : {})
			});
		}

		case 'tools/call': {
			if (typeof params.name !== 'string')
				return fail(id, INVALID_PARAMS, '`name` is required, and is the tool\u2019s name.', {
					code: 'validation_error' satisfies ErrorCode,
					argument: 'name',
					problem: 'missing'
				});
			const name = params.name;
			const tool = TOOLS_BY_NAME.get(name);
			if (!tool) return fail(id, INVALID_PARAMS, `No tool called \`${name}\`.`);

			if (params.arguments !== undefined && !isPlainObject(params.arguments))
				return fail(id, INVALID_PARAMS, '`arguments` has to be an object.', {
					code: 'validation_error' satisfies ErrorCode,
					argument: 'arguments',
					problem: 'type',
					expected: 'object'
				});
			const args = (params.arguments ?? {}) as Record<string, unknown>;
			const reach = caller.confinement ? reachOf(caller.confinement) : undefined;
			try {
				assertAllowed(caller, tool);

				/*
				 * The arguments are the ones the schema advertised, or nothing runs.
				 *
				 * Checked after the grant — a key that may not call the tool is
				 * told that, not how to spell its arguments — and before
				 * anything else: the confinement, the references, the budget and
				 * the tool all read arguments that are the shape they were
				 * promised. A protocol error rather than a tool failure, with the
				 * argument named in `data`, because it is the request that is
				 * wrong and the same request will be refused the same way again.
				 */
				const problem = argumentProblem(tool.input, args);
				if (problem)
					return fail(id, INVALID_PARAMS, describeProblem(problem), {
						code: 'validation_error' satisfies ErrorCode,
						...problem
					});

				/*
				 * A key confined to one thing works on that thing.
				 *
				 * Refuses a tool that is about the account rather than a thing,
				 * and pins the argument naming the confinement — so a call that
				 * asks for another notebook is answered about this one rather
				 * than refused, and there is no way to ask which other notebooks
				 * exist by watching the refusals.
				 */
				// `confinesItself` is the tool doing this in its own `run` — it
				// reaches by a link rather than by an id, so there is no
				// argument here to pin. Refusing it here would refuse it always.
				if (caller.confinement && !tool.confinesItself)
					confine(caller.confinement, tool.refs, tool.input, args);

				/*
				 * The same budget a plugin spends on the REST API: reads are cheap
				 * and writes grow the database, so "make a thousand goals" is told
				 * to slow down after the sixtieth, not obeyed at machine speed.
				 *
				 * Spent before the references are resolved, which is the costly
				 * part of a refused call: each id is looked up among the rows the
				 * caller can list, and a caller guessing at ids pays for every
				 * guess rather than only for the ones that landed.
				 */
				if (caller.tokenId !== undefined)
					spendCallBudget(caller.tokenId, caller.ctx.userId, tool.writes);

				/*
				 * Every id it was handed belongs to whoever is calling.
				 *
				 * Each tool declares which of its arguments name a thing and what
				 * kind of thing — and a kind is defined once, in `refs.ts`, as the
				 * rows this caller can already list. Resolving here means a number
				 * belonging to somebody else never reaches `run` at all, rather
				 * than reaching it and being caught by whatever `where` clause the
				 * service happened to write. Done at the one point every call goes
				 * through, so no tool can be written that skips it.
				 */
				assertRefs(caller.ctx, tool.refs, args, reach);

				/*
				 * Every mutation answers with what it replaced.
				 *
				 * `before` is the subject as it was, `after` as it is now — so a
				 * wrong call is reversible from the transcript rather than from a
				 * backup, which life data does not get a CI to stand in for. Done
				 * here rather than inside each tool, because a rule that has to be
				 * remembered per tool is one a tool added next year will not have.
				 * A create has no before and a delete no after; both read as null,
				 * which is the honest answer.
				 */
				/*
				 * A retried create, answered with what the first one got.
				 *
				 * After the grant, the arguments, the budget and the references —
				 * a replay is not a way to hear an answer the key could not ask
				 * for now — and before anything runs. See `request-replays.ts`.
				 */
				const retry =
					tool.writes && 'requestId' in tool.input.properties && args.requestId != null
						? {
								requestId: requestIdOf(args.requestId),
								fingerprint: fingerprintOf(tool.name, args)
							}
						: undefined;
				if (retry) {
					const earlier = replayOf(caller.ctx, retry.requestId, retry.fingerprint);
					if (earlier) return ok(id, replayResult(earlier));
				}

				const before = tool.writes ? peek(tool, caller.ctx, args, reach) : undefined;
				// A quiet tool still peeks — the log below wants it — and simply
				// does not put the two copies in the answer.

				/*
				 * `ifUpdatedAt`, where the tool offers it: checked inside the same
				 * transaction as the write, so nothing can land between the check
				 * and the change, and the answer carries the new stamp to pass
				 * next time. See `concurrency.ts`.
				 */
				const stamped = 'ifUpdatedAt' in tool.input.properties ? stampedRef(tool.refs) : undefined;
				/** The id a create handed back, for the log's subject below. */
				let createdId: unknown;
				const settle = () => {
					if (stamped) assertUnchanged(tool.refs, args);
					let value = tool.run(caller.ctx, args, {
						scopes: caller.scopes,
						confinement: caller.confinement ?? null
					});
					if (stamped && isPlainObject(value))
						value = { ...value, updatedAt: stampOf(stamped, args) };
					/*
					 * A create says what it made, and fails if it made nothing.
					 *
					 * `peek` reads the *subject* an argument names, which a create has
					 * not got — so `after` was null on every one of them and nothing
					 * ever checked that the id being handed back pointed at a row. It
					 * did not once, and the caller found out by being told the task it
					 * had just made did not exist.
					 */
					if (tool.creates) createdId = idOf(value);
					const made = tool.creates ? madeRow(caller.ctx, tool.creates, idOf(value)) : undefined;
					if (tool.creates && made === null)
						throw new Error(
							`\`${tool.name}\` answered with an id for a ${tool.creates} that is not there.`
						);
					const answer = toolResult(
						value,
						tool.writes && !tool.quiet
							? { before, after: made ?? peek(tool, caller.ctx, args, reach) }
							: undefined
					);
					// In the same transaction as the write: a create that landed and
					// an answer that was not remembered would make the retry a second
					// create, which is the whole thing this is for.
					if (retry)
						rememberAnswer(
							caller.ctx,
							retry.requestId,
							tool.name,
							retry.fingerprint,
							answer.structuredContent
						);
					return answer;
				};
				/*
				 * One call, one change: all of it or none of it.
				 *
				 * A change tool often writes more than one row — a todo's words and
				 * then its state, a recipe and then its ingredients, a session and
				 * then its lines — and a refusal from the second half used to leave
				 * the first half written, so an assistant told "invalid status" had
				 * in fact rewritten the title. Here rather than in each tool for the
				 * same reason as `before` above. The services' own transactions nest
				 * inside this one as savepoints.
				 */
				const answer = tool.writes ? db.transaction(settle) : settle();

				/*
				 * The person's own copy of what just happened.
				 *
				 * `before` in the answer serves whoever holds the transcript; the
				 * account's owner holds none, so the same fact goes into a log they
				 * can read under Settings → Integrations — and put back, when the
				 * call deleted something. The service swallows its own failures: a
				 * log that breaks a write is worse than a gap in the log.
				 */
				if (tool.writes)
					recordAssistantCall(caller.ctx, {
						tokenId: caller.tokenId,
						tool: tool.name,
						args,
						before,
						destroyed: Boolean(tool.destroys),
						subject: subjectOf(tool, args, createdId)
					});

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
				if (e instanceof ServiceError) return ok(id, toolFailure(e));
				console.error(`mcp: ${name} failed:`, e);
				return fail(id, INTERNAL_ERROR, 'That did not work.', {
					code: 'internal' satisfies ErrorCode
				});
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
			return ['diary', 'notebooks'];
		case 'ideas:write':
			return ['ideas'];
		case 'inventory:write':
			return ['inventory'];
		case 'kitchen:write':
			return ['kitchen', 'inventory'];
		case 'people:write':
			return ['people'];
		case 'streams:write':
			return ['health'];
		default:
			return [];
	}
}

/** The largest request body the endpoint reads — the same 256 KB every other endpoint takes, batch included. */
export const MAX_MCP_BODY_BYTES = 256 * 1024;

/** How many messages one JSON-RPC batch may carry. */
const MAX_BATCH = 50;

/**
 * How much one batch may answer with, all messages together, in bytes of JSON.
 *
 * Fifty messages is a small request and can be a large answer: fifty
 * `tools/list` calls, or fifty pages of two hundred tasks, are built in
 * memory before any of it is sent. Once the answers so far pass this, the
 * rest of the batch is not run — each is refused, by id, with a sentence
 * saying to send it on its own — so nothing is done that nobody will hear
 * about. A single message is always answered whole: its size is bounded by
 * the tool's own page ceilings, and a file by the media limit.
 */
export const MAX_BATCH_ANSWER_BYTES = 2 * 1024 * 1024;

/** The code for a message left unrun because its batch had said enough. */
const BATCH_TOO_LARGE = -32000;

export function handleBody(caller: Caller, body: unknown): RpcResponse | RpcResponse[] | null {
	if (Array.isArray(body)) {
		if (body.length === 0) return fail(null, INVALID_REQUEST, 'An empty batch is not a request.');
		/*
		 * A batch is a convenience, not a lever.
		 *
		 * Every answer is built before any is sent, and `tools/list` answers
		 * with the whole tool table — so an unbounded batch is an unbounded
		 * amount of memory for one request. The spec allows refusing one.
		 */
		if (body.length > MAX_BATCH)
			return fail(null, INVALID_REQUEST, `A batch may hold at most ${MAX_BATCH} messages.`);
		const answers: RpcResponse[] = [];
		let spent = 0;
		for (const one of body) {
			if (spent > MAX_BATCH_ANSWER_BYTES) {
				const request = isPlainObject(one) ? one : {};
				// A notification skipped is still not answered.
				if (request.id === undefined) continue;
				answers.push(
					fail(
						validId(request.id) ? (request.id ?? null) : null,
						BATCH_TOO_LARGE,
						`Not run: this batch\u2019s answers already passed ${MAX_BATCH_ANSWER_BYTES} bytes. Send it on its own.`
					)
				);
				continue;
			}
			const answer = handle(caller, one as RpcRequest);
			if (answer === null) continue;
			spent += JSON.stringify(answer).length;
			answers.push(answer);
		}
		return answers.length > 0 ? answers : null;
	}

	if (!isPlainObject(body)) return fail(null, INVALID_REQUEST, 'A JSON-RPC message is an object.');

	return handle(caller, body as RpcRequest);
}
