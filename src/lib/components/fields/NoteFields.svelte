<script lang="ts">
	import Field from '$lib/components/Field.svelte';
	import OneLine from '$lib/components/OneLine.svelte';
	import MoreOptions from '$lib/components/MoreOptions.svelte';
	import NotebookField from '$lib/components/NotebookField.svelte';
	import PictureAttach from '$lib/components/PictureAttach.svelte';
	import { autogrow } from '$lib/actions/autogrow';

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
		notebooks?: { id: number; title: string }[];
		compact?: boolean;
		pictures?: boolean;
		notebook?: boolean;
		label?: string;
	} = $props();

	let box = $state<HTMLTextAreaElement>();
</script>

<Field {label} span={12} required>
	<textarea
		bind:this={box}
		name="content"
		required
		rows={compact ? 4 : 8}
		use:autogrow
		class="textarea">{content}</textarea
	>
	{#if pictures}
		<PictureAttach target={box} />
	{/if}
</Field>

{#snippet rest()}
	{#if notebook}
		<NotebookField {notebooks} value={notebookId} span={12} />
	{/if}

	<Field label="Tags" span={12} hint="Separate with commas or spaces. A leading # is fine.">
		<OneLine name="tags" placeholder="work, health" value={tags} class="input" />
	</Field>
{/snippet}

{#if compact}
	<MoreOptions
		label={notebook ? 'Notebook, tags' : 'Tags'}
		count={(tags ? 1 : 0) + (notebook && notebookId ? 1 : 0)}
	>
		{@render rest()}
	</MoreOptions>
{:else}
	{@render rest()}
{/if}
