import { and, desc, eq } from 'drizzle-orm';

import { db } from '$lib/db/index.js';
import { apiTokens, notebooks, phoneWidgets } from '$lib/db/schema.js';
import type { Ctx } from '$lib/services/ctx.js';
import { NotFoundError, ValidationError } from '$lib/services/errors.js';
import { getNotebook } from '$lib/services/notebooks.js';
import { sectionItems, type SectionAnswer } from '$lib/services/notebook-sections.js';
import { stamps } from '$lib/services/time.js';
import { num } from '$lib/services/validate.js';
import {
	isWidgetSection,
	widgetQuery,
	type WidgetQuery,
	type WidgetSection
} from '$lib/notebook-widget.js';
import {
	createToken,
	freeName,
	reshapeToken,
	revokeToken,
	type AuthenticatedToken,
	type Scope
} from './tokens.js';

/**
 * Home-screen widgets that show one tab of one notebook.
 *
 * Each widget is a row here and a key of its own. The key is confined to the
 * notebook and granted the single read its tab needs — a widget on the lock
 * screen showing the renovation's shopping cannot read the diary, nor another
 * notebook's shopping. Editing a widget moves its key; deleting one revokes it.
 */

/** The one grant each tab needs to be read. */
export const SECTION_SCOPE: Record<WidgetSection, Scope> = {
	notes: 'notes:read',
	tasks: 'tasks:read',
	// Goals are read with the todo list — see `SCOPES['tasks:read']`.
	goals: 'tasks:read',
	ideas: 'ideas:read',
	inventory: 'inventory:read'
};

/** What a widget's key is called in the list of keys, before the notebook's name. */
const TOKEN_NAME_PREFIX = 'Widget · ';
/** A key's name is capped at this — see `createToken`. */
const TOKEN_NAME_MAX = 60;
/** Room left for `freeName`'s " 2", " 3". */
const TOKEN_NAME_SUFFIX_ROOM = 4;

export type PhoneWidget = {
	id: number;
	notebookId: number;
	notebookTitle: string;
	section: WidgetSection;
	status: string;
	order: string;
	direction: 'asc' | 'desc';
	tag: string | null;
	/** When the phone last asked, or null if it never has. */
	lastUsedAt: string | null;
	/** False once its key was revoked from the list of keys. */
	connected: boolean;
	createdAt: string;
};

type Chosen = { notebookId: number; query: WidgetQuery };

/**
 * A widget's choices, read off a form.
 *
 * The notebook has to be one this account can reach, and the tab one that
 * notebook holds and a widget can show: offering the Goals of a notebook with
 * no Goals tab would be a widget that is always empty for a reason nobody can
 * see.
 */
function chosen(ctx: Ctx, raw: Record<string, unknown>): Chosen {
	const notebookId = num(raw.notebookId, 'Notebook', { int: true, min: 1 });
	const notebook = getNotebook(ctx, notebookId);
	if (!isWidgetSection(raw.section) || !notebook.modules.includes(raw.section))
		throw new ValidationError({ key: 'errors.widgets.thatNotebookHasNoSuchTab' });
	return { notebookId, query: widgetQuery(raw.section, raw) };
}

function tokenName(ctx: Ctx, title: string): string {
	const room = TOKEN_NAME_MAX - TOKEN_NAME_PREFIX.length - TOKEN_NAME_SUFFIX_ROOM;
	return freeName(ctx, TOKEN_NAME_PREFIX + title.slice(0, room));
}

function columns(query: WidgetQuery) {
	return {
		section: query.section,
		status: query.status,
		sortBy: query.order,
		direction: query.direction,
		tag: query.tag
	};
}

export function listPhoneWidgets(ctx: Ctx): PhoneWidget[] {
	return db
		.select({
			id: phoneWidgets.id,
			notebookId: phoneWidgets.notebookId,
			notebookTitle: notebooks.title,
			section: phoneWidgets.section,
			status: phoneWidgets.status,
			order: phoneWidgets.sortBy,
			direction: phoneWidgets.direction,
			tag: phoneWidgets.tag,
			lastUsedAt: apiTokens.lastUsedAt,
			revokedAt: apiTokens.revokedAt,
			createdAt: phoneWidgets.createdAt
		})
		.from(phoneWidgets)
		.innerJoin(notebooks, eq(phoneWidgets.notebookId, notebooks.id))
		.innerJoin(apiTokens, eq(phoneWidgets.tokenId, apiTokens.id))
		.where(eq(phoneWidgets.userId, ctx.userId))
		.orderBy(desc(phoneWidgets.createdAt), desc(phoneWidgets.id))
		.all()
		.filter((row) => isWidgetSection(row.section))
		.map(({ revokedAt, ...row }) => ({
			...row,
			section: row.section as WidgetSection,
			connected: revokedAt === null
		}));
}

/**
 * A new widget and the key it reads with. The key is in the answer once and
 * never again — it goes straight to the phone.
 */
export function createPhoneWidget(
	ctx: Ctx,
	raw: Record<string, unknown>
): { id: number; token: string } {
	const { notebookId, query } = chosen(ctx, raw);
	const token = createToken(ctx, {
		name: tokenName(ctx, getNotebook(ctx, notebookId).title),
		scopes: [SECTION_SCOPE[query.section]],
		confinedKind: 'notebook',
		confinedId: notebookId
	});

	const row = db
		.insert(phoneWidgets)
		.values({
			...stamps(ctx),
			userId: ctx.userId,
			tokenId: token.id,
			notebookId,
			...columns(query)
		})
		.returning({ id: phoneWidgets.id })
		.get();

	return { id: row.id, token: token.plaintext };
}

function tokenOf(ctx: Ctx, id: number): number {
	const row = db
		.select({ tokenId: phoneWidgets.tokenId })
		.from(phoneWidgets)
		.where(and(eq(phoneWidgets.id, id), eq(phoneWidgets.userId, ctx.userId)))
		.get();
	if (!row) throw new NotFoundError('widget');
	return row.tokenId;
}

/** Point a widget somewhere else. Its key moves with it; the phone keeps the same one. */
export function updatePhoneWidget(ctx: Ctx, id: number, raw: Record<string, unknown>): void {
	const tokenId = tokenOf(ctx, id);
	const { notebookId, query } = chosen(ctx, raw);

	db.transaction(() => {
		reshapeToken(ctx, tokenId, {
			scopes: [SECTION_SCOPE[query.section]],
			confinedKind: 'notebook',
			confinedId: notebookId
		});
		const res = db
			.update(phoneWidgets)
			.set({ notebookId, ...columns(query), updatedAt: stamps(ctx).updatedAt })
			.where(and(eq(phoneWidgets.id, id), eq(phoneWidgets.userId, ctx.userId)))
			.run();
		if (res.changes === 0) throw new NotFoundError('widget');
	});
}

/** Remove a widget and revoke its key, so the phone's copy stops working. */
export function deletePhoneWidget(ctx: Ctx, id: number): void {
	const tokenId = tokenOf(ctx, id);
	db.transaction(() => {
		try {
			revokeToken(ctx, tokenId);
		} catch (e) {
			// Already revoked from the list of keys: the widget goes all the same.
			if (!(e instanceof NotFoundError)) throw e;
		}
		db.delete(phoneWidgets)
			.where(and(eq(phoneWidgets.id, id), eq(phoneWidgets.userId, ctx.userId)))
			.run();
	});
}

/**
 * What the widget holding this key should draw.
 *
 * The key names the widget: the phone never says which notebook it wants, so
 * it cannot ask for another one. Not found for a key that is no widget's.
 */
export function widgetFor(
	ctx: Ctx,
	token: Pick<AuthenticatedToken, 'tokenId' | 'scopes' | 'confinement'>
): SectionAnswer & { widget: number } {
	const row = db
		.select()
		.from(phoneWidgets)
		.where(and(eq(phoneWidgets.tokenId, token.tokenId), eq(phoneWidgets.userId, ctx.userId)))
		.get();
	if (!row || !isWidgetSection(row.section)) throw new NotFoundError('widget');
	// The key's own grant and pin, not only the row's say-so.
	if (!token.scopes.includes(SECTION_SCOPE[row.section])) throw new NotFoundError('widget');
	const pinned = token.confinement;
	if (!pinned || pinned.kind !== 'notebook' || pinned.id !== row.notebookId)
		throw new NotFoundError('widget');

	const query = widgetQuery(row.section, {
		status: row.status,
		order: row.sortBy,
		direction: row.direction,
		tag: row.tag
	});
	return { widget: row.id, ...sectionItems(ctx, row.notebookId, query) };
}
