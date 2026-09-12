/**
 * Every picture that is in a notebook, as a gallery album.
 *
 * A picture in a note is an ordinary `media` row that the note's markdown
 * points at — `![a shelf](/media/12)` — and nothing records which notebook it
 * belongs to. That is on purpose: the writing is where the picture lives, so
 * moving a note between notebooks, deleting the line, or pasting the same
 * picture into a second note are all just edits to text, and a table recording
 * "picture 12 is in the kitchen notebook" would be wrong within a week.
 *
 * So this is derived, every time it is asked. The gallery gets a folder per
 * notebook that has any pictures, named the way the notebook is named — which
 * means a notebook inside a notebook is a folder inside a folder, and
 * `Home — Kitchen` in the notebooks room is `Home — Kitchen` here too.
 *
 * Derived also decides what can be done to it: pictures can be looked at,
 * named and tagged like any other, but nothing is uploaded *into* a notebook
 * folder and nothing is dragged out of one. There is no such thing as being in
 * one — a note mentions a picture, and that is the only fact there is.
 */
import { and, eq, inArray, isNotNull } from 'drizzle-orm';

import { db } from '$lib/db/index.js';
import { diaryEntries, media, mediaTags, notebooks, tags } from '$lib/db/schema.js';
import type { Ctx } from './ctx.js';
import { NotFoundError } from './errors.js';
import type { AlbumPicture } from './gallery.js';
import { NOTEBOOK_SEPARATOR } from './notebooks.js';

/**
 * Where this album lives in the gallery.
 *
 * Not a row in `albums` and not a number, so it needs an address of its own.
 * One constant, because the route, the link on the albums index and the test
 * all have to mean the same place.
 */
export const NOTEBOOK_ALBUM_SLUG = 'notebooks';

/** What the albums index calls it. */
export const NOTEBOOK_ALBUM_NAME = 'Notebooks';

/**
 * Which pictures a piece of writing points at.
 *
 * The markdown the app writes is `![alt](/media/12)`, but somebody editing by
 * hand may well have written the address on its own, so this looks for the
 * address rather than for the whole image syntax.
 */
export function picturesMentionedIn(content: string): number[] {
	const found = new Set<number>();
	for (const [, id] of content.matchAll(/\/media\/(\d+)/g)) found.add(Number(id));
	return [...found];
}

/** A notebook that has pictures in it, and which ones. */
export type NotebookMediaFolder = {
	/** The notebook's own title, which is also its path — see `NOTEBOOK_SEPARATOR`. */
	name: string;
	/** What to show in the folder tile: this folder's name without its parents'. */
	leaf: string;
	/** The pictures in this notebook alone. */
	pictureIds: number[];
	/** These and every folder under this one, which is what a tile counts. */
	totalCount: number;
};

/**
 * The notebooks that have pictures, with the pictures in each.
 *
 * Ordered by name, so the folders sit in the order the notebooks room shows
 * them and a folder's parent always comes before it.
 */
export function notebookMediaFolders(ctx: Ctx): NotebookMediaFolder[] {
	const rows = db
		.select({ title: notebooks.title, content: diaryEntries.content })
		.from(diaryEntries)
		.innerJoin(notebooks, eq(diaryEntries.notebookId, notebooks.id))
		.where(and(eq(diaryEntries.userId, ctx.userId), isNotNull(diaryEntries.notebookId)))
		.all();

	const byNotebook = new Map<string, Set<number>>();
	for (const row of rows) {
		const mentioned = picturesMentionedIn(row.content);
		if (mentioned.length === 0) continue;
		const held = byNotebook.get(row.title) ?? new Set<number>();
		for (const id of mentioned) held.add(id);
		byNotebook.set(row.title, held);
	}
	if (byNotebook.size === 0) return [];

	/*
	 * Only the pictures that are still there.
	 *
	 * A note can outlive the picture it mentions — somebody deletes it from the
	 * gallery and the markdown keeps pointing at nothing. The folder should not
	 * count those, and the grid should not try to draw them.
	 */
	const mentioned = [...new Set([...byNotebook.values()].flatMap((set) => [...set]))];
	const alive = new Set(
		db
			.select({ id: media.id })
			.from(media)
			.where(and(eq(media.userId, ctx.userId), inArray(media.id, mentioned)))
			.all()
			.map((row) => row.id)
	);

	const folders: NotebookMediaFolder[] = [];
	for (const [name, held] of byNotebook) {
		const pictureIds = [...held].filter((id) => alive.has(id)).sort((a, b) => b - a);
		if (pictureIds.length === 0) continue;
		const parts = name.split(NOTEBOOK_SEPARATOR);
		folders.push({ name, leaf: parts[parts.length - 1], pictureIds, totalCount: 0 });
	}
	folders.sort((a, b) => a.name.localeCompare(b.name));

	// What a folder holds includes what is inside it, the way an album's count
	// does — a notebook whose pictures are all in its sub-notebooks reads "0"
	// otherwise, which is true of the notebook and false of what you are
	// looking at.
	for (const folder of folders) {
		const beneath = folders.filter(
			(other) => other === folder || other.name.startsWith(folder.name + NOTEBOOK_SEPARATOR)
		);
		folder.totalCount = new Set(beneath.flatMap((other) => other.pictureIds)).size;
	}
	return folders;
}

/** How many pictures are in notebooks at all, for the tile on the index. */
export function notebookMediaCount(ctx: Ctx): number {
	const folders = notebookMediaFolders(ctx);
	return new Set(folders.flatMap((folder) => folder.pictureIds)).size;
}

/**
 * One folder of the notebooks album: what is directly inside it, and the
 * pictures in it and everything under it.
 *
 * `path` is the notebook's title. Empty means the album itself, which holds no
 * pictures of its own — every picture is in some notebook — and shows one
 * folder per notebook at the top of the tree.
 */
export function notebookMediaView(
	ctx: Ctx,
	path: string
): { folders: NotebookMediaFolder[]; pictures: AlbumPicture[] } {
	const all = notebookMediaFolders(ctx);
	const here = path ? all.find((folder) => folder.name === path) : undefined;
	if (path && !here) throw new NotFoundError('No notebook pictures here.');

	const under = path ? `${path}${NOTEBOOK_SEPARATOR}` : '';
	const inside = all.filter((folder) => folder.name.startsWith(under) && folder.name !== path);

	/*
	 * The folders directly inside this one.
	 *
	 * A notebook two levels down with nothing between it and here still has to
	 * appear, so this keeps the shallowest name on each branch rather than
	 * everything one separator deeper.
	 */
	const direct = inside.filter(
		(folder) => !inside.some((other) => folder.name.startsWith(other.name + NOTEBOOK_SEPARATOR))
	);

	// Everything beneath here, newest first, which is the order a grid of
	// pictures is read in everywhere else in the gallery.
	const ids = [
		...new Set([...(here?.pictureIds ?? []), ...inside.flatMap((folder) => folder.pictureIds)])
	].sort((a, b) => b - a);

	return { folders: direct, pictures: ids.length ? picturesById(ctx, ids) : [] };
}

/** The gallery's own picture shape, for a list of ids in the order given. */
function picturesById(ctx: Ctx, ids: number[]): AlbumPicture[] {
	const rows = db
		.select({ id: media.id, alt: media.alt, filename: media.filename, createdAt: media.createdAt })
		.from(media)
		.where(and(eq(media.userId, ctx.userId), inArray(media.id, ids)))
		.all();

	const tagRows = db
		.select({ mediaId: mediaTags.mediaId, name: tags.name })
		.from(mediaTags)
		.innerJoin(tags, eq(mediaTags.tagId, tags.id))
		.where(and(eq(mediaTags.userId, ctx.userId), inArray(mediaTags.mediaId, ids)))
		.all();

	return ids.flatMap((id) => {
		const row = rows.find((r) => r.id === id);
		if (!row) return [];
		return [
			{
				id: row.id,
				alt: row.alt,
				filename: row.filename,
				addedAt: row.createdAt,
				tags: tagRows.filter((t) => t.mediaId === id).map((t) => t.name),
				// Which *albums* hold it is a question about albums, and this folder
				// is not one: a picture is here because a note says so.
				albums: []
			}
		];
	});
}
