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
	import Field from '$lib/components/Field.svelte';
	import FormGrid from '$lib/components/FormGrid.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import Modal from '$lib/components/Modal.svelte';
	import OneLine from '$lib/components/OneLine.svelte';
	import TagChip from '$lib/components/TagChip.svelte';
	import TagRows from '$lib/components/TagRows.svelte';
	import TextBox from '$lib/components/TextBox.svelte';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import { TAG_COLOR_DEFAULT } from '$lib/colors';
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
		error = null
	}: {
		open?: boolean;
		title: string;
		tags: NotebookTag[];
		action: string;
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
		<TagRows {tags} onedit={openEdit} />
	{/if}

	{#snippet footer()}
		<!-- The way to the whole vocabulary, where a label is deleted or merged.
		     It is not a tab in this room any more: what a person wants while
		     looking at a subject is that subject's words. -->
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
			<!-- What the server reads for the colour: a colour input has no empty. -->
			<input type="hidden" name="color" value={color ?? ''} />
			<FormGrid>
				<Field label={t('ui.name')} span={12}>
					<OneLine name="label" bind:value={name} class="input" required autofocus />
				</Field>
				<Field label={t('tags.whatItMeans')} span={12} hint={t('tags.whatItMeansHint')}>
					<TextBox name="description" bind:value={description} rows={2} />
				</Field>
				<Field label={t('ui.colour')} span={12} hint={t('notebooks.tags.aTagWithNoColour')}>
					<div class="flex items-center gap-2">
						<input
							type="color"
							value={color ?? TAG_COLOR_DEFAULT}
							aria-label={t('ui.colour')}
							oninput={(e) => (color = e.currentTarget.value)}
							class="input h-9 w-14 p-1"
						/>
						<TagChip name={name || editing.name} {color} />
						<button
							type="button"
							onclick={() => (color = null)}
							disabled={color === null}
							class="btn btn-sm ml-auto"
						>
							{t('notebooks.tags.noColour')}
						</button>
					</div>
				</Field>
			</FormGrid>
		</form>
	{/if}

	{#snippet footer()}
		<button type="button" class="btn" onclick={() => (editing = null)}>{t('ui.cancel')}</button>
		<button type="submit" form="notebook-tag-form" class="btn btn-primary">{t('ui.save')}</button>
	{/snippet}
</Modal>
