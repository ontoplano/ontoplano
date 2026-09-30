<script lang="ts">
	import TabbedRoom from '$lib/components/TabbedRoom.svelte';
	import RoomSurface from '$lib/components/RoomSurface.svelte';
	import { resolve } from '$app/paths';
	import FilterBar from '$lib/components/FilterBar.svelte';
	import SearchField from '$lib/components/SearchField.svelte';
	import ShowingCount from '$lib/components/ShowingCount.svelte';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import { KIND_PLACES, MIN_QUERY, parseQuery } from '$lib/search';
	import { glyphFor, routeGlyph } from '$lib/glyphs';
	import Icon from '$lib/components/Icon.svelte';
	import type { PageServerData } from './$types';
	import { useT } from '$lib/i18n';

	const t = useT();

	let { data }: { data: PageServerData } = $props();

	const total = $derived(data.groups.reduce((n, g) => n + g.hits.length, 0));

	/** What was searched for, without its `todo:` / `in:` prefixes. */
	const needle = $derived(parseQuery(data.q).text.trim().toLowerCase());

	/** A line cut where it matches, so the match can be marked. */
	function pieces(text: string): { text: string; hit: boolean }[] {
		if (needle === '') return [{ text, hit: false }];
		const out: { text: string; hit: boolean }[] = [];
		const lower = text.toLowerCase();
		let from = 0;
		for (let at = lower.indexOf(needle); at !== -1; at = lower.indexOf(needle, from)) {
			if (at > from) out.push({ text: text.slice(from, at), hit: false });
			out.push({ text: text.slice(at, at + needle.length), hit: true });
			from = at + needle.length;
		}
		if (from < text.length) out.push({ text: text.slice(from), hit: false });
		return out;
	}
</script>

<!-- The words that matched, marked where they sit. -->
{#snippet marked(text: string)}
	{#each pieces(text) as piece, i (i)}{#if piece.hit}<mark class="search-hit">{piece.text}</mark
			>{:else}{piece.text}{/if}{/each}
{/snippet}

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
					<FilterBar name="search">
						{#snippet lead()}
							<SearchField
								name="q"
								value={data.q}
								label={t('search.anythingYouHaveWrittenDown')}
								autofocus
								data-tour="search-box"
							/>
						{/snippet}
						{#snippet count()}
							{#if total > 0}
								<ShowingCount
									{total}
									shown={total}
									said={(n) => t('search.resultsCount', { count: n })}
								/>
							{/if}
						{/snippet}
					</FilterBar>
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
										<span class="block text-sm text-gray-900">{@render marked(hit.title)}</span>
										{#if hit.snippet}
											<span class="mt-0.5 block text-xs text-gray-600"
												>{@render marked(hit.snippet)}</span
											>
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

	/* Ink and a grey wash rather than the browser's yellow: chrome stays
	   neutral, and the weight says it without the colour. */
	.search-hit {
		background-color: color-mix(in srgb, var(--color-gray-500) 22%, transparent);
		color: var(--color-gray-900);
		font-weight: 600;
	}

	.search-syntax {
		background-color: var(--color-gray-100);
		padding-inline: 0.25rem;
	}
</style>
