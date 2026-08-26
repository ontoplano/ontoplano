<script lang="ts">
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import { armed } from '$lib/actions/armed';
	import { autogrow } from '$lib/actions/autogrow';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import { SECTION_COLORS } from '$lib/colors';
	import { HORIZON_LABELS, type Horizon } from '$lib/goals';
	import { STATUS_LABELS } from '$lib/task-status';
	import type { Status } from '$lib/task-status';
	import { renderMarkdown } from '$lib/markdown';

	/**
	 * One notebook: what is in it, and what can be done to it.
	 *
	 * The same thing on two screens — beside the list on the index, and alone on
	 * its own page — so it is a component rather than markup written twice. The
	 * forms post to actions the two routes share.
	 */
	type Entry = { id: number; seq: number | null; content: string; createdAt: string };

	let {
		notebook = null,
		contents = null,
		orphaned = [],
		showingOrphans = false
	}: {
		notebook?: { id: number; title: string; description: string } | null;
		contents?: {
			entries: Entry[];
			todos: { id: number; title: string; status: Status; scheduledDate: string | null }[];
			blocks: { id: number; label: string | null; date: string; startTime: string }[];
			goals: { id: number; title: string; horizon: Horizon; periodStart: string }[];
		} | null;
		orphaned?: Entry[];
		showingOrphans?: boolean;
	} = $props();

	let editingNoteId = $state<number | null>(null);
	let confirmDeleteNote = $state<number | null>(null);

	/**
	 * Notes, tasks and goals as tabs rather than three stacked lists.
	 *
	 * A notebook with a dozen notes pushed its tasks below the fold, so the two
	 * halves of "everything about this" could not be seen together at all.
	 */
	type Tab = 'notes' | 'tasks' | 'goals';
	let tab = $state<Tab>('notes');

	// Whichever notebook you move to opens on its notes, not on whichever tab
	// the last one happened to be showing.
	$effect(() => {
		void notebook?.id;
		void showingOrphans;
		tab = 'notes';
	});

	const tabs = $derived<{ key: Tab; label: string; count: number }[]>([
		{ key: 'notes', label: 'Notes', count: contents?.entries.length ?? orphaned.length },
		{
			key: 'tasks',
			label: 'Tasks',
			count: (contents?.todos.length ?? 0) + (contents?.blocks.length ?? 0)
		},
		{ key: 'goals', label: 'Goals', count: contents?.goals.length ?? 0 }
	]);

	function when(iso: string): string {
		return new Date(iso).toLocaleDateString(undefined, {
			day: 'numeric',
			month: 'short',
			year: 'numeric'
		});
	}
</script>

{#if showingOrphans}
	{@render noteList(orphaned, null)}
{:else if !notebook || !contents}
	<EmptyState icon="notebook" title="Nothing chosen" />
{:else}
	<!-- Everything about this notebook, one kind at a time. -->
	<div class="snap-strip gap-1 border-b border-gray-200 px-2 md:flex">
		{#each tabs as t (t.key)}
			<button
				onclick={() => (tab = t.key)}
				class="px-3 py-2 text-sm font-medium whitespace-nowrap transition {tab === t.key
					? 'border-b-2 text-gray-900'
					: 'text-gray-500 hover:text-gray-700'}"
				style={tab === t.key ? `border-color: ${SECTION_COLORS.diary}` : ''}
			>
				{t.label}
				<span class="tabular ml-1 text-xs text-gray-400">{t.count}</span>
			</button>
		{/each}
	</div>

	{#if tab === 'notes'}
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
			<input type="hidden" name="notebookId" value={notebook.id} />
			<textarea
				name="content"
				rows="2"
				required
				use:autogrow
				placeholder="Write a note about {notebook.title}"
				class="textarea"
			></textarea>
			<div class="mt-2 flex justify-end">
				<button class="btn btn-primary btn-sm"><Icon name="plus" /> Add note</button>
			</div>
		</form>

		{@render noteList(contents.entries, notebook.id)}
	{:else if tab === 'tasks'}
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
	{:else if contents.goals.length === 0}
		<p class="px-4 py-3 text-sm text-gray-500">
			No goal points at this notebook. It does not need one.
		</p>
	{:else}
		<ul class="divide-y divide-gray-200">
			{#each contents.goals as goal (goal.id)}
				<li class="flex items-center gap-3 px-4 py-2 text-sm">
					<Icon name="goals" class="shrink-0 text-gray-400" />
					<a href={resolve('/goals')} class="min-w-0 flex-1 truncate text-gray-900 hover:underline">
						{goal.title}
					</a>
					<span class="tabular shrink-0 text-xs text-gray-400">
						{HORIZON_LABELS[goal.horizon]} · {goal.periodStart}
					</span>
				</li>
			{/each}
		</ul>
	{/if}
{/if}

<!--
	One note, and the two things you can do to it.
	
	`notebookId` is null for a note whose notebook was deleted: editing one must
	not quietly adopt it into whatever notebook is on screen.
-->
{#snippet noteList(
	entries: { id: number; seq: number | null; content: string; createdAt: string }[],
	notebookId: number | null
)}
	{#if entries.length === 0}
		<p class="px-4 py-3 text-sm text-gray-500">Nothing written here yet.</p>
	{:else}
		<div class="divide-y divide-gray-200">
			{#each entries as entry (entry.id)}
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
							{#if notebookId !== null}
								<input type="hidden" name="notebookId" value={notebookId} />
							{/if}
							<textarea name="content" rows="4" required use:autogrow class="textarea"
								>{entry.content}</textarea
							>
							<div class="mt-2 flex justify-end gap-2">
								<button type="button" class="btn btn-sm" onclick={() => (editingNoteId = null)}
									>Cancel</button
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
								{entry.seq === null ? '' : `#${entry.seq} · `}{when(entry.createdAt)}
							</span>

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
{/snippet}
