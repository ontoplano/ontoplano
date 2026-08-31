/**
 * The anchor a heading gets, in the one place that decides it.
 *
 * It has to match in three renderers at once — GitHub, Forgejo and the static
 * site — or a link in a table of contents scrolls nowhere. This is GitHub's
 * rule: lowercase, drop anything that is not a word character, a space or a
 * hyphen, then spaces to hyphens. Underscores are word characters and survive,
 * which is the bit the first version got wrong: `recurring_tasks` was linked as
 * `#recurringtasks`, so every link in the data model's contents was dead.
 *
 * Its own file because both `build-docs.mjs` and `build-docs-site.mjs` need it,
 * and those are scripts rather than modules — importing one from the other
 * would run it.
 */
export function anchor(heading) {
	return heading
		.trim()
		.toLowerCase()
		.replace(/[^\w\s-]/g, '')
		.replace(/\s+/g, '-');
}
