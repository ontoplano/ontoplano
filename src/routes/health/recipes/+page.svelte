<script lang="ts">
	import NumberBox from '$lib/components/NumberBox.svelte';
	import ShowingCount from '$lib/components/ShowingCount.svelte';
	import SearchField from '$lib/components/SearchField.svelte';
	import { setRoomAction } from '$lib/room-action.svelte';
	import RoomSurface from '$lib/components/RoomSurface.svelte';
	import FilterBar from '$lib/components/FilterBar.svelte';
	import SortControl from '$lib/components/SortControl.svelte';
	import type { PlainKey } from '$lib/i18n/keys';
	import { goto } from '$app/navigation';
	import { keepInView } from '$lib/actions/keep-in-view';
	import { getAction, keyFor } from '$lib/shortcuts';
	import OneLine from '$lib/components/OneLine.svelte';
	import { enhance } from '$lib/enhance';
	import { resolve } from '$app/paths';
	import Banner from '$lib/components/Banner.svelte';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import Field from '$lib/components/Field.svelte';
	import FormError from '$lib/components/FormError.svelte';
	import FormGrid from '$lib/components/FormGrid.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import Modal from '$lib/components/Modal.svelte';
	import RecipeFields from '$lib/components/fields/RecipeFields.svelte';
	import type { PageServerData, ActionData } from './$types';
	import RecipeCard from '$lib/components/RecipeCard.svelte';
	import { useT } from '$lib/i18n';

	const t = useT();

	let { data, form }: { data: PageServerData; form: ActionData } = $props();

	let showForm = $state(false);
	/** The recipe whose edit form is open, or null. */
	let editingId = $state<number | null>(null);
	const editingRecipe = $derived(data.recipes.find((r) => r.id === editingId) ?? null);
	let selected = $state(0);
	/** Put away, and shown only when asked for — with how many there are. */
	let showArchived = $state(false);
	/** The recipe being put on a day, or null. */
	let planning = $state<{ id: number; title: string; minutes: number | null } | null>(null);
	/** While the server is fetching somebody else's page, which takes a moment. */
	let importing = $state(false);
	let onlyMakeable = $state(false);
	let looking = $state('');

	/** Where "put it on a day" starts, before anybody changes it. */
	const DEFAULT_START = '19:00';
	const DEFAULT_MINUTES = 45;

	const narrowed = $derived(onlyMakeable || looking.trim() !== '');
	const current = $derived(data.recipes.filter((r) => (r.archivedAt !== null) === showArchived));
	const putAway = $derived(data.recipes.filter((r) => r.archivedAt !== null).length);
	const makeable = $derived(current.filter((r) => r.missing === 0 && r.ingredients > 0));

	const ORDERS = ['title', 'missing', 'minutes', 'cooked'] as const;
	type Order = (typeof ORDERS)[number];
	const ORDER_LABELS: Record<Order, PlainKey> = {
		title: 'health.recipes.orderTitle',
		missing: 'health.recipes.orderMissing',
		minutes: 'health.recipes.orderMinutes',
		cooked: 'health.recipes.orderCooked'
	};
	/** Where this browser keeps the order it was last given. */
	const ORDER_KEY = 'recipes.order';
	let order = $state<Order>('title');
	let direction = $state<'asc' | 'desc'>('asc');
	$effect(() => {
		try {
			const kept = JSON.parse(localStorage.getItem(ORDER_KEY) ?? 'null');
			if (kept && ORDERS.includes(kept.order)) order = kept.order;
			if (kept?.direction === 'asc' || kept?.direction === 'desc') direction = kept.direction;
		} catch {
			/* A private window keeps nothing; the default order stands. */
		}
	});
	function keepOrder() {
		try {
			localStorage.setItem(ORDER_KEY, JSON.stringify({ order, direction }));
		} catch {
			/* As above. */
		}
	}

	type Recipe = (typeof data.recipes)[number];
	function compare(a: Recipe, b: Recipe): number {
		/* A recipe with no time, or never cooked, sorts after every one that has. */
		const last = direction === 'asc' ? Infinity : -Infinity;
		const by =
			order === 'missing'
				? a.missing - b.missing
				: order === 'minutes'
					? (a.minutes ?? last) - (b.minutes ?? last)
					: order === 'cooked'
						? (a.lastCookedAt ?? '').localeCompare(b.lastCookedAt ?? '')
						: 0;
		const tie = a.title.localeCompare(b.title);
		return (direction === 'asc' ? 1 : -1) * (by || tie) || 0;
	}

	const visible = $derived.by(() => {
		const needle = looking.trim().toLowerCase();
		return current
			.filter(
				(r) =>
					(!onlyMakeable || (r.missing === 0 && r.ingredients > 0)) &&
					(needle === '' || r.title.toLowerCase().includes(needle))
			)
			.sort(compare);
	});

	function clearFilters() {
		onlyMakeable = false;
		showArchived = false;
		looking = '';
		selected = 0;
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
			planning = null;
			return;
		}
		const action = getAction('/health/recipes', e.key);
		if (!action) return;
		e.preventDefault();
		const here = visible[selected];
		switch (action) {
			case 'new':
				showForm = true;
				break;
			case 'navigate-down':
				selected = Math.min(selected + 1, visible.length - 1);
				break;
			case 'navigate-up':
				selected = Math.max(selected - 1, 0);
				break;
			case 'edit':
				if (here) editingId = here.id;
				break;
			case 'open':
				if (here) goto(resolve('/health/recipes/[id]', { id: String(here.id) }));
				break;
		}
	}

	/* This screen's one verb, drawn by the room's bar — see $lib/room-action. */
	setRoomAction(() => ({
		label: t('health.recipes.newRecipe'),
		tour: 'recipe-new',
		kbd: keyFor('/health/recipes', 'new'),
		run: () => (showForm = true)
	}));
</script>

<svelte:window onkeydown={handleKeydown} />

<FormError message={form?.message} />

<!-- The controls and the recipes are one object — see `RoomSurface` — with
     the task list's strip along its top. -->
<RoomSurface dataTour="recipe-list">
	{#snippet tools()}
		<FilterBar
			name="recipes"
			inlineBelow
			on={narrowed || showArchived}
			summary={[
				onlyMakeable ? t('health.recipes.canMakeCount', { count: makeable.length }) : '',
				showArchived ? t('todoRows.archived') : ''
			]
				.filter(Boolean)
				.join(', ')}
			onclear={clearFilters}
		>
			{#snippet lead()}
				<SearchField
					bind:value={looking}
					oninput={() => (selected = 0)}
					label={t('health.recipes.search')}
				/>
			{/snippet}
			{#snippet count()}
				<!-- Held open by the count of every recipe, so narrowing does not
				     change its width. See `.count-slot`. -->
				<ShowingCount
					total={data.recipes.length}
					shown={visible.length}
					said={(count) => t('health.recipes.showingCount', { count })}
				/>
			{/snippet}
			{#snippet trailing()}
				<SortControl
					value={order}
					options={ORDERS}
					labels={ORDER_LABELS}
					{direction}
					onpick={(next) => {
						order = next;
						keepOrder();
					}}
					onflip={() => {
						direction = direction === 'asc' ? 'desc' : 'asc';
						keepOrder();
					}}
					label={t('health.recipes.orderRecipesBy')}
				/>
			{/snippet}
			<!-- Out on the strip at every width: a phone's sheet holding one
			     toggle is a press in front of a control there was room for. -->
			{#snippet inline()}
				<!-- One label, whichever way it is set: pressed is what says it is on.
				     With nothing to show it cannot be pressed — it would only empty
				     the list. -->
				<button
					type="button"
					onclick={() => {
						onlyMakeable = !onlyMakeable;
						selected = 0;
					}}
					aria-pressed={onlyMakeable}
					disabled={makeable.length === 0 && !onlyMakeable}
					class="btn btn-sm shrink-0"
				>
					{t('health.recipes.canMakeCount', { count: makeable.length })}
				</button>
				<button
					type="button"
					class="btn btn-sm shrink-0"
					aria-pressed={showArchived}
					hidden={putAway === 0 && !showArchived}
					onclick={() => {
						showArchived = !showArchived;
						selected = 0;
					}}
				>
					{t('todoRows.archivedCount', { count: putAway })}
				</button>
			{/snippet}
		</FilterBar>
	{/snippet}

	{#if !data.hasFoodCategory}
		<!-- Without one, every ingredient field would refuse everything typed
		     into it, which is a worse first impression than a sentence. -->
		<div class="border-b border-gray-200 p-3">
			<Banner kind="warning">
				{t('health.recipes.noFoodCategoryYet')}
				<a href={resolve('/inventory/stock')} class="underline"
					>{t('health.recipes.tickOneOnTheShopping')}</a
				>
			</Banner>
		</div>
	{/if}

	{#if data.recipes.length === 0}
		<EmptyState
			icon="utensils"
			title={t('health.recipes.noRecipesYet')}
			description={t('health.recipes.writeOnePutItOn')}
		>
			{#snippet action()}
				<button onclick={() => (showForm = true)} class="btn btn-primary">
					<Icon name="plus" />
					{t('health.recipes.newRecipe')}
				</button>
			{/snippet}
		</EmptyState>
	{:else if visible.length === 0}
		<EmptyState
			icon="search"
			title={onlyMakeable && !looking.trim()
				? t('health.recipes.nothingYouCanMakeRight')
				: t('health.recipes.noneMatch')}
		>
			{#snippet action()}
				<button onclick={clearFilters} class="btn">{t('health.recipes.showAllRecipes')}</button>
			{/snippet}
		</EmptyState>
	{:else}
		<!-- One column, edge to edge, the way the task list is: a grid of two
		     left an empty bordered cell whenever the count was odd. -->
		<div class="divide-y divide-gray-200">
			{#each visible as recipe, i (recipe.id)}
				<!-- The card is a component, so a recipe filed under a notebook is the
				     same recipe this room shows. See `RecipeCard`. -->
				<div use:keepInView={i === selected} class={i === selected ? 'kb-cursor' : ''}>
					<RecipeCard
						{recipe}
						onplan={(one) => (planning = one)}
						onedit={(id) => (editingId = id)}
						manage
					/>
				</div>
			{/each}
		</div>
	{/if}
</RoomSurface>

<Modal bind:open={showForm} error={form?.message} title={t('health.recipes.newRecipe')}>
	<!--
		The paste first, because it is the shortest path.

		Almost every food site publishes its recipes as structured data, so most
		of the time the answer to "add this recipe" is a paste rather than twenty
		minutes of typing. Its own form above the manual one: two acts, two
		buttons, and this one either works outright or says why and leaves the
		fields below for you.
	-->
	<form
		method="post"
		action="?/importFromPage"
		class="mb-4 border-b border-gray-200 pb-4"
		use:enhance={() => {
			importing = true;
			return async ({ update }) => {
				importing = false;
				await update();
			};
		}}
	>
		<Field
			label={t('health.recipes.fromAPage')}
			span={12}
			hint={t('health.recipes.onTheRecipePageSelect')}
		>
			<textarea
				name="page"
				rows="3"
				placeholder={t('health.recipes.pasteThePageHere')}
				class="textarea font-mono text-xs"
			></textarea>
		</Field>
		<div class="mt-2 flex flex-wrap items-center gap-2">
			<OneLine
				name="source"
				placeholder={t('health.recipes.whereItCameFromOptional')}
				class="input min-w-0 flex-1"
			/>
			<button class="btn shrink-0" disabled={importing}>
				{importing ? t('health.recipes.reading') : t('health.recipes.readIt')}
			</button>
		</div>
	</form>

	<!-- Everything the editor has. Making somebody create a title and then
	     immediately press Edit to write the recipe is two steps for one act. -->
	<form id="recipe-form" method="post" action="?/create" use:enhance>
		<RecipeFields notebooks={data.notebooks} />
	</form>

	{#snippet footer()}
		<button type="button" class="btn" onclick={() => (showForm = false)}>{t('ui.cancel')}</button>
		<button type="submit" form="recipe-form" class="btn btn-primary">{t('ui.create')}</button>
	{/snippet}
</Modal>

<!-- The same form the recipe's own page opens, from the row's pencil. -->
<Modal
	open={editingId !== null}
	onclose={() => (editingId = null)}
	error={form?.message}
	title={t('health.recipes.id.editRecipe')}
>
	{#if editingRecipe}
		<form
			id="recipe-edit-form"
			method="post"
			action="?/update"
			use:enhance={() =>
				async ({ update, result }) => {
					await update({ reset: false });
					if (result.type === 'success') editingId = null;
				}}
		>
			<input type="hidden" name="id" value={editingRecipe.id} />
			<RecipeFields editing={editingRecipe} notebooks={data.notebooks} />
		</form>
	{/if}

	{#snippet footer()}
		<button type="button" class="btn" onclick={() => (editingId = null)}>{t('ui.cancel')}</button>
		<button type="submit" form="recipe-edit-form" class="btn btn-primary">{t('ui.save')}</button>
	{/snippet}
</Modal>

<!--
	The same dialog the recipe's own page opens, on the list.

	It is the one act the Meals tab existed to make possible, and it was two
	pages away: open the recipe, then find the button. A meal is a block on the
	plan like anything else, so once it is there the week already shows it.
-->
<Modal
	open={planning !== null}
	onclose={() => (planning = null)}
	error={form?.message}
	title={t('health.recipes.putItOnADay')}
	description={t('health.recipes.itBecomesABlockOn')}
	size="sm"
>
	{#if planning}
		<form
			id="plan-recipe-form"
			method="post"
			action="?/schedule"
			use:enhance={() =>
				async ({ update, result }) => {
					await update({ reset: false });
					if (result.type === 'success') planning = null;
				}}
		>
			<input type="hidden" name="recipeId" value={planning.id} />
			<input type="hidden" name="label" value={planning.title} />
			<FormGrid>
				<Field label={t('health.recipes.day')} span={6} required>
					<input
						autocomplete="off"
						name="date"
						type="date"
						required
						value={data.today}
						class="input"
					/>
				</Field>
				<Field label={t('health.recipes.at')} span={6} required>
					<input
						autocomplete="off"
						name="startTime"
						type="time"
						required
						value={DEFAULT_START}
						class="input"
					/>
				</Field>
				<Field label={t('health.recipes.for')} span={6} hint={t('health.recipes.minutes')}>
					<NumberBox
						autocomplete="off"
						name="durationMinutes"
						min="5"
						step="5"
						value={planning.minutes ?? DEFAULT_MINUTES}
					/>
				</Field>
				<Field label={t('health.recipes.countsAs')} span={6}>
					<select name="categoryId" class="select">
						{#each data.categories as category (category.id)}
							<option value={category.id}>{category.name}</option>
						{/each}
					</select>
				</Field>
			</FormGrid>
		</form>
	{/if}

	{#snippet footer()}
		<button type="button" class="btn" onclick={() => (planning = null)}>{t('ui.cancel')}</button>
		<button type="submit" form="plan-recipe-form" class="btn btn-primary">
			{t('health.recipes.putItOnThePlan')}
		</button>
	{/snippet}
</Modal>
