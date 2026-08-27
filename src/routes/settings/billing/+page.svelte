<script lang="ts">
	import Card from '$lib/components/Card.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import { LIMIT_LABELS, formatPrice } from '$lib/plans';
	import type { PageServerData } from './$types';

	let { data }: { data: PageServerData } = $props();

	function when(iso: string | null): string {
		if (!iso) return '';
		return new Date(iso).toLocaleDateString(undefined, {
			day: 'numeric',
			month: 'long',
			year: 'numeric'
		});
	}

	/** A bar is only honest when there is a ceiling to draw it against. */
	function percent(used: number, limit: number | null): number {
		if (limit === null || limit === 0) return 0;
		return Math.min(100, Math.round((used / limit) * 100));
	}

	const current = $derived(data.plans.find((p) => p.id === data.entitlement.plan) ?? data.plans[0]);
</script>

<div class="space-y-4">
	{#if data.selfHosted}
		<Card title="Billing" description="Nothing to pay here.">
			<p class="text-sm text-gray-500">
				This is a self-hosted instance, so there is no plan and no ceiling — the same as the
				deployment settings and the Telegram bot, which also only exist on your own box.
			</p>
		</Card>
	{:else}
		<Card
			title="Your plan"
			description={data.entitlement.source === 'trial'
				? 'You are trying Pro. No card was asked for and none will be charged.'
				: data.entitlement.source === 'lapsed'
					? 'Your Pro period ended. Nothing was deleted — what is over the free ceiling stays readable.'
					: current.blurb}
		>
			{#snippet actions()}
				{#if data.portal}
					<a href={data.portal} class="btn btn-sm" rel="external">Manage payment</a>
				{/if}
			{/snippet}

			<div class="flex flex-wrap items-baseline gap-x-4 gap-y-1">
				<span class="text-2xl font-bold text-gray-900">{current.label}</span>
				<span class="text-sm text-gray-500">{formatPrice(current.priceCents)}</span>

				{#if data.entitlement.until}
					<span class="text-sm text-gray-500">
						{data.entitlement.endingAt
							? `ends ${when(data.entitlement.endingAt)}`
							: data.entitlement.source === 'trial'
								? `trial ends ${when(data.entitlement.until)}`
								: `renews ${when(data.entitlement.until)}`}
					</span>
				{/if}
			</div>

			{#if data.checkout}
				<div class="mt-4">
					<a href={data.checkout} class="btn btn-primary" rel="external">
						<Icon name="arrow-right" /> Go Pro
					</a>
					{#if !data.configured}
						<p class="mt-2 text-xs text-gray-500">
							This instance has no payment provider configured, so that link goes nowhere yet.
						</p>
					{/if}
				</div>
			{/if}
		</Card>

		<Card title="What you are using" description="Against the ceilings on your plan.">
			<div class="space-y-3">
				{#each data.limitKeys as key (key)}
					{@const limit = current.limits[key]}
					{@const used = data.usage[key]}
					<div>
						<div class="flex items-baseline justify-between text-sm">
							<span class="text-gray-700">{LIMIT_LABELS[key]}</span>
							<span class="tabular text-gray-500">
								{used}{limit === null ? '' : ` / ${limit}`}
							</span>
						</div>
						{#if limit === null}
							<!-- No bar: a full one against no ceiling reads as "you are at
							     the limit", which is the opposite of what it means. -->
							<p class="mt-0.5 text-xs text-gray-500">no limit on this plan</p>
						{:else}
							<div class="mt-1 h-1.5 w-full bg-gray-200">
								<div
									class="h-full {percent(used, limit) >= 100 ? 'bg-red-600' : 'bg-gray-900'}"
									style="width: {percent(used, limit)}%"
								></div>
							</div>
						{/if}
					</div>
				{/each}
			</div>
		</Card>

		<Card title="Plans" description="What changes between them.">
			<div class="grid gap-4 sm:grid-cols-2">
				{#each data.plans as plan (plan.id)}
					<div
						class="border p-4 {plan.id === data.entitlement.plan
							? 'border-gray-900'
							: 'border-gray-200'}"
					>
						<h3 class="text-sm font-semibold text-gray-900">{plan.label}</h3>
						<p class="tabular mt-1 text-sm text-gray-500">{formatPrice(plan.priceCents)}</p>
						<p class="mt-2 text-sm text-gray-500">{plan.blurb}</p>
						<dl class="mt-3 space-y-1 text-sm">
							{#each data.limitKeys as key (key)}
								<div class="flex justify-between gap-3">
									<dt class="text-gray-500">{LIMIT_LABELS[key]}</dt>
									<dd class="tabular text-gray-900">{plan.limits[key] ?? 'no limit'}</dd>
								</div>
							{/each}
						</dl>
					</div>
				{/each}
			</div>
		</Card>
	{/if}
</div>
