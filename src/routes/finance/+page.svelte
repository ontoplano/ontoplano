<script lang="ts">
	import { resolve } from '$app/paths';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import RoomSurface from '$lib/components/RoomSurface.svelte';
	import StatTiles from '$lib/components/StatTiles.svelte';
	import BudgetProgress from '$lib/components/BudgetProgress.svelte';
	import Card from '$lib/components/Card.svelte';
	import CategoryDonut from '$lib/components/CategoryDonut.svelte';
	import { formatMoney } from '$lib/money';
	import { minorAmount } from '$lib/services/validate';
	import { useT } from '$lib/i18n';
	import type { CurrencyPicture } from '$lib/services/finance-summary';
	import type { PageServerData } from './$types';

	const t = useT();

	let { data }: { data: PageServerData } = $props();

	const overview = $derived(data.overview);
	const mine = $derived(data.view === 'mine');

	const money = (minor: number, currency: string | null) =>
		formatMoney(minorAmount(minor, 'money'), currency ?? data.defaultCurrency);

	/** Funds after the part held for other people is taken out. */
	const myFunds = (picture: CurrencyPicture) =>
		picture.fundsMinor === null
			? null
			: minorAmount(picture.fundsMinor - picture.custodyMinor, 'my money');
	const label = (picture: CurrencyPicture) => picture.currency ?? t('finance.insights.unspecified');
	const key = (picture: CurrencyPicture) => picture.currency ?? 'unspecified';

	/*
	 * A currency is on the page when it has an account, activity or a plan. A
	 * stock in a currency with no account here is still somebody's money, so it
	 * is named in one line at the end rather than given a section that reads as
	 * an empty account.
	 */
	const shown = $derived(
		overview.currencies.filter(
			(picture) =>
				picture.coverage.accounts > 0 ||
				picture.spending.movementCount > 0 ||
				picture.budgets.length > 0
		)
	);
	const elsewhere = $derived(
		overview.currencies.filter(
			(picture) =>
				!shown.includes(picture) &&
				(picture.reservesMinor ||
					picture.payablesMinor ||
					picture.receivablesMinor ||
					(!mine && picture.custodyMinor))
		)
	);

	function noOpening(picture: CurrencyPicture) {
		const gap = picture.gaps.find((one) => one.kind === 'no-opening');
		return gap?.kind === 'no-opening' ? gap : null;
	}
	function outsideCoverage(picture: CurrencyPicture) {
		const gap = picture.gaps.find((one) => one.kind === 'outside-coverage');
		return gap?.kind === 'outside-coverage' ? gap : null;
	}
	function balanceDiffers(picture: CurrencyPicture) {
		const gap = picture.gaps.find((one) => one.kind === 'balance-differs');
		return gap?.kind === 'balance-differs' ? gap : null;
	}
	/* The month's personal spending as the donut's slices; refunds reduce a
	   category rather than getting a slice of their own. */
	function categorySlices(picture: CurrencyPicture) {
		const total = picture.spending.byCategory.reduce(
			(sum, category) => sum + Math.max(0, category.netMinor),
			0
		);
		if (!total) return [];
		return picture.spending.byCategory
			.filter((category) => category.netMinor > 0)
			.map((category) => ({
				name: category.name,
				color: category.color,
				outCents: category.netMinor,
				share: category.netMinor / total
			}))
			.sort((a, b) => b.share - a.share);
	}
	/**
	 * The first ledger a gap points at, so "Declare an opening" opens that
	 * ledger's edit dialog rather than dropping the reader on the statement.
	 */
	function firstLedger(picture: CurrencyPicture): number | null {
		for (const gap of picture.gaps) {
			if ('ledgers' in gap && gap.ledgers.length) return gap.ledgers[0]!.id;
		}
		return null;
	}
	function editHref(picture: CurrencyPicture): string {
		const id = firstLedger(picture);
		return id
			? `${resolve('/finance/ledgers')}?ledger=${id}&edit=${id}`
			: resolve('/finance/ledgers');
	}
	function unclassifiedHref(picture: CurrencyPicture) {
		const params = new URLSearchParams({
			unclassified: '1',
			month: overview.month,
			currency: picture.currency ?? 'unspecified'
		});
		return `${resolve('/finance/ledgers')}?${params}`;
	}
	const budgetsHref = (picture: CurrencyPicture) =>
		`${resolve('/finance/budgets')}?month=${overview.month}${
			picture.currency ? `&currency=${picture.currency}` : ''
		}`;
</script>

<svelte:head><title>{t('rooms.finance.tabs.overview')}</title></svelte:head>

<RoomSurface dataTour="finance-overview">
	{#snippet tools()}
		<form method="get" class="flex flex-wrap items-center gap-2">
			<label class="text-sm" for="overview-month">{t('finance.budgets.month')}</label>
			<input
				id="overview-month"
				name="month"
				type="month"
				class="input input-sm"
				value={overview.month}
				onchange={(event) => event.currentTarget.form?.requestSubmit()}
			/>
			<span class="text-xs text-gray-500">{t('finance.ledgers.asOf', { day: overview.asOf })}</span>
		</form>
		<form
			method="post"
			action="?/setView"
			class="flex flex-wrap items-center gap-1"
			title={t('finance.overview.viewHint')}
		>
			<input type="hidden" name="month" value={overview.month} />
			<span class="text-xs text-gray-500">{t('finance.overview.moneyView')}</span>
			<button
				type="submit"
				name="view"
				value="mine"
				class="btn btn-sm"
				class:btn-primary={mine}
				aria-pressed={mine}>{t('finance.overview.viewMine')}</button
			>
			<button
				type="submit"
				name="view"
				value="all"
				class="btn btn-sm"
				class:btn-primary={!mine}
				aria-pressed={!mine}>{t('finance.overview.viewAll')}</button
			>
		</form>
	{/snippet}

	<h1 class="px-4 pt-4 text-xl font-semibold">{t('rooms.finance.tabs.overview')}</h1>

	<!-- Every path below is resolve()d; the rule cannot see through a query string. -->
	<!-- eslint-disable svelte/no-navigation-without-resolve -->

	{#if overview.currencies.length === 0}
		<EmptyState
			icon="book"
			title={t('finance.overview.noAccounts')}
			description={t('finance.overview.noAccountsBody')}
		>
			{#snippet action()}
				<a class="btn btn-sm" href={resolve('/finance/ledgers')}>
					{t('finance.overview.addLedger')}
				</a>
			{/snippet}
		</EmptyState>
	{:else}
		<div class="space-y-6 p-4">
			{#each shown as picture (key(picture))}
				<section
					class="space-y-4 border-b border-gray-200 pb-6 last:border-b-0 last:pb-0"
					aria-label={label(picture)}
					data-tour="finance-overview-money"
				>
					<div class="flex flex-wrap items-baseline justify-between gap-2">
						<h2 class="text-lg font-semibold">{label(picture)}</h2>
						{#if picture.coverage.accounts}
							<p class="text-xs text-gray-600">
								{picture.coverage.accounts === 1
									? t('finance.overview.coverageOne', {
											supported: picture.coverage.supported,
											accounts: picture.coverage.accounts
										})
									: t('finance.overview.coverage', {
											supported: picture.coverage.supported,
											accounts: picture.coverage.accounts
										})}
								{#if picture.coverage.verified}
									· {t('finance.overview.verified', { count: picture.coverage.verified })}
								{/if}
							</p>
						{/if}
					</div>

					<!-- The four answers, in the same tiles the rest of Finance uses. -->
					<StatTiles
						tiles={[
							mine
								? {
										label:
											picture.fundsMinor === null
												? t('finance.ledgers.statusRecorded')
												: t('finance.overview.myMoney'),
										value: money(
											picture.fundsMinor === null
												? picture.recordedOnlyMinor
												: (myFunds(picture) ?? 0),
											picture.currency
										),
										note:
											picture.fundsMinor === null
												? t('finance.overview.notABalance')
												: t('finance.overview.myMoneyAvailableNote', {
														available: money(picture.availableMinor ?? 0, picture.currency)
													})
									}
								: {
										label:
											picture.fundsMinor === null
												? t('finance.ledgers.statusRecorded')
												: t('finance.overview.available'),
										value: money(
											picture.fundsMinor === null
												? picture.recordedOnlyMinor
												: (picture.availableMinor ?? 0),
											picture.currency
										),
										note:
											picture.fundsMinor === null
												? t('finance.overview.notABalance')
												: t('finance.overview.availableFormula')
									},
							mine
								? {
										label: t('finance.overview.setAside'),
										value: money(picture.reservesMinor, picture.currency),
										note: t('finance.overview.setAsideBody')
									}
								: {
										label: t('finance.overview.committed'),
										value: money(picture.custodyMinor + picture.reservesMinor, picture.currency),
										note: `${t('finance.commitments.custody')}: ${money(
											picture.custodyMinor,
											picture.currency
										)} · ${t('finance.commitments.reserve')}: ${money(
											picture.reservesMinor,
											picture.currency
										)}`
									},
							{
								label: t('finance.overview.spent'),
								value: money(picture.spending.netMinor, picture.currency),
								note: `${t('finance.insights.gross')}: ${money(
									picture.spending.grossMinor,
									picture.currency
								)} · ${t('finance.insights.refunds')}: ${money(
									picture.spending.refundMinor,
									picture.currency
								)}`
							}
						]}
					/>

					<!-- The subtractions, the claims and the gaps: rules, not a wall of text. -->
					{#if picture.fundsMinor !== null}
						<p class="text-sm text-gray-600" data-testid="available-formula">
							{mine
								? t('finance.overview.myMoneyFormula', {
										funds: money(myFunds(picture) ?? 0, picture.currency),
										reserves: money(picture.reservesMinor, picture.currency),
										available: money(picture.availableMinor ?? 0, picture.currency)
									})
								: t('finance.overview.availableFormulaLong', {
										funds: money(picture.fundsMinor, picture.currency),
										custody: money(picture.custodyMinor, picture.currency),
										reserves: money(picture.reservesMinor, picture.currency)
									})}
						</p>
					{/if}
					{#if picture.payablesMinor || picture.receivablesMinor}
						<div
							class="divide-y divide-gray-200 border-y border-gray-200 text-sm"
							data-testid="claims"
						>
							<p class="py-2 text-gray-600">{t('finance.overview.claimsBody')}</p>
							<dl class="flex flex-wrap gap-x-8 gap-y-1 py-2">
								<div class="flex items-baseline gap-2">
									<dt class="text-gray-500">{t('finance.overview.payables')}</dt>
									<dd class="font-semibold tabular-nums">
										{money(picture.payablesMinor, picture.currency)}
									</dd>
								</div>
								<div class="flex items-baseline gap-2">
									<dt class="text-gray-500">{t('finance.overview.receivables')}</dt>
									<dd class="font-semibold tabular-nums">
										{money(picture.receivablesMinor, picture.currency)}
									</dd>
								</div>
							</dl>
						</div>
					{/if}
					{#if noOpening(picture) || outsideCoverage(picture) || balanceDiffers(picture)}
						<ul class="divide-y divide-gray-200 border-b border-gray-200 text-sm">
							{#if noOpening(picture)}
								{@const gap = noOpening(picture)!}
								<li
									class="flex flex-wrap items-baseline justify-between gap-2 py-2"
									data-testid="gap-no-opening"
								>
									<span>
										{gap.count === 1
											? t('finance.overview.missingOpeningOne', { count: gap.count })
											: t('finance.overview.missingOpening', { count: gap.count })}
									</span>
									<a class="underline" href={editHref(picture)}>
										{t('finance.overview.fixOpening')}
									</a>
								</li>
							{/if}
							{#if outsideCoverage(picture)}
								{@const gap = outsideCoverage(picture)!}
								<li
									class="flex flex-wrap items-baseline justify-between gap-2 py-2"
									data-testid="gap-outside-coverage"
								>
									<span>
										{gap.count === 1
											? t('finance.overview.outsideCoverageOne', { count: gap.count })
											: t('finance.overview.outsideCoverageTotal', { count: gap.count })}
									</span>
									<a class="underline" href={editHref(picture)}>
										{t('finance.overview.checkOpeningDate')}
									</a>
								</li>
							{/if}
							{#if balanceDiffers(picture)}
								{@const gap = balanceDiffers(picture)!}
								<li class="space-y-1 py-2" data-testid="gap-balance-differs">
									<p>
										{gap.count === 1
											? t('finance.overview.balanceDiffersOne', { count: gap.count })
											: t('finance.overview.balanceDiffers', { count: gap.count })}
									</p>
									{#each gap.ledgers as ledger (ledger.id)}
										<a
											class="underline"
											href={`${resolve('/finance/ledgers')}?ledger=${ledger.id}&checks=1`}
										>
											{ledger.name}: {t('finance.ledgers.checkDifference', {
												amount: money(ledger.differenceMinor, picture.currency)
											})}
										</a>
									{/each}
								</li>
							{/if}
						</ul>
					{/if}

					<!-- What the month spent, and what is left of its plans: two panes,
					     one with the category ring the rest of Finance draws. -->
					<div
						class="grid grid-cols-1 border-b border-gray-200 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]"
					>
						<Card
							title={t('finance.overview.spent')}
							description={t('finance.overview.spentPane', { month: overview.month })}
							pane
						>
							<div class="space-y-3" data-tour="finance-overview-spending">
								{#if picture.spending.movementCount === 0}
									<EmptyState
										compact
										icon="wallet"
										title={t('finance.overview.nothingSpent', { month: overview.month })}
									/>
								{:else}
									<p class="text-sm" data-testid="spending-net">
										{t('finance.insights.net')}: {money(
											picture.spending.netMinor,
											picture.currency
										)} · {t('finance.insights.income')}: {money(
											picture.spending.incomeMinor,
											picture.currency
										)}
									</p>
									<CategoryDonut
										slices={categorySlices(picture)}
										currency={picture.currency ?? data.defaultCurrency}
									/>
									<p class="text-xs leading-relaxed text-gray-600" data-testid="spending-excluded">
										{t('finance.overview.excluded')}:
										{t('finance.insights.transfers', {
											count: picture.spending.transferCount,
											incoming: money(picture.spending.transferInMinor, picture.currency),
											outgoing: money(picture.spending.transferOutMinor, picture.currency)
										})}
										· {t('finance.insights.cash', {
											count: picture.spending.cashCount,
											amount: money(picture.spending.cashMinor, picture.currency)
										})}
										{#if !mine}
											· {t('finance.insights.custody', {
												count: picture.spending.custodyCount,
												amount: money(picture.spending.custodyMinor, picture.currency)
											})}
										{/if}
									</p>
									{#if picture.spending.unclassifiedCount}
										<p class="text-sm" data-testid="spending-unclassified">
											<a class="underline" href={unclassifiedHref(picture)}>
												{t('finance.insights.unclassified', {
													count: picture.spending.unclassifiedCount
												})}
											</a>
										</p>
									{/if}
									{#if picture.spending.unmatchedRefundCount}
										<p class="text-sm text-gray-600">
											{t('finance.insights.unmatchedRefunds', {
												count: picture.spending.unmatchedRefundCount
											})}
										</p>
									{/if}
								{/if}
							</div>
						</Card>

						<Card
							title={t('finance.overview.left')}
							description={t('finance.overview.leftPane', { month: overview.month })}
							pane
							class="border-t border-gray-200 lg:border-t-0 lg:border-l"
						>
							<div class="space-y-3">
								{#if picture.budgets.length}
									<BudgetProgress budgets={picture.budgets} />
									<a class="text-sm underline" href={budgetsHref(picture)}>
										{t('rooms.finance.tabs.budgets')}
									</a>
								{:else if picture.currency === null}
									<EmptyState
										compact
										icon="budgets"
										title={t('finance.overview.noPlans', { month: overview.month })}
										description={t('finance.overview.plansNeedCurrency')}
									>
										{#snippet action()}
											<a class="btn btn-sm" href={editHref(picture)}>
												{t('finance.overview.declareCurrency')}
											</a>
										{/snippet}
									</EmptyState>
								{:else}
									<EmptyState
										compact
										icon="budgets"
										title={t('finance.overview.noPlans', { month: overview.month })}
									>
										{#snippet action()}
											<a class="btn btn-sm" href={budgetsHref(picture)}>
												{t('finance.overview.setBudget')}
											</a>
										{/snippet}
									</EmptyState>
								{/if}
							</div>
						</Card>
					</div>
				</section>
			{/each}

			{#if elsewhere.length}
				<section aria-label={t('finance.overview.otherCurrencies')}>
					<Card
						title={mine
							? t('finance.overview.otherCurrenciesMine')
							: t('finance.overview.otherCurrencies')}
					>
						<ul class="divide-y divide-gray-200 text-sm">
							{#each elsewhere as picture (key(picture))}
								<li class="flex flex-wrap items-baseline justify-between gap-2 py-2">
									<span class="font-medium">{label(picture)}</span>
									<span class="text-right text-gray-600">
										{mine ? t('finance.overview.setAside') : t('finance.overview.committed')}:
										<span class="font-semibold text-gray-900 tabular-nums">
											{money(
												mine ? picture.reservesMinor : picture.custodyMinor + picture.reservesMinor,
												picture.currency
											)}
										</span>
										· {t('finance.overview.payables')}:
										{money(picture.payablesMinor, picture.currency)}
										· {t('finance.overview.receivables')}:
										{money(picture.receivablesMinor, picture.currency)}
									</span>
								</li>
							{/each}
						</ul>
					</Card>
				</section>
			{/if}
		</div>
	{/if}

	<!-- eslint-enable svelte/no-navigation-without-resolve -->
</RoomSurface>
