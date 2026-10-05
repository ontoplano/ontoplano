<script lang="ts">
	/**
	 * The labels on what is filed in one notebook.
	 *
	 * The account's whole vocabulary is a different question and a worse one to
	 * be asked while looking at a renovation: `#home` doing forty things
	 * somewhere says nothing about why it is on this. Here the count is the
	 * subject's own, and it unfolds into what carries it — two notes and a
	 * task — because a number is not somewhere to go and look.
	 *
	 * The rows are `TagRows`, the same ones the account's own list draws, so
	 * the two cannot drift into two ideas of what a label is.
	 *
	 * **A label is still the account's.** Renaming one here renames it on the
	 * week and in the gallery, which the dialog says out loud — and deleting
	 * one is not offered here at all: taking a word out of the vocabulary
	 * because one notebook has finished with it is a decision for the screen
	 * that can see all of them.
	 */
	import { enhance } from '$lib/enhance';
	import Icon from '$lib/components/Icon.svelte';
	import Modal from '$lib/components/Modal.svelte';
	import TagFields from '$lib/components/TagFields.svelte';
	import TagRows from '$lib/components/TagRows.svelte';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import { resolve } from '$app/paths';
	import { useT } from '$lib/i18n';
	import type { NotebookTag } from '$lib/services/tags';

	const t = useT();

	let {
		open = $bindable(false),
		title,
		tags,
		/** Where the save posts — the page's own action, so it reloads its list. */
		action,
		/** Where taking a label off this notebook's things posts. */
		untagAction,
		error = null
	}: {
		open?: boolean;
		title: string;
		tags: NotebookTag[];
		action: string;
		untagAction?: string;
		error?: string | null;
	} = $props();

	let editing = $state<NotebookTag | null>(null);
	let name = $state('');
	let color = $state<string | null>(null);
	let description = $state('');

	function openEdit(tag: NotebookTag) {
		editing = tag;
		name = tag.name;
		color = tag.color;
		description = tag.description;
	}
</script>

<Modal bind:open {title} description={t('tags.inThisNotebook')} size="md">
	{#if tags.length === 0}
		<EmptyState
			icon="tag"
			title={t('tags.noTagsInThisNotebook')}
			description={t('tags.aLabelIsMadeByTyping')}
		/>
	{:else}
		<TagRows
			{tags}
			onedit={openEdit}
			deleteAction={untagAction}
			deleteTitle="notebooks.tags.removeFromThisNotebook"
			deleteConfirm="notebooks.tags.removeHere"
		/>
	{/if}

	{#snippet footer()}
		<!-- The way to the whole vocabulary, where a label is deleted or merged.
		     It is the Tags tab of the room as well; this is the door from here,
		     for somebody who is already looking at one subject's words. -->
		<a href={resolve('/notebooks/tags')} class="btn btn-sm mr-auto">
			{t('tags.allLabels')}
			<Icon name="arrow-right" />
		</a>
		<button type="button" class="btn" onclick={() => (open = false)}>{t('ui.close')}</button>
	{/snippet}
</Modal>

<!--
	What the label is, from inside the notebook.

	The same three questions the account's own screen asks, and the same answer
	lands in the same place: this is the account's word, and the dialog says so
	rather than pretending a notebook owns it.
-->
<Modal
	open={editing !== null}
	title={t('notebooks.tags.editTag')}
	description={t('tags.renamingChangesItEverywhere')}
	size="sm"
	{error}
	onclose={() => (editing = null)}
>
	{#if editing}
		<form
			id="notebook-tag-form"
			method="post"
			{action}
			use:enhance={() =>
				async ({ update }) => {
					await update({ reset: false });
					editing = null;
				}}
		>
			<input type="hidden" name="id" value={editing.id} />
			<TagFields bind:name bind:description bind:color was={editing.name} />
		</form>
	{/if}

	{#snippet footer()}
		<button type="button" class="btn" onclick={() => (editing = null)}>{t('ui.cancel')}</button>
		<button type="submit" form="notebook-tag-form" class="btn btn-primary">{t('ui.save')}</button>
	{/snippet}
</Modal>
