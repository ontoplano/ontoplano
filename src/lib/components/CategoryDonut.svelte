<script lang="ts">
	import EmptyState from '$lib/components/EmptyState.svelte';
	import CategoryMark from '$lib/components/CategoryMark.svelte';
	import { formatMoney, type Currency } from '$lib/money';
	import { useT } from '$lib/i18n';

	const t = useT();

	/**
	 * Where the money went, as one ring.
	 *
	 * Every outgoing line is in exactly one slice — uncategorized included —
	 * so the ring is the whole of what was spent rather than a sample of it.
	 * Each slice carries its category's own colour, the same one its rows
	 * wear in the list.
	 */
	let {
		slices,
		currency,
		total
	}: {
		slices: { name: string; color: string; outCents: number; share: number }[];
		currency: Currency;
		total?: number;
	} = $props();

	const RADIUS = 60;
	const THICKNESS = 22;
	const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

	const sum = $derived(total ?? slices.reduce((n, s) => n + s.outCents, 0));

	// Each slice is a dashed arc: its own length, then the rest of the ring
	// empty, rotated to start where the previous one ended.
	const arcs = $derived(
		slices.reduce<{ slice: (typeof slices)[number]; offset: number }[]>((out, slice) => {
			const before = out.reduce((n, a) => n + a.slice.share, 0);
			return [...out, { slice, offset: before }];
		}, [])
	);
</script>

{#if slices.length === 0}
	<EmptyState compact icon="wallet" title={t('finance.donut.empty')} />
{:else}
	<div class="flex flex-wrap items-center gap-6">
		<svg
			viewBox="0 0 160 160"
			class="h-40 w-40 shrink-0"
			role="img"
			aria-label={t('finance.donut.heading')}
		>
			<g transform="translate(80 80) rotate(-90)">
				{#each arcs as arc (arc.slice.name)}
					<circle
						r={RADIUS}
						fill="none"
						stroke={arc.slice.color}
						stroke-width={THICKNESS}
						stroke-dasharray="{arc.slice.share * CIRCUMFERENCE} {CIRCUMFERENCE}"
						stroke-dashoffset={-arc.offset * CIRCUMFERENCE}
					>
						<title>{arc.slice.name}: {formatMoney(arc.slice.outCents, currency)}</title>
					</circle>
				{/each}
			</g>
			<text
				x="80"
				y="78"
				text-anchor="middle"
				class="fill-gray-900 text-[13px] font-semibold"
				style="font-variant-numeric: tabular-nums"
			>
				{formatMoney(sum, currency)}
			</text>
			<text x="80" y="94" text-anchor="middle" class="fill-gray-500 text-[9px]"
				>{t('finance.donut.out')}</text
			>
		</svg>

		<!--
			The legend in columns as wide as a line of it needs, as many as the
			width holds — a single column across a wide card put each name half
			a screen from its amount. Under the ring when there is no room beside
			it, rather than a column of names cut to one letter.
		-->
		<ul class="min-w-56 flex-1 columns-[15rem] gap-x-8">
			{#each slices as slice (slice.name)}
				<li class="flex max-w-72 break-inside-avoid items-center gap-2 py-0.5 text-sm">
					<span class="flex min-w-0 flex-1"
						><CategoryMark name={slice.name} color={slice.color} /></span
					>
					<span class="w-9 shrink-0 text-right text-xs text-gray-500 tabular-nums">
						{Math.round(slice.share * 100)}%
					</span>
					<span class="w-20 shrink-0 text-right text-gray-900 tabular-nums">
						{formatMoney(slice.outCents, currency)}
					</span>
				</li>
			{/each}
		</ul>
	</div>
{/if}
