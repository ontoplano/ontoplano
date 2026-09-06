<script lang="ts">
	import { onMount } from 'svelte';
	import { resolve } from '$app/paths';
	import type { PageServerData } from './$types';

	let { data }: { data: PageServerData } = $props();

	let failed = $state(false);
	let failure = $state('');

	/**
	 * The store copy: Play's own purchase sheet, then the token to the server.
	 *
	 * The Digital Goods API only exists inside the Play-installed app, which is
	 * how this page can be certain the sheet will open. `complete()` is called
	 * only after the server verified and wrote the entitlement — completing
	 * first would tell Play the purchase was delivered before it was.
	 */
	async function buyThroughPlay(sku: string) {
		try {
			const w = window as unknown as {
				getDigitalGoodsService?: (id: string) => Promise<{
					getDetails(ids: string[]): Promise<{ itemId: string }[]>;
				}>;
			};
			if (!w.getDigitalGoodsService) {
				failure = 'This copy of the app cannot open the Play purchase sheet.';
				failed = true;
				return;
			}
			const service = await w.getDigitalGoodsService('https://play.google.com/billing');
			await service.getDetails([sku]);

			const request = new PaymentRequest(
				[{ supportedMethods: 'https://play.google.com/billing', data: { sku } }],
				// Play draws its own sheet with its own numbers; this total is a
				// required formality the sheet never shows.
				{ total: { label: 'Ontoplano', amount: { currency: 'USD', value: '0' } } }
			);
			const response = await request.show();
			const { purchaseToken } = response.details as { purchaseToken: string };

			const claimed = await fetch(resolve('/api/billing/play/claim'), {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ sku, purchaseToken })
			});
			if (!claimed.ok) {
				await response.complete('fail');
				failure =
					'The purchase went through but could not be confirmed — it will be picked up shortly, or contact support.';
				failed = true;
				return;
			}
			await response.complete('success');
			location.assign(data.successUrl);
		} catch (e) {
			// The person closing Play's sheet lands here too — not an error.
			if ((e as { name?: string })?.name === 'AbortError') {
				location.assign(resolve('/settings/billing'));
				return;
			}
			failure = 'The Play purchase could not start.';
			failed = true;
		}
	}

	onMount(() => {
		if (data.play) {
			void buyThroughPlay(data.play.sku);
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
			<p class="text-sm text-red-600">
				{failure ||
					'The payment window could not load — an ad blocker sometimes takes it down. Allow this page, or try another browser.'}
			</p>
		{:else}
			<p class="text-sm text-gray-500">Opening the secure payment window…</p>
		{/if}
		<p class="mt-6 text-xs text-gray-500">
			<a href={resolve('/settings/billing')} class="underline">Back to billing</a>
		</p>
	</div>
</div>
