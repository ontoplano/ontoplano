<script lang="ts">
	import { monthOf } from '$lib/when';
	import { useWhen } from '$lib/when-context.svelte';
	import { formatMoney, type Currency } from '$lib/money';
	import { compactMoney, niceTicks } from '$lib/chart-scale';
	import { useT } from '$lib/i18n';

	const t = useT();
	const now = useWhen();

	/**
	 * Money by month, as bars: every chart in Insights.
	 *
	 * Three charts were three hand-drawn SVGs — paired in/out bars, a stack
	 * by category, one tag's cost — each with its own geometry, none with a
	 * scale up the side, all drawn into a fixed viewBox and then shrunk. On a
	 * phone that shrank the words to five pixels, so each chart was given a
	 * minimum width and a scroll box of its own, which opened on the oldest
	 * months: empty, on most accounts.
	 *
	 * So the chart is drawn at the width it actually has. Text stays its real
	 * size; the columns get narrower; month names thin out to every other one
	 * before they collide; and only when a column would be too thin to see are
	 * the oldest months left out, which the caption then says. Nothing scrolls
	 * inside the page.
	 *
	 * `series` side by side, or `stacked` on top of each other. Blue for in and
	 * red for out is the caller's choice (`fill`); a category's own colour is
	 * `color`.
	 */
	type Series = {
		label: string;
		values: number[];
		/** A colour somebody picked — a category's. */
		color?: string;
		/** A class from the palette, which follows the theme — in and out. */
		fill?: string;
	};

	let {
		months,
		series,
		stacked = false,
		net,
		average,
		averageColor,
		legend = false,
		label,
		currency
	}: {
		/** 'YYYY-MM', oldest first. */
		months: string[];
		series: Series[];
		stacked?: boolean;
		/** A signed amount written under each month — in minus out. */
		net?: number[];
		/** A level drawn across, so a month reads as above or below it. */
		average?: number;
		averageColor?: string;
		/** Name the series under the chart. Off where another chart's legend already does. */
		legend?: boolean;
		label: string;
		currency: Currency;
	} = $props();

	/* The frame, in real pixels. */
	const HEIGHT = 200;
	const TOP = 8;
	const LEFT = 48;
	const RIGHT = 8;
	/** Room under the floor for the month's name, and for the net when it is there. */
	const UNDER_NAME = 20;
	const UNDER_NET = 34;
	/** Drawn at this width until the page has measured the real one. */
	const FALLBACK_WIDTH = 640;
	/** Narrower than this and a column is a hairline: the oldest months go instead. */
	const MIN_SLOT = 14;
	/** A month's name needs about this much, so a narrower column names every other one. */
	const NAME_SLOT = 32;
	/** And the net under it needs this much, or it is not written at all. */
	const NET_SLOT = 46;
	/** The widest a column's bars get, however wide the chart. */
	const MAX_GROUP = 44;
	const GAP = 2;

	let width = $state(0);
	const W = $derived(width || FALLBACK_WIDTH);
	const plotWidth = $derived(Math.max(1, W - LEFT - RIGHT));

	/** How many of the newest months fit. */
	const fits = $derived(Math.max(1, Math.floor(plotWidth / MIN_SLOT)));
	const from = $derived(Math.max(0, months.length - fits));
	const shown = $derived(months.slice(from));
	const slot = $derived(plotWidth / Math.max(1, shown.length));
	const nameEvery = $derived(Math.max(1, Math.ceil(NAME_SLOT / slot)));
	const writeNet = $derived(!!net && slot >= NET_SLOT);
	const FLOOR = $derived(HEIGHT - (writeNet ? UNDER_NET : UNDER_NAME));

	const valueAt = (s: Series, i: number) => s.values[from + i] ?? 0;
	const columnPeak = (i: number) =>
		stacked
			? series.reduce((n, s) => n + valueAt(s, i), 0)
			: Math.max(0, ...series.map((s) => valueAt(s, i)));

	const ticks = $derived(niceTicks(Math.max(average ?? 0, ...shown.map((_, i) => columnPeak(i)))));
	const top = $derived(Math.max(1, ticks[ticks.length - 1]));
	const y = (cents: number) => FLOOR - (FLOOR - TOP) * (cents / top);

	const group = $derived(Math.min(MAX_GROUP, slot * 0.7));
	const barWidth = $derived(
		stacked ? group : Math.max(1, (group - GAP * (series.length - 1)) / series.length)
	);

	const name = (key: string) => monthOf(key, now());
	const longName = (key: string) => monthOf(key, now(), { year: 'numeric' });
	const money = (cents: number) => formatMoney(cents, currency);
</script>

<div bind:clientWidth={width}>
	<svg
		viewBox="0 0 {W} {HEIGHT}"
		width="100%"
		height={HEIGHT}
		class="block overflow-visible"
		role="img"
		aria-label={label}
	>
		<!-- The scale: a rule per step, and its value at the left. -->
		{#each ticks as tick (tick)}
			<line
				x1={LEFT}
				x2={W - RIGHT}
				y1={y(tick)}
				y2={y(tick)}
				class={tick === 0 ? 'stroke-gray-300' : 'stroke-gray-100'}
			/>
			<text x={LEFT - 6} y={y(tick) + 3} text-anchor="end" class="tabular fill-gray-500 text-[10px]"
				>{compactMoney(tick, currency)}</text
			>
		{/each}

		{#each shown as month, i (month)}
			{@const cx = LEFT + slot * i + slot / 2}
			{#if stacked}
				{#each series as s, si (s.label)}
					{@const below = series.slice(0, si).reduce((n, o) => n + valueAt(o, i), 0)}
					{@const cents = valueAt(s, i)}
					{#if cents > 0}
						<rect
							x={cx - barWidth / 2}
							y={y(below + cents)}
							width={barWidth}
							height={y(below) - y(below + cents)}
							fill={s.color}
							class={s.fill}
						>
							<title>{longName(month)} · {s.label}: {money(cents)}</title>
						</rect>
					{/if}
				{/each}
			{:else}
				{#each series as s, si (s.label)}
					{@const cents = valueAt(s, i)}
					<rect
						x={cx - group / 2 + si * (barWidth + GAP)}
						y={y(cents)}
						width={barWidth}
						height={FLOOR - y(cents)}
						fill={s.color}
						class={s.fill}
					>
						<title>{longName(month)} · {s.label}: {money(cents)}</title>
					</rect>
				{/each}
			{/if}

			{#if (shown.length - 1 - i) % nameEvery === 0}
				<!-- Counted from the newest, so the month that is now is always named. -->
				<text x={cx} y={FLOOR + 14} text-anchor="middle" class="fill-gray-500 text-[10px]">
					{name(month)}
				</text>
			{/if}
			{#if writeNet && net}
				{@const n = net[from + i] ?? 0}
				<text
					x={cx}
					y={FLOOR + 28}
					text-anchor="middle"
					class="tabular text-[10px] {n >= 0 ? 'fill-blue-700' : 'fill-gray-900'}"
				>
					{n === 0 ? '' : compactMoney(n, currency, { signed: true })}
					<title>{longName(month)}: {money(n)}</title>
				</text>
			{/if}
		{/each}

		{#if average !== undefined && average > 0}
			<line
				x1={LEFT}
				x2={W - RIGHT}
				y1={y(average)}
				y2={y(average)}
				stroke={averageColor ?? 'currentColor'}
				stroke-dasharray="4 4"
				class="text-gray-500"
			/>
		{/if}
	</svg>

	<!-- What the marks are, under the chart rather than over the bars. -->
	{#if legend || average || writeNet || from > 0}
		<div class="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-500">
			{#if legend}
				{#each series as s (s.label)}
					<span class="flex items-center gap-1.5">
						<svg width="10" height="10" aria-hidden="true" class="shrink-0">
							<rect width="10" height="10" fill={s.color} class={s.fill} />
						</svg>
						{s.label}
					</span>
				{/each}
			{/if}
			{#if average !== undefined && average > 0}
				<span class="flex items-center gap-1.5">
					<svg width="16" height="10" aria-hidden="true" class="shrink-0 text-gray-500">
						<line
							x1="0"
							x2="16"
							y1="5"
							y2="5"
							stroke={averageColor ?? 'currentColor'}
							stroke-width="2"
							stroke-dasharray="4 3"
						/>
					</svg>
					<span class="tabular"
						>{t('finance.insights.average', { averageCents: money(average) })}</span
					>
				</span>
			{/if}
			{#if writeNet}
				<span>{t('finance.monthlyBars.caption')}</span>
			{/if}
			{#if from > 0}
				<span class="ml-auto">
					{t('finance.monthBars.newest', { shown: shown.length, total: months.length })}
				</span>
			{/if}
		</div>
	{/if}
</div>
