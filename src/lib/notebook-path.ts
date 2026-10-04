/**
 * Where a notebook sits on the shelf.
 *
 * A notebook carries a folder path, `Home/Kitchen`, beside its name. A folder
 * is only a label for grouping: it holds nothing, it is not a notebook, and it
 * has no row of its own — it exists while some notebook names it. Renaming a
 * folder is rewriting that prefix on every notebook that carries it.
 *
 * Written down here rather than beside the notebooks service so a page can use
 * it without pulling the database in behind it.
 */

/** What separates one folder from the one inside it. */
export const FOLDER_SEPARATOR = '/';

/** The longest folder path a notebook may carry. */
export const MAX_FOLDER_LENGTH = 240;

/**
 * The em dash that used to be the relationship: `Home — Kitchen` was a
 * notebook inside `Home`. Still read by the importer, for an export written
 * before folders, and used by the gallery's notebook album to join a path
 * into one name — a slash cannot do that, because a notebook's own name may
 * contain one.
 */
export const NOTEBOOK_SEPARATOR = ' — ';

/** The segments of a folder path, with blanks and stray spaces dropped. */
export function folderSegments(folder: string): string[] {
	return folder
		.split(FOLDER_SEPARATOR)
		.map((part) => part.trim())
		.filter(Boolean);
}

/** A folder path as it is stored: `' Home / Kitchen/ '` is `Home/Kitchen`. */
export function normaliseFolder(raw: string): string {
	return folderSegments(raw).join(FOLDER_SEPARATOR);
}

/** The folder a folder sits in, or '' at the top. */
export function parentFolder(folder: string): string {
	return folderSegments(folder).slice(0, -1).join(FOLDER_SEPARATOR);
}

/** A folder's own name, without the path in front of it. */
function folderName(folder: string): string {
	return folderSegments(folder).at(-1) ?? '';
}

/** Whether `folder` is `ancestor` itself or somewhere inside it. */
function isInsideFolder(folder: string, ancestor: string): boolean {
	return folder === ancestor || folder.startsWith(ancestor + FOLDER_SEPARATOR);
}

/**
 * Where a folder ends up when `from` is renamed to `to`, or null when it is
 * not inside `from` and so does not move.
 */
export function movedFolder(folder: string, from: string, to: string): string | null {
	if (!from || !isInsideFolder(folder, from)) return null;
	return normaliseFolder(to + FOLDER_SEPARATOR + folder.slice(from.length));
}

/** The whole address of a notebook, for a picker: `Home/Kitchen/Countertops`. */
export function notebookPath(notebook: { title: string; folder?: string | null }): string {
	return notebook.folder ? notebook.folder + FOLDER_SEPARATOR + notebook.title : notebook.title;
}

/**
 * A title from before folders, split into the two it is now.
 *
 * `Home — Kitchen — Countertops` is `Countertops` in `Home/Kitchen`. The same
 * rule migration 0106 applies to a database, applied to an export — a name
 * whose last segment is blank is left whole rather than becoming no name.
 */
export function splitLegacyTitle(title: string): { folder: string; title: string } {
	const parts = title.split(NOTEBOOK_SEPARATOR);
	const leaf = (parts.pop() ?? '').trim();
	if (parts.length === 0 || !leaf) return { folder: '', title };
	return { folder: parts.map((part) => part.trim()).join(FOLDER_SEPARATOR), title: leaf };
}

/**
 * The shelf's order with the favourites pulled to the front.
 *
 * Favourites lead, then the rest, then whatever is closed — a closed notebook
 * stays at the back even with a star on it, because it is history. Each group
 * keeps the order it was given in, which is the path.
 */
export function favouritesFirst<T extends { favourite?: boolean; closedAt?: string | null }>(
	notebooks: readonly T[]
): T[] {
	const rank = (one: T) => (one.closedAt ? 2 : one.favourite ? 0 : 1);
	return [...notebooks].sort((a, b) => rank(a) - rank(b));
}

/** Every folder the shelf has, ancestors included, in order. */
export function allFolders(notebooks: readonly { folder?: string | null }[]): string[] {
	const found = new Set<string>();
	for (const one of notebooks) {
		const parts = folderSegments(one.folder ?? '');
		for (let depth = 1; depth <= parts.length; depth++)
			found.add(parts.slice(0, depth).join(FOLDER_SEPARATOR));
	}
	return [...found].sort((a, b) => a.localeCompare(b));
}

/** A folder on the shelf, with what is directly in it. */
export type ShelfFolder<T> = {
	path: string;
	name: string;
	folders: ShelfFolder<T>[];
	notebooks: T[];
	/** How many notebooks are in it at any depth. */
	count: number;
};

/**
 * The shelf as folders: what is at the top, and each folder with its own.
 *
 * Folders come first and then notebooks, each in the order given for the
 * notebooks and by name for the folders.
 */
export function shelfOf<T extends { folder?: string | null }>(
	notebooks: readonly T[]
): { folders: ShelfFolder<T>[]; notebooks: T[] } {
	const root: ShelfFolder<T> = { path: '', name: '', folders: [], notebooks: [], count: 0 };
	const byPath = new Map<string, ShelfFolder<T>>([['', root]]);

	const folderAt = (path: string): ShelfFolder<T> => {
		const held = byPath.get(path);
		if (held) return held;
		const made: ShelfFolder<T> = {
			path,
			name: folderName(path),
			folders: [],
			notebooks: [],
			count: 0
		};
		byPath.set(path, made);
		folderAt(parentFolder(path)).folders.push(made);
		return made;
	};

	for (const notebook of notebooks) {
		const path = normaliseFolder(notebook.folder ?? '');
		folderAt(path).notebooks.push(notebook);
		for (let at = path; at; at = parentFolder(at)) folderAt(at).count++;
	}

	const sort = (folder: ShelfFolder<T>) => {
		folder.folders.sort((a, b) => a.name.localeCompare(b.name));
		folder.folders.forEach(sort);
	};
	sort(root);
	return { folders: root.folders, notebooks: root.notebooks };
}
