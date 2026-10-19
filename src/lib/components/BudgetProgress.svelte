<script lang="ts">
	import { formatMoney } from '$lib/money';
	import { useT } from '$lib/i18n';

	import type { Budget } from '$lib/services/budgets';
	export type BudgetRow = Budget;

	let { budgets = [] }: { budgets: BudgetRow[] } = $props();
	const t = useT();

	function progressPercent(budget: BudgetRow): number {
		if (budget.amountMinor <= 0) return budget.spentMinor > 0 ? 100 : 0;
		const pct = Math.round((budget.spentMinor / budget.amountMinor) * 100);
		return Math.max(0, Math.min(100, pct));
	}
</script>

<div class="space-y-4" data-testid="budget-progress">
	{#if budgets.length === 0}
		<p class="text-dim text-sm">{t('finance.budgets.noBudgets')}</p>
	{:else}
		<div class="space-y-3">
			{#each budgets as budget (budget.id)}
				<div
					class="space-y-2 rounded border border-gray-200 p-4 dark:border-gray-800"
					data-testid="row"
				>
					<div class="flex flex-wrap items-center justify-between gap-2">
						<div class="flex items-center gap-2">
							<span class="font-medium">{budget.category}</span>
							{#if budget.orphaned}
								<span class="text-xs text-gray-600">
									{t('finance.budgets.orphaned')}
								</span>
							{/if}
						</div>
						<div class="text-dim text-sm">
							<span
								>{t('finance.budgets.allocated')}: {formatMoney(
									budget.amountMinor,
									budget.currency
								)}</span
							>
						</div>
					</div>

					<div
						class="h-2 w-full overflow-hidden rounded bg-gray-100"
						role="progressbar"
						aria-label={budget.category}
						aria-valuemin="0"
						aria-valuemax="100"
						aria-valuenow={progressPercent(budget)}
					>
						<div
							class="h-full {budget.spentMinor > budget.amountMinor ? 'bg-red-500' : 'bg-blue-600'}"
							style="width: {progressPercent(budget)}%"
						></div>
					</div>

					<div class="text-dim flex flex-wrap items-center justify-between gap-2 text-xs">
						<div>
							<span>{t('finance.budgets.spent')}: </span>
							<span class="text-foreground font-medium"
								>{formatMoney(budget.spentMinor, budget.currency)}</span
							>
						</div>
						<div>
							<span>{t('finance.budgets.remaining')}: </span>
							<span class="font-medium text-gray-900">
								{formatMoney(budget.remainingMinor, budget.currency)}
							</span>
						</div>
						{#if budget.creditMinor > 0}
							<div>
								<span>{t('finance.budgets.credit')}: </span>
								<span class="font-medium text-blue-700"
									>{formatMoney(budget.creditMinor, budget.currency)}</span
								>
							</div>
						{/if}
					</div>
				</div>
			{/each}
		</div>
	{/if}
</div>
