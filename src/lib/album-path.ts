/**
 * How an album's name says where it belongs.
 *
 * A folder import writes `Birds — Falconiformes`, which is a name and a
 * lineage at once: split it and the flat list of albums is a tree. This is the
 * one place that string is written down, and it is here rather than beside the
 * album service because a page needs it too — and importing the service into a
 * page would pull the database in behind it.
 */
export const ALBUM_SEPARATOR = ' — ';

/** A folder's own name, without the lineage in front of it. */
export function leafAlbumName(name: string): string {
	return name.split(ALBUM_SEPARATOR).at(-1) ?? name;
}
