<script lang="ts">
	import { resolve } from '$app/paths';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import RoomSurface from '$lib/components/RoomSurface.svelte';
	import StatTiles from '$lib/components/StatTiles.svelte';
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
		formatMoney(minorAmount(minor, 'money'), currency ?? data.defaultCurrency);

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
				(picture.custodyMinor ||
					picture.reservesMinor ||
					picture.payablesMinor ||
					picture.receivablesMinor)
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
	{/snippet}

	<h1 class="px-4 pt-4 text-xl font-semibold">{t('rooms.finance.tabs.overview')}</h1>

	<!-- Every path below is resolve()d; the rule cannot see through a query string. -->
	<!-- eslint-disable svelte/no-navigation-without-resolve -->

	{#if !hasAccounts}
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
								{t('finance.overview.coverage', {
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
							{
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
							{
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
								{t('finance.overview.payables')}: {money(picture.payablesMinor, picture.currency)} · {t(
									'finance.overview.receivables'
								)}: {money(picture.receivablesMinor, picture.currency)}
							</p>
						</div>
					{/if}

					<!-- Every gap named at the total, with the way to fix it. -->
					{#if noOpening(picture)}
						{@const gap = noOpening(picture)!}
						<p class="text-sm" data-testid="gap-no-opening">
							{t('finance.overview.missingOpening', { count: gap.count })}
							<a class="underline" href={resolve('/finance/ledgers')}>
								{t('finance.overview.fixOpening')}
							</a>
						</p>
					{/if}
					{#if outsideCoverage(picture)}
						{@const gap = outsideCoverage(picture)!}
						<p class="text-sm" data-testid="gap-outside-coverage">
							{t('finance.overview.outsideCoverageTotal', { count: gap.count })}
							<a class="underline" href={resolve('/finance/ledgers')}>
								{t('finance.overview.checkOpeningDate')}
							</a>
						</p>
					{/if}
					{#if balanceDiffers(picture)}
						{@const gap = balanceDiffers(picture)!}
						<p class="text-sm" data-testid="gap-balance-differs">
							{t('finance.overview.balanceDiffers', { count: gap.count })}
							{#each gap.ledgers as ledger (ledger.id)}
								<a class="underline" href={`${resolve('/finance/ledgers')}?ledger=${ledger.id}`}>
									{ledger.name}: {t('finance.ledgers.checkDifference', {
										amount: money(ledger.differenceMinor, picture.currency)
									})}
								</a>
							{/each}
						</p>
					{/if}

					<!-- What the month spent, and what it deliberately left out. -->
					<div class="space-y-1" data-tour="finance-overview-spending">
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

					<!-- What is left against the plans, with the shared budget arithmetic. -->
					<div class="space-y-2">
						<div class="flex flex-wrap items-baseline justify-between gap-2">
							<h3 class="text-sm font-semibold">{t('finance.overview.left')}</h3>
							<a class="text-sm underline" href={budgetsHref(picture)}>
								{t('rooms.finance.tabs.budgets')}
							</a>
						</div>
						{#if picture.budgets.length}
							<BudgetProgress budgets={picture.budgets} />
						{:else}
							<p class="text-sm text-gray-600">
								{t('finance.overview.noPlans', { month: overview.month })}
								<a class="underline" href={budgetsHref(picture)}>
									{t('finance.overview.setBudget')}
								</a>
							</p>
						{/if}
					</div>
				</section>
			{/each}

			{#if elsewhere.length}
				<section class="text-sm" aria-label={t('finance.overview.otherCurrencies')}>
					<h2 class="text-sm font-semibold">{t('finance.overview.otherCurrencies')}</h2>
					{#each elsewhere as picture (key(picture))}
						<p class="text-gray-600">
							{label(picture)} · {t('finance.overview.committed')}:
							{money(picture.custodyMinor + picture.reservesMinor, picture.currency)}
							· {t('finance.overview.payables')}: {money(picture.payablesMinor, picture.currency)}
							· {t('finance.overview.receivables')}: {money(
								picture.receivablesMinor,
								picture.currency
							)}
						</p>
					{/each}
				</section>
			{/if}
		</div>
	{/if}

	<!-- eslint-enable svelte/no-navigation-without-resolve -->
</RoomSurface>
