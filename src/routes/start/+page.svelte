<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import { resolve } from '$app/paths';
	import Banner from '$lib/components/Banner.svelte';
	import { describeYearly, formatPrice, tierPricing } from '$lib/plans';
	import type { PageServerData, ActionData } from './$types';

	let { data, form }: { data: PageServerData; form: ActionData } = $props();

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

	function when(iso: string): string {
		return new Date(iso).toLocaleDateString(undefined, {
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

<div class="flex min-h-screen items-center justify-center bg-gray-100">
	<div class="w-full max-w-md border border-gray-200 bg-white p-8 shadow-card">
		{#if data.mode === 'expired'}
			<h1 class="mb-4 text-xl font-bold tracking-tight text-gray-900">Your subscription ended</h1>
			<p class="text-sm text-gray-700">
				Everything you wrote is kept — nothing was deleted. Renew to pick up where you left off, or
				take your data with you.
			</p>
		{:else if data.trialDaysAhead > 0}
			<h1 class="mb-4 text-xl font-bold tracking-tight text-gray-900">
				Your {data.trialDaysAhead} free days
			</h1>
			<p class="text-sm text-gray-700">
				<strong class="text-gray-900">Nothing is charged today.</strong> The first charge is on
				{when(data.firstChargeOn)}, a mail warns you two days before, and cancelling before that
				date costs nothing.
			</p>
		{:else}
			<h1 class="mb-4 text-xl font-bold tracking-tight text-gray-900">Go Pro</h1>
			<p class="text-sm text-gray-700">Billed today — the trial was already used.</p>
		{/if}

		{#if form && 'message' in form && form.message}
			<div class="mt-4"><Banner kind="error" message={form.message} /></div>
		{/if}

		{#if familyOffered}
			<!--
				The plan first, the interval second. Both are on the page whatever
				the front page said: the cookie carrying that choice is a
				convenience, and a household that loses it must not end up on one
				seat without being shown the other price.
			-->
			<div class="mt-6 flex gap-2" role="group" aria-label="Plan">
				<button
					type="button"
					onclick={() => (tier = 'solo')}
					aria-pressed={tier === 'solo'}
					class="flex-1 border px-3 py-2 text-sm transition {tier === 'solo'
						? 'border-gray-900 bg-gray-900 text-white'
						: 'border-gray-300 text-gray-700 hover:bg-gray-50'}"
				>
					Just me
				</button>
				<button
					type="button"
					onclick={() => (tier = 'family')}
					aria-pressed={tier === 'family'}
					class="flex-1 border px-3 py-2 text-sm transition {tier === 'family'
						? 'border-gray-900 bg-gray-900 text-white'
						: 'border-gray-300 text-gray-700 hover:bg-gray-50'}"
				>
					Family — {data.pricing.familySeats} accounts
				</button>
			</div>
		{/if}

		<!-- Full page post on purpose: the answer is a redirect into checkout. -->
		<form method="post" action="?/checkout" class="mt-3 space-y-2">
			<input type="hidden" name="tier" value={familyOffered ? tier : 'solo'} />
			{#if data.yearly && prices.yearlyCents > 0}
				<button
					name="interval"
					value="yearly"
					class="w-full bg-gray-900 px-4 py-3 text-left text-white transition hover:bg-gray-800"
				>
					<span class="block text-sm font-semibold">Yearly — {yearlyLine}</span>
				</button>
				<button
					name="interval"
					value="monthly"
					class="w-full border border-gray-300 px-4 py-2.5 text-left text-sm text-gray-700 transition hover:bg-gray-50"
				>
					Monthly — {formatPrice(prices.monthlyCents, prices.currency)} a month
				</button>
			{:else}
				<button
					name="interval"
					value="monthly"
					class="w-full bg-gray-900 px-4 py-3 text-sm font-semibold text-white transition hover:bg-gray-800"
				>
					Start — {formatPrice(prices.monthlyCents, prices.currency)} a month
				</button>
			{/if}
		</form>

		{#if familyOffered && tier === 'family'}
			<p class="mt-2 text-xs text-gray-500">
				One invoice covers {data.pricing.familySeats} accounts, yours included. You invite the others
				once you are in.
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
						{exporting ? 'Exporting…' : 'Download your data (JSON)'}
					</button>
				</form>
			{:else}
				<p class="mt-3 text-xs text-gray-500">
					Both of today's exports are used — the next unlocks tomorrow.
				</p>
			{/if}
		{/if}

		<div class="mt-5 text-xs text-gray-500">
			<form method="post" action="/login?/signOut" use:enhance>
				<button type="submit" class="underline">Sign out</button>
			</form>
		</div>
	</div>
</div>
