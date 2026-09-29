<script lang="ts">
	import { routeGlyph } from '$lib/glyphs';
	import Picker from '$lib/components/Picker.svelte';
	import { monthOf } from '$lib/when';
	import { useWhen } from '$lib/when-context.svelte';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import CategoryMark from '$lib/components/CategoryMark.svelte';
	import CategoryDonut from '$lib/components/CategoryDonut.svelte';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import RoomSurface from '$lib/components/RoomSurface.svelte';
	import Card from '$lib/components/Card.svelte';
	import MonthBars from '$lib/components/MonthBars.svelte';
	import StatTiles from '$lib/components/StatTiles.svelte';
	import { formatMoney, type Currency } from '$lib/money';
	import type { PageServerData } from './$types';
	import { useT } from '$lib/i18n';

	const t = useT();
	const now = useWhen();

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

	/** A month as words, with its year: "Aug 2026". */
	const monthName = (key: string) => monthOf(key, now(), { year: 'numeric' });

	const biggest = $derived(data.byCategory.categories[0] ?? null);
	const dearest = $derived([...data.totals].sort((a, b) => b.outCents - a.outCents)[0] ?? null);
	const spent = $derived(data.totals.reduce((n, m) => n + m.outCents, 0));
	const monthsWithSpending = $derived(data.totals.filter((m) => m.outCents > 0).length);
</script>

{#snippet biggestPill()}
	<!-- The category wears its colour as a pill, never as tinted text. -->
	{#if biggest}<CategoryMark name={biggest.name} color={biggest.color} />{/if}
{/snippet}

<!--
	One surface: what is being looked at along its top, the three numbers worth
	knowing before any chart under it, then the charts as panes of the same
	object, two to a row where there is the width for two.
-->
<RoomSurface>
	{#snippet tools()}
		<div class="flex w-full flex-wrap items-center gap-2">
			<!-- Pickers rather than `<select>`s: these narrow what is on screen and
			     stand in a row of buttons. See `Picker`. -->
			<Picker
				value={String(data.ledgerId)}
				options={[
					{ value: '0', label: t('finance.insights.everyLedger') },
					...data.ledgers.map((l) => ({ value: String(l.id), label: l.name }))
				]}
				onpick={(next) => filter({ ledger: Number(next) })}
				label={t('finance.insights.everyLedger')}
			/>
			<Picker
				value={String(data.months)}
				options={WINDOWS.map((w) => ({
					value: String(w),
					label: t('finance.insights.lastMonths', { w })
				}))}
				onpick={(next) => filter({ months: Number(next) })}
				label={t('finance.insights.lastMonths', { w: data.months })}
			/>
		</div>
	{/snippet}

	{#if !anything}
		<EmptyState
			icon={routeGlyph('/finance/insights')!}
			title={t('finance.insights.nothingToReadYet')}
			description={t('finance.insights.importAStatementIntoA')}
		/>
	{:else}
		<!-- The three numbers worth knowing before any chart. -->
		<StatTiles
			tiles={[
				{
					label: t('finance.insights.spentPerMonthOnAverage'),
					value: money(monthsWithSpending ? Math.round(spent / monthsWithSpending) : 0),
					note: t('finance.insights.overMonthWithAny', {
						monthsWithSpending: monthsWithSpending,
						s: monthsWithSpending === 1 ? '' : 's'
					})
				},
				{
					label: t('finance.insights.dearestMonth'),
					value: dearest ? money(dearest.outCents) : '—',
					note: dearest ? monthName(dearest.month) : ''
				},
				{
					label: t('finance.insights.biggestCategory'),
					value: biggest ? money(biggest.totalCents) : '—',
					note: biggest ? biggestPill : ''
				}
			]}
		/>

		<!--
			Two charts of the months side by side where there is the width, then
			the window as one ring, then one tag. Each chart is as tall as what it
			draws — none is stretched to match a taller neighbour.
		-->
		<div class="grid grid-cols-1 border-b border-gray-200 lg:grid-cols-2">
			<Card
				title={t('finance.insights.inAndOut')}
				description={t('finance.insights.whatArrivedAgainstWhatLeft')}
				pane
			>
				<MonthBars
					months={data.totals.map((m) => m.month)}
					series={[
						{
							label: t('finance.insights.in'),
							values: data.totals.map((m) => m.inCents),
							fill: 'fill-blue-600'
						},
						{
							label: t('finance.insights.out'),
							values: data.totals.map((m) => m.outCents),
							fill: 'fill-red-500'
						}
					]}
					net={data.totals.map((m) => m.netCents)}
					legend
					label={t('streamChart.inAgainstOutByMonth', {
						inLabel: t('finance.insights.in'),
						outLabel: t('finance.insights.out')
					})}
					{currency}
				/>
			</Card>

			<Card
				title={t('finance.insights.whatEachMonthWasMade')}
				description={t('finance.insights.spendingStackedByCategory')}
				pane
				class="border-t border-gray-200 lg:border-t-0 lg:border-l"
			>
				<!-- The bands wear the categories' colours; the ring below is their legend. -->
				<MonthBars
					months={data.byCategory.months}
					series={data.byCategory.categories.map((c) => ({
						label: c.name,
						values: c.byMonth,
						color: c.color
					}))}
					stacked
					label={t('finance.stackedMonths.caption')}
					{currency}
				/>
			</Card>
		</div>

		<Card
			title={t('finance.insights.theWholeWindowByCategory')}
			description={t('finance.insights.theSameMoneyWithoutThe')}
			pane
			class="border-b border-gray-200"
		>
			<CategoryDonut slices={data.slices} {currency} />
		</Card>

		<!-- One tag at a time, on purpose: tags overlap, so a second one on the
		     same chart would count a line that carries both of them twice. -->
		<Card
			title={t('finance.insights.whatOneTagCosts')}
			description={data.tagSeries
				? t('finance.insights.inTotalAMonth', {
						totalCents: money(data.tagSeries.totalCents),
						averageCents: money(data.tagSeries.averageCents),
						activeMonths: data.tagSeries.activeMonths,
						s: data.tagSeries.activeMonths === 1 ? '' : 's'
					})
				: ''}
			pane
		>
			{#if !data.tagSeries}
				<p class="text-sm text-gray-500">
					{t('finance.insights.noTagsYet')}
					<a href={resolve('/finance/rules')} class="underline">{t('finance.insights.writeOne')}</a>
				</p>
			{:else}
				{@const series = data.tagSeries}
				<!-- Which tag, above what it draws: it narrows this chart and nothing else. -->
				<div class="controls-sm mb-3 flex items-center gap-2">
					<Picker
						value={data.tag ?? ''}
						options={data.tags.map((tag) => ({ value: tag.name, label: `#${tag.name}` }))}
						onpick={(next) => filter({ tag: next })}
						label={t('finance.insights.whatOneTagCosts')}
					/>
				</div>
				<MonthBars
					months={series.months}
					series={[{ label: `#${series.name}`, values: series.byMonth, color: series.color }]}
					average={series.averageCents}
					averageColor={series.color}
					label={t('finance.insights.monthlyCostOf', { name: series.name })}
					{currency}
				/>
			{/if}
		</Card>
	{/if}
</RoomSurface>
