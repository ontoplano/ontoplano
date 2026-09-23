<script lang="ts">
	/* biome-ignore-all assist/source/organizeImports lint/correctness/noUnusedImports lint/correctness/noUnusedVariables lint/style/useConst: Svelte template and rune usage in this file triggers false positives in current Biome diagnostics. */
	import { enhance } from '$lib/enhance';
	import FilterChips from '$lib/components/FilterChips.svelte';
	import TagChip from '$lib/components/TagChip.svelte';
	import RoomSurface from '$lib/components/RoomSurface.svelte';
	import { SECTION_COLORS } from '$lib/colors';
	import { setRoomAction } from '$lib/room-action.svelte';
	import FormError from '$lib/components/FormError.svelte';
	import IdeaFields from '$lib/components/fields/IdeaFields.svelte';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import FormGrid from '$lib/components/FormGrid.svelte';
	import Modal from '$lib/components/Modal.svelte';
	import type { PageServerData, ActionData } from './$types';
	import { getAction } from '$lib/shortcuts';
	import { keepInView } from '$lib/actions/keep-in-view';
	import IdeaCard from '$lib/components/IdeaCard.svelte';
	import { IDEA_ROOM_ACTIONS } from '$lib/idea-action-names';
	import { useT } from '$lib/i18n';

	const t = useT();

	let { data, form }: { data: PageServerData; form: ActionData } = $props();

	let showForm = $state(false);
	let editingId: number | null = $state(null);
	let selectedIndex = $state(0);
	let filterTag: string | null = $state(null);
	/*
	 * The tag list is folded to begin with. Somebody opening Ideas came to read
	 * ideas; the tags are how you narrow them once you know what you are after,
	 * and every tag ever used is a wall of chips above the thing itself.
	 */
	let tagsOpen = $state(false);
	/*
	 * The ones still waiting, first.
	 *
	 * An idea you already acted on is a record; an idea you have not is the
	 * reason to open this screen. Opening on everything buried the second in
	 * the first, and the filter is one press away either way.
	 */
	let filterApplied: 'all' | 'applied' | 'not-applied' = $state('not-applied');
	let filterFavorite: 'all' | 'favorite' | 'not-favorite' = $state('all');

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

	function openIdeaForm(id: number | null = null) {
		showForm = true;
		editingId = id;
	}

	function closeForms() {
		showForm = false;
		editingId = null;
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
		const action = getAction('/notebooks/ideas', e.key);
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

	/* This screen's one verb, drawn by the room's bar — see $lib/room-action. */
	setRoomAction(() => ({
		label: t('notebooks.ideas.newIdea'),
		open: showForm,
		tour: 'idea-new',
		run: () => (showForm ? closeForms() : openIdeaForm())
	}));
</script>

<svelte:window onkeydown={handleKeydown} />

<div class="space-y-4">
	<FormError message={form?.message} />

	<Modal
		bind:open={showForm}
		error={form?.message}
		title={editingId ? t('notebooks.ideas.editIdea') : t('notebooks.ideas.newIdea')}
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
			<button type="button" class="btn" onclick={closeForms}>{t('ui.cancel')}</button>
			<button type="submit" form="idea-form" class="btn btn-primary">
				{editingId ? 'Save' : t('notebooks.ideas.saveIdea')}
			</button>
		{/snippet}
	</Modal>

	{#if filteredIdeas.length === 0}
		<div class="border border-gray-200 bg-white p-8 text-center text-sm text-gray-500 shadow-sm">
			{#if filterTag || filterApplied !== 'all' || filterFavorite !== 'all'}
				<EmptyState icon="ideas" title={t('notebooks.ideas.noIdeasMatchTheCurrent')} />
			{:else}
				<EmptyState
					icon="ideas"
					title={t('notebooks.ideas.nothingCapturedYet')}
					description={t('notebooks.ideas.ideasAreTheThingsYou')}
				>
					{#snippet action()}
						<button onclick={() => (showForm = true)} class="btn btn-primary">
							<Icon name="plus" />
							{t('notebooks.ideas.newIdea')}
						</button>
					{/snippet}
				</EmptyState>
			{/if}
		</div>
	{:else}
		<!--
			One surface, and an idea is a row on it.

			A card each meant twenty captured thoughts drew twenty boxes on the
			page's ground, with the background showing through between every two.
			They are one list, so they sit on one surface with a hairline between
			them — the same shape the todo list and the activities list have.
		-->
		<!--
			The controls and the ideas are one object — see `RoomSurface`. They
			were two: a fold of tags and two rows of chips on the page's own
			patterned ground, then a gap, then a card of rows.
		-->
		<RoomSurface accent={SECTION_COLORS.ideas} dataTour="idea-list">
			{#snippet tools()}
				<!--
					The tags fold away, and start folded.

					Every tag anybody has ever used, above everything, is a wall of
					chips between the page and the ideas — and an idea list gathers
					tags faster than almost anything else here. It is a filter,
					which is something you go looking for; the ideas are what the
					page is.

					The one it is filtered by stays visible while the rest are
					folded, or closing the list would hide that a filter is on.
				-->
				{@render ideaTags()}
			{/snippet}
			{#snippet filters()}
				{#if data.ideas.length > 0}{@render ideaFilters()}{/if}
			{/snippet}
			<div class="divide-y divide-gray-200">
				{#each filteredIdeas as idea, i (idea.id)}
					<div
						use:keepInView={i === clampedSelectedIndex}
						class="relative p-4 {i === clampedSelectedIndex ? 'kb-cursor' : ''}"
					>
						<!--
							The card is a component, so a notebook's Ideas tab shows the
							same idea this room does rather than a line of text beside a
							tick — see `IdeaCard`.
						-->
						<IdeaCard
							{idea}
							actions={IDEA_ROOM_ACTIONS}
							selected={i === clampedSelectedIndex}
							ontag={(name) => {
								filterTag = name;
								selectedIndex = 0;
							}}
							onedit={(id) => openIdeaForm(id)}
						/>
					</div>
				{/each}
			</div>
		</RoomSurface>
	{/if}
</div>

<!--
	The two blocks the surface puts along its top, written here because they
	are this room's own and only their placement belongs to the component.
-->
{#snippet ideaTags()}
	{#if data.allTags.length > 0}
		<div class="space-y-2">
			<button
				type="button"
				onclick={() => (tagsOpen = !tagsOpen)}
				class="flex items-center gap-1.5 text-xs font-medium tracking-wide text-gray-500 uppercase hover:text-gray-900"
				aria-expanded={tagsOpen}
			>
				<Icon name={tagsOpen ? 'chevron-down' : 'chevron-right'} size={14} />
				{t('ui.tags')}
				<span class="text-gray-500">({data.allTags.length})</span>
			</button>

			{#if filterTag && !tagsOpen}
				<div class="flex flex-wrap items-center gap-2">
					<TagChip name={filterTag} active />
					<button
						onclick={() => {
							filterTag = null;
							selectedIndex = 0;
						}}
						class="border border-gray-200 bg-white px-2 py-0.5 text-xs text-gray-500 transition hover:text-gray-600"
					>
						{t('notebooks.ideas.clear')}
					</button>
				</div>
			{/if}
		</div>
	{/if}

	{#if data.allTags.length > 0 && tagsOpen}
		<div class="flex flex-wrap gap-2">
			{#each data.allTags as tag (tag.id)}
				<TagChip
					name={tag.name}
					active={filterTag === tag.name}
					onclick={() => {
						filterTag = filterTag === tag.name ? null : tag.name;
						selectedIndex = 0;
					}}
				/>
			{/each}
			{#if filterTag}
				<button
					onclick={() => {
						filterTag = null;
						selectedIndex = 0;
					}}
					class="border border-gray-200 bg-white px-2 py-0.5 text-xs text-gray-500 transition hover:text-gray-600"
				>
					{t('notebooks.ideas.clear')}
				</button>
			{/if}
		</div>
	{/if}
{/snippet}

{#snippet ideaFilters()}
	<FilterChips
		label={t('notebooks.ideas.applied')}
		bind:value={filterApplied}
		onchange={() => (selectedIndex = 0)}
		options={[
			{ value: 'all', label: 'ui.all' },
			{ value: 'applied', label: 'notebooks.ideas.applied' },
			{ value: 'not-applied', label: 'notebooks.ideas.notApplied' }
		]}
	/>
	<FilterChips
		label={t('notebooks.ideas.favourite')}
		bind:value={filterFavorite}
		onchange={() => (selectedIndex = 0)}
		options={[
			{ value: 'all', label: 'ui.all' },
			{ value: 'favorite', label: 'notebooks.ideas.favourites' },
			{ value: 'not-favorite', label: 'notebooks.ideas.notFavourite' }
		]}
	/>
{/snippet}
