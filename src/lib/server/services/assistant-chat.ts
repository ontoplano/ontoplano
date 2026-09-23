import { createAnthropic } from '@ai-sdk/anthropic';
import { createOpenAI } from '@ai-sdk/openai';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import {
	convertToModelMessages,
	dynamicTool,
	jsonSchema,
	stepCountIs,
	streamText,
	type LanguageModel,
	type UIMessage
} from 'ai';

import {
	OLLAMA_DEFAULT_BASE_URL,
	OPENROUTER_BASE_URL,
	type ProviderId
} from '$lib/assistant-providers.js';
import { handle, visibleTools, type Caller } from '$lib/server/mcp/protocol';
import { fetchPublic } from '$lib/server/outbound.js';
import { isSelfHosted } from '$lib/server/settings.js';
import { modelNameFor } from './model-keys.js';
import { getChatMayDelete } from '$lib/services/settings.js';
import { ASSISTANT_SCOPES } from '$lib/server/mcp/tools';
import type { Ctx } from '$lib/services/ctx.js';

/**
 * The in-app chat: the same assistant surface MCP offers, spoken to a model
 * the person brought a key for.
 *
 * Everything the model may do goes through `handle()` — the same dispatcher
 * an external assistant's calls go through — so scope checks, id resolution,
 * the call budget, the write log and the room invalidations all apply here
 * without a second copy of any of them. This file only turns the tool table
 * into the shape the AI SDK wants and picks which company to dial.
 *
 * **Switched off.** The chat this serves is parked — `CHAT_IN_APP` in
 * `$lib/features` — so nothing calls this today. It is kept, and kept tested,
 * because the decision is pending rather than made.
 */

/**
 * How many model turns one message may take. A turn that reads the week,
 * lists the todos and answers is three; a runaway loop is not a conversation.
 */
const MAX_STEPS = 12;

/**
 * Written for the model, not shown to people, so it lives here rather than in
 * the catalogue — the reader's language is whatever the person writes in.
 */
const SYSTEM = [
	'You are the assistant inside ontoplano, a planner for a whole life:',
	'the week as blocks, todos, goals, habits, a diary and notebooks, people,',
	'the shopping list and recipes.',
	'Use the tools to read before you claim and to act when asked.',
	'Answer in the language the person writes in, briefly.',
	'Never invent rows the tools did not answer with.'
].join(' ');

type KeyRow = {
	provider: ProviderId;
	key: string;
	model: string | null;
	baseUrl: string | null;
};

function modelFor(row: KeyRow): LanguageModel {
	const name = modelNameFor(row);
	switch (row.provider) {
		case 'anthropic':
			return createAnthropic({ apiKey: row.key })(name);
		case 'openai':
			return createOpenAI({ apiKey: row.key })(name);
		case 'openrouter':
			return createOpenAICompatible({
				name: 'openrouter',
				baseURL: OPENROUTER_BASE_URL,
				apiKey: row.key
			})(name);
		case 'ollama':
			return createOpenAICompatible({
				name: 'ollama',
				baseURL: row.baseUrl || OLLAMA_DEFAULT_BASE_URL,
				apiKey: row.key || 'ollama',
				/*
				 * The one address here a person typed. On the hosted instance it
				 * dials through the same guard the webhooks use, so "chat with
				 * http://169.254.169.254" probes nothing; on a self-hosted one
				 * Ollama on this very machine is the point, so it dials plainly.
				 */
				fetch: isSelfHosted() ? undefined : (fetchPublic as unknown as typeof fetch)
			})(name);
	}
}

/**
 * The tool table, in the AI SDK's shape, each call dispatched through the
 * MCP pipeline. A refusal comes back as the sentence the service wrote — the
 * model reads it and answers the person with it — and only a broken call
 * throws.
 */
function toolsFor(caller: Caller) {
	let calls = 0;
	return Object.fromEntries(
		visibleTools(caller).map((tool) => [
			tool.name,
			dynamicTool({
				description: tool.description,
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				inputSchema: jsonSchema(tool.inputSchema as any),
				execute: async (input) => {
					const reply = handle(caller, {
						jsonrpc: '2.0',
						id: ++calls,
						method: 'tools/call',
						params: { name: tool.name, arguments: input as Record<string, unknown> }
					});
					if (!reply) throw new Error('The tool answered nothing.');
					if ('error' in reply && reply.error) throw new Error(reply.error.message);
					const result = (reply as { result?: Record<string, unknown> }).result ?? {};
					if (result.isError) {
						const said = (result.content as { text?: string }[] | undefined)?.[0]?.text;
						return { refused: said ?? 'That did not work.' };
					}
					return result.structuredContent ?? result;
				}
			})
		])
	);
}

/**
 * What the chat may do, which is the account's own answer.
 *
 * Every grant an assistant is offered, and `destructive` only where somebody
 * has ticked it on the Chat tab. It is derived rather than written down twice:
 * a tool added next year brings its scope with it through `ASSISTANT_SCOPES`,
 * and deleting stays the one grant that has to be asked for.
 */
export function chatScopes(ctx: Ctx): readonly string[] {
	return getChatMayDelete(ctx.userId) ? [...ASSISTANT_SCOPES, 'destructive'] : ASSISTANT_SCOPES;
}

/** One message in, a streamed answer out, tools and all. */
export async function chatResponse(
	caller: Caller,
	row: KeyRow,
	messages: UIMessage[]
): Promise<Response> {
	const result = streamText({
		model: modelFor(row),
		system: SYSTEM,
		messages: await convertToModelMessages(messages),
		tools: toolsFor(caller),
		stopWhen: stepCountIs(MAX_STEPS)
	});
	return result.toUIMessageStreamResponse();
}
