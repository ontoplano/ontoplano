<script lang="ts">
	import { resolve } from '$app/paths';
	import { enhance } from '$lib/enhance';
	import { armed } from '$lib/actions/armed';
	import { typing } from '$lib/browse.svelte';
	import { getAction } from '$lib/shortcuts';
	import RoomSurface from '$lib/components/RoomSurface.svelte';
	import Modal from '$lib/components/Modal.svelte';
	import FormError from '$lib/components/FormError.svelte';
	import OneLine from '$lib/components/OneLine.svelte';
	import BudgetProgress, { type BudgetRow } from '$lib/components/BudgetProgress.svelte';
	import StatTiles from '$lib/components/StatTiles.svelte';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import { useT } from '$lib/i18n';
	import type { PageServerData, ActionData } from './$types';
	import { formatMoney, moneyInput } from '$lib/money';

	let { data, form }: { data: PageServerData; form: ActionData } = $props();
	const t = useT();

	/* The three numbers of the visible plans, when they are one currency's —
	   unlike money is never added to unlike money. */
	const summary = $derived.by(() => {
		const rows = data.budgets;
		if (!rows.length) return null;
		const currencies = new Set(rows.map((row) => row.currency));
		if (currencies.size !== 1) return null;
		const currency = [...currencies][0]!;
		return {
			currency,
			allocated: rows.reduce((sum, row) => sum + row.amountMinor, 0),
			spent: rows.reduce((sum, row) => sum + row.spentMinor, 0),
			remaining: rows.reduce((sum, row) => sum + row.remainingMinor, 0)
		};
	});

	let creating = $state(false);
	let editing = $state(false);
	let selectedBudget = $state<BudgetRow | null>(null);
	let deletingId = $state<number | null>(null);
	/** The category the select is on; kept as state so an inline new rule can
	   be selected the moment it is saved. */
	let categoryValue = $state('');
	let creatingCategory = $state(false);
	let categoryName = $state('');
	let categoryCreated = $state<string | null>(null);
	/** The budget draft, held in state so an inline category creation (which
	   reloads the page data) does not wipe the month, currency or amount. */
	let formMonth = $state('');
	let formCurrency = $state('');
	let formAmount = $state('');

	const categoryIsGone = $derived(
		editing && selectedBudget ? !data.categories.includes(selectedBudget.category) : false
	);
	/** Ledgers decide which currencies a budget can use; an old budget in a
	   currency whose ledger went away can still be repaired unchanged. */
	const currencyChoices = $derived([
		...data.currencies,
		...(editing && selectedBudget && !data.currencies.includes(selectedBudget.currency)
			? [selectedBudget.currency]
			: [])
	]);
	const canSave = $derived(
		(data.categories.length > 0 || categoryIsGone) && currencyChoices.length > 0
	);
	// The dialog can make a category itself, so having none is not a reason to
	// lock the form; only the absence of a ledger currency is.
	const canCreate = $derived(data.currencies.length > 0);

	function defaultCurrency(): string {
		if (data.currencies.includes(data.currency)) return data.currency;
		if (data.currencies.includes(data.defaultCurrency)) return data.defaultCurrency;
		return data.currencies[0] ?? '';
	}

	function openNew() {
		selectedBudget = null;
		creating = true;
		editing = false;
		categoryValue = '';
		creatingCategory = false;
		categoryName = '';
		categoryCreated = null;
		formMonth = data.month;
		formCurrency = defaultCurrency();
		formAmount = '';
	}

	function openEdit(b: BudgetRow) {
		selectedBudget = b;
		editing = true;
		creating = false;
		categoryValue = b.category;
		creatingCategory = false;
		categoryName = '';
		categoryCreated = null;
		formMonth = b.month;
		formCurrency = b.currency;
		formAmount = moneyInput(b.amountMinor, b.currency);
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
					<input type="hidden" name="fromMonth" value={data.previousMonth} />
					<input type="hidden" name="toMonth" value={data.month} />
					<button
						type="submit"
						class="btn btn-sm"
						disabled={data.previousCount === 0}
						title={data.previousCount === 0 ? t('finance.budgets.nothingToCopy') : ''}
					>
						{t('finance.budgets.copy')}
					</button>
				</form>
				<button
					class="btn btn-sm btn-primary"
					onclick={openNew}
					disabled={!canCreate}
					title={!canCreate ? t('finance.budgets.noLedgerCurrency') : ''}
				>
					{t('finance.budgets.new')}
				</button>
			</div>
		</div>

		{#if form && 'added' in form && 'skipped' in form}
			<p class="text-sm text-gray-600" role="status">
				{t('finance.budgets.copied', {
					added: form.added ?? 0,
					skipped: form.skipped ?? 0
				})}
			</p>
		{/if}
		{#if data.previousCount === 0}
			<p class="text-xs text-gray-600">{t('finance.budgets.nothingToCopy')}</p>
		{/if}
		{#if data.categories.length === 0}
			<p class="text-sm text-amber-700" role="status">
				{t('finance.budgets.noCategories')}
				<a class="underline" href={resolve('/finance/rules')}>
					{t('finance.budgets.newCategory')}
				</a>
			</p>
		{/if}
		{#if data.currencies.length === 0}
			<p class="text-sm text-amber-700" role="status">
				{t('finance.budgets.noLedgerCurrency')}
				<a class="underline" href={resolve('/finance/ledgers')}>
					{t('finance.overview.declareCurrency')}
				</a>
			</p>
		{/if}

		{#if summary}
			<StatTiles
				tiles={[
					{
						label: t('finance.budgets.allocated'),
						value: formatMoney(summary.allocated, summary.currency),
						note: summary.currency
					},
					{
						label: t('finance.budgets.spent'),
						value: formatMoney(summary.spent, summary.currency),
						note: t('finance.budgets.month')
					},
					{
						label: t('finance.budgets.remaining'),
						value: formatMoney(summary.remaining, summary.currency),
						note: summary.currency
					}
				]}
			/>
		{/if}

		{#if data.budgets.length === 0}
			<EmptyState
				icon="budgets"
				title={t('finance.budgets.noBudgets')}
				description={t('finance.budgets.noBudgetsHint')}
			>
				{#snippet action()}
					<button class="btn btn-sm btn-primary" onclick={openNew} disabled={!canCreate}>
						{t('finance.budgets.new')}
					</button>
				{/snippet}
			</EmptyState>
		{:else}
			<BudgetProgress budgets={data.budgets} />
		{/if}

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
						if (result.data && typeof result.data === 'object' && 'category' in result.data) {
							// The inline form made a category; keep the budget dialog
							// open and put the new rule in the select. The select is
							// rebuilt by the reload, so choose the new option after it
							// arrives rather than before it exists.
							const made = String(result.data.category);
							creatingCategory = false;
							categoryName = '';
							categoryCreated = made;
							// Keep the budget draft: this submit was the category
							// mini-form, not the budget itself.
							return update({ reset: false });
						}
						creating = false;
						editing = false;
						selectedBudget = null;
					}
					// A redirect is a successful create that also moves the list to
					// the month/currency it landed in; close the dialog either way.
					if (result.type === 'redirect') {
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
			<input type="hidden" name="viewMonth" value={data.month} />
			<input type="hidden" name="viewCurrency" value={data.currency} />

			<div>
				<label for="budget-form-month" class="label">{t('finance.budgets.month')}</label>
				<input
					id="budget-form-month"
					name="month"
					type="month"
					class="input"
					required
					bind:value={formMonth}
				/>
			</div>

			<div>
				<label for="budget-form-category" class="label">{t('finance.budgets.category')}</label>
				<select
					id="budget-form-category"
					name="category"
					class="input"
					required
					disabled={data.categories.length === 0 && !categoryIsGone}
					bind:value={categoryValue}
					onchange={() => (categoryCreated = null)}
				>
					<option value="" disabled>{t('finance.budgets.chooseCategory')}</option>
					{#each data.categories as cat (cat)}
						<option value={cat}>{cat}</option>
					{/each}
					{#if editing && selectedBudget && categoryIsGone}
						<option value={selectedBudget.category}>
							{selectedBudget.category} — {t('finance.budgets.orphaned')}
						</option>
					{/if}
				</select>
				<p class="mt-1 text-xs text-gray-600">
					{t('finance.budgets.categoryHint')}
					<a class="underline" href={resolve('/finance/rules')}>
						{t('finance.budgets.manageRules')}
					</a>
				</p>
				<div class="mt-2">
					<button
						type="button"
						class="text-sm underline"
						onclick={() => {
							creatingCategory = !creatingCategory;
							categoryName = '';
							categoryCreated = null;
						}}
					>
						{t('finance.budgets.newCategory')}
					</button>
					{#if creatingCategory}
						<div class="mt-2 space-y-2 rounded border border-gray-200 p-3 dark:border-gray-800">
							<label class="label" for="budget-new-category">
								{t('finance.budgets.categoryName')}
							</label>
							<OneLine
								id="budget-new-category"
								name="categoryName"
								class="input"
								maxlength={120}
								bind:value={categoryName}
							/>
							<p class="text-xs text-gray-600">
								{t('finance.budgets.categoryNameHint')}
							</p>
							<div class="flex justify-end gap-2">
								<button
									type="button"
									class="btn btn-sm"
									onclick={() => {
										creatingCategory = false;
										categoryName = '';
									}}
								>
									{t('finance.budgets.cancel')}
								</button>
								<button
									type="submit"
									formaction="?/createCategory"
									formnovalidate
									class="btn btn-sm btn-primary"
									disabled={!categoryName.trim()}
								>
									{t('finance.budgets.createCategory')}
								</button>
							</div>
						</div>
					{/if}
				</div>
				{#if categoryCreated}
					<p class="mt-1 text-sm text-gray-600" role="status">
						{t('finance.budgets.categoryCreated', { category: categoryCreated })}
					</p>
				{:else if categoryIsGone}
					<p class="mt-1 text-sm text-amber-700">
						{t('finance.budgets.categoryGone', { category: selectedBudget?.category ?? '' })}
					</p>
				{:else if data.categories.length === 0}
					<p class="mt-1 text-sm text-amber-700">
						{t('finance.budgets.noCategories')}
					</p>
				{/if}
			</div>

			<div>
				<label for="budget-form-currency" class="label">{t('finance.budgets.currency')}</label>
				<select
					id="budget-form-currency"
					name="currency"
					class="input uppercase"
					required
					disabled={currencyChoices.length === 0}
					bind:value={formCurrency}
				>
					<option value="" disabled>{t('finance.budgets.chooseCurrency')}</option>
					{#each currencyChoices as cur (cur)}
						<option value={cur}>
							{cur}
							{#if editing && selectedBudget && cur === selectedBudget.currency && !data.currencies.includes(cur)}
								— {t('finance.budgets.noLedger')}
							{/if}
						</option>
					{/each}
				</select>
				<p class="mt-1 text-xs text-gray-600">{t('finance.budgets.currencyNeedsLedger')}</p>
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
					bind:value={formAmount}
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
				<button type="submit" class="btn btn-primary" disabled={!canSave}>
					{editing ? t('finance.budgets.save') : t('finance.budgets.create')}
				</button>
			</div>
		</form>
	{/if}
</Modal>
