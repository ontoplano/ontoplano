<script lang="ts">
	/* biome-ignore-all assist/source/organizeImports lint/correctness/noUnusedImports lint/correctness/noUnusedVariables lint/style/useConst: Svelte template and rune usage in this file triggers false positives in current Biome diagnostics. */
	import { enhance } from '$app/forms';
	import FormError from '$lib/components/FormError.svelte';
	import IdeaFields from '$lib/components/fields/IdeaFields.svelte';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import { armed } from '$lib/actions/armed';
	import { autofocus } from '$lib/actions/autofocus';
	import FormGrid from '$lib/components/FormGrid.svelte';
	import Modal from '$lib/components/Modal.svelte';
	import type { PageServerData, ActionData } from './$types';
	import { getAction } from '$lib/shortcuts';
	import { keepInView } from '$lib/actions/keep-in-view';

	let { data, form }: { data: PageServerData; form: ActionData } = $props();

	let showForm = $state(false);
	let editingId: number | null = $state(null);
	let editingAppliedNoteId: number | null = $state(null);
	let appliedNoteDraft = $state('');
	let selectedIndex = $state(0);
	let filterTag: string | null = $state(null);
	/*
	 * The tag list is folded to begin with. Somebody opening Ideas came to read
	 * ideas; the tags are how you narrow them once you know what you are after,
	 * and every tag ever used is a wall of chips above the thing itself.
	 */
	let tagsOpen = $state(false);
	let filterApplied: 'all' | 'applied' | 'not-applied' = $state('all');
	let filterFavorite: 'all' | 'favorite' | 'not-favorite' = $state('all');
	let confirmingDeleteId: number | null = $state(null);

	let filteredIdeas = $derived.by(() =>
		data.ideas
			.filter((idea) => !filterTag || idea.tags.some((tag) => tag.name === filterTag))
			.filter((idea) => {
				if (filterApplied === 'applied') return idea.isApplied;
				if (filterApplied === 'not-applied') return !idea.isApplied;
				return true;
			})
			.filter((idea) => {
				if (filterFavorite === 'favorite') return idea.favorite;
				if (filterFavorite === 'not-favorite') return !idea.favorite;
				return true;
			})
	);

	let clampedSelectedIndex = $derived(
		Math.min(selectedIndex, Math.max(filteredIdeas.length - 1, 0))
	);
	let currentSelectedIdea = $derived(filteredIdeas[clampedSelectedIndex] ?? null);

	function editingIdea() {
		if (!editingId) return null;
		return data.ideas.find((idea) => idea.id === editingId) ?? null;
	}

	function editingTagString() {
		const idea = editingIdea();
		if (!idea) return '';
		return idea.tags.map((tag) => tag.name).join(', ');
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

	function openIdeaForm(id: number | null = null) {
		showForm = true;
		editingId = id;
		editingAppliedNoteId = null;
		appliedNoteDraft = '';
	}

	function closeForms() {
		showForm = false;
		editingId = null;
		editingAppliedNoteId = null;
		appliedNoteDraft = '';
		confirmingDeleteId = null;
	}

	function startAppliedNoteEdit(idea: (typeof data.ideas)[number]) {
		editingAppliedNoteId = idea.id;
		appliedNoteDraft = idea.appliedNote ?? '';
	}

	function submitIdeaAction(id: number, action: 'favorite' | 'applied') {
		const selector =
			action === 'favorite'
				? `form[data-favorite-toggle-id="${id}"]`
				: `form[data-applied-toggle-id="${id}"]`;
		document.querySelector<HTMLFormElement>(selector)?.requestSubmit();
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			// A `<dialog>` closes itself on Escape; `preventDefault()` here cancels
			// that. Nothing on this page needs the key while one is open.
			if (document.querySelector('dialog[open]')) return;

			e.preventDefault();
			closeForms();
			(document.activeElement as HTMLElement)?.blur?.();
			return;
		}

		if (
			e.target instanceof HTMLInputElement ||
			e.target instanceof HTMLTextAreaElement ||
			e.target instanceof HTMLSelectElement
		)
			return;

		const items = filteredIdeas;
		const action = getAction('/ideas', e.key);
		if (!action) return;
		e.preventDefault();

		switch (action) {
			case 'navigate-down':
				selectedIndex = Math.min(clampedSelectedIndex + 1, Math.max(items.length - 1, 0));
				break;
			case 'navigate-up':
				selectedIndex = Math.max(clampedSelectedIndex - 1, 0);
				break;
			case 'new':
				openIdeaForm();
				break;
			case 'edit':
				if (items.length > 0) openIdeaForm(items[clampedSelectedIndex].id);
				break;
			case 'toggle-favorite': {
				const idea = currentSelectedIdea;
				if (idea) submitIdeaAction(idea.id, 'favorite');
				break;
			}
			case 'toggle-applied': {
				const idea = currentSelectedIdea;
				if (idea) submitIdeaAction(idea.id, 'applied');
				break;
			}
		}
	}
</script>

<svelte:window onkeydown={handleKeydown} />

<div class="space-y-4">
	<div class="flex flex-wrap items-center justify-between gap-3">
		<h1 class="shrink-0 text-lg font-bold text-gray-900">Ideas</h1>
		<button
			onclick={() => {
				if (showForm) {
					closeForms();
				} else {
					openIdeaForm();
				}
			}}
			class="btn btn-sm"
			data-tour="idea-new"
		>
			{showForm ? 'Cancel' : 'New idea'}
		</button>
	</div>

	<!--
		The tags fold away, and start folded.

		Every tag anybody has ever used, above everything, is a wall of chips
		between the page and the ideas — and an idea list gathers tags faster than
		almost anything else here. It is a filter, which is something you go
		looking for; the ideas are what the page is.

		The one it is filtered by stays visible while the rest are folded, or
		closing the list would hide the fact that a filter is on.
	-->
	{#if data.allTags.length > 0}
		<div class="space-y-2">
			<button
				type="button"
				onclick={() => (tagsOpen = !tagsOpen)}
				class="flex items-center gap-1.5 text-xs font-medium tracking-wide text-gray-500 uppercase hover:text-gray-900"
				aria-expanded={tagsOpen}
			>
				<Icon name={tagsOpen ? 'chevron-down' : 'chevron-right'} size={14} />
				Tags
				<span class="text-gray-400">({data.allTags.length})</span>
			</button>

			{#if filterTag && !tagsOpen}
				<div class="flex flex-wrap items-center gap-2">
					<span class="chip border-indigo-500 bg-indigo-50 text-indigo-700">#{filterTag}</span>
					<button
						onclick={() => {
							filterTag = null;
							selectedIndex = 0;
						}}
						class="border border-gray-200 bg-white px-2 py-0.5 text-xs text-gray-500 transition hover:text-gray-600"
					>
						clear
					</button>
				</div>
			{/if}
		</div>
	{/if}

	{#if data.allTags.length > 0 && tagsOpen}
		<div class="flex flex-wrap gap-2">
			{#each data.allTags as tag (tag.id)}
				<button
					onclick={() => {
						filterTag = filterTag === tag.name ? null : tag.name;
						selectedIndex = 0;
					}}
					class="chip {filterTag === tag.name
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
					class="border border-gray-200 bg-white px-2 py-0.5 text-xs text-gray-500 transition hover:text-gray-600"
				>
					clear
				</button>
			{/if}
		</div>
	{/if}

	<!-- Two rows of filters over an empty list is chrome with nothing to act on. -->
	{#if data.ideas.length > 0}
		<div class="flex flex-wrap items-center gap-3">
			<div class="flex flex-wrap items-center gap-2">
				<span class="text-xs font-medium tracking-wide text-gray-500 uppercase">Applied</span>
				<button
					onclick={() => {
						filterApplied = 'all';
						selectedIndex = 0;
					}}
					class="chip {filterApplied === 'all'
						? 'border-indigo-500 bg-indigo-50 text-indigo-700'
						: 'border-gray-200 bg-white text-gray-500 hover:bg-gray-50 hover:text-gray-700'}"
				>
					All
				</button>
				<button
					onclick={() => {
						filterApplied = 'applied';
						selectedIndex = 0;
					}}
					class="chip {filterApplied === 'applied'
						? 'border-indigo-500 bg-indigo-50 text-indigo-700'
						: 'border-gray-200 bg-white text-gray-500 hover:bg-gray-50 hover:text-gray-700'}"
				>
					Applied
				</button>
				<button
					onclick={() => {
						filterApplied = 'not-applied';
						selectedIndex = 0;
					}}
					class="chip {filterApplied === 'not-applied'
						? 'border-indigo-500 bg-indigo-50 text-indigo-700'
						: 'border-gray-200 bg-white text-gray-500 hover:bg-gray-50 hover:text-gray-700'}"
				>
					Not Applied
				</button>
			</div>

			<div class="flex flex-wrap items-center gap-2">
				<span class="text-xs font-medium tracking-wide text-gray-500 uppercase">Favorite</span>
				<button
					onclick={() => {
						filterFavorite = 'all';
						selectedIndex = 0;
					}}
					class="chip {filterFavorite === 'all'
						? 'border-amber-500 bg-amber-50 text-amber-700'
						: 'border-gray-200 bg-white text-gray-500 hover:bg-gray-50 hover:text-gray-700'}"
				>
					All
				</button>
				<button
					onclick={() => {
						filterFavorite = 'favorite';
						selectedIndex = 0;
					}}
					class="chip {filterFavorite === 'favorite'
						? 'border-amber-500 bg-amber-50 text-amber-700'
						: 'border-gray-200 bg-white text-gray-500 hover:bg-gray-50 hover:text-gray-700'}"
				>
					Favorites
				</button>
				<button
					onclick={() => {
						filterFavorite = 'not-favorite';
						selectedIndex = 0;
					}}
					class="chip {filterFavorite === 'not-favorite'
						? 'border-amber-500 bg-amber-50 text-amber-700'
						: 'border-gray-200 bg-white text-gray-500 hover:bg-gray-50 hover:text-gray-700'}"
				>
					Not Favorite
				</button>
			</div>
		</div>
	{/if}

	<FormError message={form?.message} />

	<Modal
		bind:open={showForm}
		error={form?.message}
		title={editingId ? 'Edit idea' : 'New idea'}
		onclose={() => (editingId = null)}
	>
		<form
			id="idea-form"
			method="post"
			action={editingId ? '?/update' : '?/create'}
			use:enhance={() => {
				return async ({ update, result }) => {
					await update({ reset: false });
					if (result.type === 'success') closeForms();
				};
			}}
		>
			{#if editingId}
				<input type="hidden" name="id" value={editingId} />
			{/if}

			<FormGrid>
				<IdeaFields
					content={editingId ? (editingIdea()?.content ?? '') : ''}
					tags={editingId ? editingTagString() : ''}
				/>
			</FormGrid>
		</form>

		{#snippet footer()}
			<button type="button" class="btn" onclick={closeForms}>Cancel</button>
			<button type="submit" form="idea-form" class="btn btn-primary">
				{editingId ? 'Save' : 'Save idea'}
			</button>
		{/snippet}
	</Modal>

	{#if filteredIdeas.length === 0}
		<div class="border border-gray-200 bg-white p-8 text-center text-sm text-gray-500 shadow-sm">
			{#if filterTag || filterApplied !== 'all' || filterFavorite !== 'all'}
				<EmptyState icon="ideas" title="No ideas match the current filters" />
			{:else}
				<EmptyState
					icon="ideas"
					title="Nothing captured yet"
					description="Ideas are the things you would otherwise forget by the time you sat down."
				>
					{#snippet action()}
						<button onclick={() => (showForm = true)} class="btn btn-primary">
							<Icon name="plus" /> New idea
						</button>
					{/snippet}
				</EmptyState>
			{/if}
		</div>
	{:else}
		<div class="space-y-3" data-tour="idea-list">
			{#each filteredIdeas as idea, i (idea.id)}
				<div
					use:keepInView={i === clampedSelectedIndex}
					class="lift relative border border-gray-200 bg-white p-4 shadow-card transition-all {i ===
					clampedSelectedIndex
						? 'border-l-4 border-l-indigo-300/60 ring-2 ring-indigo-400 ring-inset'
						: ''}"
				>
					<div class="mb-2 flex items-start gap-4">
						<form
							method="post"
							action="?/toggleFavorite"
							data-favorite-toggle-id={idea.id}
							use:enhance
						>
							<input type="hidden" name="id" value={idea.id} />
							<button
								type="submit"
								class="mt-0.5 text-lg leading-none transition {idea.favorite
									? 'text-amber-600 hover:text-amber-700'
									: 'text-gray-300 hover:text-amber-600'}"
								aria-label={idea.favorite ? 'Remove favorite' : 'Mark as favorite'}
							>
								{idea.favorite ? '★' : '☆'}
							</button>
						</form>

						<div class="min-w-0 flex-1">
							<!-- Buttons beside the text squeeze it to a ribbon on a phone. -->
							<div
								class="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-4"
							>
								<p class="text-sm whitespace-pre-wrap text-gray-900">{idea.content}</p>
								<div class="flex flex-wrap items-center justify-end gap-2 sm:shrink-0">
									{#if confirmingDeleteId === idea.id}
										<form
											method="post"
											action="?/delete"
											use:enhance={() => {
												return async ({ update }) => {
													await update({ reset: false });
													confirmingDeleteId = null;
												};
											}}
										>
											<input type="hidden" name="id" value={idea.id} />
											<button
												type="submit"
												class="border border-red-300 bg-red-50 px-2 py-1 text-xs font-medium text-red-700"
												use:armed
											>
												Confirm?
											</button>
										</form>
										<button
											type="button"
											onclick={() => {
												confirmingDeleteId = null;
											}}
											class="btn btn-sm"
										>
											Cancel
										</button>
									{:else}
										<button
											title="Edit"
											aria-label="Edit"
											onclick={() => openIdeaForm(idea.id)}
											class="btn btn-sm"
										>
											<Icon name="edit" />
										</button>
										<button
											title="Delete"
											aria-label="Delete"
											type="button"
											onclick={() => {
												confirmingDeleteId = idea.id;
											}}
											class="border border-red-200 bg-white px-2 py-1 text-xs text-red-600 transition hover:bg-red-50"
										>
											<Icon name="trash" />
										</button>
									{/if}
								</div>
							</div>

							<!-- Date, tags and the applied toggle share a line and have to wrap
							     as one row; nested un-wrapping rows put the button in the middle
							     of the tags on a phone. -->
							<div class="mt-2 flex flex-wrap items-center gap-2">
								<div class="flex flex-wrap items-center gap-2">
									<span class="text-xs text-gray-500">{formatDate(idea.createdAt)}</span>
									{#if idea.updatedAt !== idea.createdAt}
										<span class="text-xs text-gray-500">· edited {formatDate(idea.updatedAt)}</span>
									{/if}
									{#if idea.tags.length > 0}
										<div class="flex flex-wrap gap-1">
											{#each idea.tags as tag (tag.id)}
												<button
													onclick={() => {
														filterTag = tag.name;
														selectedIndex = 0;
													}}
													class="chip"
												>
													#{tag.name}
												</button>
											{/each}
										</div>
									{/if}
								</div>

								<form
									method="post"
									action="?/toggleApplied"
									class="ml-auto"
									data-applied-toggle-id={idea.id}
									use:enhance={() => {
										return async ({ update }) => {
											await update({ reset: false });
											if (editingAppliedNoteId === idea.id) {
												editingAppliedNoteId = null;
												appliedNoteDraft = '';
											}
										};
									}}
								>
									<input type="hidden" name="id" value={idea.id} />
									<button
										type="submit"
										class="border px-2 py-1 text-xs font-medium shadow-sm transition {idea.isApplied
											? 'border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100'
											: 'border-gray-300 bg-white text-gray-600 hover:bg-gray-50'}"
									>
										{idea.isApplied ? 'Applied' : 'Mark applied'}
									</button>
								</form>
							</div>

							{#if idea.isApplied && i === clampedSelectedIndex}
								<div
									class="mt-3 border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-900 shadow-sm"
								>
									<div class="flex items-start justify-between gap-3">
										<div class="min-w-0 flex-1">
											<div class="text-xs font-medium tracking-wide text-blue-700 uppercase">
												Applied note
											</div>
											{#if editingAppliedNoteId === idea.id}
												<form
													method="post"
													action="?/updateAppliedNote"
													use:enhance={() => {
														return async ({ update }) => {
															await update({ reset: false });
															editingAppliedNoteId = null;
															appliedNoteDraft = '';
														};
													}}
													class="mt-2 flex items-center gap-2"
												>
													<input type="hidden" name="id" value={idea.id} />
													<input
														name="appliedNote"
														type="text"
														autocomplete="off"
														bind:value={appliedNoteDraft}
														placeholder="What did you apply?"
														use:autofocus
														class="min-w-0 flex-1 border border-blue-300 bg-white px-2 py-1 text-sm shadow-sm focus:border-blue-700 focus:ring-1 focus:ring-blue-700 focus:outline-none"
													/>
													<button
														type="submit"
														class="bg-gray-900 px-2 py-1 text-xs text-white hover:bg-gray-800"
														>Save</button
													>
													<button
														type="button"
														onclick={() => {
															editingAppliedNoteId = null;
															appliedNoteDraft = '';
														}}
														class="btn btn-sm"
													>
														Cancel
													</button>
												</form>
											{:else}
												<p class="mt-1 text-sm whitespace-pre-wrap text-blue-900">
													{idea.appliedNote || 'No applied note yet.'}
												</p>
											{/if}
										</div>

										{#if editingAppliedNoteId !== idea.id}
											<button
												type="button"
												onclick={() => startAppliedNoteEdit(idea)}
												class="border border-blue-200 bg-white px-2 py-1 text-xs text-blue-700 hover:bg-blue-100"
											>
												{idea.appliedNote ? 'Edit note' : 'Add note'}
											</button>
										{/if}
									</div>
								</div>
							{/if}
						</div>
					</div>
				</div>
			{/each}
		</div>
	{/if}
</div>
