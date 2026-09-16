<script lang="ts">
	import NumberBox from '$lib/components/NumberBox.svelte';
	import { setRoomAction } from '$lib/room-action.svelte';
	import RoomToolbar from '$lib/components/RoomToolbar.svelte';
	import { getAction, keyFor } from '$lib/shortcuts';
	import OneLine from '$lib/components/OneLine.svelte';
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import { autogrow } from '$lib/actions/autogrow';
	import Banner from '$lib/components/Banner.svelte';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import Field from '$lib/components/Field.svelte';
	import FormError from '$lib/components/FormError.svelte';
	import FormGrid from '$lib/components/FormGrid.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import Modal from '$lib/components/Modal.svelte';
	import type { PageServerData, ActionData } from './$types';
	import { useT } from '$lib/i18n';

	const t = useT();

	let { data, form }: { data: PageServerData; form: ActionData } = $props();

	let showForm = $state(false);
	/** The recipe being put on a day, or null. */
	let planning = $state<{ id: number; title: string; minutes: number | null } | null>(null);
	/** While the server is fetching somebody else's page, which takes a moment. */
	let importing = $state(false);
	let onlyMakeable = $state(false);

	const visible = $derived(
		onlyMakeable ? data.recipes.filter((r) => r.missing === 0) : data.recipes
	);

	function handleKeydown(e: KeyboardEvent) {
		if (
			e.target instanceof HTMLInputElement ||
			e.target instanceof HTMLTextAreaElement ||
			e.target instanceof HTMLSelectElement
		)
			return;

		if (e.key === 'Escape') {
			showForm = false;
			planning = null;
		}
		if (getAction('/health/recipes', e.key) === 'new') {
			e.preventDefault();
			showForm = true;
		}
	}

	/* This screen's one verb, drawn by the room's bar — see $lib/room-action. */
	setRoomAction(() => ({
		label: 'New recipe',
		tour: 'recipe-new',
		kbd: keyFor('/health/recipes', 'new'),
		run: () => (showForm = true)
	}));
</script>

<svelte:window onkeydown={handleKeydown} />

<div class="space-y-4">
	<RoomToolbar>
		{#snippet tools()}
			{#if data.recipes.length > 0}
				<button
					onclick={() => (onlyMakeable = !onlyMakeable)}
					aria-pressed={onlyMakeable}
					class="btn btn-sm"
				>
					{onlyMakeable ? 'Show all' : 'What I can make now'}
				</button>
			{/if}
		{/snippet}
	</RoomToolbar>

	<FormError message={form?.message} />

	{#if !data.hasFoodCategory}
		<!-- Without one, every ingredient field would refuse everything typed
		     into it, which is a worse first impression than a sentence. -->
		<Banner kind="warning">
			{t('health.recipes.noFoodCategoryYet')}
			<a href={resolve('/inventory')} class="underline"
				>{t('health.recipes.tickOneOnTheShopping')}</a
			>
		</Banner>
	{/if}

	{#if data.recipes.length === 0}
		<EmptyState
			icon="utensils"
			title={t('health.recipes.noRecipesYet')}
			description="Write one, put it on a day, and the shopping list fills itself with what it needs."
		>
			{#snippet action()}
				<button onclick={() => (showForm = true)} class="btn btn-primary">
					<Icon name="plus" />
					{t('health.recipes.newRecipe')}
				</button>
			{/snippet}
		</EmptyState>
	{:else if visible.length === 0}
		<EmptyState icon="utensils" title={t('health.recipes.nothingYouCanMakeRight')}>
			{#snippet action()}
				<button onclick={() => (onlyMakeable = false)} class="btn"
					>{t('health.recipes.showAllRecipes')}</button
				>
			{/snippet}
		</EmptyState>
	{:else}
		<!--
			One surface, and the recipes are its cells.

			Every recipe used to be a card of its own on the page's ground, which
			at four recipes is four boxes floating in a field of background and at
			twenty is a mosaic. The list is one thing, so it is one surface: a
			hairline between rows down to the phone, and the same hairline between
			columns once there is room for two of them. In the two-column layout
			that line is a one-pixel grid gap with the surface showing through it,
			which is why the surface is gray behind cells that are white.
		-->
		<div
			class="divide-y divide-gray-200 border border-gray-200 bg-white shadow-card lg:grid lg:grid-cols-2 lg:gap-px lg:divide-y-0 lg:bg-gray-200 2xl:grid-cols-3"
			data-tour="recipe-list"
		>
			{#each visible as recipe (recipe.id)}
				<div class="relative bg-white">
					<!--
						Putting a recipe on a day, without opening it first.

						This is the whole of what the Meals tab used to be for, in the
						place a recipe is already being looked at. The button sits above
						the card's own link rather than inside it, because a button
						inside an anchor is neither.
					-->
					<button
						type="button"
						onclick={() =>
							(planning = {
								id: recipe.id,
								title: recipe.title,
								minutes: recipe.minutes ?? null
							})}
						title={t('health.recipes.putItOnADay')}
						aria-label="Put {recipe.title} on a day"
						class="btn btn-sm absolute top-2 right-2 z-10"
					>
						<Icon name="calendar" />
					</button>
					<a
						href={resolve('/health/recipes/[id]', { id: String(recipe.id) })}
						class="block h-full p-4 transition-colors hover:bg-gray-50 max-sm:flex max-sm:items-start max-sm:gap-3"
					>
						<!--
						The picture, when there is one: a cookbook you recognise by
						sight rather than by reading forty titles. Sized so a card
						without one is not a different shape from a card with one.
					-->
						{#if recipe.mainPicture}
							<!--
							A square, not a stripe.

							Full-width at a fixed height crops a photograph to a letterbox
							— a horse becomes a horse's flank, a face becomes an eye — and
							a page of those is unreadable. A square of one size, whatever
							the picture's own shape, is what makes a grid of cards scan.
						-->
							<img
								src="/media/{recipe.mainPicture}"
								alt=""
								loading="lazy"
								class="mb-3 block size-[9.6rem] rounded-md border border-gray-200 bg-white object-cover max-sm:mb-0 max-sm:size-20 max-sm:shrink-0"
							/>
						{/if}

						<!-- On a phone the picture is beside the words, so they share a
						     column of their own rather than sitting under an empty half. -->
						<span class="block min-w-0 max-sm:flex-1">
							<span class="block text-sm font-medium text-gray-900">{recipe.title}</span>

							<span class="mt-1 flex flex-wrap items-center gap-2 text-xs text-gray-500">
								{#if recipe.minutes}<span class="tabular">{recipe.minutes} min</span>{/if}
								{#if recipe.servings}<span class="tabular">serves {recipe.servings}</span>{/if}
								<span class="tabular">{recipe.ingredients} ingredients</span>
							</span>

							<span class="mt-2 block text-xs">
								{#if recipe.ingredients === 0}
									<span class="text-gray-500">{t('health.recipes.nothingInItYet')}</span>
								{:else if recipe.missing === 0}
									<span class="text-teal-700">{t('health.recipes.youHaveEverything')}</span>
								{:else}
									<span class="text-amber-700">
										missing {recipe.missing}
										{recipe.missing === 1 ? 'ingredient' : 'ingredients'}
									</span>
								{/if}
							</span>
						</span></a
					>
				</div>
			{/each}
		</div>
	{/if}
</div>

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
			hint="On the recipe page: select all, copy, paste here. Its ingredients and method come with it."
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
				{importing ? 'Reading…' : 'Read it'}
			</button>
		</div>
	</form>

	<!-- Everything the editor has. Making somebody create a title and then
	     immediately press Edit to write the recipe is two steps for one act. -->
	<form id="recipe-form" method="post" action="?/create" use:enhance>
		<FormGrid>
			<Field label={t('health.recipes.whatItIs')} span={12} required>
				<OneLine name="heading" class="input" required />
			</Field>
			<Field label={t('health.recipes.serves')} span={4}>
				<NumberBox autocomplete="off" name="servings" min="1" />
			</Field>
			<Field label={t('health.recipes.minutes')} span={4}>
				<NumberBox autocomplete="off" name="minutes" min="1" />
			</Field>
			<Field label={t('health.recipes.whereItCameFrom')} span={4}>
				<OneLine name="source" class="input" />
			</Field>
			<Field
				label={t('health.recipes.method')}
				span={12}
				hint="Markdown: headings, lists, numbers. Ingredients come after."
			>
				<textarea name="method" rows="8" use:autogrow class="textarea"></textarea>
			</Field>
			<Field label={t('ui.notes')} span={12}>
				<textarea name="notes" rows="2" class="textarea"></textarea>
			</Field>
		</FormGrid>
	</form>

	{#snippet footer()}
		<button type="button" class="btn" onclick={() => (showForm = false)}>{t('ui.cancel')}</button>
		<button type="submit" form="recipe-form" class="btn btn-primary">{t('ui.create')}</button>
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
	description="It becomes a block on the plan, like anything else you give time to."
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
						value="19:00"
						class="input"
					/>
				</Field>
				<Field label={t('health.recipes.for')} span={6} hint="Minutes.">
					<NumberBox
						autocomplete="off"
						name="durationMinutes"
						min="5"
						step="5"
						value={planning.minutes ?? 45}
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
