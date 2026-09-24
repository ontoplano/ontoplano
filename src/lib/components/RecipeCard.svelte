<script lang="ts">
	/**
	 * One recipe, wherever a recipe is shown.
	 *
	 * Written inside the Kitchen, so a recipe filed under a subject was a title
	 * and two numbers: no picture, nothing about what it needs that the
	 * cupboard has not got, and no way to put it on a day. What makes this room
	 * worth having is the loop between a recipe, the week and the shopping
	 * list, and a card without it is a title in a list.
	 *
	 * The same move as `GoalCard`, `IdeaCard`, `BillRow` and `HabitCard`. There
	 * are no action names to pass: everything a card does is a link or a
	 * callback, and what changes a recipe is its own page.
	 */
	import Icon from '$lib/components/Icon.svelte';
	import { resolve } from '$app/paths';
	import { useT } from '$lib/i18n';

	const t = useT();

	/** What a card needs — `withMissingCounts` and `mainPictures` give this. */
	type Shown = {
		id: number;
		title: string;
		minutes: number | null;
		servings: number | null;
		ingredients: number;
		missing: number;
		mainPicture?: number | null;
	};

	let {
		recipe,
		/** Put it on a day, without opening it first. Absent where there is no planner to hand. */
		onplan
	}: {
		recipe: Shown;
		onplan?: (recipe: { id: number; title: string; minutes: number | null }) => void;
	} = $props();
</script>

<div class="relative bg-white">
	<!--
		Putting a recipe on a day, without opening it first.

		This is the whole of what the Meals tab used to be for, in the place a
		recipe is already being looked at. The button sits above the card's own
		link rather than inside it, because a button inside an anchor is neither.
	-->
	{#if onplan}
		<button
			type="button"
			onclick={() =>
				onplan({ id: recipe.id, title: recipe.title, minutes: recipe.minutes ?? null })}
			title={t('health.recipes.putItOnADay')}
			aria-label={t('health.recipes.putOnADay', { title: recipe.title })}
			class="btn btn-sm absolute top-2 right-2 z-10"
		>
			<Icon name="calendar" />
		</button>
	{/if}
	<a
		href={resolve('/health/recipes/[id]', { id: String(recipe.id) })}
		class="block h-full p-4 transition-colors hover:bg-gray-50 max-sm:flex max-sm:items-start max-sm:gap-3"
	>
		<!--
			The picture, when there is one: a cookbook you recognise by sight
			rather than by reading forty titles. Sized so a card without one is not
			a different shape from a card with one.
		-->
		{#if recipe.mainPicture}
			<!--
				A square, not a stripe.

				Full-width at a fixed height crops a photograph to a letterbox — a
				horse becomes a horse's flank, a face becomes an eye — and a page of
				those is unreadable. A square of one size, whatever the picture's own
				shape, is what makes a grid of cards scan.
			-->
			<img
				src="/media/{recipe.mainPicture}"
				alt=""
				loading="lazy"
				class="mb-3 block size-[9.6rem] rounded-md border border-gray-200 bg-white object-cover max-sm:mb-0 max-sm:size-20 max-sm:shrink-0"
			/>
		{/if}

		<!-- On a phone the picture is beside the words, so they share a column of
		     their own rather than sitting under an empty half. -->
		<span class="block min-w-0 max-sm:flex-1">
			<span class="block text-sm font-medium text-gray-900">{recipe.title}</span>

			<span class="mt-1 flex flex-wrap items-center gap-2 text-xs text-gray-500">
				{#if recipe.minutes}<span class="tabular"
						>{t('health.recipes.min', { minutes: recipe.minutes })}</span
					>{/if}
				{#if recipe.servings}<span class="tabular"
						>{t('health.recipes.serves2', { servings: recipe.servings })}</span
					>{/if}
				<span class="tabular"
					>{t('health.recipes.ingredients', { ingredients: recipe.ingredients })}</span
				>
			</span>

			<span class="mt-2 block text-xs">
				{#if recipe.ingredients === 0}
					<span class="text-gray-500">{t('health.recipes.nothingInItYet')}</span>
				{:else if recipe.missing === 0}
					<span class="text-teal-700">{t('health.recipes.youHaveEverything')}</span>
				{:else}
					<span class="text-amber-700"
						>{t('health.recipes.missing', {
							missing: recipe.missing,
							ingredients: recipe.missing === 1 ? 'ingredient' : 'ingredients'
						})}</span
					>
				{/if}
			</span>
		</span></a
	>
</div>
