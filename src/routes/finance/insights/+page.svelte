<script lang="ts">
	import { goto } from '$app/navigation';
	import Swatch from '$lib/components/Swatch.svelte';
	import { resolve } from '$app/paths';
	import CategoryDonut from '$lib/components/CategoryDonut.svelte';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import MonthlyBars from '$lib/components/MonthlyBars.svelte';
	import StackedMonths from '$lib/components/StackedMonths.svelte';
	import { formatMoney, type Currency } from '$lib/money';
	import type { PageServerData } from './$types';
	import { useT } from '$lib/i18n';

	const t = useT();

	let { data }: { data: PageServerData } = $props();

	const currency = $derived(data.currency as Currency);
	const money = (cents: number) => formatMoney(cents, currency);

	const anything = $derived(data.totals.some((m) => m.inCents || m.outCents));
	const WINDOWS = [3, 6, 12, 24];

	function filter(changes: { ledger?: number; months?: number; tag?: string }) {
		const params: [string, string][] = [];
		const ledger = changes.ledger ?? data.ledgerId;
		const months = changes.months ?? data.months;
		const tag = changes.tag ?? data.tag;
		if (ledger) params.push(['ledger', String(ledger)]);
		if (months !== 12) params.push(['months', String(months)]);
		if (tag) params.push(['tag', String(tag)]);
		// The path is resolved; the rule cannot see through the appended query.
		// eslint-disable-next-line svelte/no-navigation-without-resolve
		void goto(`${resolve('/finance/insights')}?${new URLSearchParams(params)}`, { noScroll: true });
	}

	/** The months a series covers, as words: "Oct 2025 – Sep 2026". */
	const monthName = (key: string) =>
		new Date(`${key}-15T12:00:00Z`).toLocaleString('en', {
			month: 'short',
			year: 'numeric',
			timeZone: 'UTC'
		});

	const biggest = $derived(data.byCategory.categories[0] ?? null);
	const dearest = $derived([...data.totals].sort((a, b) => b.outCents - a.outCents)[0] ?? null);
	const spent = $derived(data.totals.reduce((n, m) => n + m.outCents, 0));
	const monthsWithSpending = $derived(data.totals.filter((m) => m.outCents > 0).length);
</script>

<div class="space-y-5">
	<!-- What is being looked at. -->
	<div class="flex flex-wrap items-center gap-2">
		<select
			class="select select-sm w-auto"
			value={data.ledgerId}
			onchange={(e) => filter({ ledger: Number((e.currentTarget as HTMLSelectElement).value) })}
		>
			<option value={0}>{t('finance.insights.everyLedger')}</option>
			{#each data.ledgers as l (l.id)}<option value={l.id}>{l.name}</option>{/each}
		</select>
		<select
			class="select select-sm w-auto"
			value={data.months}
			onchange={(e) => filter({ months: Number((e.currentTarget as HTMLSelectElement).value) })}
		>
			{#each WINDOWS as w (w)}<option value={w}>{t('finance.insights.lastMonths', { w: w })}</option
				>{/each}
		</select>
		{#if data.totals.length > 0}
			<span class="text-xs text-gray-500">
				{monthName(data.totals[0].month)} – {monthName(data.totals[data.totals.length - 1].month)}
			</span>
		{/if}
	</div>

	{#if !anything}
		<EmptyState
			icon="wallet"
			title={t('finance.insights.nothingToReadYet')}
			description="Import a statement into a ledger and these come alive: what each month cost, where it went, and what any one tag adds up to."
		/>
	{:else}
		<!-- The three numbers worth knowing before any chart. -->
		<div class="grid gap-3 sm:grid-cols-3">
			<div class="rounded border border-gray-200 p-3">
				<div class="text-xs text-gray-500">{t('finance.insights.spentPerMonthOnAverage')}</div>
				<div class="text-lg font-semibold text-gray-900 tabular-nums">
					{money(monthsWithSpending ? Math.round(spent / monthsWithSpending) : 0)}
				</div>
				<div class="text-xs text-gray-500">
					{t('finance.insights.overMonthWithAny', {
						monthsWithSpending: monthsWithSpending,
						s: monthsWithSpending === 1 ? '' : 's'
					})}
				</div>
			</div>
			<div class="rounded border border-gray-200 p-3">
				<div class="text-xs text-gray-500">{t('finance.insights.dearestMonth')}</div>
				<div class="text-lg font-semibold text-gray-900 tabular-nums">
					{dearest ? money(dearest.outCents) : '—'}
				</div>
				<div class="text-xs text-gray-500">{dearest ? monthName(dearest.month) : ''}</div>
			</div>
			<div class="rounded border border-gray-200 p-3">
				<div class="text-xs text-gray-500">{t('finance.insights.biggestCategory')}</div>
				<div class="text-lg font-semibold tabular-nums" style="color: {biggest?.color ?? '#111'}">
					{biggest ? money(biggest.totalCents) : '—'}
				</div>
				<div class="text-xs text-gray-500">{biggest?.name ?? ''}</div>
			</div>
		</div>

		<section class="rounded border border-gray-200 p-4">
			<h2 class="mb-1 text-sm font-semibold text-gray-900">{t('finance.insights.inAndOut')}</h2>
			<p class="mb-3 text-xs text-gray-500">
				{t('finance.insights.whatArrivedAgainstWhatLeft')}
			</p>
			<MonthlyBars rows={data.totals} inLabel="In" outLabel="Out" {currency} />
		</section>

		<section class="rounded border border-gray-200 p-4">
			<h2 class="mb-1 text-sm font-semibold text-gray-900">
				{t('finance.insights.whatEachMonthWasMade')}
			</h2>
			<p class="mb-3 text-xs text-gray-500">
				{t('finance.insights.spendingStackedByCategory')}
			</p>
			<StackedMonths
				months={data.byCategory.months}
				categories={data.byCategory.categories}
				{currency}
			/>
			<div class="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs">
				{#each data.byCategory.categories as c (c.name)}
					<span class="flex items-center gap-1.5 text-gray-600">
						<Swatch color={c.color} shape="dot" />
						{c.name}
						<span class="text-gray-400 tabular-nums">{money(c.totalCents)}</span>
					</span>
				{/each}
			</div>
		</section>

		<section class="rounded border border-gray-200 p-4">
			<h2 class="mb-1 text-sm font-semibold text-gray-900">
				{t('finance.insights.theWholeWindowByCategory')}
			</h2>
			<p class="mb-3 text-xs text-gray-500">{t('finance.insights.theSameMoneyWithoutThe')}</p>
			<CategoryDonut slices={data.slices} {currency} />
		</section>

		<!-- One tag at a time, on purpose: tags overlap, so a second one on the
		     same chart would count a line that carries both of them twice. -->
		<section class="rounded border border-gray-200 p-4">
			<div class="mb-1 flex flex-wrap items-center gap-2">
				<h2 class="text-sm font-semibold text-gray-900">{t('finance.insights.whatOneTagCosts')}</h2>
				{#if data.tags.length > 0}
					<select
						class="select select-sm w-auto"
						value={data.tag}
						onchange={(e) => filter({ tag: (e.currentTarget as HTMLSelectElement).value })}
					>
						{#each data.tags as tag (tag.name)}<option value={tag.name}>#{tag.name}</option>{/each}
					</select>
				{/if}
			</div>

			{#if !data.tagSeries}
				<p class="text-sm text-gray-500">
					{t('finance.insights.noTagsYet')}
					<a href={resolve('/finance/rules')} class="underline">{t('finance.insights.writeOne')}</a>
				</p>
			{:else}
				{@const series = data.tagSeries}
				<p class="mb-3 text-xs text-gray-500">
					{t('finance.insights.inTotalAMonth', {
						totalCents: money(series.totalCents),
						averageCents: money(series.averageCents),
						activeMonths: series.activeMonths,
						s: series.activeMonths === 1 ? '' : 's'
					})}
				</p>
				{@const peak = Math.max(1, ...series.byMonth)}
				<!-- The average, drawn across, so a month reads as above or below it. -->
				{@const avgY = 140 - 128 * (series.averageCents / peak)}
				<div class="overflow-x-auto">
					<svg
						viewBox="0 0 680 170"
						class="w-full min-w-140"
						role="img"
						aria-label={t('finance.insights.monthlyCostOf', { name: series.name })}
					>
						<line
							x1="10"
							x2="670"
							y1={avgY}
							y2={avgY}
							stroke={series.color}
							stroke-dasharray="4 4"
							opacity="0.5"
						/>
						<text x="668" y={avgY - 4} text-anchor="end" class="fill-gray-500 text-[9px]"
							>{t('finance.insights.average', { averageCents: money(series.averageCents) })}</text
						>
						{#each series.months as month, i (month)}
							{@const slot = 660 / series.months.length}
							{@const cx = 10 + slot * i + slot / 2}
							{@const h = 128 * (series.byMonth[i] / peak)}
							<rect
								x={cx - Math.min(22, slot * 0.5) / 2}
								y={140 - h}
								width={Math.min(22, slot * 0.5)}
								height={h}
								fill={series.color}
								opacity={series.byMonth[i] > series.averageCents ? 1 : 0.65}
							>
								<title>{monthName(month)}: {money(series.byMonth[i])}</title>
							</rect>
							<text x={cx} y="154" text-anchor="middle" class="fill-gray-500 text-[10px]">
								{new Date(`${month}-15T12:00:00Z`).toLocaleString('en', {
									month: 'short',
									timeZone: 'UTC'
								})}
							</text>
							<text
								x={cx}
								y="165"
								text-anchor="middle"
								class="fill-gray-400 text-[9px]"
								style="font-variant-numeric: tabular-nums"
							>
								{series.byMonth[i] === 0 ? '' : money(series.byMonth[i])}
							</text>
						{/each}
					</svg>
				</div>
			{/if}
		</section>
	{/if}
</div>
