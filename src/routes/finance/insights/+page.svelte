<script lang="ts">
	import { routeGlyph } from '$lib/glyphs';
	import Picker from '$lib/components/Picker.svelte';
	import { monthOf } from '$lib/when';
	import { useWhen } from '$lib/when-context.svelte';
	import { goto } from '$app/navigation';
	import CategoryMark from '$lib/components/CategoryMark.svelte';
	import { resolve } from '$app/paths';
	import CategoryDonut from '$lib/components/CategoryDonut.svelte';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import RoomSurface from '$lib/components/RoomSurface.svelte';
	import Card from '$lib/components/Card.svelte';
	import { pillStyle } from '$lib/pill-ink';
	import MonthlyBars from '$lib/components/MonthlyBars.svelte';
	import StackedMonths from '$lib/components/StackedMonths.svelte';
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

	/** The months a series covers, as words: "Oct 2025 – Sep 2026". */
	const monthName = (key: string) => monthOf(key, now(), { year: 'numeric' });

	const biggest = $derived(data.byCategory.categories[0] ?? null);
	const dearest = $derived([...data.totals].sort((a, b) => b.outCents - a.outCents)[0] ?? null);
	const spent = $derived(data.totals.reduce((n, m) => n + m.outCents, 0));
	const monthsWithSpending = $derived(data.totals.filter((m) => m.outCents > 0).length);
</script>

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
			{#if data.totals.length > 0}
				<span class="tabular ml-auto text-xs text-gray-500">
					{monthName(data.totals[0].month)} – {monthName(data.totals[data.totals.length - 1].month)}
				</span>
			{/if}
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
		<dl class="grid grid-cols-2 gap-x-8 gap-y-3 border-b border-gray-200 px-4 py-3 sm:grid-cols-3">
			<div>
				<dt class="text-xs text-gray-500">{t('finance.insights.spentPerMonthOnAverage')}</dt>
				<dd class="tabular text-lg font-semibold text-gray-900">
					{money(monthsWithSpending ? Math.round(spent / monthsWithSpending) : 0)}
				</dd>
				<dd class="text-xs text-gray-500">
					{t('finance.insights.overMonthWithAny', {
						monthsWithSpending: monthsWithSpending,
						s: monthsWithSpending === 1 ? '' : 's'
					})}
				</dd>
			</div>
			<div>
				<dt class="text-xs text-gray-500">{t('finance.insights.dearestMonth')}</dt>
				<dd class="tabular text-lg font-semibold text-gray-900">
					{dearest ? money(dearest.outCents) : '—'}
				</dd>
				<dd class="text-xs text-gray-500">{dearest ? monthName(dearest.month) : ''}</dd>
			</div>
			<div>
				<dt class="text-xs text-gray-500">{t('finance.insights.biggestCategory')}</dt>
				<dd class="tabular text-lg font-semibold text-gray-900">
					{biggest ? money(biggest.totalCents) : '—'}
				</dd>
				<!-- The category wears its colour as a pill, never as tinted text. -->
				{#if biggest}
					<dd><span class="pill" style={pillStyle(biggest.color)}>{biggest.name}</span></dd>
				{/if}
			</div>
		</dl>

		<div class="grid grid-cols-1 border-b border-gray-200 lg:grid-cols-2">
			<Card
				title={t('finance.insights.inAndOut')}
				description={t('finance.insights.whatArrivedAgainstWhatLeft')}
				pane
			>
				<MonthlyBars
					rows={data.totals}
					inLabel={t('finance.insights.in')}
					outLabel={t('finance.insights.out')}
					{currency}
				/>
			</Card>

			<Card
				title={t('finance.insights.whatEachMonthWasMade')}
				description={t('finance.insights.spendingStackedByCategory')}
				pane
				class="border-t border-gray-200 lg:border-t-0 lg:border-l"
			>
				<StackedMonths
					months={data.byCategory.months}
					categories={data.byCategory.categories}
					{currency}
				/>
				<div class="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs">
					{#each data.byCategory.categories as c (c.name)}
						<span class="flex items-center gap-1.5 text-gray-600">
							<CategoryMark name={c.name} color={c.color} />
							<span class="text-gray-500 tabular-nums">{money(c.totalCents)}</span>
						</span>
					{/each}
				</div>
			</Card>
		</div>

		<div class="grid grid-cols-1 lg:grid-cols-2">
			<Card
				title={t('finance.insights.theWholeWindowByCategory')}
				description={t('finance.insights.theSameMoneyWithoutThe')}
				pane
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
				class="border-t border-gray-200 lg:border-t-0 lg:border-l"
			>
				{#snippet titleActions()}
					{#if data.tags.length > 0}
						<Picker
							value={data.tag ?? ''}
							options={data.tags.map((tag) => ({ value: tag.name, label: `#${tag.name}` }))}
							onpick={(next) => filter({ tag: next })}
							label={t('finance.insights.whatOneTagCosts')}
						/>
					{/if}
				{/snippet}
				{#if !data.tagSeries}
					<p class="text-sm text-gray-500">
						{t('finance.insights.noTagsYet')}
						<a href={resolve('/finance/rules')} class="underline"
							>{t('finance.insights.writeOne')}</a
						>
					</p>
				{:else}
					{@const series = data.tagSeries}
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
									{monthOf(month, now())}
								</text>
								<text
									x={cx}
									y="165"
									text-anchor="middle"
									class="fill-gray-500 text-[9px]"
									style="font-variant-numeric: tabular-nums"
								>
									{series.byMonth[i] === 0 ? '' : money(series.byMonth[i])}
								</text>
							{/each}
						</svg>
					</div>
				{/if}
			</Card>
		</div>
	{/if}
</RoomSurface>
