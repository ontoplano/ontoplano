<script lang="ts">
	import TagInput from '$lib/components/TagInput.svelte';
	import { page } from '$app/state';
	import Field from '$lib/components/Field.svelte';
	import MoreOptions from '$lib/components/MoreOptions.svelte';
	import NotebookField from '$lib/components/NotebookField.svelte';
	import PictureAttach from '$lib/components/PictureAttach.svelte';
	import RecordingAttach from '$lib/components/RecordingAttach.svelte';
	import MarkdownBox from '$lib/components/MarkdownBox.svelte';
	import { useT } from '$lib/i18n';

	const t = useT();

	/**
	 * What a note is made of. See IdeaFields for why this is a component.
	 *
	 * Pictures are attached here rather than on one page, because this is the
	 * one place a note is written from — the diary, a notebook, the capture
	 * wheel. Whatever a picture does in one of them it does in all of them.
	 */
	let {
		content = '',
		tags = '',
		notebookId = null,
		notebooks = [],
		compact = false,
		/** Off where there is no room for it, like the capture sheet's four rows. */
		pictures = true,
		/**
		 * Whether this note may be filed in a notebook.
		 *
		 * Off in the diary, which is not one notebook among others — it is the
		 * day, and a note written into it is a note about the day. Offering to
		 * move it somewhere else at the moment of writing asks a question the
		 * page has already answered, and answering it took the note out of the
		 * diary the writer was looking at. A note can still be filed later, from
		 * the note itself.
		 */
		notebook = true,
		/**
		 * What the box is called.
		 *
		 * "Note" on the diary page, where the page is the diary and the word is
		 * unambiguous. "Diary note" from the capture wheel, which offers four
		 * things to write and where a bare "Note" does not say which of them
		 * this one lands in.
		 */
		label = 'Note'
	}: {
		content?: string;
		tags?: string;
		notebookId?: number | null;
		notebooks?: { id: number; title: string; defaultTags?: string }[];
		compact?: boolean;
		pictures?: boolean;
		notebook?: boolean;
		label?: string;
	} = $props();

	let box = $state<HTMLTextAreaElement>();

	/*
	 * A notebook's own labels, filled in rather than applied.
	 *
	 * "Every new note here starts with these" is a suggestion, so it belongs
	 * in the box where the person can see it and take it out again — not
	 * added on the server where they would find out afterwards. Picking a
	 * different notebook swaps them, and anything typed is left alone: the
	 * swap only replaces what the last notebook put there.
	 */
	let filedIn = $state(notebookId);
	let labels = $state(tags);

	const defaultsFor = (id: number | null) =>
		(id === null ? '' : (notebooks.find((one) => one.id === id)?.defaultTags ?? '')).trim();

	/*
	 * Plain variables, for the same reason TagInput's is: they mark what this
	 * effect last did, and making them reactive would have it depend on its
	 * own writes.
	 *
	 * `openedWith` is the re-seed TagInput needs for the same reason — one
	 * modal is reused for the next note, so the props change under a component
	 * that is not rebuilt, and state seeded once would show the last note's
	 * labels and save them.
	 */
	let openedWith = { notebookId, tags };
	let suggested = defaultsFor(notebookId);
	$effect(() => {
		if (notebookId !== openedWith.notebookId || tags !== openedWith.tags) {
			openedWith = { notebookId, tags };
			filedIn = notebookId;
			labels = tags;
			suggested = defaultsFor(notebookId);
			return;
		}

		const now = defaultsFor(filedIn);
		if (now === suggested) return;
		// Only what the last notebook put there is replaced; anything typed stays.
		if (labels.trim() === suggested) labels = now;
		suggested = now;
	});
</script>

<Field {label} span={12} required>
	<!-- Twice the height it started at: a note is usually more than two lines,
	     and a box that has to be grown before it is written in asks a question
	     nobody wanted. It still grows past this. -->
	<MarkdownBox bind:element={box} value={content} name="content" required rows={compact ? 8 : 16} />
	{#if pictures}
		<PictureAttach target={box} />
		<RecordingAttach target={box} />
	{/if}
</Field>

{#snippet rest()}
	{#if notebook}
		<NotebookField {notebooks} bind:value={filedIn} span={12} />
	{/if}

	<!-- Half the row, so Tags and the People field beside it are the same size
	     and the row is used. They were 12 and 6 — one full-width box above a
	     half-width one, for two things of equal weight. -->
	<Field label={t('ui.tags')} span={6} hint={t('fields.note.separateWithCommasOrSpaces')}>
		<TagInput
			bind:value={labels}
			known={page.data.tagVocabulary ?? []}
			placeholder={t('fields.note.tagsExample')}
		/>
	</Field>
{/snippet}

{#if compact}
	<MoreOptions
		label={notebook ? t('fields.note.notebookTags') : 'Tags'}
		count={(labels ? 1 : 0) + (notebook && filedIn ? 1 : 0)}
	>
		{@render rest()}
	</MoreOptions>
{:else}
	{@render rest()}
{/if}
