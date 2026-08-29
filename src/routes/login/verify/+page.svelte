<script lang="ts">
	import { enhance } from '$app/forms';
	import type { PageServerData, ActionData } from './$types';
	import Banner from '$lib/components/Banner.svelte';

	let { data, form }: { data: PageServerData; form: ActionData } = $props();

	/**
	 * The button counts down the same 60 seconds the server enforces. The
	 * server's word is the real limit; this only keeps an honest button from
	 * inviting a click that would be refused.
	 */
	let secondsLeft = $state(0);
	let timer: ReturnType<typeof setInterval> | null = null;

	function startCooldown(seconds: number) {
		secondsLeft = seconds;
		if (timer) clearInterval(timer);
		timer = setInterval(() => {
			secondsLeft -= 1;
			if (secondsLeft <= 0 && timer) clearInterval(timer);
		}, 1000);
	}

	$effect(() => {
		const wait = form?.retryAfterSeconds;
		if (wait) startCooldown(wait);
	});
</script>

<div class="flex min-h-screen items-center justify-center bg-gray-100">
	<div class="w-full max-w-sm border border-gray-200 bg-white p-8 shadow-card">
		<h1 class="mb-6 text-xl font-bold tracking-tight text-gray-900">Confirm your address</h1>

		{#if form && 'message' in form && form.message}
			<div class="mb-4"><Banner kind="error" message={form.message} /></div>
		{/if}
		{#if form && 'sent' in form && form.sent}
			<div class="mb-4">
				<Banner
					kind="success"
					message="Sent. Check your mailbox — and the spam folder, the first time."
				/>
			</div>
		{/if}

		<p class="text-sm text-gray-700">
			A confirmation mail went to <strong class="text-gray-900">{data.email}</strong>. Following its
			link signs you in; until then this page is the whole app.
		</p>

		<form method="post" action="?/resend" use:enhance class="mt-6">
			<button
				type="submit"
				disabled={secondsLeft > 0}
				class="w-full bg-gray-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
			>
				{secondsLeft > 0 ? `Send it again (${secondsLeft}s)` : 'Send it again'}
			</button>
		</form>

		<form method="post" action="/login?/signOut" use:enhance class="mt-4 text-xs text-gray-500">
			Wrong address?
			<button type="submit" class="underline">Sign out</button> and register again — nothing has been
			kept yet.
		</form>
	</div>
</div>
