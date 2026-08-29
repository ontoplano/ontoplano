<script lang="ts">
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import Banner from '$lib/components/Banner.svelte';
	import Card from '$lib/components/Card.svelte';
	import type { ActionData } from './$types';

	let { form }: { form: ActionData } = $props();

	/**
	 * Where the phone app listens. Any app on the phone could claim this scheme,
	 * which is why the key it carries can read today and nothing else.
	 */
	const handoff = $derived(
		form?.success && form.token
			? `ontoplano://widget?origin=${encodeURIComponent(form.origin)}&token=${encodeURIComponent(form.token)}`
			: null
	);

	/**
	 * The navigation happens on its own, but a link stays on screen: a browser
	 * that refuses a page-initiated scheme change still honours a tap.
	 */
	$effect(() => {
		if (handoff) window.location.href = handoff;
	});
</script>

{#if form?.message && !form?.success}
	<Banner kind="error" message={form.message} />
{/if}

<Card
	title="Home-screen widget"
	description="The widget on this phone gets its own key. It can read today's plan and nothing else."
>
	{#if handoff}
		<div class="space-y-3">
			<Banner kind="success" message="Connected. Taking you back to the widget…" />
			<!-- eslint-disable svelte/no-navigation-without-resolve -- an app scheme, not a route -->
			<p class="text-sm text-gray-500">
				If nothing happens,
				<a href={handoff} class="font-medium text-gray-900 underline">finish in the app</a>.
			</p>
			<!-- eslint-enable svelte/no-navigation-without-resolve -->
		</div>
	{:else}
		<form method="post" action="?/connect" use:enhance>
			<button class="btn btn-primary">Connect this phone's widget</button>
		</form>
		<p class="mt-3 text-sm text-gray-500">
			You can disconnect it any time by revoking its key under
			<a href={resolve('/settings/integrations')} class="font-medium text-gray-900 underline"
				>Integrations</a
			>.
		</p>
	{/if}
</Card>
