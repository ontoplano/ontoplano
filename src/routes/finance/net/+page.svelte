<script lang="ts">
	import EmptyState from '$lib/components/EmptyState.svelte';
	import MonthlyBars from '$lib/components/MonthlyBars.svelte';
	import { formatMoney, type Currency } from '$lib/money';
	import type { PageServerData } from './$types';

	let { data }: { data: PageServerData } = $props();

	const currency = $derived(data.currency as Currency);
	const money = (cents: number) => formatMoney(cents, currency);

	const recordRows = $derived(
		data.records.map((r) => ({
			month: r.month,
			inCents: r.incomeCents,
			outCents: r.billsCents,
			netCents: r.netCents
		}))
	);
	const hasRecords = $derived(recordRows.some((r) => r.inCents || r.outCents));
	const hasStatements = $derived(data.statements.some((r) => r.inCents || r.outCents));

	/** The freshest month with statement lines, for the category breakdown. */
	const categoryMonth = $derived(
		[...data.statements].reverse().find((r) => r.byCategory.length > 0) ?? null
	);
	const categoryPeak = $derived(
		categoryMonth ? Math.max(1, ...categoryMonth.byCategory.map((c) => c.outCents)) : 1
	);
</script>

<div class="space-y-5">
	{#if !hasRecords && !hasStatements}
		<EmptyState
			icon="wallet"
			title="Nothing to add up yet"
			description="Net is income against outgo, month by month. Record income and bills, or import a bank statement, and the months draw themselves."
		/>
	{:else}
		<section class="rounded border border-gray-200 p-4">
			<h2 class="mb-1 text-sm font-semibold text-gray-900">From your records</h2>
			<p class="mb-3 text-xs text-gray-500">
				Income you marked received against bills you marked paid.
			</p>
			{#if hasRecords}
				<MonthlyBars rows={recordRows} inLabel="Income" outLabel="Bills" {currency} />
			{:else}
				<p class="text-sm text-gray-500">No payments recorded yet.</p>
			{/if}
		</section>

		<section class="rounded border border-gray-200 p-4">
			<h2 class="mb-1 text-sm font-semibold text-gray-900">From your statements</h2>
			<p class="mb-3 text-xs text-gray-500">
				What the bank exports say arrived and left. Kept apart from your records — a salary visible
				in both would otherwise count twice.
			</p>
			{#if hasStatements}
				<MonthlyBars rows={data.statements} inLabel="In" outLabel="Out" {currency} />
			{:else}
				<p class="text-sm text-gray-500">No statements imported yet.</p>
			{/if}
		</section>

		{#if categoryMonth}
			<section class="rounded border border-gray-200 p-4">
				<h2 class="mb-1 text-sm font-semibold text-gray-900">
					Where {categoryMonth.month} went
				</h2>
				<p class="mb-3 text-xs text-gray-500">
					Spending by category. A line belongs to exactly one category, so these add up.
				</p>
				<ul class="space-y-2">
					{#each categoryMonth.byCategory as c (c.name)}
						<li class="flex items-center gap-3 text-sm">
							<span class="w-32 shrink-0 truncate text-gray-700">{c.name}</span>
							<span class="h-3 flex-1 rounded-sm bg-gray-100">
								<span
									class="block h-3 rounded-sm bg-red-500"
									style="width: {(c.outCents / categoryPeak) * 100}%"
								></span>
							</span>
							<span class="w-24 shrink-0 text-right text-gray-900 tabular-nums">
								{money(c.outCents)}
							</span>
						</li>
					{/each}
				</ul>
			</section>
		{/if}
	{/if}
</div>
