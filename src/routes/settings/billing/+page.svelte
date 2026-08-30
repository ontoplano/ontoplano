<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import { page } from '$app/state';
	import Banner from '$lib/components/Banner.svelte';
	import Card from '$lib/components/Card.svelte';
	import FormError from '$lib/components/FormError.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import { LIMIT_LABELS, describeYearly, formatPrice } from '$lib/plans';
	import type { ActionData, PageServerData } from './$types';

	let { data, form }: { data: PageServerData; form: ActionData } = $props();

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
	const yearlyLine = $derived(describeYearly(data.pricing));

	/** Downgrading asks once — twelve months of monthly costs more. */
	let confirmMonthly = $state(false);

	/**
	 * Coming back from checkout, the webhook may still be a few seconds out —
	 * the page keeps asking until the plan flips, so nobody stares at buy
	 * buttons they just used.
	 */
	const cameFromCheckout = page.url.searchParams.get('welcome') === '1';
	let confirming = $state(cameFromCheckout);
	$effect(() => {
		if (!confirming) return;
		if (data.hasProviderSub) {
			confirming = false;
			return;
		}
		let polls = 0;
		const timer = setInterval(() => {
			polls += 1;
			if (polls > 15 || data.hasProviderSub) {
				clearInterval(timer);
				confirming = false;
				return;
			}
			invalidateAll();
		}, 2000);
		return () => clearInterval(timer);
	});
</script>

<div class="space-y-4">
	{#if cameFromCheckout && data.hasProviderSub}
		<Banner
			kind="success"
			message={data.entitlement.source === 'trial' || data.entitlement.status === 'trialing'
				? `Card saved — your ${data.pricing.trialDays} days are running.`
				: 'Payment confirmed.'}
		/>
	{:else if confirming}
		<Banner kind="info" message="Confirming your payment…" />
	{/if}

	<Card
		title="Your plan"
		description={data.entitlement.status === 'trialing' || data.entitlement.source === 'trial'
			? `Your trial runs until ${when(data.entitlement.until)}.`
			: data.entitlement.source === 'lapsed'
				? 'Your subscription has ended. Nothing was deleted — everything you wrote is still here and still exportable.'
				: current.blurb}
	>
		{#snippet actions()}
			{#if data.portal}
				<a href={data.portal} class="btn btn-sm" rel="external">Manage payment</a>
			{/if}
		{/snippet}

		<div class="flex flex-wrap items-baseline gap-x-4 gap-y-1">
			<span class="text-2xl font-bold text-gray-900">{current.label}</span>
			{#if data.hasProviderSub && data.interval}
				<span class="text-sm text-gray-500">
					{data.interval === 'year'
						? `${formatPrice(data.pricing.yearlyCents, data.pricing.currency)} a year`
						: `${formatPrice(data.pricing.monthlyCents, data.pricing.currency)} a month`}
				</span>
			{:else if current.id === 'pro'}
				<span class="text-sm text-gray-500">
					{formatPrice(data.pricing.monthlyCents, data.pricing.currency)} a month
				</span>
			{/if}

			{#if data.entitlement.until}
				<span class="text-sm text-gray-500">
					{data.entitlement.endingAt
						? `ends ${when(data.entitlement.endingAt)}`
						: data.entitlement.status === 'trialing' || data.entitlement.source === 'trial'
							? `first charge ${when(data.entitlement.until)}`
							: `renews ${when(data.entitlement.until)}`}
				</span>
			{/if}
		</div>

		<div class="mt-3"><FormError message={form?.message} /></div>

		{#if form && 'switched' in form && form.switched}
			<div class="mt-3">
				<Banner
					kind="success"
					message={form.switched === 'yearly' ? 'Yearly it is.' : 'Back to monthly.'}
				/>
			</div>
		{/if}

		{#if data.hasProviderSub && data.yearly && data.interval === 'month'}
			<!-- The one honest upgrade: same subscription, better cycle. -->
			<form method="post" action="?/switchInterval" use:enhance class="mt-4">
				<button name="interval" value="yearly" class="btn btn-primary">
					<Icon name="arrow-right" /> Switch to yearly — {yearlyLine}
				</button>
			</form>
		{:else if data.hasProviderSub && data.interval === 'year'}
			{#if confirmMonthly}
				<div class="mt-4 flex flex-wrap items-center gap-2">
					<span class="text-sm text-gray-700">
						Monthly is {formatPrice(data.pricing.monthlyCents * 12, data.pricing.currency)} over a year
						— {formatPrice(
							data.pricing.monthlyCents * 12 - data.pricing.yearlyCents,
							data.pricing.currency
						)} more for the same thing.
					</span>
					<form method="post" action="?/switchInterval" use:enhance>
						<button name="interval" value="monthly" class="btn btn-sm btn-danger">
							Switch anyway
						</button>
					</form>
					<button type="button" class="btn btn-sm" onclick={() => (confirmMonthly = false)}>
						Keep yearly
					</button>
				</div>
			{:else}
				<button
					type="button"
					class="btn btn-sm btn-quiet mt-4"
					onclick={() => (confirmMonthly = true)}
				>
					Switch to monthly
				</button>
			{/if}
		{/if}

		{#if data.canCheckout}
			<div class="mt-4">
				{#if data.configured}
					{@const trialFirst = data.pricing.trialRequiresCard && data.entitlement.plan === 'none'}
					<!-- Full page post on purpose: the answer is a redirect to the
					     provider's checkout, which enhance would swallow. Yearly
					     leads; it is the one worth taking. -->
					<form method="post" action="?/checkout" class="flex flex-wrap items-center gap-2">
						{#if data.yearly}
							<button class="btn btn-primary" name="interval" value="yearly">
								<Icon name="arrow-right" />
								{trialFirst ? `Start your free ${data.pricing.trialDays} days` : 'Go Pro'} — yearly
							</button>
							<button class="btn" name="interval" value="monthly">
								{formatPrice(data.pricing.monthlyCents, data.pricing.currency)} monthly
							</button>
						{:else}
							<button class="btn btn-primary" name="interval" value="monthly">
								<Icon name="arrow-right" />
								{trialFirst ? `Start your free ${data.pricing.trialDays} days` : 'Go Pro'}
							</button>
						{/if}
					</form>
					{#if data.yearly && yearlyLine}
						<p class="mt-2 text-xs text-gray-500">Yearly is {yearlyLine}.</p>
					{/if}
					{#if trialFirst}
						<p class="mt-1 text-xs text-gray-500">
							Card now, nothing charged today. The first charge comes after the
							{data.pricing.trialDays} days, and a mail warns you two days before.
						</p>
					{/if}
				{:else}
					<p class="mt-2 text-xs text-gray-500">
						This instance has no payment provider configured yet, so there is nothing to buy.
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
</div>
