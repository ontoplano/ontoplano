<script lang="ts">
	import { browser } from '$app/environment';
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import Banner from '$lib/components/Banner.svelte';
	import Card from '$lib/components/Card.svelte';
	import { isStandalone } from '$lib/platform';
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
	 * Inside the installed app, this page cannot finish.
	 *
	 * The last step is a link to `ontoplano://widget`, and a scheme link fired
	 * from inside the app resolves back to the app: Android asks "Continue to
	 * Ontoplano?" and Continue reloads this page. The screen that has to receive
	 * the key is the widget's own setup, which is only listening while the app is
	 * in the background — so the page has to be open in a browser.
	 *
	 * Said before the button rather than after it: minting a key that cannot be
	 * delivered leaves a live token on the account and the person no further on.
	 */
	const trapped = $derived(browser && isStandalone());
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
	{:else if trapped}
		<div class="space-y-3">
			<Banner
				kind="warning"
				message="This page has to be open in a browser to finish. Inside the app, the last step comes straight back here."
			/>
			<p class="text-sm text-gray-500">
				Add the widget from your home screen, tap Connect on its setup screen, and it will open this
				page where it can hand the key over.
			</p>
			<p class="text-sm text-gray-500">
				The widget comes with the Android app. A shortcut added from the browser cannot provide one
				— Android only lets an installed app do that.
			</p>
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
