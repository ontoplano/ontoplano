<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import { resolve } from '$app/paths';
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

	/** One export at a time — the button disables so a double-click cannot burn both. */
	let exporting = $state(false);
	function startExport() {
		exporting = true;
		setTimeout(() => (exporting = false), 5000);
	}

	function setThemeNow(theme: string) {
		document.documentElement.dataset.theme = theme;
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

		{#if data.mode === 'expired'}
			{#if data.exportsLeft > 0}
				<a
					href={resolve('/settings/account/export')}
					data-sveltekit-preload-data="off"
					class="mt-3 block w-full border border-gray-300 px-4 py-2.5 text-center text-sm text-gray-700 transition hover:bg-gray-50 {exporting
						? 'pointer-events-none opacity-50'
						: ''}"
					onclick={startExport}
				>
					{exporting ? 'Exporting…' : 'Download your data (JSON)'}
				</a>
			{:else}
				<p class="mt-3 text-xs text-gray-500">
					Both of today's exports are used — the next unlocks tomorrow.
				</p>
			{/if}
		{/if}

		<div class="mt-5 flex items-center justify-between text-xs text-gray-500">
			<form method="post" action="/login?/signOut" use:enhance>
				Not now? <button type="submit" class="underline">Sign out</button>.
			</form>
			<form method="post" action="?/theme" use:enhance class="flex gap-2">
				<button name="theme" value="light" class="underline" onclick={() => setThemeNow('light')}>
					Light
				</button>
				<button name="theme" value="dark" class="underline" onclick={() => setThemeNow('dark')}>
					Dark
				</button>
			</form>
		</div>
	</div>
</div>
