<script lang="ts">
	/* biome-ignore-all assist/source/organizeImports lint/correctness/noUnusedImports lint/correctness/noUnusedVariables lint/style/useConst: Svelte template and rune usage in this file triggers false positives in current Biome diagnostics. */
	import { enhance } from '$lib/enhance';
	import ShowingCount from '$lib/components/ShowingCount.svelte';
	import SearchField from '$lib/components/SearchField.svelte';
	import { openFromUrl } from '$lib/open-from-url.svelte';
	import FilterBar from '$lib/components/FilterBar.svelte';
	import Picker from '$lib/components/Picker.svelte';
	import { tagFilterWords } from '$lib/tag-filter-summary';
	import TagFilter from '$lib/components/TagFilter.svelte';
	import { tagFilterInUrl } from '$lib/tag-filter-url.svelte';
	import { isTagFiltering, passesTagFilter, NO_TAG_FILTER } from '$lib/tag-filter';
	import RoomSurface from '$lib/components/RoomSurface.svelte';
	import { setRoomAction } from '$lib/room-action.svelte';
	import FormError from '$lib/components/FormError.svelte';
	import IdeaFields from '$lib/components/fields/IdeaFields.svelte';
	import EmptyState from '$lib/components/EmptyState.svelte';
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
	/** Which labels to show and which to hide, kept in the address. */
	const tagFilter = tagFilterInUrl();
	/*
	 * The ones still waiting, first.
	 *
	 * An idea you already acted on is a record; an idea you have not is the
	 * reason to open this screen. Opening on everything buried the second in
	 * the first, and the filter is one press away either way.
	 */
	type AppliedChoice = 'all' | 'applied' | 'not-applied';
	type FavouriteChoice = 'all' | 'favorite' | 'not-favorite';
	const DEFAULT_APPLIED: AppliedChoice = 'not-applied';
	const DEFAULT_FAVOURITE: FavouriteChoice = 'all';
	let filterApplied: AppliedChoice = $state(DEFAULT_APPLIED);
	let filterFavorite: FavouriteChoice = $state(DEFAULT_FAVOURITE);
	/** What the search box holds: ideas whose words or tags contain it. */
	let looking = $state('');

	const appliedChoices = $derived([
		{ value: 'not-applied' as const, label: t('notebooks.ideas.notApplied') },
		{ value: 'applied' as const, label: t('notebooks.ideas.applied') },
		{ value: 'all' as const, label: t('notebooks.ideas.appliedOrNot') }
	]);
	const favouriteChoices = $derived([
		{ value: 'all' as const, label: t('notebooks.ideas.favouriteOrNot') },
		{ value: 'favorite' as const, label: t('notebooks.ideas.favourites') },
		{ value: 'not-favorite' as const, label: t('notebooks.ideas.notFavourite') }
	]);

	/*
	 * Narrowed past where the room opens. "Not applied" is where it starts,
	 * so it is not something to clear.
	 */
	const narrowed = $derived(
		isTagFiltering(tagFilter.current) ||
			looking.trim() !== '' ||
			filterApplied !== DEFAULT_APPLIED ||
			filterFavorite !== DEFAULT_FAVOURITE
	);

	function narrowing(): string {
		const said = tagFilterWords(tagFilter.current, t('tagFilter.untagged'));
		if (filterApplied !== DEFAULT_APPLIED)
			said.unshift(appliedChoices.find((one) => one.value === filterApplied)?.label ?? '');
		if (filterFavorite !== DEFAULT_FAVOURITE)
			said.unshift(favouriteChoices.find((one) => one.value === filterFavorite)?.label ?? '');
		return said.filter(Boolean).join(', ');
	}

	function clearFilters() {
		tagFilter.current = NO_TAG_FILTER;
		filterApplied = DEFAULT_APPLIED;
		filterFavorite = DEFAULT_FAVOURITE;
		looking = '';
		selectedIndex = 0;
	}

	let filteredIdeas = $derived.by(() =>
		data.ideas
			.filter((idea) =>
				passesTagFilter(
					idea.tags.map((tag) => tag.name),
					tagFilter.current
				)
			)
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
			.filter((idea) => {
				const needle = looking.trim().toLowerCase();
				if (!needle) return true;
				return [idea.content, idea.appliedNote ?? '', ...idea.tags.map((tag) => tag.name)]
					.join('\n')
					.toLowerCase()
					.includes(needle);
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

	/*
	 * And the address can ask for one, which is how the receipt after a quick
	 * capture offers a way straight into what it just wrote. See
	 * `$lib/open-from-url`.
	 */
	openFromUrl((id) => openIdeaForm(id));

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
				{editingId ? t('ui.save') : t('notebooks.ideas.saveIdea')}
			</button>
		{/snippet}
	</Modal>

	<!--
		The controls and the ideas are one object — see `RoomSurface` — with the
		strip a notebook's Notes tab has: search, count, what narrows, clear.
	-->
	<RoomSurface dataTour="idea-list">
		{#snippet tools()}
			{#if data.ideas.length > 0}{@render ideaFilters()}{/if}
		{/snippet}
		{#if data.ideas.length === 0}
			<EmptyState
				icon="ideas"
				title={t('notebooks.ideas.nothingCapturedYet')}
				description={t('notebooks.ideas.ideasAreTheThingsYou')}
			/>
		{:else if filteredIdeas.length === 0}
			<!-- Inside the surface, so the controls that emptied it stay to undo it. -->
			<EmptyState
				filtered
				onclear={clearFilters}
				description={t('notebooks.ideas.noIdeasMatchTheCurrent')}
			/>
		{:else}
			<div class="divide-y divide-gray-200">
				{#each filteredIdeas as idea, i (idea.id)}
					<div
						use:keepInView={i === clampedSelectedIndex}
						class={i === clampedSelectedIndex ? 'kb-cursor' : ''}
					>
						<!--
							The card is a component, so a notebook's Ideas tab shows the
							same idea this room does — see `IdeaCard`.
						-->
						<IdeaCard
							{idea}
							actions={IDEA_ROOM_ACTIONS}
							selected={i === clampedSelectedIndex}
							ontag={(name) => {
								const held = tagFilter.current;
								if (!held.include.includes(name))
									tagFilter.current = {
										...held,
										include: [...held.include, name],
										exclude: held.exclude.filter((one) => one !== name)
									};
								selectedIndex = 0;
							}}
							onedit={(id) => openIdeaForm(id)}
						/>
					</div>
				{/each}
			</div>
		{/if}
	</RoomSurface>
</div>

{#snippet ideaFilters()}
	<FilterBar name="ideas" on={narrowed} summary={narrowing()} onclear={clearFilters}>
		{#snippet lead()}
			<SearchField bind:value={looking} label={t('notebooks.ideas.searchTheseIdeas')} />
		{/snippet}
		{#snippet count()}
			<!-- Held open at the count of every idea — see `.count-slot`. -->
			<ShowingCount
				total={data.ideas.length}
				shown={filteredIdeas.length}
				said={(count) => t('notebooks.ideas.showingCount', { count })}
			/>
		{/snippet}
		<Picker
			value={filterApplied}
			options={appliedChoices}
			onpick={(next) => {
				filterApplied = next;
				selectedIndex = 0;
			}}
			label={t('notebooks.ideas.applied')}
			class="min-w-36 flex-1 sm:flex-none"
		/>
		<Picker
			value={filterFavorite}
			options={favouriteChoices}
			onpick={(next) => {
				filterFavorite = next;
				selectedIndex = 0;
			}}
			label={t('notebooks.ideas.favourite')}
			class="min-w-36 flex-1 sm:flex-none"
		/>
		{#if data.allTags.length > 0 || isTagFiltering(tagFilter.current)}
			<TagFilter
				tags={data.allTags.map((tag) => tag.name)}
				value={tagFilter.current}
				onchange={(next) => {
					tagFilter.current = next;
					selectedIndex = 0;
				}}
				name="idea-tags"
				class="min-w-36 flex-1 sm:flex-none"
			/>
		{/if}
	</FilterBar>
{/snippet}
