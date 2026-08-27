<script lang="ts">
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import { armed } from '$lib/actions/armed';
	import Field from '$lib/components/Field.svelte';
	import FormError from '$lib/components/FormError.svelte';
	import FormGrid from '$lib/components/FormGrid.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import Modal from '$lib/components/Modal.svelte';
	import NotebookDetail from '$lib/components/NotebookDetail.svelte';
	import { SECTION_COLORS } from '$lib/colors';
	import type { PageServerData, ActionData } from './$types';

	let { data, form }: { data: PageServerData; form: ActionData } = $props();

	let editing = $state(false);
	let confirmingDelete = $state(false);

	function handleKeydown(e: KeyboardEvent) {
		if (
			e.target instanceof HTMLInputElement ||
			e.target instanceof HTMLTextAreaElement ||
			e.target instanceof HTMLSelectElement
		)
			return;

		if (e.key === 'Escape') {
			editing = false;
			confirmingDelete = false;
		}
	}
</script>

<svelte:window onkeydown={handleKeydown} />

<div class="space-y-4">
	<div class="flex flex-wrap items-start justify-between gap-3">
		<div class="min-w-0">
			<a
				href={resolve('/diary/notebooks')}
				class="text-xs text-gray-500 hover:text-gray-900 hover:underline"
			>
				&larr; All notebooks
			</a>
			<h1 class="mt-1 text-lg font-bold text-gray-900">
				{data.notebook.title}
				{#if data.notebook.closedAt}
					<span class="eyebrow ml-2 align-middle text-gray-500">closed</span>
				{/if}
			</h1>
			{#if data.notebook.description}
				<p class="mt-1 max-w-prose text-sm text-gray-500">{data.notebook.description}</p>
			{/if}
		</div>

		<div class="flex flex-wrap items-center gap-2">
			<button onclick={() => (editing = true)} class="btn btn-sm" title="Rename" aria-label="Rename"
				><Icon name="edit" /></button
			>
			<form
				method="post"
				action="?/setClosed"
				use:enhance={() =>
					async ({ update }) => {
						await update({ reset: false });
					}}
			>
				<input type="hidden" name="id" value={data.notebook.id} />
				<input type="hidden" name="closed" value={data.notebook.closedAt ? 'false' : 'true'} />
				<button class="btn btn-sm">
					{#if data.notebook.closedAt}
						<Icon name="undo" /> Reopen
					{:else}
						<Icon name="check" /> Close
					{/if}
				</button>
			</form>
			<button onclick={() => (confirmingDelete = true)} class="btn btn-danger btn-sm">
				<Icon name="trash" /> Delete
			</button>
		</div>
	</div>

	<FormError message={form?.message} />

	<!-- The whole width, which is the point of being here rather than on the index. -->
	<section
		class="card-accent flex flex-col border border-gray-200 bg-white shadow-card"
		style="--card-accent: {SECTION_COLORS.diary}"
	>
		<NotebookDetail notebook={data.notebook} contents={data.contents} />
	</section>
</div>

<Modal bind:open={editing} error={form?.message} title="Edit notebook" size="sm">
	<form
		id="notebook-form"
		method="post"
		action="?/update"
		use:enhance={() =>
			async ({ update, result }) => {
				await update({ reset: false });
				if (result.type === 'success') editing = false;
			}}
	>
		<input type="hidden" name="id" value={data.notebook.id} />
		<FormGrid>
			<Field label="Title" span={12} required>
				<input name="title" required autocomplete="off" value={data.notebook.title} class="input" />
			</Field>
			<Field label="What it is for" span={12}>
				<textarea name="description" rows="2" class="textarea">{data.notebook.description}</textarea
				>
			</Field>
		</FormGrid>
	</form>

	{#snippet footer()}
		<button type="button" class="btn" onclick={() => (editing = false)}>Cancel</button>
		<button type="submit" form="notebook-form" class="btn btn-primary">Save</button>
	{/snippet}
</Modal>

<!-- The same dialog as the index: a confirmation somewhere the cursor is not. -->
<Modal
	bind:open={confirmingDelete}
	title="Delete this notebook?"
	description="“{data.notebook.title}” will be gone."
	size="sm"
>
	<p class="text-sm text-gray-600">
		Its notes, tasks and goals will not be deleted. The tasks and goals stay where they are, in the
		planner and in Goals; the notes move to <strong class="font-medium text-gray-900"
			>Notes without a notebook</strong
		>, at the bottom of the list.
	</p>

	{#snippet footer()}
		<button type="button" class="btn" onclick={() => (confirmingDelete = false)}>Cancel</button>
		<form method="post" action="?/delete" use:enhance>
			<input type="hidden" name="id" value={data.notebook.id} />
			<button class="btn btn-danger" use:armed>Delete the notebook</button>
		</form>
	{/snippet}
</Modal>
