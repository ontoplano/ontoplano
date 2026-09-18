<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import { resolve } from '$app/paths';
	import Banner from '$lib/components/Banner.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import { describeYearly, formatPrice, tierPricing, type Pricing } from '$lib/plans';
	import type { PageServerData, ActionData } from './$types';
	import { useT } from '$lib/i18n';

	const t = useT();

	let { data, form }: { data: PageServerData; form: ActionData } = $props();
	/**
	 * Which way money goes. Only the copy installed from Google Play has the
	 * Digital Goods API; when it is there, the checkout action routes to Play
	 * Billing instead of minting a provider transaction. Detected once — a
	 * browser never grows the API mid-visit.
	 */
	let payChannel = $state('');
	$effect(() => {
		if ('getDigitalGoodsService' in window) payChannel = 'play';
	});
	/** The billing page's rule, on the other page that charges: inside the
	 * installed app with no Play sheet, nothing here may open a checkout. */
	const moneyStays = $derived(data.inApp && payChannel !== 'play');

	/*
	 * Which plan is being bought, here on the page where it is bought.
	 *
	 * It opens on whatever was chosen on the front page and stays changeable:
	 * somebody who came for the family plan should not have to buy one seat and
	 * then upgrade, and somebody who came for one seat should still be able to
	 * see there is a household rate before they pay rather than after.
	 */
	let tier = $state<'solo' | 'family'>(data.wanted);
	const familyOffered = $derived(data.pricing.familyMonthlyCents > 0);
	const prices = $derived(tierPricing(data.pricing, familyOffered ? tier : 'solo'));
	const yearlyLine = $derived(describeYearly(prices));

	/** The cheapest way to have a plan, for its tile: the yearly rate if there is one. */
	function fromMonthly(p: Pricing): string {
		const cents = p.yearlyCents > 0 ? Math.round(p.yearlyCents / 12) : p.monthlyCents;
		return `from ${formatPrice(cents, p.currency)} a month`;
	}
	const soloFrom = $derived(fromMonthly(tierPricing(data.pricing, 'solo')));
	const familyFrom = $derived(fromMonthly(tierPricing(data.pricing, 'family')));

	function when(iso: string): string {
		return new Date(iso).toLocaleDateString(t.locale, {
			day: 'numeric',
			month: 'long',
			year: 'numeric'
		});
	}

	/**
	 * A paid checkout resolves by webhook, seconds after the browser is back —
	 * polling until the hold clears means the server-side redirect fires on
	 * its own instead of showing a stale card page.
	 */
	$effect(() => {
		let polls = 0;
		const timer = setInterval(() => {
			polls += 1;
			if (polls > 20) clearInterval(timer);
			else invalidateAll();
		}, 3000);
		return () => clearInterval(timer);
	});

	/**
	 * One export per click.
	 *
	 * It used to be a link, which the client router tried to route to — the
	 * export is an endpoint, not a page, so the first tap raised a navigation
	 * error instead of downloading, and only the second one appeared to work.
	 * A plain form submits natively, and the guard below disarms the button
	 * for the same gesture rather than for a re-render: two of a day's two
	 * exports must not go to one impatient double-tap.
	 */
	let exporting = $state(false);

	function startExport(event: SubmitEvent) {
		if (exporting) {
			event.preventDefault();
			return;
		}
		exporting = true;
		// After the submission is under way, so the button is still enabled at
		// the moment the browser reads the form.
		setTimeout(() => (exporting = false), 6000);
	}
</script>

<div class="solo-screen bg-gray-100">
	<div class="solo-card sm:max-w-md">
		{#if data.mode === 'expired'}
			<h1 class="mb-4 text-xl font-bold tracking-tight text-gray-900">
				{t('start.yourSubscriptionEnded')}
			</h1>
			<p class="text-sm text-gray-700">
				{t('start.everythingYouWroteIsKept')}
			</p>
		{:else if data.trialDaysAhead > 0}
			<!-- The promise is the heading. "Your 14 free days" named the offer;
			     what the person at a card form wants said first is that pressing
			     a button here costs nothing. -->
			<h1 class="mb-4 text-2xl font-bold tracking-tight text-gray-900">
				{t('start.nothingIsChargedToday')}
			</h1>
			<p class="text-sm text-gray-700">
				<strong class="text-gray-900"
					>{t('start.youGetFreeDaysEvenIf', { trialDaysAhead: data.trialDaysAhead })}</strong
				><br />
				{t('start.ifNotTheFirstCharge', { firstChargeOn: when(data.firstChargeOn) })}
			</p>
		{:else}
			<h1 class="mb-4 text-xl font-bold tracking-tight text-gray-900">{t('start.subscribe')}</h1>
			<p class="text-sm text-gray-700">{t('start.billedTodayTheTrial')}</p>
		{/if}

		<!-- What the money is actually for — said before it is asked for. -->
		<p class="mt-3 text-sm text-gray-500">
			{t('start.ontoplanoIsFreeAndOpen')}
		</p>

		{#if form && 'message' in form && form.message}
			<div class="mt-4"><Banner kind="error" message={form.message} /></div>
		{/if}

		{#if familyOffered}
			<!--
				Two questions, two shapes — the shapes every payment page uses.

				Which plan comes first: two big square tiles side by side, the
				selected one unmistakable, each carrying its cheapest rate. Which
				interval comes below, and those are the only elements shaped like
				"press this and money moves". The tiles keep a constant border
				width so choosing one moves nothing (a selection must not reflow
				the page) — it only rewrites the prices under it.
			-->
			<div class="mt-6 grid grid-cols-2 gap-3" role="radiogroup" aria-label={t('start.plan')}>
				<button
					type="button"
					role="radio"
					onclick={() => (tier = 'solo')}
					aria-checked={tier === 'solo'}
					class="flex aspect-square flex-col items-center justify-center gap-1.5 border-2 text-center transition {tier ===
					'solo'
						? 'border-gray-900 bg-gray-50'
						: 'border-gray-200 hover:border-gray-400'}"
				>
					<span class={tier === 'solo' ? 'text-gray-900' : 'text-gray-400'}>
						<Icon name="user" size={36} />
					</span>
					<span class="text-lg font-bold text-gray-900">{t('start.justMe')}</span>
					<span class="text-xs text-gray-500">{t('start.1Account')}</span>
					<span class="text-sm font-medium text-gray-700">{soloFrom}</span>
				</button>
				<button
					type="button"
					role="radio"
					onclick={() => (tier = 'family')}
					aria-checked={tier === 'family'}
					class="flex aspect-square flex-col items-center justify-center gap-1.5 border-2 text-center transition {tier ===
					'family'
						? 'border-gray-900 bg-gray-50'
						: 'border-gray-200 hover:border-gray-400'}"
				>
					<span class={tier === 'family' ? 'text-gray-900' : 'text-gray-400'}>
						<Icon name="home" size={36} />
					</span>
					<span class="text-lg font-bold text-gray-900">{t('start.family')}</span>
					<span class="text-xs text-gray-500"
						>{t('start.accounts', { familySeats: data.pricing.familySeats })}</span
					>
					<span class="text-sm font-medium text-gray-700">{familyFrom}</span>
				</button>
			</div>
		{/if}

		{#if moneyStays}
			<p class="mt-3 text-sm text-gray-600">{t('start.aSubscriptionCannotBeStarted')}</p>
		{:else}
			<!-- Full page post on purpose: the answer is a redirect into checkout. -->
			<form method="post" action="?/checkout" class="mt-3 space-y-2">
				<input type="hidden" name="tier" value={familyOffered ? tier : 'solo'} />
				<input type="hidden" name="channel" value={payChannel} />
				{#if data.yearly && prices.yearlyCents > 0}
					<button name="interval" value="yearly" class="btn btn-money">
						<span class="block text-sm font-semibold"
							>{t('start.yearly', { yearlyLine: yearlyLine ?? '' })}</span
						>
					</button>
					<button name="interval" value="monthly" class="btn btn-outline btn-money-quiet"
						>{t('start.monthlyAMonth', {
							currency: formatPrice(prices.monthlyCents, prices.currency)
						})}</button
					>
				{:else}
					<button name="interval" value="monthly" class="btn btn-money"
						>{t('start.startAMonth', {
							currency: formatPrice(prices.monthlyCents, prices.currency)
						})}</button
					>
				{/if}
			</form>
		{/if}

		{#if familyOffered}
			<!-- Always in the layout, shown only for the family plan: picking a
			     plan must not shove the buttons below it around. -->
			<p
				class="mt-2 text-xs text-gray-500 {tier === 'family' ? '' : 'invisible'}"
				aria-hidden={tier !== 'family'}
			>
				{t('start.oneInvoiceCoversAccountsYours', { familySeats: data.pricing.familySeats })}
			</p>
		{/if}

		{#if data.mode === 'expired'}
			{#if data.exportsLeft > 0}
				<!-- A native GET, not a routed link: the target is an endpoint. -->
				<form
					method="get"
					action={resolve('/settings/account/export')}
					onsubmit={startExport}
					class="mt-3"
				>
					<button
						type="submit"
						disabled={exporting}
						class="w-full border border-gray-300 px-4 py-2.5 text-center text-sm text-gray-700 transition hover:bg-gray-50 disabled:opacity-50"
					>
						{exporting ? 'Exporting…' : t('start.downloadYourDataJson')}
					</button>
				</form>
			{:else}
				<p class="mt-3 text-xs text-gray-500">
					{t('start.bothOfTodaySExportsAre')}
				</p>
			{/if}
		{/if}

		{#if data.demo}
			<!--
				The way out that is not "sign out".

				Somebody who reached a card without having seen the thing has two
				options here otherwise: pay, or leave. A demo is the third — a real
				button rather than a line of small print, since for the undecided it
				is the most useful thing on the page — and it opens in a tab of its
				own so this page is still behind it.
			-->
			<!-- An address on another host, so `resolve` has nothing to do with
			     it — the rule is about this app's own routes. -->
			<!-- eslint-disable svelte/no-navigation-without-resolve -->
			<!-- Deliberately not button-shaped: the buttons above take money, and
			     nothing that does not may dress like them. -->
			<a
				href={data.demo}
				target="_blank"
				rel="noopener"
				class="mt-5 block text-center text-sm font-medium text-gray-700 underline underline-offset-4 transition hover:text-gray-900"
			>
				{t('start.letMeSeeTheDemo')}
			</a>
			<!-- eslint-enable svelte/no-navigation-without-resolve -->
		{/if}

		<div class="mt-6 space-y-3 border-t border-gray-200 pt-4 text-xs text-gray-500">
			<!-- eslint-disable svelte/no-navigation-without-resolve -->
			<p>
				<a
					href="https://docs.ontoplano.com/running-it"
					target="_blank"
					rel="noopener"
					class="underline hover:text-gray-900"
				>
					{t('start.iWantToHostMy')}
				</a>
			</p>
			<!-- eslint-enable svelte/no-navigation-without-resolve -->
			<form method="post" action="/login?/signOut" use:enhance>
				<button type="submit" class="underline">{t('start.signOut')}</button>
			</form>
		</div>
	</div>
</div>
