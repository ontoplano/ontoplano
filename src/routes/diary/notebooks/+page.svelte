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
	import { SECTION_COLORS } from '$lib/colors';
	import { HORIZON_LABELS } from '$lib/goals';
	import { STATUS_LABELS } from '$lib/task-status';
	import { renderMarkdown } from '$lib/markdown';
	import type { PageServerData, ActionData } from './$types';

	let { data, form }: { data: PageServerData; form: ActionData } = $props();

	type Notebook = PageServerData['notebooks'][number];

	let showForm = $state(false);
	let editingId = $state<number | null>(null);
	let confirmDelete = $state<number | null>(null);
	let editingNoteId = $state<number | null>(null);
	let confirmDeleteNote = $state<number | null>(null);

	const editing = $derived(
		editingId ? (data.notebooks.find((n) => n.id === editingId) ?? null) : null
	);
	const selected = $derived(data.notebooks.find((n) => n.id === data.selected) ?? null);
	const contents = $derived(data.contents);

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
			confirmDelete = null;
			return;
		}
		if (e.key === 'n') {
			e.preventDefault();
			openCreate();
		}
	}

	function when(iso: string): string {
		return new Date(iso).toLocaleDateString(undefined, {
			day: 'numeric',
			month: 'short',
			year: 'numeric'
		});
	}

	/** "12 entries · 3 tasks · 1 goal", with nothing said about what is empty. */
	function tally(n: Notebook): string {
		const parts: string[] = [];
		if (n.entries) parts.push(`${n.entries} ${n.entries === 1 ? 'entry' : 'entries'}`);
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
			Entries, tasks and goals can belong to one, and everything about it collects here.
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
					description="Start one for something you will keep coming back to, and point entries, tasks and goals at it."
				>
					{#snippet action()}
						<button onclick={openCreate} class="btn btn-primary">
							<Icon name="plus" /> New notebook
						</button>
					{/snippet}
				</EmptyState>
			{:else}
				<div class="divide-y divide-gray-200">
					{#each data.notebooks as notebook (notebook.id)}
						<div
							class="flex items-center gap-3 px-4 py-3 {notebook.id === data.selected
								? 'bg-gray-100'
								: ''}"
						>
							<a
								href="{resolve('/diary/notebooks')}?notebook={notebook.id}"
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
				</div>
			{/if}
		</Card>

		<Card
			title={selected ? selected.title : 'Nothing chosen'}
			description={selected
				? (selected.description ?? '')
				: 'Pick a notebook to see everything that belongs to it.'}
			accent={SECTION_COLORS.diary}
			flush
		>
			{#snippet actions()}
				{#if selected}
					{#if confirmDelete === selected.id}
						<span class="hidden text-xs text-gray-500 sm:inline">
							Its entries, tasks and goals stay where they are.
						</span>
						<form
							method="post"
							action="?/delete"
							use:enhance={() =>
								async ({ update }) => {
									confirmDelete = null;
									await update();
								}}
							class="flex items-center gap-1"
						>
							<input type="hidden" name="id" value={selected.id} />
							<button type="button" onclick={() => (confirmDelete = null)} class="btn btn-sm">
								Cancel
							</button>
							<button class="btn btn-danger btn-sm" use:armed>Yes, delete</button>
						</form>
					{:else}
						<button onclick={() => (confirmDelete = selected.id)} class="btn btn-danger btn-sm">
							<Icon name="trash" /> Delete
						</button>
					{/if}
				{/if}
			{/snippet}

			{#if !selected || !contents}
				<EmptyState icon="notebook" title="Nothing chosen" />
			{:else}
				<section>
					<h3 class="eyebrow border-b border-gray-200 px-4 py-2 text-gray-500">Entries</h3>

					<!-- Writing about the kitchen renovation used to mean going to the
					     Diary and remembering to pick the notebook from a dropdown. -->
					<form
						method="post"
						action="?/addEntry"
						use:enhance={() =>
							async ({ update, result }) => {
								await update({ reset: result.type === 'success' });
							}}
						class="border-b border-gray-200 px-4 py-3"
					>
						<input type="hidden" name="notebookId" value={selected?.id} />
						<textarea
							name="content"
							rows="2"
							required
							placeholder="Write a note about {selected?.title ?? 'this notebook'}"
							class="textarea"
						></textarea>
						<div class="mt-2 flex justify-end">
							<button class="btn btn-primary btn-sm"><Icon name="plus" /> Add note</button>
						</div>
					</form>

					{#if contents.entries.length === 0}
						<p class="px-4 py-3 text-sm text-gray-500">Nothing written here yet.</p>
					{:else}
						<div class="divide-y divide-gray-200">
							{#each contents.entries as entry (entry.id)}
								<article class="px-4 py-3">
									{#if editingNoteId === entry.id}
										<form
											method="post"
											action="?/updateEntry"
											use:enhance={() =>
												async ({ update, result }) => {
													await update();
													if (result.type === 'success') editingNoteId = null;
												}}
										>
											<input type="hidden" name="id" value={entry.id} />
											<input type="hidden" name="notebookId" value={selected?.id} />
											<textarea name="content" rows="4" required class="textarea"
												>{entry.content}</textarea
											>
											<div class="mt-2 flex justify-end gap-2">
												<button
													type="button"
													class="btn btn-sm"
													onclick={() => (editingNoteId = null)}>Cancel</button
												>
												<button class="btn btn-primary btn-sm">Save</button>
											</div>
										</form>
									{:else}
										<div class="md text-sm text-gray-900">
											<!-- `renderMarkdown` escapes every character of the input before it emits a
											     tag, and emits only attributes it writes itself. See `$lib/markdown.ts`. -->
											<!-- eslint-disable-next-line svelte/no-at-html-tags -->
											{@html renderMarkdown(entry.content)}
										</div>
										<div class="mt-1 flex flex-wrap items-center gap-2">
											<span class="tabular text-xs text-gray-400">
												#{entry.seq} · {when(entry.createdAt)}
											</span>

											<!-- A note lives only here now, so this is the only place it
											     can be corrected or thrown away. -->
											<div class="ml-auto flex items-center gap-2">
												<button
													onclick={() => (editingNoteId = entry.id)}
													class="btn btn-sm"
													title="Edit this note"
													aria-label="Edit this note"><Icon name="edit" /></button
												>
												{#if confirmDeleteNote === entry.id}
													<form
														method="post"
														action="?/deleteEntry"
														use:enhance={() =>
															async ({ update }) => {
																await update();
																confirmDeleteNote = null;
															}}
														class="flex items-center gap-2"
													>
														<input type="hidden" name="id" value={entry.id} />
														<button
															type="button"
															class="btn btn-sm"
															onclick={() => (confirmDeleteNote = null)}>Cancel</button
														>
														<button class="btn btn-danger btn-sm" use:armed>Yes, delete</button>
													</form>
												{:else}
													<button
														onclick={() => (confirmDeleteNote = entry.id)}
														class="btn btn-danger btn-sm"
														title="Delete this note"
														aria-label="Delete this note"><Icon name="trash" /></button
													>
												{/if}
											</div>
										</div>
									{/if}
								</article>
							{/each}
						</div>
					{/if}
				</section>

				<section>
					<h3 class="eyebrow border-b border-gray-200 px-4 py-2 text-gray-500">Tasks</h3>
					{#if contents.blocks.length === 0 && contents.todos.length === 0}
						<p class="px-4 py-3 text-sm text-gray-500">Nothing to do for this yet.</p>
					{:else}
						<ul class="divide-y divide-gray-200">
							{#each contents.blocks as block (`b${block.id}`)}
								<li class="flex items-center gap-3 px-4 py-2 text-sm">
									<Icon name="calendar" class="shrink-0 text-gray-400" />
									<span class="min-w-0 flex-1 truncate text-gray-900">{block.label}</span>
									<span class="tabular shrink-0 text-xs text-gray-400">
										{block.date}
										{block.startTime}
									</span>
								</li>
							{/each}
							{#each contents.todos as todo (`t${todo.id}`)}
								<li class="flex items-center gap-3 px-4 py-2 text-sm">
									<Icon name="check" class="shrink-0 text-gray-400" />
									<span
										class="min-w-0 flex-1 truncate text-gray-900"
										class:line-through={todo.status === 'done'}
									>
										{todo.title}
									</span>
									<span class="shrink-0 text-xs text-gray-400">
										{todo.scheduledDate ?? STATUS_LABELS[todo.status]}
									</span>
								</li>
							{/each}
						</ul>
					{/if}
				</section>

				<section>
					<h3 class="eyebrow border-b border-gray-200 px-4 py-2 text-gray-500">Goals</h3>
					{#if contents.goals.length === 0}
						<p class="px-4 py-3 text-sm text-gray-500">
							No goal points at this notebook. It does not need one.
						</p>
					{:else}
						<ul class="divide-y divide-gray-200">
							{#each contents.goals as goal (goal.id)}
								<li class="flex items-center gap-3 px-4 py-2 text-sm">
									<Icon name="goals" class="shrink-0 text-gray-400" />
									<a
										href={resolve('/goals')}
										class="min-w-0 flex-1 truncate text-gray-900 hover:underline"
									>
										{goal.title}
									</a>
									<span class="tabular shrink-0 text-xs text-gray-400">
										{HORIZON_LABELS[goal.horizon]} · {goal.periodStart}
									</span>
								</li>
							{/each}
						</ul>
					{/if}
				</section>
			{/if}
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
