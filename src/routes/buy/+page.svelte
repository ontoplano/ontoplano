<script lang="ts">
	import { onMount } from 'svelte';
	import { resolve } from '$app/paths';
	import type { PageServerData } from './$types';
	import { useT } from '$lib/i18n';
	import Banner from '$lib/components/Banner.svelte';
	import { fromPlayStore } from '$lib/platform';
	import { PLAY_PARAMS, playTripAddress } from '$lib/play-billing';

	const t = useT();

	let { data }: { data: PageServerData } = $props();

	let failed = $state(false);
	let failure = $state('');

	/**
	 * The store copy: Play's own purchase sheet, then the token to the server.
	 *
	 * The sheet opens on the device's copy of the app, the only origin with a
	 * bridge to the shell, and the answer comes back here in the address —
	 * see `$lib/play-billing`. The server verifies the token with Google and
	 * acknowledges it; only then is the purchase delivered.
	 */
	async function buyThroughPlay(sku: string, account: string) {
		const carried = new URLSearchParams(location.search);
		const purchaseToken = carried.get(PLAY_PARAMS.purchase);
		const refused = carried.get(PLAY_PARAMS.failed);

		if (refused) {
			failure = t('buy.playCouldNotStart', { code: refused });
			failed = true;
			return;
		}
		if (!purchaseToken) {
			if (!fromPlayStore()) {
				failure = t('buy.playOnlyInStoreCopy');
				failed = true;
				return;
			}
			location.replace(playTripAddress(location.origin, sku, account));
			return;
		}

		try {
			const claimed = await fetch(resolve('/api/billing/play/claim'), {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ sku, purchaseToken })
			});
			if (!claimed.ok) throw new Error(String(claimed.status));
			location.replace(data.successUrl);
		} catch {
			failure = t('buy.playNotConfirmed');
			failed = true;
		}
	}

	onMount(() => {
		if (data.play) {
			void buyThroughPlay(data.play.sku, data.play.account);
			return;
		}
		// Injected here rather than in app.html: this is the only page allowed
		// to run the provider's script, and the CSP (hooks.server.ts) is
		// widened for exactly this route.
		const script = document.createElement('script');
		script.src = 'https://cdn.paddle.com/paddle/v2/paddle.js';
		script.onload = () => {
			// Paddle.js opens the checkout by itself from the _ptxn parameter.
			const paddle = (window as unknown as { Paddle: PaddleJs }).Paddle;
			if (data.paddle!.environment === 'sandbox') paddle.Environment.set('sandbox');
			paddle.Initialize({
				token: data.paddle!.token,
				checkout: { settings: { displayMode: 'overlay', successUrl: data.successUrl } }
			});
		};
		script.onerror = () => (failed = true);
		document.head.appendChild(script);
	});

	interface PaddleJs {
		Environment: { set(env: string): void };
		Initialize(options: {
			token: string;
			checkout?: { settings?: { displayMode?: string; successUrl?: string } };
		}): void;
	}
</script>

<div class="flex min-h-screen items-center justify-center bg-gray-100">
	<div class="w-full max-w-md p-8 text-center">
		{#if failed}
			<Banner kind="error" message={failure || t('buy.thePaymentWindowCouldNot')} />
		{:else}
			<p class="text-sm text-gray-500">{t('buy.openingTheSecurePaymentWindow')}</p>
		{/if}
		<p class="mt-6 text-xs text-gray-500">
			<a href={resolve('/settings/billing')} class="underline">{t('buy.backToBilling')}</a>
		</p>
	</div>
</div>
