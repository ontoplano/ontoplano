<script lang="ts">
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
	<p class="text-sm text-gray-500">{t('finance.donut.empty')}</p>
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

		<ul class="min-w-0 flex-1 space-y-1">
			{#each slices as slice (slice.name)}
				<li class="flex items-center gap-2 text-sm">
					<span
						class="inline-block h-2.5 w-2.5 shrink-0 rounded-sm"
						style="background-color: {slice.color}"
					></span>
					<span class="min-w-0 flex-1 truncate text-gray-700">{slice.name}</span>
					<span class="shrink-0 text-xs text-gray-500 tabular-nums">
						{Math.round(slice.share * 100)}%
					</span>
					<span class="w-24 shrink-0 text-right text-gray-900 tabular-nums">
						{formatMoney(slice.outCents, currency)}
					</span>
				</li>
			{/each}
		</ul>
	</div>
{/if}
