<script lang="ts">
	import { resolve } from '$app/paths';
	import Icon from '$lib/components/Icon.svelte';
	import { PAGE_TURN_DEFAULTS, PAGE_TURN_RANGES } from '$lib/page-turn';
	import { PAGE_TURN, keepPageTurn, resetPageTurn, runDissolve } from '$lib/page-turn.svelte';

	/*
	 * The dissolve, on this page, without going anywhere.
	 *
	 * A real turn only happens on a real navigation, and it is over in a
	 * quarter of a second — which is long enough to see that something
	 * happened and far too short to judge what. The two swatches below carry
	 * the same two filters the view transition puts on its snapshots, and
	 * pressing play slides the same threshold across them, so the grain and
	 * the hardness can be looked at for as long as it takes.
	 *
	 * It is the same `runDissolve`: the numbers cannot be right here and wrong
	 * in the app, because there is one of them.
	 */
	let playing = $state(false);
	function play() {
		playing = true;
		runDissolve();
		setTimeout(() => (playing = false), PAGE_TURN.durationMs + 60);
	}

	/*
	 * Somewhere to go and come back from.
	 *
	 * The turn only happens on a real navigation, so watching it means
	 * leaving this page — and the whole point is to change a number and
	 * immediately see the next one. Two links that bounce between this page
	 * and the dashboard are the shortest loop there is.
	 */
	const ROUND_TRIP = ['/', '/tasks/plan', '/notebooks/diary'] as const;

	const KNOBS = [
		{
			key: 'durationMs' as const,
			says: 'How long the whole turn takes. Under a hundred it is a blink; over four hundred you are waiting for it.'
		},
		{
			key: 'grain' as const,
			says: 'How fine the dots are. Higher is finer — much above one and it reads as film grain rather than ink.'
		},
		{
			key: 'hardness' as const,
			says: 'How hard each dot snaps on. Low leaves half-lit dots, which is a soft fade wearing texture; high is the e-reader.'
		}
	];

	const changed = $derived(KNOBS.some((k) => PAGE_TURN[k.key] !== PAGE_TURN_DEFAULTS[k.key]));
</script>

<svelte:head><title>The page turn</title></svelte:head>

<div class="space-y-4">
	<div class="flex items-baseline gap-3">
		<h1 class="text-lg font-bold text-gray-900">The page turn</h1>
		<span class="text-xs text-gray-500">not part of the app — dev and staging only</span>
	</div>

	<section class="rounded border border-gray-200 p-4">
		<p class="mb-4 text-sm text-gray-600">
			Move something, then go somewhere and come back. The numbers are kept in this browser, so they
			survive a reload and follow you around the app until you put them back.
		</p>

		<div class="space-y-5">
			{#each KNOBS as knob (knob.key)}
				{@const range = PAGE_TURN_RANGES[knob.key]}
				<label class="block">
					<span class="flex items-baseline justify-between gap-3">
						<span class="text-sm font-medium text-gray-900">{range.label}</span>
						<span class="font-mono text-sm text-gray-600 tabular-nums">
							{PAGE_TURN[knob.key]}{range.unit}
						</span>
					</span>
					<input
						type="range"
						class="mt-1 w-full"
						min={range.min}
						max={range.max}
						step={range.step}
						bind:value={PAGE_TURN[knob.key]}
						onchange={keepPageTurn}
					/>
					<span class="mt-1 block text-xs text-gray-500">{knob.says}</span>
				</label>
			{/each}
		</div>

		<div class="mt-5 flex flex-wrap items-center gap-2">
			{#each ROUND_TRIP as where (where)}
				<a class="btn btn-sm" href={resolve(where)}>
					<Icon name="chevron-right" />
					{where}
				</a>
			{/each}
			<button class="btn btn-sm ml-auto" type="button" disabled={!changed} onclick={resetPageTurn}>
				Back to {PAGE_TURN_DEFAULTS.durationMs}ms / {PAGE_TURN_DEFAULTS.grain} / {PAGE_TURN_DEFAULTS.hardness}
			</button>
		</div>
	</section>

	<!--
		What to put in the file once it feels right, so the answer is not
		trapped in one phone's local storage.
	-->
	<section class="rounded border border-gray-200 p-4">
		<div class="mb-3 flex flex-wrap items-baseline gap-3">
			<h2 class="text-sm font-semibold text-gray-900">What it looks like</h2>
			<p class="min-w-0 flex-1 text-xs text-gray-500">
				The same two filters the real turn uses, on two stacked panels. The one leaving breaks into
				dots; the one arriving fills the gaps they leave.
			</p>
			<button class="btn btn-sm" type="button" onclick={play} disabled={playing}>
				{playing ? 'turning…' : 'Play it'}
			</button>
		</div>

		<div class="relative h-44 overflow-hidden rounded border border-gray-200">
			<!-- Arriving, underneath. -->
			<div
				class="absolute inset-0 grid place-items-center bg-gray-900 text-lg font-semibold text-white"
				style="filter: url('#{PAGE_TURN_DEFAULTS.inFilter}')"
			>
				the screen arriving
			</div>
			<!-- Leaving, on top of it. -->
			<div
				class="absolute inset-0 grid place-items-center bg-gray-100 text-lg font-semibold text-gray-900"
				style="filter: url('#{PAGE_TURN_DEFAULTS.outFilter}')"
			>
				the screen leaving
			</div>
		</div>
	</section>

	<section class="rounded border border-gray-200 p-4">
		<h2 class="text-sm font-semibold text-gray-900">To keep it</h2>
		<p class="mt-1 mb-2 text-xs text-gray-500">
			In <code>src/lib/page-turn.ts</code>, as the defaults everybody gets.
		</p>
		<pre
			class="overflow-x-auto rounded bg-gray-50 p-3 font-mono text-xs text-gray-800">durationMs: {PAGE_TURN.durationMs},
grain: {PAGE_TURN.grain},
hardness: {PAGE_TURN.hardness},</pre>
	</section>
</div>
