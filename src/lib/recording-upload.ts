/**
 * A recording, sent to be kept.
 *
 * The recordings page, the wheel and the note form's attach button all post
 * the same form to `/media/audio`; this is that form, once. What comes back is
 * the stored row's id and name, and the markdown a note carries it with.
 */
export type RecordingDraft = { bytes: Blob; name: string; notes: string; seconds: number };

export type KeptRecording = { id: number; name: string; markdown: string };

export async function postRecording(
	draft: RecordingDraft,
	/** What to say when the server gives no message of its own. */
	fallbackMessage = ''
): Promise<KeptRecording> {
	const body = new FormData();
	// A name only for the multipart part; the service names the row.
	body.set('file', draft.bytes, 'recording');
	body.set('label', draft.name);
	body.set('notes', draft.notes);
	body.set('seconds', String(draft.seconds));

	const answer = await fetch('/media/audio', { method: 'POST', body });
	const reply = (await answer.json().catch(() => ({}))) as Partial<KeptRecording> & {
		message?: string;
	};
	if (!answer.ok || !reply.id) throw new Error(reply.message ?? fallbackMessage);
	return { id: reply.id, name: reply.name ?? draft.name, markdown: reply.markdown ?? '' };
}
