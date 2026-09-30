/**
 * The words a box should suggest for something filed under a notebook.
 *
 * A notebook is a subject, and the labels offered inside one are the labels
 * that subject already uses; filed under nothing, it is the account's whole
 * vocabulary. Every place that suggests a label for a task asks this, so the
 * edit dialog and the quick chip on a row cannot offer different words.
 */
export function vocabularyFor(
	data: {
		tagVocabulary?: readonly string[];
		tagVocabularyByNotebook?: Readonly<Record<number, readonly string[]>>;
	},
	notebookId: number | null | undefined
): readonly string[] {
	return notebookId
		? (data.tagVocabularyByNotebook?.[notebookId] ?? [])
		: (data.tagVocabulary ?? []);
}
