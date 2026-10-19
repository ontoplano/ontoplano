<script lang="ts">
	import { enhance } from '$lib/enhance';
	import { armed } from '$lib/actions/armed';
	import { typing } from '$lib/browse.svelte';
	import { getAction } from '$lib/shortcuts';
	import RoomSurface from '$lib/components/RoomSurface.svelte';
	import Modal from '$lib/components/Modal.svelte';
	import FormError from '$lib/components/FormError.svelte';
	import OneLine from '$lib/components/OneLine.svelte';
	import BudgetProgress, { type BudgetRow } from '$lib/components/BudgetProgress.svelte';
	import { useT } from '$lib/i18n';
	import type { PageServerData, ActionData } from './$types';
	import { moneyInput } from '$lib/money';

	let { data, form }: { data: PageServerData; form: ActionData } = $props();
	const t = useT();

	let creating = $state(false);
	let editing = $state(false);
	let selectedBudget = $state<BudgetRow | null>(null);
	let deletingId = $state<number | null>(null);

	function getPreviousMonth(monthStr: string): string {
		const parts = monthStr.split('-');
		if (parts.length !== 2) return monthStr;
		const y = Number(parts[0]);
		const m = Number(parts[1]);
		if (m === 1) {
			return `${y - 1}-12`;
		}
		return `${y}-${String(m - 1).padStart(2, '0')}`;
	}

	const previousMonth = $derived(getPreviousMonth(data.month));

	function openNew() {
		selectedBudget = null;
		creating = true;
		editing = false;
	}

	function openEdit(b: BudgetRow) {
		selectedBudget = b;
		editing = true;
		creating = false;
	}

	function onkeydown(event: KeyboardEvent) {
		if (typing(event) || event.ctrlKey || event.metaKey || event.altKey) return;
		if (getAction('/finance/budgets', event) === 'new') {
			event.preventDefault();
			openNew();
		}
	}
</script>

<svelte:window {onkeydown} />
<FormError message={form?.message} />
<svelte:head><title>{t('rooms.finance.tabs.budgets')}</title></svelte:head>

<RoomSurface>
	{#snippet tools()}
		<form method="get" class="flex flex-wrap items-center gap-2">
			<label class="flex items-center gap-2 text-sm whitespace-nowrap">
				{t('finance.budgets.month')}
				<input
					name="month"
					type="month"
					class="input input-sm"
					value={data.month}
					onchange={(e) => e.currentTarget.form?.requestSubmit()}
				/>
			</label>
			{#if data.currencies.length > 0}
				<label class="flex items-center gap-2 text-sm whitespace-nowrap">
					{t('finance.budgets.currency')}
					<select
						name="currency"
						class="input input-sm"
						value={data.currency}
						onchange={(e) => e.currentTarget.form?.requestSubmit()}
					>
						<option value="">{t('finance.budgets.allCurrencies')}</option>
						{#each data.currencies as cur (cur)}
							<option value={cur}>{cur}</option>
						{/each}
					</select>
				</label>
			{/if}
		</form>
	{/snippet}

	<div class="space-y-6 p-4" data-tour="budgets">
		<div class="flex flex-wrap items-center justify-between gap-3">
			<h1 class="text-xl font-semibold">{t('rooms.finance.tabs.budgets')}</h1>
			<div class="flex flex-wrap items-center gap-2">
				<form method="post" action="?/copy" use:enhance>
					<input type="hidden" name="fromMonth" value={previousMonth} />
					<input type="hidden" name="toMonth" value={data.month} />
					<button type="submit" class="btn btn-sm">{t('finance.budgets.copy')}</button>
				</form>
				<button class="btn btn-sm btn-primary" onclick={openNew}>
					{t('finance.budgets.new')}
				</button>
			</div>
		</div>

		<BudgetProgress budgets={data.budgets} />

		<!-- Controls for each budget (edit, armed delete) -->
		{#if data.budgets.length > 0}
			<div class="space-y-2 border-t border-gray-100 pt-2 dark:border-gray-800">
				{#each data.budgets as budget (budget.id)}
					<div
						class="hover:bg-surface-1 dark:hover:bg-surface-2 flex flex-wrap items-center justify-between gap-2 rounded p-2 text-sm"
					>
						<div>
							<span class="font-medium">{budget.category}</span>
							<span class="text-dim ml-1 text-xs">({budget.currency})</span>
						</div>
						<div class="flex items-center gap-2">
							<button class="btn btn-xs" type="button" onclick={() => openEdit(budget)}>
								{t('finance.budgets.edit')}
							</button>
							{#if deletingId === budget.id}
								<form method="post" action="?/delete" use:enhance>
									<input type="hidden" name="id" value={budget.id} />
									<button class="btn btn-xs btn-danger" type="submit" use:armed>
										{t('finance.budgets.delete')}
									</button>
								</form>
								<button class="btn btn-xs" type="button" onclick={() => (deletingId = null)}
									>{t('finance.budgets.cancel')}</button
								>
							{:else}
								<button class="btn btn-xs" type="button" onclick={() => (deletingId = budget.id)}
									>{t('finance.budgets.deleteConfirm')}</button
								>
							{/if}
						</div>
					</div>
				{/each}
			</div>
		{/if}
	</div>
</RoomSurface>

<Modal
	open={creating || editing}
	error={form?.message}
	title={editing ? t('finance.budgets.edit') : t('finance.budgets.new')}
	onclose={() => {
		creating = false;
		editing = false;
		selectedBudget = null;
	}}
	size="sm"
>
	{#if creating || editing}
		<form
			id="budget-form"
			method="post"
			action={editing ? '?/update' : '?/create'}
			use:enhance={() =>
				({ result, update }) => {
					if (result.type === 'success') {
						creating = false;
						editing = false;
						selectedBudget = null;
					}
					return update();
				}}
			class="space-y-4"
		>
			{#if editing && selectedBudget}
				<input type="hidden" name="id" value={selectedBudget.id} />
				<input type="hidden" name="updatedAt" value={selectedBudget.updatedAt} />
			{/if}

			<div>
				<label for="budget-form-month" class="label">{t('finance.budgets.month')}</label>
				<input
					id="budget-form-month"
					name="month"
					type="month"
					class="input"
					required
					value={editing && selectedBudget ? selectedBudget.month : data.month}
				/>
			</div>

			<div>
				<label for="budget-form-category" class="label">{t('finance.budgets.category')}</label>
				<input
					id="budget-form-category"
					name="category"
					type="text"
					list="budget-categories"
					class="input"
					required
					value={editing && selectedBudget ? selectedBudget.category : ''}
				/>
				<datalist id="budget-categories">
					{#each data.categories as cat (cat)}
						<option value={cat}>{cat}</option>
					{/each}
				</datalist>
			</div>

			<div>
				<label for="budget-form-currency" class="label">{t('finance.budgets.currency')}</label>
				<OneLine
					id="budget-form-currency"
					name="currency"
					class="input uppercase"
					maxlength={3}
					required
					value={editing && selectedBudget
						? selectedBudget.currency
						: data.currency || data.defaultCurrency || 'USD'}
				/>
			</div>

			<div>
				<label for="budget-form-amount" class="label">{t('finance.budgets.allocated')}</label>
				<input
					id="budget-form-amount"
					name="amount"
					type="text"
					inputmode="decimal"
					class="input"
					placeholder="0.00"
					required
					value={editing && selectedBudget
						? moneyInput(selectedBudget.amountMinor, selectedBudget.currency)
						: ''}
				/>
			</div>

			<div class="flex justify-end gap-2 pt-2">
				<button
					type="button"
					class="btn"
					onclick={() => {
						creating = false;
						editing = false;
						selectedBudget = null;
					}}
				>
					{t('finance.budgets.cancel')}
				</button>
				<button type="submit" class="btn btn-primary">
					{editing ? t('finance.budgets.save') : t('finance.budgets.create')}
				</button>
			</div>
		</form>
	{/if}
</Modal>
