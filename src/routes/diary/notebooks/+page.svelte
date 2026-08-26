<script lang="ts">
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import { armed } from '$lib/actions/armed';
	import Card from '$lib/components/Card.svelte';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import Field from '$lib/components/Field.svelte';
	import FormError from '$lib/components/FormError.svelte';
	import FormGrid from '$lib/components/FormGrid.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import Modal from '$lib/components/Modal.svelte';
	import NotebookDetail from '$lib/components/NotebookDetail.svelte';
	import { SECTION_COLORS } from '$lib/colors';
	import type { PageServerData, ActionData } from './$types';

	let { data, form }: { data: PageServerData; form: ActionData } = $props();

	type Notebook = PageServerData['notebooks'][number];

	let showForm = $state(false);
	let editingId = $state<number | null>(null);
	let confirmingDelete = $state(false);

	const editing = $derived(
		editingId ? (data.notebooks.find((n) => n.id === editingId) ?? null) : null
	);
	const selected = $derived(data.notebooks.find((n) => n.id === data.selected) ?? null);
	const orphaned = $derived(data.orphaned);
	const showingOrphans = $derived(data.orphanedSelected && !selected);

	function openCreate() {
		editingId = null;
		showForm = true;
	}

	function openEdit(notebook: Notebook) {
		editingId = notebook.id;
		showForm = true;
	}

	function handleKeydown(e: KeyboardEvent) {
		if (
			e.target instanceof HTMLInputElement ||
			e.target instanceof HTMLTextAreaElement ||
			e.target instanceof HTMLSelectElement
		)
			return;

		if (e.key === 'Escape') {
			showForm = false;
			editingId = null;
			confirmingDelete = false;
			return;
		}
		if (e.key === 'n') {
			e.preventDefault();
			openCreate();
		}
	}

	/**
	 * "12 notes · 3 tasks · 1 goal", with nothing said about what is empty.
	 *
	 * Notes, not entries: writing in a notebook is a note and writing in the
	 * diary is an entry, and the tab above this list already says so.
	 */
	function tally(n: Notebook): string {
		const parts: string[] = [];
		if (n.entries) parts.push(`${n.entries} ${n.entries === 1 ? 'note' : 'notes'}`);
		if (n.tasks) parts.push(`${n.tasks} ${n.tasks === 1 ? 'task' : 'tasks'}`);
		if (n.goals) parts.push(`${n.goals} ${n.goals === 1 ? 'goal' : 'goals'}`);
		return parts.join(' · ') || 'nothing in it yet';
	}
</script>

<svelte:window onkeydown={handleKeydown} />

<div class="space-y-4">
	<h1 class="text-lg font-bold text-gray-900">Notebooks</h1>
	<div class="flex flex-wrap items-center justify-between gap-3">
		<p class="max-w-prose text-sm text-gray-500">
			A subject you write against with no deadline — a book you are reading, a trip, a renovation.
			Notes, tasks and goals can belong to one, and everything about it collects here.
		</p>
		<button onclick={openCreate} class="btn btn-primary btn-sm">
			<Icon name="plus" /> New notebook
			<kbd class="border border-gray-600 bg-gray-800 px-1 text-xs">n</kbd>
		</button>
	</div>

	<FormError message={form?.message} />

	<div class="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.8fr)]">
		<Card title="Notebooks" accent={SECTION_COLORS.diary} flush>
			{#if data.notebooks.length === 0}
				<EmptyState
					icon="notebook"
					title="No notebooks yet"
					description="Start one for something you will keep coming back to, and point notes, tasks and goals at it."
				>
					{#snippet action()}
						<button onclick={openCreate} class="btn btn-primary">
							<Icon name="plus" /> New notebook
						</button>
					{/snippet}
				</EmptyState>
			{:else}
				<div class="flex h-full flex-col divide-y divide-gray-200">
					{#each data.notebooks as notebook (notebook.id)}
						<div
							class="flex items-center gap-3 px-4 py-3 {notebook.id === data.selected
								? 'bg-gray-100'
								: ''}"
						>
							<a
								href={resolve('/diary/notebooks/[id]', { id: String(notebook.id) })}
								class="min-w-0 flex-1 text-sm text-gray-900 hover:underline"
							>
								<span class:text-gray-500={notebook.closedAt}>{notebook.title}</span>
								{#if notebook.closedAt}
									<span class="eyebrow ml-2 text-gray-400">closed</span>
								{/if}
								<span class="block truncate text-xs text-gray-500">{tally(notebook)}</span>
							</a>

							<button onclick={() => openEdit(notebook)} class="btn btn-sm">
								<Icon name="edit" label="Edit" />
							</button>

							<form
								method="post"
								action="?/setClosed"
								use:enhance={() =>
									async ({ update }) => {
										await update({ reset: false });
									}}
							>
								<input type="hidden" name="id" value={notebook.id} />
								<input type="hidden" name="closed" value={notebook.closedAt ? 'false' : 'true'} />
								<button class="btn btn-sm">
									{#if notebook.closedAt}
										<Icon name="undo" /> Reopen
									{:else}
										<Icon name="check" /> Close
									{/if}
								</button>
							</form>
						</div>
					{/each}

					<!--
						A notebook of its own, and only when there is something in it. `mt-auto`
						pins it to the bottom of the card rather than to the end of the list:
						it is not one more notebook in the same sequence as the others.
					-->
					{#if orphaned.length > 0}
						<a
							href="{resolve('/diary/notebooks')}?notebook=orphaned"
							class="mt-auto block px-4 py-3 text-sm hover:underline {showingOrphans
								? 'bg-gray-100'
								: ''}"
						>
							<span class="text-gray-900">Notes without a notebook</span>
							<span class="block truncate text-xs text-gray-500">
								{orphaned.length}
								{orphaned.length === 1 ? 'note' : 'notes'} · their notebook was deleted
							</span>
						</a>
					{/if}
				</div>
			{/if}
		</Card>

		<Card
			title={showingOrphans ? 'Notes without a notebook' : (selected?.title ?? 'Nothing chosen')}
			description={showingOrphans
				? 'Their notebook was deleted. The writing was kept — it is not part of the journal, so it waits here.'
				: selected
					? (selected.description ?? '')
					: 'Pick a notebook to see everything that belongs to it.'}
			accent={SECTION_COLORS.diary}
			flush
		>
			{#snippet actions()}
				{#if selected}
					<!-- The confirmation is a dialog, not a second button in the same
					     place: a two-step delete that puts "Yes" where "Delete" was is a
					     double-click away from destroying something. -->
					<button onclick={() => (confirmingDelete = true)} class="btn btn-danger btn-sm">
						<Icon name="trash" /> Delete
					</button>
				{/if}
			{/snippet}

			<NotebookDetail notebook={selected} contents={data.contents} {orphaned} {showingOrphans} />
		</Card>
	</div>
</div>

<Modal
	bind:open={showForm}
	error={form?.message}
	onclose={() => (editingId = null)}
	title={editingId ? 'Edit notebook' : 'New notebook'}
	size="sm"
>
	<form
		id="notebook-form"
		method="post"
		action={editingId ? '?/update' : '?/create'}
		use:enhance={() =>
			async ({ update, result }) => {
				await update({ reset: result.type === 'success' });
				if (result.type === 'success') {
					showForm = false;
					editingId = null;
				}
			}}
	>
		{#if editingId}
			<input type="hidden" name="id" value={editingId} />
		{/if}

		<FormGrid>
			<Field label="Title" span={12} required>
				<input
					name="title"
					required
					autocomplete="off"
					value={editing?.title ?? ''}
					class="input"
					placeholder="Kitchen renovation"
				/>
			</Field>

			<Field label="What it is for" span={12}>
				<textarea name="description" rows="3" class="textarea"
					>{editing?.description ?? ''}</textarea
				>
			</Field>
		</FormGrid>
	</form>

	{#snippet footer()}
		<button type="button" class="btn" onclick={() => (showForm = false)}>Cancel</button>
		<button type="submit" form="notebook-form" class="btn btn-primary">
			{editingId ? 'Save' : 'Create notebook'}
		</button>
	{/snippet}
</Modal>

<!--
	Deleting a notebook, at arm's length.

	The old confirmation replaced the Delete button with "Yes, delete" in the
	same pixels, so a double-click destroyed the notebook. A dialog puts the
	answer somewhere the cursor is not, and leaves room to say plainly what
	survives.
-->
<Modal
	bind:open={confirmingDelete}
	title="Delete this notebook?"
	description={selected ? `“${selected.title}” will be gone.` : ''}
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
		<form
			method="post"
			action="?/delete"
			use:enhance={() =>
				async ({ update }) => {
					confirmingDelete = false;
					await update();
				}}
		>
			<input type="hidden" name="id" value={selected?.id} />
			<button class="btn btn-danger" use:armed>Delete the notebook</button>
		</form>
	{/snippet}
</Modal>
