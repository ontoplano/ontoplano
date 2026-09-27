<script lang="ts">
	import RoomSurface from '$lib/components/RoomSurface.svelte';
	import FilterBar from '$lib/components/FilterBar.svelte';
	import SearchField from '$lib/components/SearchField.svelte';
	import ShowingCount from '$lib/components/ShowingCount.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import { routeGlyph } from '$lib/glyphs';
	import { useWhen } from '$lib/when-context.svelte';
	import { dayOf } from '$lib/when';
	import { resolve } from '$app/paths';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import type { PageServerData } from './$types';
	import { useT } from '$lib/i18n';

	const t = useT();
	const now = useWhen();

	let { data }: { data: PageServerData } = $props();

	/** What the search box holds: weeks whose note contains it. */
	let looking = $state('');
	const shownWeeks = $derived.by(() => {
		const needle = looking.trim().toLowerCase();
		if (!needle) return data.weeks;
		return data.weeks.filter((one) => one.note.toLowerCase().includes(needle));
	});

	/**
	 * A year, a week at a time.
	 *
	 * The weekly note was reachable only from the week it belonged to, so the
	 * one running account this app keeps was write-only — and a thing you write
	 * and never see again is a thing you stop writing. Newest first, each one
	 * linked back to the week it is about.
	 */
	function weekLabel(weekStart: string): string {
		// Arithmetic on a string, not on a Date somebody could mutate: the seven
		// days of a week are fixed and this only has to name two of them.
		const monday = new Date(`${weekStart}T00:00:00Z`);
		const sunday = new Date(monday.getTime() + 6 * 86_400_000);
		// Built out of UTC parts above, so it is read as UTC here too.
		const short = (d: Date) => dayOf(d, { ...now(), tz: 'UTC' });
		return `${short(monday)} – ${short(sunday)} ${sunday.getUTCFullYear()}`;
	}
</script>

<svelte:head><title>{t('notebooks.weekly.weeklyNotesOntoplano')}</title></svelte:head>

<!--
	No second heading: the room's name is above and the Weekly notes tab is
	lit, so a page saying it again said it three times.
-->
<!--
	One surface, and a week is a row on it — the search and the count along
	its top, the way a notebook's Notes tab opens.
-->
<RoomSurface accent="var(--section-accent)">
	{#snippet tools()}
		{#if data.weeks.length > 0}
			<FilterBar name="weekly">
				{#snippet lead()}
					<SearchField bind:value={looking} label={t('notebooks.weekly.searchTheWeeks')} />
				{/snippet}
				{#snippet count()}
					<ShowingCount
						total={data.weeks.length}
						shown={shownWeeks.length}
						said={(count) => t('notebooks.weekly.showingCount', { count })}
					/>
				{/snippet}
			</FilterBar>
		{/if}
	{/snippet}
	{#if data.weeks.length === 0}
		<EmptyState
			icon={routeGlyph('/notebooks/weekly')!}
			title={t('notebooks.weekly.nothingWrittenYet')}
			description={t('notebooks.weekly.everyWeekYouWriteAbout')}
		/>
	{:else if shownWeeks.length === 0}
		<EmptyState icon="search" title={t('todoRows.nothingToShow')} />
	{:else}
		<div class="divide-y divide-gray-200">
			{#each shownWeeks as week (week.weekStart)}
				<article class="list-row items-start">
					<div class="list-row-main min-w-0">
						<h2 class="text-sm font-medium text-gray-900">{weekLabel(week.weekStart)}</h2>
						<!-- The note as it was typed: paragraphs stay paragraphs. -->
						<p class="mt-1 text-sm whitespace-pre-wrap text-gray-900">{week.note}</p>
					</div>
					<div class="list-row-actions flex-none">
						<a
							href="{resolve('/tasks/review')}?week={week.weekStart}"
							class="icon-btn"
							title={t('notebooks.weekly.openThatWeek')}
							aria-label={t('notebooks.weekly.openThatWeek')}
						>
							<Icon name="arrow-right" />
						</a>
					</div>
				</article>
			{/each}
		</div>
	{/if}
</RoomSurface>
