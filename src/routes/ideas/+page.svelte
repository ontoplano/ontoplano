<script lang="ts">
	import { enhance } from '$app/forms';
	import { tick } from 'svelte';
	import type { PageServerData, ActionData } from './$types';

	let { data, form }: { data: PageServerData; form: ActionData } = $props();

	let showForm = $state(false);
	let editingId: number | null = $state(null);
	let selectedIndex = $state(0);
	let filterTag: string | null = $state(null);
	let confirmingDeleteId: number | null = $state(null);

	function filteredIdeas() {
		if (!filterTag) return data.ideas;
		return data.ideas.filter((i) => i.tags.some((t) => t.name === filterTag));
	}

	function editingIdea() {
		if (!editingId) return null;
		return data.ideas.find((i) => i.id === editingId) ?? null;
	}

	function editingTagString() {
		const idea = editingIdea();
		if (!idea) return '';
		return idea.tags.map((t) => t.name).join(', ');
	}

	function formatDate(iso: string): string {
		const d = new Date(iso);
		return d.toLocaleDateString('en-US', {
			weekday: 'short',
			year: 'numeric',
			month: 'short',
			day: 'numeric',
			hour: '2-digit',
			minute: '2-digit'
		});
	}

	function handleKeydown(e: KeyboardEvent) {
		if (
			e.target instanceof HTMLInputElement ||
			e.target instanceof HTMLTextAreaElement ||
			e.target instanceof HTMLSelectElement
		)
			return;

		const items = filteredIdeas();

		switch (e.key) {
			case 'j':
				e.preventDefault();
				selectedIndex = Math.min(selectedIndex + 1, items.length - 1);
				break;
			case 'k':
				e.preventDefault();
				selectedIndex = Math.max(selectedIndex - 1, 0);
				break;
			case 'n':
				e.preventDefault();
				showForm = true;
				editingId = null;
				tick().then(() => {
					const ta = document.querySelector<HTMLTextAreaElement>('textarea[name="content"]');
					ta?.focus();
				});
				break;
			case 'e':
				e.preventDefault();
				if (items.length > 0) {
					editingId = items[selectedIndex].id;
					showForm = true;
					tick().then(() => {
						const ta = document.querySelector<HTMLTextAreaElement>('textarea[name="content"]');
						ta?.focus();
					});
				}
				break;
			case 'Escape':
				e.preventDefault();
				showForm = false;
				editingId = null;
				confirmingDeleteId = null;
				break;
		}
	}
</script>

<svelte:window onkeydown={handleKeydown} />

<div class="space-y-4">
	<div class="flex items-center justify-between">
		<h1 class="text-lg font-bold text-gray-900">Ideas</h1>
		<button
			onclick={() => {
				showForm = !showForm;
				editingId = null;
				if (!showForm) return;
				tick().then(() => {
					const ta = document.querySelector<HTMLTextAreaElement>('textarea[name="content"]');
					ta?.focus();
				});
			}}
			class="border border-gray-300 bg-white px-3 py-1 text-sm text-gray-700 shadow-sm transition hover:bg-gray-50"
		>
			{showForm ? 'Cancel' : 'New Idea'}
		</button>
	</div>

	{#if data.allTags.length > 0}
		<div class="flex flex-wrap gap-2">
			{#each data.allTags as tag (tag.id)}
				<button
					onclick={() => {
						filterTag = filterTag === tag.name ? null : tag.name;
						selectedIndex = 0;
					}}
					class="border px-2 py-0.5 text-xs transition {filterTag === tag.name
						? 'border-indigo-500 bg-indigo-50 text-indigo-700'
						: 'border-gray-200 bg-white text-gray-500 hover:bg-gray-50 hover:text-gray-700'}"
				>
					#{tag.name}
				</button>
			{/each}
			{#if filterTag}
				<button
					onclick={() => {
						filterTag = null;
						selectedIndex = 0;
					}}
					class="border border-gray-200 bg-white px-2 py-0.5 text-xs text-gray-400 transition hover:text-gray-600"
				>
					clear
				</button>
			{/if}
		</div>
	{/if}

	<div class="text-xs text-gray-400">
		<kbd class="border border-gray-300 bg-gray-50 px-1">j</kbd>/<kbd
			class="border border-gray-300 bg-gray-50 px-1">k</kbd
		>
		navigate &middot;
		<kbd class="border border-gray-300 bg-gray-50 px-1">n</kbd> new &middot;
		<kbd class="border border-gray-300 bg-gray-50 px-1">e</kbd> edit &middot;
		<kbd class="border border-gray-300 bg-gray-50 px-1">Esc</kbd> close form
	</div>

	{#if form?.message}
		<div class="border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
			{form.message}
		</div>
	{/if}

	{#if showForm}
		<form
			method="post"
			action={editingId ? '?/update' : '?/create'}
			use:enhance={() => {
				return async ({ update }) => {
					await update();
					showForm = false;
					editingId = null;
				};
			}}
			class="space-y-3 border border-gray-200 bg-white p-4 shadow-sm"
		>
			{#if editingId}
				<input type="hidden" name="id" value={editingId} />
			{/if}
			<label class="block">
				<span class="text-sm font-medium text-gray-700">Idea</span>
				<textarea
					name="content"
					required
					rows="4"
					class="mt-1 block w-full border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-gray-900 focus:ring-1 focus:ring-gray-900 focus:outline-none"
					>{editingId ? (editingIdea()?.content ?? '') : ''}</textarea
				>
			</label>
			<label class="block">
				<span class="text-sm font-medium text-gray-700">Tags</span>
				<input
					name="tags"
					type="text"
					value={editingId ? editingTagString() : ''}
					placeholder="comma separated, e.g. project, app, music"
					class="mt-1 block w-full border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-gray-900 focus:ring-1 focus:ring-gray-900 focus:outline-none"
				/>
			</label>
			<div class="flex items-center gap-2">
				<button
					type="submit"
					class="bg-gray-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-gray-800"
				>
					{editingId ? 'Update' : 'Save'}
				</button>
				<button
					type="button"
					onclick={() => {
						showForm = false;
						editingId = null;
					}}
					class="border border-gray-300 bg-white px-4 py-2 text-sm text-gray-700 transition hover:bg-gray-50"
				>
					Cancel
				</button>
			</div>
		</form>
	{/if}

	{#if filteredIdeas().length === 0}
		<div class="border border-gray-200 bg-white p-8 text-center text-sm text-gray-500 shadow-sm">
			{#if filterTag}
				No ideas with tag #{filterTag}.
			{:else}
				No ideas yet. Jot down your first one.
			{/if}
		</div>
	{:else}
		<div class="space-y-3">
			{#each filteredIdeas() as idea, i (idea.id)}
				<div
					class="relative border border-gray-200 bg-white p-4 shadow-sm transition-all {i ===
					selectedIndex
						? 'border-l-4 border-l-indigo-300/60 ring-2 ring-indigo-400 ring-inset'
						: ''}"
				>
					<div class="mb-2 flex items-start justify-between gap-4">
						<p class="whitespace-pre-wrap text-sm text-gray-900">{idea.content}</p>
						<div class="flex shrink-0 items-center gap-2">
							{#if confirmingDeleteId === idea.id}
								<form
									method="post"
									action="?/delete"
									use:enhance={() => {
										return async ({ update }) => {
											await update();
											confirmingDeleteId = null;
										};
									}}
								>
									<input type="hidden" name="id" value={idea.id} />
									<button
										type="submit"
										class="border border-red-300 bg-red-50 px-2 py-1 text-xs font-medium text-red-700"
									>
										Confirm?
									</button>
								</form>
								<button
									type="button"
									onclick={() => {
										confirmingDeleteId = null;
									}}
									class="border border-gray-200 bg-white px-2 py-1 text-xs text-gray-600 transition hover:bg-gray-100"
								>
									Cancel
								</button>
							{:else}
								<button
									onclick={() => {
										editingId = idea.id;
										showForm = true;
										tick().then(() => {
											const ta = document.querySelector<HTMLTextAreaElement>(
												'textarea[name="content"]'
											);
											ta?.focus();
										});
									}}
									class="border border-gray-200 bg-white px-2 py-1 text-xs text-gray-600 transition hover:bg-gray-100"
								>
									Edit
								</button>
								<button
									type="button"
									onclick={() => {
										confirmingDeleteId = idea.id;
									}}
									class="border border-red-200 bg-white px-2 py-1 text-xs text-red-600 transition hover:bg-red-50"
								>
									Delete
								</button>
							{/if}
						</div>
					</div>
					<div class="flex items-center gap-2">
						<span class="text-xs text-gray-400">{formatDate(idea.createdAt)}</span>
						{#if idea.updatedAt !== idea.createdAt}
							<span class="text-xs text-gray-400">· edited {formatDate(idea.updatedAt)}</span>
						{/if}
						{#if idea.tags.length > 0}
							<div class="flex flex-wrap gap-1">
								{#each idea.tags as tag (tag.id)}
									<button
										onclick={() => {
											filterTag = tag.name;
											selectedIndex = 0;
										}}
										class="border border-gray-200 bg-gray-50 px-1.5 py-0.5 text-xs text-gray-600 transition hover:bg-gray-100"
									>
										#{tag.name}
									</button>
								{/each}
							</div>
						{/if}
					</div>
				</div>
			{/each}
		</div>
	{/if}
</div>
