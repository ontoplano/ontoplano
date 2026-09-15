import type { Ctx } from '$lib/services/ctx.js';
import { listEveryEntry } from '$lib/services/diary.js';
import { listGoals } from '$lib/services/goals.js';
import { listNotebooks } from '$lib/services/notebooks.js';
import { listTodos } from '$lib/services/todos.js';
import { ForbiddenError } from '$lib/services/errors.js';
import type { Ref, RefKind } from './refs.js';
import { TOOLS } from './tools.js';

/**
 * A key that can only reach one thing.
 *
 * Scopes answer "what may this key do" — read your notes, write your tasks —
 * for the whole account. That is the right shape for a scale that pushes
 * weights and the wrong shape for the thing people actually want to hand an
 * assistant: work on *this* project with me. Granting `tasks:write` for that
 * hands over every to-do there is, and the one being asked for is a notebook's
 * worth.
 *
 * So a token may also carry a confinement: a kind of thing and which one. It
 * is not a filter the tools apply — it is the listing they resolve against.
 * `refs.ts` defines a kind as the rows a caller can list; a confined caller
 * lists fewer, and every tool that names that kind narrows with it, with
 * nothing to remember at seventy call sites.
 *
 * Three rules, and the third is what makes the other two safe:
 *
 *   1. A tool that names nothing is refused. A confined key cannot call
 *      `diary` or `goals`, because those are about the account, not a thing.
 *   2. A tool that names a kind this confinement does not contain is refused
 *      — a shopping item is not inside a notebook.
 *   3. Where a tool names the confining kind itself, the argument is *set*
 *      rather than checked. Asking for another notebook does not fail; it is
 *      simply not what the call ends up being about. Nothing here is ever read
 *      from a request: the kind comes from this table and the id from the
 *      token's own row.
 */

type Contains = Partial<Record<RefKind, (ctx: Ctx, id: number) => { id: number }[]>>;

type Confinable = {
	/** The sentence the owner of the account agrees to. */
	label: string;
	/** What one of these is called, on the screen that offers the choice. */
	noun: string;
	/** What kind of thing the token is pinned to. */
	kind: RefKind;
	/** For each kind a confined key may name, the rows inside this one. */
	contains: Contains;
	/** The ones there are to choose from, named as the person named them. */
	options: (ctx: Ctx) => { id: number; label: string }[];
};

export const CONFINEMENTS: Record<string, Confinable> = Object.freeze({
	notebook: {
		label: 'one notebook — its tasks, its goals and its notes, and nothing else',
		noun: 'notebook',
		kind: 'notebook',
		options: (ctx) => listNotebooks(ctx).map((one) => ({ id: one.id, label: one.title })),
		contains: {
			notebook: (ctx, id) => listNotebooks(ctx).filter((one) => one.id === id),
			todo: (ctx, id) => listTodos(ctx).filter((one) => one.notebookId === id),
			goal: (ctx, id) => listGoals(ctx, { includeClosed: true }).filter((g) => g.notebookId === id),
			note: (ctx, id) => listEveryEntry(ctx).filter((one) => one.notebookId === id)
		}
	}
});

export type ConfinementKind = keyof typeof CONFINEMENTS;

/** What a token carries: which table above, and which row. */
export type Confinement = { kind: string; id: number };

/** Whether a string off a database row still names something here. */
export function isConfinementKind(kind: unknown): kind is ConfinementKind {
	return typeof kind === 'string' && Object.hasOwn(CONFINEMENTS, kind);
}

/**
 * What this confinement lets a caller see of each kind.
 *
 * Null for a kind it does not contain at all, which is the answer that refuses
 * a tool rather than narrowing it — there is no such thing as "the shopping
 * items in a notebook", and pretending there are none would make the tool look
 * as if it had simply found nothing.
 */
export function reachOf(confinement: Confinement) {
	const table = CONFINEMENTS[confinement.kind];
	return (kind: RefKind, ctx: Ctx): { id: number }[] | null => {
		const inside = table?.contains[kind];
		return inside ? inside(ctx, confinement.id) : null;
	};
}

/**
 * Whether a confined key could call this tool at all.
 *
 * The same two rules `confine` refuses on, asked as a question rather than
 * answered with a throw — so the tool list a confined key is shown is exactly
 * the set it can use. A model offered a tool that always refuses spends its
 * turn finding that out.
 */
export function withinConfinement(
	confinement: Confinement,
	tool: { refs?: readonly Ref[] }
): boolean {
	const table = CONFINEMENTS[confinement.kind];
	if (!table) return false;

	const named = tool.refs ?? [];
	return named.length > 0 && named.every((ref) => Boolean(table.contains[ref.kind]));
}

/**
 * Refuse a tool this key has no business calling, and pin the ones it does.
 *
 * Mutates `args` on purpose — it is how rule 3 is applied, and doing it here
 * rather than inside the tools is what stops it from being something seventy
 * tools have to remember.
 */
export function confine(
	confinement: Confinement,
	refs: readonly Ref[] | undefined,
	args: Record<string, unknown>
): void {
	const table = CONFINEMENTS[confinement.kind];
	if (!table) throw new ForbiddenError('This key is confined to something that no longer exists.');

	const named = refs ?? [];
	if (named.length === 0)
		throw new ForbiddenError(
			`This key can only work on ${table.label}, and that asks about the whole account.`
		);

	for (const ref of named) {
		if (!table.contains[ref.kind])
			throw new ForbiddenError(`This key can only work on ${table.label}.`);
		if (ref.kind === table.kind) args[ref.arg] = confinement.id;
	}
}

/**
 * The choices to put in front of somebody making a key.
 *
 * Generated from the table rather than written out on the page, so a second
 * confinement — one album, one ledger — arrives on the form by being added
 * here. An entry with nothing to choose from is left out: offering "tie it to
 * a notebook" to an account with no notebooks is offering a dead end.
 */
export function confinementChoices(ctx: Ctx) {
	return Object.entries(CONFINEMENTS)
		.map(([kind, table]) => ({
			kind,
			noun: table.noun,
			label: table.label,
			scopes: scopesWithin(kind),
			things: table.options(ctx)
		}))
		.filter((choice) => choice.things.length > 0);
}

/**
 * Which permissions still mean anything once a key is tied to one thing.
 *
 * A key confined to a notebook can only call the tools that name something
 * inside it, so every other room's grant would be a box that grants nothing —
 * and a permission screen that offers grants with no effect teaches people
 * that the screen is decoration. Derived from the tool table, so a tool added
 * later brings its room onto this list by existing.
 */
export function scopesWithin(kind: string): string[] {
	const table = CONFINEMENTS[kind];
	if (!table) return [];

	const scopes = new Set<string>();
	for (const tool of TOOLS) if (withinConfinement({ kind, id: 0 }, tool)) scopes.add(tool.scope);
	return [...scopes];
}

/**
 * What a key is tied to, in a phrase for the list of keys.
 *
 * Resolved through the same options the form offered, so a notebook renamed
 * since is named as it is now — and one deleted since reads as gone rather
 * than as a number. Null for a key that reaches the whole account.
 */
export function describeConfinement(ctx: Ctx, confinement: Confinement | null): string | null {
	if (!confinement) return null;

	const table = CONFINEMENTS[confinement.kind];
	if (!table) return 'something that no longer exists';

	const one = table.options(ctx).find((option) => option.id === confinement.id);
	return one ? `${table.noun}: ${one.label}` : `a ${table.noun} that has been deleted`;
}
