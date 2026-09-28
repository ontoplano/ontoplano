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
	import { enhance } from '$lib/enhance';
	import { armed } from '$lib/actions/armed';
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
		archivedAt?: string | null;
	};

	let {
		recipe,
		/** Put it on a day, without opening it first. Absent where there is no planner to hand. */
		onplan,
		/** Open the recipe's edit form. Absent where the screen has none. */
		onedit,
		/**
		 * Put away, brought back, and deleted — the last only once put away.
		 * Posts to the recipe room's own actions; absent where the screen does
		 * not mount them.
		 */
		manage = false
	}: {
		recipe: Shown;
		onplan?: (recipe: { id: number; title: string; minutes: number | null }) => void;
		onedit?: (id: number) => void;
		manage?: boolean;
	} = $props();

	const archived = $derived(Boolean(recipe.archivedAt));
	let confirmingDelete = $state(false);
</script>

<!--
	The card a task is drawn on — `RowCard`: the picture where a task has its
	tick, the words beside it, the verbs along the foot. The whole card opens
	the recipe; the name carries the link and stretches it over the card, and
	the actions sit above it.
-->
<div class="row-card relative transition-colors hover:bg-gray-50">
	<RowCard>
		{#snippet rail()}
			<!--
				The picture, when there is one: a cookbook you recognise by sight
				rather than by reading forty titles. The rail's own width, whatever
				the picture's shape, and the same square empty without one, so every
				name starts where a task's does.
			-->
			{#if recipe.mainPicture}
				<img
					src="/media/{recipe.mainPicture}"
					alt=""
					loading="lazy"
					class="block size-8 shrink-0 border border-gray-200 bg-white object-cover"
				/>
			{:else}
				<span
					class="flex size-8 shrink-0 items-center justify-center border border-gray-200 bg-gray-50 text-gray-500"
					aria-hidden="true"
				>
					<Icon name="utensils" size={14} />
				</span>
			{/if}
		{/snippet}

		{#snippet labels()}
			<!-- What the cupboard says, on the foot line beside the verbs. -->
			<span class="text-xs">
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
		{/snippet}

		{#snippet controls()}
			<!--
				Putting a recipe on a day, without opening it first.

				This is the whole of what the Meals tab used to be for, in the place a
				recipe is already being looked at. Above the card's own link rather
				than inside it, because a button inside an anchor is neither.
			-->
			{#if onplan && !archived}
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
			{#if onedit}
				<button
					type="button"
					onclick={() => onedit(recipe.id)}
					title={t('ui.edit')}
					aria-label={t('ui.edit')}
					class="icon-btn relative z-10"
				>
					<Icon name="edit" />
				</button>
			{/if}
			{#if manage}
				<!-- Away and back, without asking: nothing is lost either way. -->
				<form method="post" action="?/setArchived" use:enhance class="relative z-10">
					<input type="hidden" name="id" value={recipe.id} />
					<input type="hidden" name="archived" value={archived ? 'false' : 'true'} />
					<button
						type="submit"
						class="icon-btn"
						title={archived ? t('todoRows.takeItBackOut') : t('finance.ledgers.putItAway')}
						aria-label={archived ? t('todoRows.takeItBackOut') : t('finance.ledgers.putItAway')}
					>
						<Icon name={archived ? 'undo' : 'archive'} />
					</button>
				</form>
				<!-- Deleting is for a recipe already put away. -->
				{#if archived}
					{#if confirmingDelete}
						<form method="post" action="?/delete" use:enhance class="relative z-10">
							<input type="hidden" name="id" value={recipe.id} />
							<button type="submit" class="btn btn-sm btn-danger" use:armed>
								{t('todoRows.confirm')}
							</button>
						</form>
						<button
							type="button"
							onclick={() => (confirmingDelete = false)}
							class="btn btn-sm relative z-10"
						>
							{t('ui.cancel')}
						</button>
					{:else}
						<button
							type="button"
							onclick={() => (confirmingDelete = true)}
							title={t('ui.delete')}
							aria-label={t('ui.delete')}
							class="icon-btn icon-btn-danger relative z-10"
						>
							<Icon name="trash" />
						</button>
					{/if}
				{/if}
			{/if}
		{/snippet}

		<a
			href={resolve('/health/recipes/[id]', { id: String(recipe.id) })}
			class="text-sm leading-snug font-medium break-words after:absolute after:inset-0 {archived
				? 'text-gray-500'
				: 'text-gray-900'}">{recipe.title}</a
		>

		<span class="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-gray-500">
			{#if archived}<span class="eyebrow text-gray-600">{t('todoRows.archived')}</span>{/if}
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
	</RowCard>
</div>
