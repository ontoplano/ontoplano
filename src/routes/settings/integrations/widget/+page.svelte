<script lang="ts">
	import { browser } from '$app/environment';
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import Banner from '$lib/components/Banner.svelte';
	import Card from '$lib/components/Card.svelte';
	import Icon from '$lib/components/Icon.svelte';
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
	 * Whether this page is running inside the installed app.
	 *
	 * It changes what to advise, not whether to proceed. The last step is a link
	 * to `ontoplano://widget`, and Android decides which app answers that — with
	 * this app installed it has answered itself, which is the loop where
	 * "Continue to Ontoplano?" leads back to this page.
	 *
	 * It used to refuse to start here, which was worse: the widget's setup opens
	 * this page itself, so somebody arriving that way was told to do the one
	 * thing they could not do. It warns and carries on, and the key below is the
	 * way through when the link will not go.
	 */
	const trapped = $derived(browser && isStandalone());

	let copied = $state(false);

	async function copy(value: string) {
		try {
			await navigator.clipboard.writeText(value);
			copied = true;
			setTimeout(() => (copied = false), 2000);
		} catch {
			// A browser that refuses the clipboard is not an error worth a banner;
			// the key is on screen and can be selected.
		}
	}

	/**
	 * The navigation happens on its own, but a link stays on screen: a browser
	 * that refuses a page-initiated scheme change still honours a tap. Not
	 * attempted at all from inside the app, where it is the loop.
	 */
	$effect(() => {
		if (handoff && !trapped) window.location.href = handoff;
	});
</script>

{#if form?.message && !form?.success}
	<Banner kind="error" message={form.message} />
{/if}

<Card
	title="Home-screen widget"
	description="The widget on this phone gets its own key. It can read today's plan and nothing else."
>
	{#if handoff && form?.token}
		<div class="space-y-3">
			{#if trapped}
				<Banner
					kind="warning"
					message="This page opened inside the app, so the link back to the widget comes round to here. Copy the key instead and paste it on the widget's setup screen."
				/>
			{:else}
				<Banner kind="success" message="Connected. Taking you back to the widget…" />
			{/if}

			<!--
				The key, shown as well as sent.

				The link is at the mercy of which app Android decides should answer
				it, and on a phone with this app installed it has answered itself.
				Pasting a key needs no intent, no chooser and no browser, so it is
				the way that cannot fail — the widget's setup screen has a box for it.
			-->
			<div>
				<p class="eyebrow mb-1 text-gray-600">The key for this widget</p>
				<div class="flex items-center gap-2">
					<code
						class="tabular flex-1 border border-gray-300 bg-gray-50 px-3 py-2 text-xs break-all"
					>
						{form.token}
					</code>
					<button type="button" onclick={() => copy(form.token!)} class="btn btn-sm">
						<Icon name="copy" />
						{copied ? 'Copied' : 'Copy'}
					</button>
				</div>
				<p class="mt-1 text-xs text-gray-500">
					Paste it into <strong>Or paste the key</strong> on the widget's setup screen. It is shown once.
				</p>
			</div>

			{#if !trapped}
				<!-- eslint-disable svelte/no-navigation-without-resolve -- an app scheme, not a route -->
				<p class="text-sm text-gray-500">
					If nothing happens,
					<a href={handoff} class="font-medium text-gray-900 underline">finish in the app</a>.
				</p>
				<!-- eslint-enable svelte/no-navigation-without-resolve -->
			{/if}
		</div>
	{:else}
		{#if trapped}
			<div class="mb-3">
				<Banner
					kind="warning"
					message="This page opened inside the app rather than in a browser. Connect still works — you will copy the key across by hand at the end."
				/>
			</div>
		{/if}

		<form method="post" action="?/connect" use:enhance>
			<button class="btn btn-primary">Connect this phone's widget</button>
		</form>
		<p class="mt-3 text-sm text-gray-500">
			The widget comes with the Android app. A shortcut added from the browser cannot provide one —
			Android only lets an installed app do that.
		</p>
		<p class="mt-2 text-sm text-gray-500">
			You can disconnect it any time by revoking its key under
			<a href={resolve('/settings/integrations')} class="font-medium text-gray-900 underline"
				>Integrations</a
			>.
		</p>
	{/if}
</Card>
