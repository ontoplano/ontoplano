<script lang="ts">
	import { resolve } from '$app/paths';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import { formatMoney } from '$lib/money';
	import type { PageServerData } from './$types';

	let { data }: { data: PageServerData } = $props();

	const toBuy = $derived(data.needed.filter((n) => !n.inStock));
	const have = $derived(data.needed.filter((n) => n.inStock));
	const priced = $derived(toBuy.filter((n) => n.priceCents !== null));
	const totalCents = $derived(priced.reduce((sum, n) => sum + (n.priceCents ?? 0), 0));

	// Plain `Date` on purpose: these are read once and thrown away, never held
	// in state, so there is nothing for `SvelteDate` to make reactive.
	function dayName(iso: string): string {
		return new Date(`${iso}T12:00:00`).toLocaleDateString(undefined, {
			weekday: 'short',
			day: 'numeric',
			month: 'short'
		});
	}

	function shift(days: number): string {
		// eslint-disable-next-line svelte/prefer-svelte-reactivity
		const d = new Date(`${data.from}T12:00:00`);
		d.setDate(d.getDate() + days);
		return d.toISOString().slice(0, 10);
	}
</script>

<div class="space-y-4">
	<div class="flex flex-wrap items-center justify-between gap-3">
		<h1 class="text-lg font-bold text-gray-900">Meals</h1>
		<div class="flex items-center gap-2">
			<a href="{resolve('/kitchen/meals')}?from={shift(-7)}" class="btn btn-sm">&larr;</a>
			<a href={resolve('/kitchen/meals')} class="btn btn-sm">This week</a>
			<a href="{resolve('/kitchen/meals')}?from={shift(7)}" class="btn btn-sm">&rarr;</a>
			<a href={resolve('/kitchen/recipes')} class="btn btn-primary btn-sm">
				<Icon name="plus" /> From a recipe
			</a>
		</div>
	</div>

	<!-- Seven columns, because a week is the unit a shop is done in. -->
	<div class="grid gap-2 md:grid-cols-7">
		{#each data.days as day (day)}
			{@const onThisDay = data.meals.filter((m) => m.date === day)}
			<section
				class="border border-gray-200 bg-white p-3 shadow-card {day === data.today
					? 'ring-2 ring-gray-900 ring-inset'
					: ''}"
			>
				<h2 class="eyebrow text-gray-600">{dayName(day)}</h2>
				{#if onThisDay.length === 0}
					<p class="mt-2 text-xs text-gray-500">—</p>
				{:else}
					<ul class="mt-2 space-y-1">
						{#each onThisDay as meal (meal.id)}
							<li>
								<a
									href={resolve('/kitchen/recipes/[id]', { id: String(meal.recipeId) })}
									class="block text-sm text-gray-900 hover:underline"
								>
									{meal.title}
									<span class="tabular block text-xs text-gray-500">{meal.startTime}</span>
								</a>
							</li>
						{/each}
					</ul>
				{/if}
			</section>
		{/each}
	</div>

	{#if data.needed.length === 0}
		<EmptyState
			icon="utensils"
			title="No meals planned this week"
			description="Put a recipe on a day and what it needs turns up here, minus what is already in the cupboard."
		>
			{#snippet action()}
				<a href={resolve('/kitchen/recipes')} class="btn btn-primary">Pick a recipe</a>
			{/snippet}
		</EmptyState>
	{:else}
		<div class="grid gap-4 lg:grid-cols-2">
			<section class="border border-gray-200 bg-white shadow-card">
				<header
					class="flex flex-wrap items-center justify-between gap-2 border-b border-gray-200 px-4 py-3"
				>
					<h2 class="eyebrow text-gray-600">To buy</h2>
					{#if totalCents > 0}
						<span class="text-xs text-gray-500">
							about <span class="tabular font-medium text-gray-900"
								>{formatMoney(totalCents, data.currency)}</span
							>
							{#if priced.length < toBuy.length}
								<span class="text-gray-500">· {toBuy.length - priced.length} unpriced</span>
							{/if}
						</span>
					{/if}
				</header>

				{#if toBuy.length === 0}
					<p class="px-4 py-3 text-sm text-gray-500">Everything is in already.</p>
				{:else}
					<ul class="divide-y divide-gray-200">
						{#each toBuy as item (item.itemId)}
							<li class="px-4 py-2 text-sm">
								<span class="text-gray-900">{item.name}</span>
								{#if item.amounts.length > 0}
									<span class="tabular ml-2 text-xs text-gray-500">{item.amounts.join(', ')}</span>
								{/if}
								<span class="block text-xs text-gray-500">for {item.recipes.join(', ')}</span>
							</li>
						{/each}
					</ul>
					<p class="border-t border-gray-200 px-4 py-2 text-xs text-gray-500">
						These are already on the shopping list — anything not in the cupboard is.
					</p>
				{/if}
			</section>

			<section class="border border-gray-200 bg-white shadow-card">
				<header class="border-b border-gray-200 px-4 py-3">
					<h2 class="eyebrow text-gray-600">Already have</h2>
				</header>
				{#if have.length === 0}
					<p class="px-4 py-3 text-sm text-gray-500">Nothing yet.</p>
				{:else}
					<ul class="divide-y divide-gray-200">
						{#each have as item (item.itemId)}
							<li class="px-4 py-2 text-sm text-gray-500">
								{item.name}
								{#if item.amounts.length > 0}
									<span class="tabular ml-2 text-xs text-gray-500">{item.amounts.join(', ')}</span>
								{/if}
							</li>
						{/each}
					</ul>
				{/if}
			</section>
		</div>
	{/if}
</div>
