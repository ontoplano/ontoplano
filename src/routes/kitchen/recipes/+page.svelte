<script lang="ts">
	import { getAction, keyFor } from '$lib/shortcuts';
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

	let { data, form }: { data: PageServerData; form: ActionData } = $props();

	let showForm = $state(false);
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

		if (e.key === 'Escape') showForm = false;
		if (getAction('/kitchen/recipes', e.key) === 'new') {
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
			<a href={resolve('/kitchen/meals')} class="btn btn-sm">This week's meals</a>
			{#if data.recipes.length > 0}
				<button onclick={() => (onlyMakeable = !onlyMakeable)} class="btn btn-sm">
					{onlyMakeable ? 'Show all' : 'What I can make now'}
				</button>
			{/if}
			<button
				onclick={() => (showForm = true)}
				class="btn btn-primary btn-sm"
				data-tour="recipe-new"
			>
				<Icon name="plus" /> New recipe
				<kbd class="border border-gray-600 bg-gray-800 px-1 text-xs"
					>{keyFor('/kitchen/recipes', 'new')}</kbd
				>
			</button>
		</div>
	</div>

	<FormError message={form?.message} />

	{#if !data.hasFoodCategory}
		<!-- Without one, every ingredient field would refuse everything typed
		     into it, which is a worse first impression than a sentence. -->
		<Banner kind="warning">
			No food category yet.
			<a href={resolve('/shopping')} class="underline">Tick one on the shopping list.</a>
		</Banner>
	{/if}

	{#if data.recipes.length === 0}
		<EmptyState
			icon="utensils"
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
		<EmptyState icon="utensils" title="Nothing you can make right now">
			{#snippet action()}
				<button onclick={() => (onlyMakeable = false)} class="btn">Show all recipes</button>
			{/snippet}
		</EmptyState>
	{:else}
		<div class="gap-4 lg:columns-2 2xl:columns-3" data-tour="recipe-list">
			{#each visible as recipe (recipe.id)}
				<a
					href={resolve('/kitchen/recipes/[id]', { id: String(recipe.id) })}
					class="lift mb-4 block break-inside-avoid border border-gray-200 bg-white p-4 shadow-card"
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
							class="mb-3 block size-[9.6rem] rounded-md border border-gray-200 bg-white object-cover"
						/>
					{/if}

					<span class="block text-sm font-medium text-gray-900">{recipe.title}</span>

					<span class="mt-1 flex flex-wrap items-center gap-2 text-xs text-gray-500">
						{#if recipe.minutes}<span class="tabular">{recipe.minutes} min</span>{/if}
						{#if recipe.servings}<span class="tabular">serves {recipe.servings}</span>{/if}
						<span class="tabular">{recipe.ingredients} ingredients</span>
					</span>

					<span class="mt-2 block text-xs">
						{#if recipe.ingredients === 0}
							<span class="text-gray-500">nothing in it yet</span>
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

<Modal bind:open={showForm} error={form?.message} title="New recipe">
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
			label="From a page"
			span={12}
			hint="On the recipe page: select all, copy, paste here. Its ingredients and method come with it."
		>
			<textarea
				name="page"
				rows="3"
				placeholder="Paste the page here"
				class="textarea font-mono text-xs"
			></textarea>
		</Field>
		<div class="mt-2 flex flex-wrap items-center gap-2">
			<input
				name="source"
				autocomplete="off"
				placeholder="Where it came from (optional)"
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
			<Field label="What it is" span={12} required>
				<input name="heading" required autocomplete="off" class="input" />
			</Field>
			<Field label="Serves" span={4}>
				<input autocomplete="off" name="servings" type="number" min="1" class="input" />
			</Field>
			<Field label="Minutes" span={4}>
				<input autocomplete="off" name="minutes" type="number" min="1" class="input" />
			</Field>
			<Field label="Where it came from" span={4}>
				<input name="source" autocomplete="off" class="input" />
			</Field>
			<Field
				label="Method"
				span={12}
				hint="Markdown: headings, lists, numbers. Ingredients come after."
			>
				<textarea name="method" rows="8" use:autogrow class="textarea"></textarea>
			</Field>
			<Field label="Notes" span={12}>
				<textarea name="notes" rows="2" class="textarea"></textarea>
			</Field>
		</FormGrid>
	</form>

	{#snippet footer()}
		<button type="button" class="btn" onclick={() => (showForm = false)}>Cancel</button>
		<button type="submit" form="recipe-form" class="btn btn-primary">Create</button>
	{/snippet}
</Modal>
