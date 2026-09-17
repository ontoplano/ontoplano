<script lang="ts">
	import { formatMoney, type Currency } from '$lib/money';
	import { useT } from '$lib/i18n';

	const t = useT();

	/**
	 * Twelve months of money in against money out, drawn as paired bars with
	 * the net written under each pair. Blue for in, red for out — a
	 * difference in hue, never only in position, and never green against red.
	 */
	let {
		rows,
		inLabel,
		outLabel,
		currency
	}: {
		rows: { month: string; inCents: number; outCents: number; netCents: number }[];
		inLabel: string;
		outLabel: string;
		currency: Currency;
	} = $props();

	const W = 640;
	const H = 180;
	const PAD = 8;

	const peak = $derived(Math.max(1, ...rows.map((r) => Math.max(r.inCents, r.outCents))));
	const slot = $derived((W - PAD * 2) / Math.max(1, rows.length));
	const barWidth = $derived(Math.min(18, slot / 2 - 2));

	/**
	 * Money under every column only fits while the columns are wide. Past
	 * half a year the strings collide into a smear, so the number goes to
	 * the tooltip and the month keeps its label.
	 */
	const labelAmounts = $derived(rows.length <= 6);

	const monthLabel = (key: string) =>
		new Date(`${key}-15T12:00:00Z`).toLocaleString('en', { month: 'short', timeZone: 'UTC' });
	const y = (cents: number) => (H - 24) * (cents / peak);
	const money = (cents: number) => formatMoney(cents, currency);
</script>

<div class="overflow-x-auto">
	<svg
		viewBox="0 0 {W} {H}"
		class="w-full min-w-120"
		style="max-height: 210px"
		role="img"
		aria-label={t('streamChart.inAgainstOutByMonth', { inLabel, outLabel })}
	>
		{#each [0.25, 0.5, 0.75, 1] as line (line)}
			<line
				x1={PAD}
				x2={W - PAD}
				y1={H - 24 - (H - 24) * line}
				y2={H - 24 - (H - 24) * line}
				class="stroke-gray-100"
			/>
		{/each}
		{#each rows as r, i (r.month)}
			{@const cx = PAD + slot * i + slot / 2}
			<rect
				x={cx - barWidth - 1}
				y={H - 24 - y(r.inCents)}
				width={barWidth}
				height={y(r.inCents)}
				class="fill-blue-600"
			>
				<title>{monthLabel(r.month)}: {inLabel} {money(r.inCents)}</title>
			</rect>
			<rect
				x={cx + 1}
				y={H - 24 - y(r.outCents)}
				width={barWidth}
				height={y(r.outCents)}
				class="fill-red-500"
			>
				<title>{monthLabel(r.month)}: {outLabel} {money(r.outCents)}</title>
			</rect>
			<text x={cx} y={H - 12} text-anchor="middle" class="fill-gray-500 text-[10px]">
				{monthLabel(r.month)}
			</text>
			{#if labelAmounts}
				<text
					x={cx}
					y={H - 1}
					text-anchor="middle"
					class="text-[9px] {r.netCents >= 0 ? 'fill-blue-700' : 'fill-red-600'}"
					style="font-variant-numeric: tabular-nums"
				>
					{r.netCents === 0 ? '' : money(r.netCents)}
				</text>
			{/if}
		{/each}
	</svg>
	<div class="mt-1 flex items-center gap-4 text-xs text-gray-500">
		<span class="flex items-center gap-1">
			<span class="inline-block h-2 w-2 rounded-sm bg-blue-600"></span>
			{inLabel}
		</span>
		<span class="flex items-center gap-1">
			<span class="inline-block h-2 w-2 rounded-sm bg-red-500"></span>
			{outLabel}
		</span>
		<span class="ml-auto">{t('finance.monthlyBars.caption')}</span>
	</div>
</div>
