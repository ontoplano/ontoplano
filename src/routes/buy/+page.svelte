<script lang="ts">
	import { onMount } from 'svelte';
	import { resolve } from '$app/paths';
	import type { PageServerData } from './$types';

	let { data }: { data: PageServerData } = $props();

	let failed = $state(false);

	onMount(() => {
		// Injected here rather than in app.html: this is the only page allowed
		// to run the provider's script, and the CSP (hooks.server.ts) is
		// widened for exactly this route.
		const script = document.createElement('script');
		script.src = 'https://cdn.paddle.com/paddle/v2/paddle.js';
		script.onload = () => {
			// Paddle.js opens the checkout by itself from the _ptxn parameter.
			const paddle = (window as unknown as { Paddle: PaddleJs }).Paddle;
			if (data.paddle.environment === 'sandbox') paddle.Environment.set('sandbox');
			paddle.Initialize({
				token: data.paddle.token,
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
				The payment window could not load — an ad blocker sometimes takes it down. Allow this page,
				or try another browser.
			</p>
		{:else}
			<p class="text-sm text-gray-500">Opening the secure payment window…</p>
		{/if}
		<p class="mt-6 text-xs text-gray-500">
			<a href={resolve('/settings/billing')} class="underline">Back to billing</a>
		</p>
	</div>
</div>
