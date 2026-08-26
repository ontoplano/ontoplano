<script lang="ts">
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import Field from '$lib/components/Field.svelte';
	import FormError from '$lib/components/FormError.svelte';
	import FormGrid from '$lib/components/FormGrid.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import Modal from '$lib/components/Modal.svelte';
	import type { PageServerData, ActionData } from './$types';

	let { data, form }: { data: PageServerData; form: ActionData } = $props();

	let showForm = $state(false);
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

		if (e.key === 'Escape') showForm = false;
		if (e.key === 'n') {
			e.preventDefault();
			showForm = true;
		}
	}
</script>

<svelte:window onkeydown={handleKeydown} />

<div class="space-y-4">
	<div class="flex flex-wrap items-center justify-between gap-3">
		<h1 class="text-lg font-bold text-gray-900">Recipes</h1>
		<div class="flex flex-wrap items-center gap-2">
			{#if data.recipes.length > 0}
				<button onclick={() => (onlyMakeable = !onlyMakeable)} class="btn btn-sm">
					{onlyMakeable ? 'Show all' : 'What I can make now'}
				</button>
			{/if}
			<button onclick={() => (showForm = true)} class="btn btn-primary btn-sm">
				<Icon name="plus" /> New recipe
				<kbd class="border border-gray-600 bg-gray-800 px-1 text-xs">n</kbd>
			</button>
		</div>
	</div>

	<FormError message={form?.message} />

	{#if !data.hasFoodCategory}
		<!-- Without one, every ingredient field would refuse everything typed
		     into it, which is a worse first impression than a sentence. -->
		<div class="border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
			No shopping category holds food yet, so nothing can be an ingredient.
			<a href={resolve('/shopping')} class="underline">Tick one on the shopping list.</a>
		</div>
	{/if}

	{#if data.recipes.length === 0}
		<EmptyState
			icon="shopping"
			title="No recipes yet"
			description="Write one, put it on a day, and the shopping list fills itself with what it needs."
		>
			{#snippet action()}
				<button onclick={() => (showForm = true)} class="btn btn-primary">
					<Icon name="plus" /> New recipe
				</button>
			{/snippet}
		</EmptyState>
	{:else if visible.length === 0}
		<EmptyState icon="shopping" title="Nothing you can make right now">
			{#snippet action()}
				<button onclick={() => (onlyMakeable = false)} class="btn">Show all recipes</button>
			{/snippet}
		</EmptyState>
	{:else}
		<div class="gap-4 lg:columns-2 2xl:columns-3">
			{#each visible as recipe (recipe.id)}
				<a
					href={resolve('/kitchen/recipes/[id]', { id: String(recipe.id) })}
					class="lift mb-4 block break-inside-avoid border border-gray-200 bg-white p-4 shadow-card"
				>
					<span class="block text-sm font-medium text-gray-900">{recipe.title}</span>

					<span class="mt-1 flex flex-wrap items-center gap-2 text-xs text-gray-500">
						{#if recipe.minutes}<span class="tabular">{recipe.minutes} min</span>{/if}
						{#if recipe.servings}<span class="tabular">serves {recipe.servings}</span>{/if}
						<span class="tabular">{recipe.ingredients} ingredients</span>
					</span>

					<span class="mt-2 block text-xs">
						{#if recipe.ingredients === 0}
							<span class="text-gray-400">nothing in it yet</span>
						{:else if recipe.missing === 0}
							<span class="text-teal-700">you have everything</span>
						{:else}
							<span class="text-amber-700">
								missing {recipe.missing}
								{recipe.missing === 1 ? 'ingredient' : 'ingredients'}
							</span>
						{/if}
					</span>
				</a>
			{/each}
		</div>
	{/if}
</div>

<Modal bind:open={showForm} error={form?.message} title="New recipe" size="sm">
	<form id="recipe-form" method="post" action="?/create" use:enhance>
		<FormGrid>
			<Field label="What it is" span={12} required>
				<input name="title" required autocomplete="off" class="input" />
			</Field>
			<Field label="Serves" span={6}>
				<input name="servings" type="number" min="1" class="input" />
			</Field>
			<Field label="Minutes" span={6}>
				<input name="minutes" type="number" min="1" class="input" />
			</Field>
		</FormGrid>
	</form>

	{#snippet footer()}
		<button type="button" class="btn" onclick={() => (showForm = false)}>Cancel</button>
		<button type="submit" form="recipe-form" class="btn btn-primary">Create</button>
	{/snippet}
</Modal>
