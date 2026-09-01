<script lang="ts">
	import { resolve } from '$app/paths';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import { MIN_QUERY } from '$lib/search';
	import type { PageServerData } from './$types';

	let { data }: { data: PageServerData } = $props();

	const total = $derived(data.groups.reduce((n, g) => n + g.hits.length, 0));
</script>

<svelte:head><title>Search · ontoplano</title></svelte:head>

<div class="space-y-4">
	<h1 class="text-lg font-bold text-gray-900">Search</h1>

	<!-- A plain GET form: the URL is the state, so a search can be linked to and
	     gone back to, and it works before any JavaScript has run. -->
	<form method="get" action={resolve('/search')}>
		<!-- svelte-ignore a11y_autofocus -->
		<input
			name="q"
			value={data.q}
			autofocus
			autocomplete="off"
			data-tour="search-box"
			placeholder="Anything you have written down"
			class="input"
			aria-label="Search"
		/>
		<!--
			The syntax, where somebody will meet it.

			A feature nobody is told about is a feature for the person who wrote it.
			Two examples cost one line and teach the whole thing.
		-->
		<p class="mt-1.5 text-xs text-gray-500">
			Narrow it: <code class="rounded bg-gray-100 px-1">todo:</code>,
			<code class="rounded bg-gray-100 px-1">goal:</code>,
			<code class="rounded bg-gray-100 px-1">note:</code> — or
			<code class="rounded bg-gray-100 px-1">in:kitchen</code> for one notebook.
		</p>
	</form>

	{#if data.q.trim().length < MIN_QUERY}
		<EmptyState
			icon="tag"
			title="What are you looking for?"
			description="Notes, diary entries, todos, blocks, goals, ideas, people, shopping and activities — all of it at once, or one kind at a time."
		/>
	{:else if total === 0}
		<EmptyState icon="tag" title="Nothing matches “{data.q}”" />
	{:else}
		<p class="text-xs text-gray-500">
			{total}
			{total === 1 ? 'result' : 'results'} for “{data.q}”
		</p>

		<div class="gap-4 lg:columns-2 2xl:columns-3">
			{#each data.groups as group (group.kind)}
				<section class="mb-4 break-inside-avoid border border-gray-200 bg-white shadow-card">
					<h2 class="eyebrow border-b border-gray-200 px-4 py-2 text-gray-500">
						{group.label}
						<span class="tabular ml-1 text-xs text-gray-500">{group.hits.length}</span>
					</h2>
					<div class="divide-y divide-gray-200">
						{#each group.hits as hit (`${hit.kind}-${hit.id}`)}
							<!-- The destination is built in `services/search.ts` from the row it
							     found, not typed here; `resolve()` has nothing to check. -->
							<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
							<a href={hit.href} class="block px-4 py-3 hover:bg-gray-50">
								<span class="block text-sm text-gray-900">{hit.title}</span>
								{#if hit.snippet}
									<span class="mt-0.5 block text-xs text-gray-500">{hit.snippet}</span>
								{/if}
							</a>
						{/each}
					</div>
				</section>
			{/each}
		</div>
	{/if}
</div>
