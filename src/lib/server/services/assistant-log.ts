import { and, desc, eq, inArray, lt } from 'drizzle-orm';

import { db } from '../db/index.js';
import { apiTokens, assistantCalls } from '../db/schema.js';
import type { Ctx } from './ctx.js';
import { stamp } from './time.js';
import { NotFoundError, ValidationError } from './errors.js';
import { createTodo } from './todos.js';
import { createNotebook } from './notebooks.js';
import { createIdea, toggleApplied, toggleFavorite } from './ideas.js';
import { createItem, createCategory as createShoppingCategory } from './shopping.js';
import { createFreeReminder } from './reminders.js';
import { createSlot } from './slots.js';
import { createLocation } from './locations.js';
import { createWorkoutCategory } from './workouts.js';

/**
 * What an assistant did to an account, and the way back.
 *
 * The MCP layer answers every write with the state it replaced — but that
 * answer goes to whoever holds the transcript, and the person whose data it is
 * has no transcript. This log is their copy: one row per write, with the same
 * `before`, shown under Settings → Integrations. A row whose call deleted
 * something carries a **Put it back** that recreates it through the same
 * service the app uses.
 *
 * Deliberately append-only and deliberately unable to fail a call: a log that
 * breaks a write is worse than a gap in the log, the same rule `audit.ts`
 * follows. Capped per account, oldest rows pruned, because a log nobody prunes
 * is a disk that fills.
 */

/** Rows kept per account. Enough to read a bad afternoon back, not a history. */
export const CALLS_KEPT = 500;

export type AssistantCall = {
	id: number;
	tokenId: number | null;
	tokenName: string | null;
	tool: string;
	args: Record<string, unknown>;
	before: unknown;
	destroyed: boolean;
	restoredAt: string | null;
	createdAt: string;
};

export function recordAssistantCall(
	ctx: Ctx,
	entry: {
		tokenId?: number;
		tool: string;
		args: Record<string, unknown>;
		before: unknown;
		destroyed: boolean;
	}
): void {
	try {
		db.insert(assistantCalls)
			.values({
				userId: ctx.userId,
				tokenId: entry.tokenId ?? null,
				tool: entry.tool,
				args: JSON.stringify(entry.args ?? {}),
				before:
					entry.before === null || entry.before === undefined ? null : JSON.stringify(entry.before),
				destroyed: entry.destroyed,
				createdAt: stamp(ctx)
			})
			.run();

		// The cap. Everything older than the newest CALLS_KEPT rows goes; done on
		// every write because a prune that waits for a timer is a prune that a
		// box without the timer never runs.
		const edge = db
			.select({ id: assistantCalls.id })
			.from(assistantCalls)
			.where(eq(assistantCalls.userId, ctx.userId))
			.orderBy(desc(assistantCalls.id))
			.limit(1)
			.offset(CALLS_KEPT - 1)
			.get();
		if (edge) {
			db.delete(assistantCalls)
				.where(and(eq(assistantCalls.userId, ctx.userId), lt(assistantCalls.id, edge.id)))
				.run();
		}
	} catch (e) {
		// Never the call's problem.
		console.error('assistant-log: recording failed:', e);
	}
}

export function listAssistantCalls(ctx: Ctx, options: { limit?: number } = {}): AssistantCall[] {
	const rows = db
		.select({
			id: assistantCalls.id,
			tokenId: assistantCalls.tokenId,
			tool: assistantCalls.tool,
			args: assistantCalls.args,
			before: assistantCalls.before,
			destroyed: assistantCalls.destroyed,
			restoredAt: assistantCalls.restoredAt,
			createdAt: assistantCalls.createdAt
		})
		.from(assistantCalls)
		.where(eq(assistantCalls.userId, ctx.userId))
		.orderBy(desc(assistantCalls.id))
		.limit(Math.min(options.limit ?? 50, 200))
		.all();

	// Token names in one query rather than one per row. A token that has been
	// revoked still names itself here, which is the point of keeping the log
	// apart from the credential.
	const tokenIds = [...new Set(rows.map((r) => r.tokenId).filter((v): v is number => v !== null))];
	const names = new Map(
		tokenIds.length === 0
			? []
			: db
					.select({ id: apiTokens.id, name: apiTokens.name })
					.from(apiTokens)
					.where(and(eq(apiTokens.userId, ctx.userId), inArray(apiTokens.id, tokenIds)))
					.all()
					.map((t) => [t.id, t.name] as const)
	);

	return rows.map((r) => ({
		id: r.id,
		tokenId: r.tokenId,
		tokenName: r.tokenId === null ? null : (names.get(r.tokenId) ?? null),
		tool: r.tool,
		args: parsed(r.args) as Record<string, unknown>,
		before: r.before === null ? null : parsed(r.before),
		destroyed: r.destroyed,
		restoredAt: r.restoredAt,
		createdAt: r.createdAt
	}));
}

function parsed(raw: string): unknown {
	try {
		return JSON.parse(raw);
	} catch {
		return null;
	}
}

/**
 * Recreate what a deleting call removed, from the `before` it recorded.
 *
 * Through the same create the app uses, so ceilings, validation and ownership
 * are the service's — this cannot make a row the person could not have made by
 * hand. The new row gets a new id; what comes back is the thing, not the
 * exact database row it was.
 *
 * Only the deleting tools are offered a way back here. A *changed* row's
 * before is in the log to be read; putting a change back is editing, and
 * editing belongs in the app where the current state is on screen.
 */
export function putBack(ctx: Ctx, id: number): { made: string } {
	const row = db
		.select()
		.from(assistantCalls)
		.where(and(eq(assistantCalls.id, id), eq(assistantCalls.userId, ctx.userId)))
		.get();
	if (!row) throw new NotFoundError('call');
	if (!row.destroyed) throw new ValidationError('That call changed something; it deleted nothing.');
	if (row.restoredAt) throw new ValidationError('Already put back.');

	const before = row.before === null ? null : parsed(row.before);
	if (!before || typeof before !== 'object')
		throw new ValidationError('Nothing was recorded to put back.');

	const made = recreate(ctx, row.tool, before as Record<string, unknown>);

	db.update(assistantCalls)
		.set({ restoredAt: stamp(ctx) })
		.where(and(eq(assistantCalls.id, id), eq(assistantCalls.userId, ctx.userId)))
		.run();

	return { made };
}

/** One case per deleting tool. A tool this does not know is a bug, not a shrug. */
function recreate(ctx: Ctx, tool: string, before: Record<string, unknown>): string {
	switch (tool) {
		case 'drop_todo': {
			createTodo(ctx, {
				title: before.title,
				notes: before.notes,
				categoryId: before.categoryId,
				notebookId: before.notebookId,
				scheduledDate: before.scheduledDate
			});
			return `the todo "${String(before.title)}"`;
		}

		case 'remove_notebook': {
			// Only empty notebooks can be removed over MCP, so the title and the
			// description are the whole of what was lost.
			createNotebook(ctx, { title: before.title, description: before.description });
			return `the notebook "${String(before.title)}"`;
		}

		case 'remove_idea': {
			const tags = Array.isArray(before.tags)
				? (before.tags as { name?: unknown }[]).map((t) => String(t.name ?? '')).join(', ')
				: '';
			const ideaId = createIdea(ctx, { content: before.content, tags });
			if (before.favorite) toggleFavorite(ctx, ideaId);
			if (before.isApplied) toggleApplied(ctx, ideaId, before.appliedNote ?? undefined);
			return `the idea "${String(before.content).slice(0, 60)}"`;
		}

		case 'remove_from_shopping_list': {
			createItem(ctx, {
				name: before.name,
				type: before.type,
				shoppingCategoryId: before.shoppingCategoryId,
				notes: before.notes,
				locationId: before.locationId,
				idealQty: before.idealQty
			});
			return `"${String(before.name)}" on the shopping list`;
		}

		case 'remove_shopping_category': {
			createShoppingCategory(ctx, { name: before.name, isFood: before.isFood });
			return `the section "${String(before.name)}"`;
		}

		case 'cancel_alarm': {
			// Only a free-standing alarm can be recreated whole: one that hung off
			// a block or a todo belongs to its subject, and the honest fix is to
			// set it again on the thing itself.
			if (before.subjectKind !== 'free')
				throw new ValidationError(
					'That reminder belonged to something — set it again on the thing itself.'
				);
			createFreeReminder(ctx, {
				at: before.remindAt,
				message: before.message,
				audible: before.audible,
				ringtoneId: before.ringtoneId
			});
			return `the reminder "${String(before.message)}"`;
		}

		case 'remove_repeating_block': {
			createSlot(ctx, {
				weekday: before.weekday,
				startTime: before.startTime,
				durationMinutes: before.durationMinutes,
				mode: before.mode,
				categoryId: before.categoryId,
				activityId: before.activityId,
				workoutId: before.workoutId,
				label: before.label,
				remindLeadMinutes: before.remindLeadMinutes,
				recurrence: typeof before.recurrence === 'string' ? before.recurrence : undefined,
				meta: typeof before.meta === 'string' ? before.meta : undefined,
				ratings: {
					urgency: (before.urgency as number) ?? null,
					interest: (before.interest as number) ?? null,
					energy: (before.energy as number) ?? null
				}
			});
			return `the repeating block "${String(before.label || before.activityName || before.categoryName || 'block')}"`;
		}

		case 'remove_location': {
			// The row itself. Children it once held were lifted to its parent when
			// it went, and they stay where they are — put back the shelf, not the
			// whole cupboard's arrangement.
			createLocation(ctx, { name: before.name, parentId: before.parentId, notes: before.notes });
			return `the location "${String(before.name)}"`;
		}

		case 'remove_workout_category': {
			createWorkoutCategory(ctx, before.name);
			return `the workout category "${String(before.name)}"`;
		}

		default:
			throw new ValidationError('That call has no way back from here.');
	}
}
