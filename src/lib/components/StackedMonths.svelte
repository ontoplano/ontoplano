<script lang="ts">
	import { formatMoney, type Currency } from '$lib/money';

	/**
	 * A month is a column, and each category is a band in it.
	 *
	 * Stacked rather than grouped: the question this answers is "what did
	 * the month cost, and of what", and a stack says both at once. The bands
	 * keep their categories' colours, so the legend is the ring's legend.
	 */
	let {
		months,
		categories,
		currency
	}: {
		months: string[];
		categories: { name: string; color: string; byMonth: number[] }[];
		currency: Currency;
	} = $props();

	const W = 680;
	const H = 200;
	const PAD = 10;
	const FLOOR = H - 26;

	const monthTotals = $derived(
		months.map((_, i) => categories.reduce((n, c) => n + (c.byMonth[i] ?? 0), 0))
	);
	const peak = $derived(Math.max(1, ...monthTotals));
	const slot = $derived((W - PAD * 2) / Math.max(1, months.length));
	const barWidth = $derived(Math.min(34, slot * 0.62));

	/** The same rule the in/out chart uses: numbers under wide columns only. */
	const labelAmounts = $derived(months.length <= 6);

	const label = (key: string) =>
		new Date(`${key}-15T12:00:00Z`).toLocaleString('en', { month: 'short', timeZone: 'UTC' });
	const height = (cents: number) => (FLOOR - 6) * (cents / peak);
</script>

<div class="overflow-x-auto">
	<svg
		viewBox="0 0 {W} {H}"
		class="w-full min-w-140"
		style="max-height: 230px"
		role="img"
		aria-label="Spending by category, by month"
	>
		{#each [0.25, 0.5, 0.75, 1] as line (line)}
			<line
				x1={PAD}
				x2={W - PAD}
				y1={FLOOR - (FLOOR - 6) * line}
				y2={FLOOR - (FLOOR - 6) * line}
				class="stroke-gray-100"
			/>
		{/each}

		{#each months as month, i (month)}
			{@const cx = PAD + slot * i + slot / 2}
			{#each categories as category, ci (category.name)}
				{@const below = categories.slice(0, ci).reduce((n, c) => n + (c.byMonth[i] ?? 0), 0)}
				{@const cents = category.byMonth[i] ?? 0}
				{#if cents > 0}
					<rect
						x={cx - barWidth / 2}
						y={FLOOR - height(below) - height(cents)}
						width={barWidth}
						height={height(cents)}
						fill={category.color}
					>
						<title>{label(month)} · {category.name}: {formatMoney(cents, currency)}</title>
					</rect>
				{/if}
			{/each}
			<text x={cx} y={FLOOR + 14} text-anchor="middle" class="fill-gray-500 text-[10px]">
				{label(month)}
			</text>
			{#if labelAmounts}
				<text
					x={cx}
					y={FLOOR + 25}
					text-anchor="middle"
					class="fill-gray-400 text-[9px]"
					style="font-variant-numeric: tabular-nums"
				>
					{monthTotals[i] === 0 ? '' : formatMoney(monthTotals[i], currency)}
				</text>
			{/if}
		{/each}
	</svg>
</div>
