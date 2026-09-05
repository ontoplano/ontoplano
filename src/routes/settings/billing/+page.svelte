<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import { page } from '$app/state';
	import { base, resolve } from '$app/paths';
	import Banner from '$lib/components/Banner.svelte';
	import Card from '$lib/components/Card.svelte';
	import FormError from '$lib/components/FormError.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import { LIMIT_LABELS, describeYearly, formatPrice, tierPricing } from '$lib/plans';
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

	/**
	 * The rate this account is on, not the one at the top of the price list.
	 *
	 * Everything that describes the *current* subscription — what it costs, what
	 * yearly would save, what monthly would cost over a year — reads `mine`.
	 * The buy buttons below still read `data.pricing`, because there the two
	 * plans are being offered side by side.
	 */
	const mine = $derived(tierPricing(data.pricing, data.tier));
	const yearlyLine = $derived(describeYearly(mine));

	/** Downgrading asks once — twelve months of monthly costs more. */
	let confirmMonthly = $state(false);

	/** "I should be on my partner's plan" — shown instead of buying twice. */
	let onSomebodyElses = $state(false);

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
				: data.entitlement.source === 'invited' && data.entitlement.until
					? // An invitation, not a trial: nothing was charged and no card was
						// asked for. Say when it runs out, because the buttons below are
						// only useful to somebody who knows that it does.
						`You were invited, and your account runs until ${when(data.entitlement.until)}. No card, and nothing charged.`
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
						? `${formatPrice(mine.yearlyCents, mine.currency)} a year`
						: `${formatPrice(mine.monthlyCents, mine.currency)} a month`}
				</span>
			{:else if current.id === 'pro'}
				<span class="text-sm text-gray-500">
					{formatPrice(mine.monthlyCents, mine.currency)} a month
				</span>
			{/if}

			{#if data.tier === 'family'}
				<span class="chip">Family — {data.seats} accounts</span>
				<a class="text-sm underline" href={resolve('/settings/family')}>Who is on it</a>
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
					message={form.switched === 'yearly'
						? 'Switched to yearly billing.'
						: 'Switched to monthly billing.'}
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
						Monthly is {formatPrice(mine.monthlyCents * 12, mine.currency)} over a year — {formatPrice(
							mine.monthlyCents * 12 - mine.yearlyCents,
							mine.currency
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

			<!-- The twice-a-day ceiling is only spoken as its refusal: the third
			     press is told "you can switch again tomorrow", and nobody who
			     never meets the limit reads about it. -->
		{/if}

		{#if data.canCheckout}
			<div class="mt-4">
				{#if data.configured}
					{@const trialFirst = data.pricing.trialRequiresCard && data.trialDaysAhead > 0}
					<!-- Full page post on purpose: the answer is a redirect to the
					     provider's checkout, which enhance would swallow. Yearly
					     leads; it is the one worth taking. -->
					<form method="post" action="?/checkout" class="flex flex-wrap items-center gap-2">
						<input type="hidden" name="tier" value="solo" />
						{#if data.yearly}
							<button class="btn btn-primary" name="interval" value="yearly">
								<Icon name="arrow-right" />
								{trialFirst ? `Start your free ${data.trialDaysAhead} days` : 'Subscribe'} — yearly
							</button>
							<button class="btn" name="interval" value="monthly">
								{formatPrice(data.pricing.monthlyCents, data.pricing.currency)} monthly
							</button>
						{:else}
							<button class="btn btn-primary" name="interval" value="monthly">
								<Icon name="arrow-right" />
								{trialFirst ? `Start your free ${data.trialDaysAhead} days` : 'Subscribe'}
							</button>
						{/if}
					</form>

					<!--
						The family plan, offered beside the ordinary one rather than as
						an upsell after it: somebody buying for a household knows that
						before they reach this page, and finding out afterwards means
						cancelling and buying again.
					-->
					{#if data.pricing.familyMonthlyCents > 0}
						<form
							method="post"
							action="?/checkout"
							class="mt-3 flex flex-wrap items-center gap-2 border-t border-gray-200 pt-3"
						>
							<input type="hidden" name="tier" value="family" />
							<span class="text-sm text-gray-600">
								For up to {data.pricing.familySeats} accounts on one invoice:
							</span>
							{#if data.yearly}
								<button class="btn btn-sm" name="interval" value="yearly">
									{formatPrice(data.pricing.familyYearlyCents, data.pricing.currency)} yearly
								</button>
							{/if}
							<button class="btn btn-sm" name="interval" value="monthly">
								{formatPrice(data.pricing.familyMonthlyCents, data.pricing.currency)} monthly
							</button>
						</form>
					{/if}
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

				<!--
					The third answer to "how do I pay for this": somebody already has.
					Without it the only route was to buy a second subscription and
					then ask for a refund, which is what one person did.
				-->
				{#if !onSomebodyElses}
					<button
						type="button"
						class="btn btn-sm btn-quiet mt-4"
						onclick={() => (onSomebodyElses = true)}
					>
						Somebody else's plan should cover me
					</button>
				{:else}
					<div class="mt-4 border border-gray-200 bg-gray-50 p-3">
						<p class="text-sm text-gray-700">
							Ask them to add you. On their account: Settings → Family → your email address → Add to
							my plan.
						</p>
						<img
							src="{base}/help/family-seat.png"
							alt="The Family tab, with a field for an email address and an Add to my plan button"
							class="mt-3 w-full max-w-2xl border border-gray-200"
							loading="lazy"
						/>
						<p class="mt-2 text-xs text-gray-500">
							A band appears at the top of your app asking whether to accept. Say yes and this page
							goes quiet.
						</p>
						<button type="button" class="btn btn-sm mt-3" onclick={() => (onSomebodyElses = false)}>
							<Icon name="arrow-left" /> Back
						</button>
					</div>
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
