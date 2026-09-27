<script lang="ts">
	import TabbedRoom from '$lib/components/TabbedRoom.svelte';
	import RoomSurface from '$lib/components/RoomSurface.svelte';
	import { resolve } from '$app/paths';
	import OneLine from '$lib/components/OneLine.svelte';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import { KIND_PLACES, MIN_QUERY } from '$lib/search';
	import { glyphFor, routeGlyph } from '$lib/glyphs';
	import Icon from '$lib/components/Icon.svelte';
	import type { PageServerData } from './$types';
	import { useT } from '$lib/i18n';

	const t = useT();

	let { data }: { data: PageServerData } = $props();

	const total = $derived(data.groups.reduce((n, g) => n + g.hits.length, 0));
</script>

<TabbedRoom title={t('ui.search')} label={t('ui.search')}>
	<div class="space-y-4">
		<!--
		The box and what it found, as one object.

		The field sat loose on the page ground and the results were a masonry of
		separate cards under it, each with its own border — the one screen whose
		answer did not look like any list in the app. It is a room surface now:
		the box along the top, then a band per kind with its rows under it, the
		same anatomy as the task list.
	-->
		<RoomSurface>
			{#snippet tools()}
				<!-- A plain GET form: the URL is the state, so a search can be linked to
			     and gone back to, and it works before any JavaScript has run. -->
				<form method="get" action={resolve('/search')} class="w-full">
					<OneLine
						name="q"
						placeholder={t('search.anythingYouHaveWrittenDown')}
						value={data.q}
						class="input"
						autofocus
						ariaLabel={t('ui.search')}
						dataTour="search-box"
					/>
					<!--
					The syntax, where somebody will meet it.

					A feature nobody is told about is a feature for the person who
					wrote it. Two examples cost one line and teach the whole thing.
				-->
					<p class="mt-1.5 text-xs text-gray-500">
						{t('search.narrowIt')} <code class="search-syntax">{t('search.todo')}</code>,
						<code class="search-syntax">{t('search.goal')}</code>,
						<code class="search-syntax">{t('search.note')}</code>
						{t('search.or')}
						<code class="search-syntax">{t('search.inKitchen')}</code>
						{t('search.forOneNotebook')}
					</p>
				</form>
			{/snippet}

			{#if data.q.trim().length < MIN_QUERY}
				<EmptyState
					icon={routeGlyph('/search')!}
					title={t('search.whatAreYouLookingFor')}
					description={t('search.notesDiaryEntriesTodosBlocks')}
				/>
			{:else if total === 0}
				<EmptyState icon="search" title={t('search.nothingMatches', { q: data.q })} />
			{:else}
				<p class="tabular border-b border-gray-200 px-4 py-2 text-xs text-gray-500">
					{t('search.resultsFor', { count: total, q: data.q })}
				</p>
				{#each data.groups as group (group.kind)}
					<section class="search-group">
						<h2
							class="section-tint eyebrow flex items-center gap-1.5 border-b border-gray-200 px-4 py-2 text-gray-600"
						>
							<Icon name={glyphFor(KIND_PLACES[group.kind])!} size={12} />
							{t(group.label)}
							<span class="tabular ml-auto text-xs text-gray-500">{group.hits.length}</span>
						</h2>
						<div class="divide-y divide-gray-200">
							{#each group.hits as hit (`${hit.kind}-${hit.id}`)}
								<!-- The destination is built in `services/search.ts` from the row it
							     found, not typed here; `resolve()` has nothing to check. -->
								<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
								<a href={hit.href} class="list-row hover:bg-gray-50">
									<span class="list-row-main">
										<span class="block text-sm text-gray-900">{hit.title}</span>
										{#if hit.snippet}
											<span class="mt-0.5 block text-xs text-gray-500">{hit.snippet}</span>
										{/if}
									</span>
									<Icon name="chevron-right" size={14} class="shrink-0 text-gray-500" />
								</a>
							{/each}
						</div>
					</section>
				{/each}
			{/if}
		</RoomSurface>
	</div>
</TabbedRoom>

<style>
	/* Bands inside the surface are part of it: square in either style. */
	.search-group,
	.search-group > h2 {
		border-radius: 0 !important;
	}

	.search-group + .search-group {
		border-top: 1px solid var(--color-gray-200);
	}

	.search-syntax {
		background-color: var(--color-gray-100);
		padding-inline: 0.25rem;
	}
</style>
