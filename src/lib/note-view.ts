/**
 * How a notebook's notes are laid out: a list of rows, or a grid of cards.
 *
 * Shared by the settings service that keeps the choice and the notebook screen
 * that draws it, so the two words are written once.
 */
export const NOTE_VIEWS = ['list', 'grid'] as const;
export type NoteView = (typeof NOTE_VIEWS)[number];

/** What a notebook nobody has chosen for opens as: the list it always was. */
export const DEFAULT_NOTE_VIEW: NoteView = 'list';

export function isNoteView(value: unknown): value is NoteView {
	return typeof value === 'string' && (NOTE_VIEWS as readonly string[]).includes(value);
}
