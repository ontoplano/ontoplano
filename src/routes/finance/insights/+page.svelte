<script lang="ts">
	import { routeGlyph } from '$lib/glyphs';
	import Picker from '$lib/components/Picker.svelte';

	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import CategoryMark from '$lib/components/CategoryMark.svelte';
	import CategoryDonut from '$lib/components/CategoryDonut.svelte';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import RoomSurface from '$lib/components/RoomSurface.svelte';
	import Card from '$lib/components/Card.svelte';
	import MonthBars from '$lib/components/MonthBars.svelte';
	import StatTiles from '$lib/components/StatTiles.svelte';
	import BudgetProgress from '$lib/components/BudgetProgress.svelte';
	import { formatMoney, type Currency } from '$lib/money';
	import type { PageServerData } from './$types';
	import { useT } from '$lib/i18n';

	const t = useT();

	let { data }: { data: PageServerData } = $props();

	const currency = $derived(data.currency);
	const money = (cents: number) =>
		currency
			? formatMoney(cents, currency as Currency)
			: t('finance.insights.minorUnits', { amount: cents });

	const anything = $derived(!!data.report?.movementCount);
	const WINDOWS = [3, 6, 12, 24];

	function filter(changes: {
		ledger?: number;
		months?: number;
		month?: string;
		tag?: string;
		currency?: string;
	}) {
		const params: [string, string][] = [];
		const ledger = changes.ledger ?? data.ledgerId;
		const months = changes.months ?? data.months;
		const tag = changes.tag ?? data.tag;
		const month = changes.month ?? (changes.months === undefined ? data.month : '');
		if (ledger) params.push(['ledger', String(ledger)]);
		if (months !== 12) params.push(['months', String(months)]);
		if (month) params.push(['month', month]);
		else if (changes.months === undefined && changes.month === undefined)
			params.push(['from', data.window.from], ['to', data.window.to]);
		params.push(['currency', changes.currency ?? currency ?? 'unspecified']);
		if (tag) params.push(['tag', String(tag)]);
		// The path is resolved; the rule cannot see through the appended query.
		// eslint-disable-next-line svelte/no-navigation-without-resolve
		void goto(`${resolve('/finance/insights')}?${new URLSearchParams(params)}`, { noScroll: true });
	}

	const biggest = $derived(
		data.byCategory.categories.find((category) => category.totalCents > 0) ?? null
	);
	const reviewParams = $derived(
		new URLSearchParams({
			unclassified: '1',
			currency: currency ?? 'unspecified',
			from: data.window.from,
			to: data.window.to,
			...(data.ledgerId ? { ledger: String(data.ledgerId) } : {})
		})
	);
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
			<label class="text-sm"
				>{t('finance.insights.month')}
				<input
					class="input ml-2 max-w-44"
					type="month"
					value={data.month}
					onchange={(event) => filter({ month: event.currentTarget.value })}
				/>
			</label>
			<Picker
				value={currency ?? 'unspecified'}
				options={data.currencies.map((code) => ({
					value: code ?? 'unspecified',
					label: code ?? t('finance.insights.unspecified')
				}))}
				onpick={(next) => filter({ ledger: 0, currency: next })}
				label={t('finance.insights.currency')}
			/>
		</div>
	{/snippet}

	<section class="space-y-2 border-b border-gray-200 p-4 text-sm" data-testid="spending-context">
		<p>
			{t('finance.insights.window', { from: data.window.from, to: data.window.to })} · {currency ??
				t('finance.insights.unspecified')}
		</p>
		{#if data.defaultWindow}<p>{t('finance.insights.defaultWindow')}</p>{/if}
		<p>{t('finance.insights.definitions')}</p>
		<p>
			{data.balanceCoverage.verified === 0
				? t('finance.insights.unknownBalance')
				: t('finance.insights.partialBalance', data.balanceCoverage)}
		</p>
	</section>

	{#if !anything}
		<EmptyState
			icon={routeGlyph('/finance/insights')!}
			title={t('finance.insights.noActivity')}
			description={t('finance.insights.importAStatementIntoA')}
		/>
	{:else}
		<!-- The three numbers worth knowing before any chart. -->
		<div data-testid="spending-totals">
			<StatTiles
				tiles={[
					{
						label: t('finance.insights.gross'),
						value: money(data.report?.grossMinor ?? 0)
					},
					{
						label: t('finance.insights.refunds'),
						value: money(data.report?.refundMinor ?? 0)
					},
					{
						label: t('finance.insights.net'),
						value: money(data.report?.netMinor ?? 0)
					}
				]}
			/>
		</div>

		<section
			class="space-y-2 border-b border-gray-200 p-4 text-sm"
			aria-label={t('finance.insights.exclusions')}
			data-testid="spending-exclusions"
		>
			<h2 class="font-semibold">{t('finance.insights.exclusions')}</h2>
			{#if data.report}
				<p>
					{t('finance.insights.transfers', {
						count: data.report.transferCount,
						incoming: money(data.report.transferInMinor),
						outgoing: money(data.report.transferOutMinor)
					})}
				</p>
				<p>
					{t('finance.insights.cash', {
						count: data.report.cashCount,
						amount: money(data.report.cashMinor)
					})}
				</p>
				<p>
					{t('finance.insights.custody', {
						count: data.report.custodyCount,
						amount: money(data.report.custodyMinor)
					})}
				</p>
				<p>{t('finance.insights.income')}: {money(data.report.incomeMinor)}</p>
				{#if data.report.unclassifiedCount}<p>
						<a class="underline" href={resolve(`/finance/ledgers?${reviewParams}`)}
							>{t('finance.insights.unclassified', { count: data.report.unclassifiedCount })}</a
						>
					</p>{/if}
				{#if data.report.unmatchedRefundCount}<p>
						{t('finance.insights.unmatchedRefunds', { count: data.report.unmatchedRefundCount })}
					</p>{/if}
			{/if}
		</section>
		<section
			class="space-y-3 border-b border-gray-200 p-4"
			aria-label={t('finance.insights.categories')}
		>
			<h2 class="text-sm font-semibold">{t('finance.insights.categories')}</h2>
			<p class="text-xs text-gray-600">{t('finance.insights.credit')}</p>
			{#if biggest}<p class="flex flex-wrap items-center gap-2 text-sm">
					{t('finance.insights.biggestCategory')}: {@render biggestPill()}
				</p>{/if}
			<ul class="divide-y divide-gray-200 text-sm">
				{#each data.report?.byCategory ?? [] as category (category.name)}
					<li class="flex flex-wrap justify-between gap-2 py-2" data-testid="spending-category">
						<span>{category.name}</span><span
							>{t('finance.insights.gross')}: {money(category.grossMinor)} · {t(
								'finance.insights.refunds'
							)}: {money(category.refundMinor)} · {t('finance.insights.net')}: {money(
								category.netMinor
							)}</span
						>
					</li>
				{/each}
			</ul>
		</section>
		{#if currency}
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
							values: c.byMonth.map((value) => Math.max(0, value)),
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
						<a href={resolve('/finance/rules')} class="underline"
							>{t('finance.insights.writeOne')}</a
						>
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
						series={[
							{
								label: `#${series.name}`,
								values: series.byMonth.map((value) => Math.max(0, value)),
								color: series.color
							}
						]}
						average={series.averageCents}
						averageColor={series.color}
						label={t('finance.insights.monthlyCostOf', { name: series.name })}
						{currency}
					/>
				{/if}
			</Card>
		{/if}
	{/if}
	<section
		class="space-y-3 border-t border-gray-200 p-4"
		aria-label={t('finance.insights.monthBudgets')}
	>
		<h2 class="text-sm font-semibold">{t('finance.insights.monthBudgets')}</h2>
		{#if data.month}
			<p class="text-xs text-gray-600">
				{data.month} · {t('finance.insights.everyLedger')} · {currency ??
					t('finance.insights.unspecified')}
			</p>
			<BudgetProgress budgets={data.budgets} />
			<a class="text-sm underline" href={resolve(`/finance/budgets?month=${data.month}`)}
				>{t('rooms.finance.tabs.budgets')}</a
			>
		{:else}<p class="text-sm text-gray-600">{t('finance.insights.budgetsWindow')}</p>{/if}
	</section>
</RoomSurface>
