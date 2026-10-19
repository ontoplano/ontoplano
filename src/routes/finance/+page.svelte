<script lang="ts">
	import { resolve } from '$app/paths';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import RoomSurface from '$lib/components/RoomSurface.svelte';
	import BudgetProgress from '$lib/components/BudgetProgress.svelte';
	import { formatMoney } from '$lib/money';
	import { minorAmount } from '$lib/services/validate';
	import { useT } from '$lib/i18n';
	import type { CurrencyPicture } from '$lib/services/finance-summary';
	import type { PageServerData } from './$types';

	const t = useT();

	let { data }: { data: PageServerData } = $props();

	const overview = $derived(data.overview);
	const hasAccounts = $derived(overview.currencies.some((picture) => picture.coverage.accounts));

	const money = (minor: number, currency: string | null) =>
		currency
			? formatMoney(minorAmount(minor, 'money'), currency)
			: t('finance.ledgers.minorUnitsAmount', { amount: minorAmount(minor, 'money') });

	const label = (picture: CurrencyPicture) => picture.currency ?? t('finance.insights.unspecified');
	const key = (picture: CurrencyPicture) => picture.currency ?? 'unspecified';

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
	function budgetsLeft(picture: CurrencyPicture) {
		return picture.budgets.reduce(
			(total, budget) => minorAmount(total + budget.remainingMinor, 'budget left'),
			0
		);
	}
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
	{/snippet}

	<!-- Every path here is resolve()d; the rule cannot see through an appended
	     query string, as in the ledgers and insights pages. -->
	<!-- eslint-disable svelte/no-navigation-without-resolve -->

	{#if !hasAccounts}
		<h1 class="px-4 pt-4 text-xl font-semibold">{t('rooms.finance.tabs.overview')}</h1>
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
			<p class="p-4 text-sm text-gray-600">{t('finance.overview.noAccountsBody')}</p>
		{/if}
	{:else}
		<h1 class="px-4 pt-4 text-xl font-semibold">{t('rooms.finance.tabs.overview')}</h1>
		<div class="space-y-8 p-4">
			{#each overview.currencies as picture (key(picture))}
				<section class="space-y-4" aria-label={label(picture)} data-tour="finance-overview-money">
					<div class="flex flex-wrap items-baseline justify-between gap-2">
						<h2 class="text-lg font-semibold">{label(picture)}</h2>
						<p class="text-xs text-gray-600">
							{t('finance.overview.coverage', {
								supported: picture.coverage.supported,
								accounts: picture.coverage.accounts
							})}
							{#if picture.coverage.verified}
								· {t('finance.overview.verified', { count: picture.coverage.verified })}
							{/if}
						</p>
					</div>

					<!-- Four answers: mine, committed, spent, left. -->
					<div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
						<div class="bg-surface-1 dark:bg-surface-2 rounded p-3">
							<p class="text-xs text-gray-500">
								{#if picture.fundsMinor !== null}
									{t('finance.overview.available')}
								{:else if picture.currency === null}
									{t('finance.overview.noCurrencyTotal')}
								{:else if picture.coverage.accounts === 0}
									{t('finance.overview.noAccountsInCurrency')}
								{:else}
									{t('finance.ledgers.statusRecorded')}
								{/if}
							</p>
							<p class="tabular text-lg font-semibold break-words">
								{#if picture.fundsMinor !== null}
									{money(picture.availableMinor ?? 0, picture.currency)}
								{:else if picture.currency !== null && picture.coverage.accounts > 0}
									{money(picture.recordedOnlyMinor, picture.currency)}
								{:else}
									—
								{/if}
							</p>
							<p class="text-xs text-gray-600">
								{#if picture.fundsMinor !== null}
									{t('finance.overview.availableFormula')}
								{:else if picture.currency === null}
									{t('finance.overview.noCurrencyBody')}
								{:else if picture.coverage.accounts === 0}
									{t('finance.overview.noAccountsInCurrencyBody')}
								{:else}
									{t('finance.overview.notABalance')}
								{/if}
							</p>
						</div>
						<div class="bg-surface-1 dark:bg-surface-2 rounded p-3">
							<p class="text-xs text-gray-500">{t('finance.overview.committed')}</p>
							<p class="tabular text-lg font-semibold break-words">
								{money(picture.custodyMinor + picture.reservesMinor, picture.currency)}
							</p>
							<p class="text-xs text-gray-600">
								{t('finance.commitments.custody')}: {money(picture.custodyMinor, picture.currency)} ·
								{t('finance.commitments.reserve')}: {money(picture.reservesMinor, picture.currency)}
							</p>
						</div>
						<div class="bg-surface-1 dark:bg-surface-2 rounded p-3">
							<p class="text-xs text-gray-500">{t('finance.overview.spent')}</p>
							<p class="tabular text-lg font-semibold break-words">
								{money(picture.spending.netMinor, picture.currency)}
							</p>
							<p class="text-xs text-gray-600">
								{t('finance.insights.gross')}: {money(
									picture.spending.grossMinor,
									picture.currency
								)}
								· {t('finance.insights.refunds')}: {money(
									picture.spending.refundMinor,
									picture.currency
								)}
							</p>
						</div>
						<div class="bg-surface-1 dark:bg-surface-2 rounded p-3">
							<p class="text-xs text-gray-500">{t('finance.overview.left')}</p>
							<p class="tabular text-lg font-semibold break-words">
								{#if picture.budgets.length}
									{money(budgetsLeft(picture), picture.currency)}
								{:else}
									—
								{/if}
							</p>
							{#if picture.budgets.length}
								<p class="text-xs text-gray-600">
									{t('finance.overview.forTheMonth', { month: overview.month })}
								</p>
							{/if}
						</div>
					</div>

					<!-- The subtractions beside available, and the claims that are not. -->
					{#if picture.fundsMinor !== null}
						<p class="text-sm" data-testid="available-formula">
							{t('finance.overview.availableFormulaLong', {
								funds: money(picture.fundsMinor, picture.currency),
								custody: money(picture.custodyMinor, picture.currency),
								reserves: money(picture.reservesMinor, picture.currency)
							})}
						</p>
					{/if}
					{#if picture.payablesMinor || picture.receivablesMinor}
						<div class="text-sm" data-testid="claims">
							<p>{t('finance.overview.claimsBody')}</p>
							<p>
								{t('finance.overview.payables')}: {money(picture.payablesMinor, picture.currency)} ·
								{t('finance.overview.receivables')}: {money(
									picture.receivablesMinor,
									picture.currency
								)}
							</p>
						</div>
					{/if}

					<!-- Every gap named at the total, with the way to fix it. -->
					{#if noOpening(picture)}
						{@const gap = noOpening(picture)!}
						<div class="text-sm" data-testid="gap-no-opening">
							<p>
								{t('finance.overview.missingOpening', { count: gap.count })}
								<a
									class="underline"
									href={`${resolve('/finance/ledgers')}?ledger=${gap.ledgers[0].id}`}
									>{t('finance.overview.fixOpening')}</a
								>
							</p>
						</div>
					{/if}
					{#if outsideCoverage(picture)}
						{@const gap = outsideCoverage(picture)!}
						<div class="text-sm" data-testid="gap-outside-coverage">
							<p>
								{t('finance.overview.outsideCoverageTotal', { count: gap.count })}
								<a
									class="underline"
									href={`${resolve('/finance/ledgers')}?ledger=${gap.ledgers[0].id}`}
									>{t('finance.overview.checkOpeningDate')}</a
								>
							</p>
						</div>
					{/if}
					{#if balanceDiffers(picture)}
						{@const gap = balanceDiffers(picture)!}
						<div class="text-sm" data-testid="gap-balance-differs">
							<p>
								{t('finance.overview.balanceDiffers', { count: gap.count })}
								{#each gap.ledgers as ledger (ledger.id)}
									<a class="underline" href={`${resolve('/finance/ledgers')}?ledger=${ledger.id}`}>
										{ledger.name}: {t('finance.ledgers.checkDifference', {
											amount: money(ledger.differenceMinor, picture.currency)
										})}
									</a>
								{/each}
							</p>
						</div>
					{/if}

					<!-- What the month spent, and what it deliberately left out. -->
					<div
						class="space-y-2 border-t border-gray-200 pt-3"
						data-tour="finance-overview-spending"
					>
						<h3 class="text-sm font-semibold">{t('finance.overview.spent')}</h3>
						{#if picture.spending.movementCount === 0}
							<p class="text-sm text-gray-600">
								{t('finance.overview.nothingSpent', { month: overview.month })}
							</p>
						{:else}
							<p class="text-sm" data-testid="spending-net">
								{t('finance.insights.net')}: {money(picture.spending.netMinor, picture.currency)} ·
								{t('finance.insights.income')}: {money(
									picture.spending.incomeMinor,
									picture.currency
								)}
							</p>
							<p class="text-sm text-gray-600" data-testid="spending-excluded">
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
								· {t('finance.insights.custody', {
									count: picture.spending.custodyCount,
									amount: money(picture.spending.custodyMinor, picture.currency)
								})}
							</p>
							{#if picture.spending.unclassifiedCount}
								<p class="text-sm" data-testid="spending-unclassified">
									<a
										class="underline"
										href={`${resolve('/finance/ledgers')}?${new URLSearchParams({
											unclassified: '1',
											month: overview.month,
											currency: picture.currency ?? 'unspecified'
										})}`}
									>
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

					<!-- What is left against the plans, with the shared budget arithmetic. -->
					<div class="space-y-2 border-t border-gray-200 pt-3">
						<div class="flex flex-wrap items-baseline justify-between gap-2">
							<h3 class="text-sm font-semibold">{t('finance.overview.left')}</h3>
							<a
								class="text-sm underline"
								href={`${resolve('/finance/budgets')}?month=${overview.month}`}
							>
								{t('rooms.finance.tabs.budgets')}
							</a>
						</div>
						{#if picture.budgets.length}
							<BudgetProgress budgets={picture.budgets} />
						{:else}
							<p class="text-sm text-gray-600">
								{t('finance.overview.noPlans', { month: overview.month })}
								<a class="underline" href={`${resolve('/finance/budgets')}?month=${overview.month}`}
									>{t('finance.overview.setBudget')}</a
								>
							</p>
						{/if}
					</div>
				</section>
			{/each}
		</div>
	{/if}

	<!-- eslint-enable svelte/no-navigation-without-resolve -->
</RoomSurface>
