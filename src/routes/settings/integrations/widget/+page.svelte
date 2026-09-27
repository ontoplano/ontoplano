<script lang="ts">
	import { browser } from '$app/environment';
	import { enhance } from '$lib/enhance';
	import { resolve } from '$app/paths';
	import Banner from '$lib/components/Banner.svelte';
	import RoomSurface from '$lib/components/RoomSurface.svelte';
	import SettingGroup from '$lib/components/SettingGroup.svelte';
	import SettingRow from '$lib/components/SettingRow.svelte';
	import CopyBlock from '$lib/components/CopyBlock.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import { isStandalone } from '$lib/platform';
	import type { ActionData, PageServerData } from './$types';
	import NotebookWidgets from './NotebookWidgets.svelte';
	import { useT } from '$lib/i18n';

	const t = useT();

	let { data, form }: { data: PageServerData; form: ActionData } = $props();

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

	/**
	 * The navigation happens on its own, but a link stays on screen: a browser
	 * that refuses a page-initiated scheme change still honours a tap. Not
	 * attempted at all from inside the app, where it is the loop.
	 */
	$effect(() => {
		if (handoff && !trapped) window.location.href = handoff;
	});
</script>

<div class="space-y-4">
	{#if form?.message && !form?.success && !('created' in form) && !('updated' in form)}
		<Banner kind="error" message={form.message} />
	{/if}

	<!-- One surface, a subject per band — the shape every settings screen
	     shares. See `SettingGroup` and `SettingRow`. -->
	<RoomSurface>
		<NotebookWidgets widgets={data.widgets} notebooks={data.notebooks} {form} />

		<SettingGroup
			title={t('settings.integrations.widget.homeScreenWidget')}
			description={t('settings.integrations.widget.theWidgetOnThisPhone')}
		>
			{#if handoff && form?.token}
				<div class="space-y-3 px-4 py-3">
					{#if trapped}
						<Banner
							kind="warning"
							message={t('settings.integrations.widget.openedInsideAppLinkComes')}
						/>
					{:else}
						<Banner
							kind="success"
							message={t('settings.integrations.widget.connectedTakingYouBack')}
						/>
					{/if}

					<!--
						The key, shown as well as sent.

						The link is at the mercy of which app Android decides should
						answer it, and on a phone with this app installed it has answered
						itself. Pasting a key needs no intent, no chooser and no browser,
						so it is the way that cannot fail — the widget's setup screen has
						a box for it.
					-->
					<div>
						<p class="eyebrow mb-1 text-gray-600">
							{t('settings.integrations.widget.theKeyForThisWidget')}
						</p>
						<CopyBlock text={form.token} label={t('ui.copy')} />
						<p class="mt-1 text-xs text-gray-500">
							{t('settings.integrations.widget.pasteItInto')}
							<strong>{t('settings.integrations.widget.orPasteTheKey')}</strong>
							{t('settings.integrations.widget.onTheWidgetSSetupScreen')}
						</p>
					</div>

					{#if !trapped}
						<!-- eslint-disable svelte/no-navigation-without-resolve -- an app scheme, not a route -->
						<p class="text-sm text-gray-500">
							{t('settings.integrations.widget.ifNothingHappens')}
							<a href={handoff} class="font-medium text-gray-900 underline"
								>{t('settings.integrations.widget.finishInTheApp')}</a
							>.
						</p>
						<!-- eslint-enable svelte/no-navigation-without-resolve -->
					{/if}
				</div>
			{:else}
				{#if trapped}
					<div class="px-4 py-3">
						<Banner
							kind="warning"
							message={t('settings.integrations.widget.openedInsideAppRatherThan')}
						/>
					</div>
				{/if}
				<SettingRow
					label={t('settings.integrations.widget.connectThisPhoneSWidget')}
					hint={t('settings.integrations.widget.theWidgetComesWithThe')}
				>
					<p class="mt-1 text-sm text-gray-500">
						{t('settings.integrations.widget.youCanDisconnectItAny')}
						<a
							href={resolve('/settings/integrations/connections')}
							class="font-medium text-gray-900 underline"
							>{t('settings.integrations.widget.integrations')}</a
						>.
					</p>
					{#snippet control()}
						<form method="post" action="?/connect" use:enhance>
							<button class="btn btn-sm">
								<Icon name="phone" />
								{t('settings.integrations.widget.connect')}
							</button>
						</form>
					{/snippet}
				</SettingRow>
			{/if}
		</SettingGroup>
	</RoomSurface>
</div>
