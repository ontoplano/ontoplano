<script lang="ts">
	import { resolve } from '$app/paths';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import type { PageServerData } from './$types';
	import { useT } from '$lib/i18n';

	const t = useT();

	let { data }: { data: PageServerData } = $props();

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
		const short = (d: Date) =>
			d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
		return `${short(monday)} – ${short(sunday)} ${sunday.getUTCFullYear()}`;
	}
</script>

<svelte:head><title>{t('notebooks.weekly.weeklyNotesOntoplano')}</title></svelte:head>

<!--
	No second heading: the room's name is above and the Weekly notes tab is
	lit, so a page saying it again said it three times.
-->
<div class="space-y-4">
	{#if data.weeks.length === 0}
		<div class="border border-gray-200 bg-white shadow-sm">
			<EmptyState
				icon="note"
				title={t('notebooks.weekly.nothingWrittenYet')}
				description="Every week you write about in the review shows up here."
			/>
		</div>
	{:else}
		<!--
			One surface, and a week is a row on it.

			Each week used to be a card of its own with its own accent edge, so a
			year of writing was a column of boxes with a strip of page between
			every two — and on a phone, where a card bleeds to both screen edges,
			twelve accent bars stacked up the side with gaps between them. The
			same shape the diary and the to-do list already have: one bordered
			surface, a hairline between rows, and the accent on the surface
			rather than on each row of it.
		-->
		<div
			class="card-accent divide-y divide-gray-200 border border-gray-200 bg-white shadow-card"
			style="--card-accent: var(--section-accent)"
		>
			{#each data.weeks as week (week.weekStart)}
				<article class="p-4">
					<h2 class="mb-2 text-sm font-semibold text-gray-900">{weekLabel(week.weekStart)}</h2>
					<!-- The note as it was typed: paragraphs stay paragraphs. -->
					<p class="text-sm whitespace-pre-wrap text-gray-900">{week.note}</p>
					<div class="mt-2">
						<a
							href="{resolve('/tasks/review')}?week={week.weekStart}"
							class="text-xs text-gray-500 hover:text-gray-900 hover:underline"
						>
							{t('notebooks.weekly.openThatWeek')}
						</a>
					</div>
				</article>
			{/each}
		</div>
	{/if}
</div>
