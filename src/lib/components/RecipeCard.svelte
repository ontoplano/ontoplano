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
	import RowCard from '$lib/components/RowCard.svelte';
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

<!--
	The card a task is drawn on — `RowCard`: the picture where a task has its
	tick, the words beside it, the verbs along the foot. The whole card opens
	the recipe; the name carries the link and stretches it over the card, and
	the actions sit above it.
-->
<div
	class="relative flex h-full items-stretch gap-x-4 bg-white px-4 py-3 transition-colors hover:bg-gray-50"
>
	<RowCard>
		{#snippet rail()}
			<!--
				The picture, when there is one: a cookbook you recognise by sight
				rather than by reading forty titles. A square of one size whatever the
				picture's own shape, and the same square empty without one, so every
				name starts at the same x.
			-->
			{#if recipe.mainPicture}
				<img
					src="/media/{recipe.mainPicture}"
					alt=""
					loading="lazy"
					class="block size-16 shrink-0 border border-gray-200 bg-white object-cover"
				/>
			{:else}
				<span
					class="flex size-16 shrink-0 items-center justify-center border border-gray-200 bg-gray-50 text-gray-500"
					aria-hidden="true"
				>
					<Icon name="utensils" />
				</span>
			{/if}
		{/snippet}

		{#snippet controls()}
			<!--
				Putting a recipe on a day, without opening it first.

				This is the whole of what the Meals tab used to be for, in the place a
				recipe is already being looked at. Above the card's own link rather
				than inside it, because a button inside an anchor is neither.
			-->
			{#if onplan}
				<button
					type="button"
					onclick={() =>
						onplan({ id: recipe.id, title: recipe.title, minutes: recipe.minutes ?? null })}
					title={t('health.recipes.putItOnADay')}
					aria-label={t('health.recipes.putOnADay', { title: recipe.title })}
					class="icon-btn relative z-10"
				>
					<Icon name="calendar" />
				</button>
			{/if}
		{/snippet}

		<a
			href={resolve('/health/recipes/[id]', { id: String(recipe.id) })}
			class="text-sm leading-snug font-medium break-words text-gray-900 after:absolute after:inset-0"
			>{recipe.title}</a
		>

		<span class="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-gray-500">
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

		<span class="mt-1 block text-xs">
			{#if recipe.ingredients === 0}
				<span class="text-gray-500">{t('health.recipes.nothingInItYet')}</span>
			{:else if recipe.missing === 0}
				<!-- Blue for the good news and grey for the rest, never green and
				     amber: a small word in either is one a red-green colourblind
				     reader cannot tell apart. -->
				<span class="font-medium text-blue-700">{t('health.recipes.youHaveEverything')}</span>
			{:else}
				<span class="font-medium text-gray-700"
					>{t('health.recipes.missingCount', { count: recipe.missing })}</span
				>
			{/if}
		</span>
	</RowCard>
</div>
