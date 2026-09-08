<script lang="ts">
	import { resolve } from '$app/paths';
	import Card from '$lib/components/Card.svelte';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import type { PageServerData } from './$types';

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

<svelte:head><title>Weekly notes · Ontoplano</title></svelte:head>

<div class="space-y-4">
	<h1 class="text-lg font-bold text-gray-900">Weekly notes</h1>

	{#if data.weeks.length === 0}
		<EmptyState
			icon="note"
			title="Nothing written yet"
			description="Every week you write about in the review shows up here."
		/>
	{:else}
		<div class="space-y-3">
			{#each data.weeks as week (week.weekStart)}
				<Card title={weekLabel(week.weekStart)} accent="var(--section-accent)">
					<!-- The note as it was typed: paragraphs stay paragraphs. -->
					<p class="text-sm whitespace-pre-wrap text-gray-900">{week.note}</p>
					<div class="mt-2">
						<a
							href="{resolve('/tasks/review')}?week={week.weekStart}"
							class="text-xs text-gray-500 hover:text-gray-900 hover:underline"
						>
							Open that week
						</a>
					</div>
				</Card>
			{/each}
		</div>
	{/if}
</div>
