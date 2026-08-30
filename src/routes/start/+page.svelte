<script lang="ts">
	import { enhance } from '$app/forms';
	import Banner from '$lib/components/Banner.svelte';
	import { describeYearly, formatPrice } from '$lib/plans';
	import type { PageServerData, ActionData } from './$types';

	let { data, form }: { data: PageServerData; form: ActionData } = $props();

	const yearlyLine = $derived(describeYearly(data.pricing));

	function when(iso: string): string {
		return new Date(iso).toLocaleDateString(undefined, {
			day: 'numeric',
			month: 'long',
			year: 'numeric'
		});
	}
</script>

<div class="flex min-h-screen items-center justify-center bg-gray-100">
	<div class="w-full max-w-md border border-gray-200 bg-white p-8 shadow-card">
		<h1 class="mb-4 text-xl font-bold tracking-tight text-gray-900">
			Your {data.pricing.trialDays} free days
		</h1>

		{#if form?.message}
			<div class="mb-4"><Banner kind="error" message={form.message} /></div>
		{/if}

		<p class="text-sm text-gray-700">
			<strong class="text-gray-900">Nothing is charged today.</strong> The first charge is on
			{when(data.firstChargeOn)}, a mail warns you two days before, and cancelling before that date
			costs nothing.
		</p>

		<!-- Full page post on purpose: the answer is a redirect into checkout. -->
		<form method="post" action="?/checkout" class="mt-6 space-y-2">
			{#if data.yearly}
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
					Monthly — {formatPrice(data.pricing.monthlyCents, data.pricing.currency)} a month
				</button>
			{:else}
				<button
					name="interval"
					value="monthly"
					class="w-full bg-gray-900 px-4 py-3 text-sm font-semibold text-white transition hover:bg-gray-800"
				>
					Start — {formatPrice(data.pricing.monthlyCents, data.pricing.currency)} a month
				</button>
			{/if}
		</form>

		<form method="post" action="/login?/signOut" use:enhance class="mt-5 text-xs text-gray-500">
			Not now? <button type="submit" class="underline">Sign out</button>.
		</form>
	</div>
</div>
