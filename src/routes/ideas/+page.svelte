<script lang="ts">
	/* biome-ignore-all assist/source/organizeImports lint/correctness/noUnusedImports lint/correctness/noUnusedVariables lint/style/useConst: Svelte template and rune usage in this file triggers false positives in current Biome diagnostics. */
	import { enhance } from '$app/forms';
	import FormError from '$lib/components/FormError.svelte';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import { armed } from '$lib/actions/armed';
	import { autofocus } from '$lib/actions/autofocus';
	import Field from '$lib/components/Field.svelte';
	import FormGrid from '$lib/components/FormGrid.svelte';
	import Modal from '$lib/components/Modal.svelte';
	import type { PageServerData, ActionData } from './$types';
	import { getAction } from '$lib/shortcuts';

	let { data, form }: { data: PageServerData; form: ActionData } = $props();

	let showForm = $state(false);
	let editingId: number | null = $state(null);
	let editingAppliedNoteId: number | null = $state(null);
	let appliedNoteDraft = $state('');
	let selectedIndex = $state(0);
	let filterTag: string | null = $state(null);
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
	<div class="flex items-center justify-between">
		<h1 class="text-lg font-bold text-gray-900">Ideas</h1>
		<button
			onclick={() => {
				if (showForm) {
					closeForms();
				} else {
					openIdeaForm();
				}
			}}
			class="btn btn-sm"
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

	<div class="flex flex-wrap items-center gap-3">
		<div class="flex flex-wrap items-center gap-2">
			<span class="text-xs font-medium tracking-wide text-gray-400 uppercase">Applied</span>
			<button
				onclick={() => {
					filterApplied = 'all';
					selectedIndex = 0;
				}}
				class="border px-2 py-0.5 text-xs transition {filterApplied === 'all'
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
				class="border px-2 py-0.5 text-xs transition {filterApplied === 'applied'
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
				class="border px-2 py-0.5 text-xs transition {filterApplied === 'not-applied'
					? 'border-indigo-500 bg-indigo-50 text-indigo-700'
					: 'border-gray-200 bg-white text-gray-500 hover:bg-gray-50 hover:text-gray-700'}"
			>
				Not Applied
			</button>
		</div>

		<div class="flex flex-wrap items-center gap-2">
			<span class="text-xs font-medium tracking-wide text-gray-400 uppercase">Favorite</span>
			<button
				onclick={() => {
					filterFavorite = 'all';
					selectedIndex = 0;
				}}
				class="border px-2 py-0.5 text-xs transition {filterFavorite === 'all'
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
				class="border px-2 py-0.5 text-xs transition {filterFavorite === 'favorite'
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
				class="border px-2 py-0.5 text-xs transition {filterFavorite === 'not-favorite'
					? 'border-amber-500 bg-amber-50 text-amber-700'
					: 'border-gray-200 bg-white text-gray-500 hover:bg-gray-50 hover:text-gray-700'}"
			>
				Not Favorite
			</button>
		</div>
	</div>

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
					await update();
					if (result.type === 'success') closeForms();
				};
			}}
		>
			{#if editingId}
				<input type="hidden" name="id" value={editingId} />
			{/if}

			<FormGrid>
				<Field label="Idea" span={12} required>
					<textarea name="content" required rows="5" class="textarea"
						>{editingId ? (editingIdea()?.content ?? '') : ''}</textarea
					>
				</Field>

				<Field label="Tags" span={12} hint="Comma separated.">
					<input
						name="tags"
						type="text"
						autocomplete="off"
						value={editingId ? editingTagString() : ''}
						placeholder="project, app, music"
						class="input"
					/>
				</Field>
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
		<div class="space-y-3">
			{#each filteredIdeas as idea, i (idea.id)}
				<div
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
							<div class="flex items-start justify-between gap-4">
								<p class="text-sm whitespace-pre-wrap text-gray-900">{idea.content}</p>
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
											class="border border-gray-200 bg-white px-2 py-1 text-xs text-gray-600 transition hover:bg-gray-100"
										>
											Cancel
										</button>
									{:else}
										<button
											onclick={() => openIdeaForm(idea.id)}
											class="border border-gray-200 bg-white px-2 py-1 text-xs text-gray-600 transition hover:bg-gray-100"
										>
											<Icon name="edit" /> Edit
										</button>
										<button
											type="button"
											onclick={() => {
												confirmingDeleteId = idea.id;
											}}
											class="border border-red-200 bg-white px-2 py-1 text-xs text-red-600 transition hover:bg-red-50"
										>
											<Icon name="trash" /> Delete
										</button>
									{/if}
								</div>
							</div>

							<div class="mt-2 flex items-start justify-between gap-3">
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

								<form
									method="post"
									action="?/toggleApplied"
									data-applied-toggle-id={idea.id}
									use:enhance={() => {
										return async ({ update }) => {
											await update();
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
															await update();
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
