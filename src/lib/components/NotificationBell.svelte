<script lang="ts">
	import Icon from '$lib/components/Icon.svelte';
	import NotificationPanel, { type Sent } from '$lib/components/NotificationPanel.svelte';
	import { useT } from '$lib/i18n';

	/**
	 * What the app has told you, and whether you have read it.
	 *
	 * A push happens once and is gone the moment a lock screen is cleared, so
	 * this is the only place "what did it say while I was out" has an answer.
	 *
	 * **Opening it is reading it.** The badge answers one question — is there
	 * anything I have not looked at — and looking at them answers it. A count
	 * that survives being read is a count people stop believing, and then a
	 * badge nobody looks at.
	 */
	const t = useT();

	let {
		held,
		unread,
		/** Where the panel opens from, since the phone hangs it off a fan. */
		align = 'right'
	}: { held: Sent[]; unread: number; align?: 'right' | 'left' } = $props();

	let open = $state(false);
</script>

<div class="relative">
	<button
		type="button"
		onclick={() => (open = !open)}
		class="relative flex h-8 w-8 items-center justify-center border border-chrome-line bg-chrome-raised text-chrome-muted shadow-sm transition hover:text-chrome-ink hover:brightness-125"
		aria-label={unread > 0
			? t('notifications.open', { count: unread })
			: t('notifications.openNone')}
		aria-expanded={open}
		title={t('notifications.title')}
		data-notifications
	>
		<Icon name="bell" size={16} />
		{#if unread > 0}
			<!--
				The number, not just a dot.

				Up here there is room for it, and "three things you have not read"
				is a different decision from "something happened". The dot without
				a number is the phone's bar, where there is no room and the fan
				behind it carries the count.
			-->
			<span
				class="absolute -top-1 -right-1 grid min-w-4 place-items-center rounded-full bg-red-600 px-1 text-[0.625rem] leading-4 font-semibold text-white tabular-nums"
				data-unread={unread}
			>
				{unread > 99 ? '99+' : unread}
			</span>
		{/if}
	</button>

	{#if open}
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div class="fixed inset-0 z-40" onclick={() => (open = false)}></div>

		<div
			class="rise absolute top-full z-50 mt-1 max-h-[70vh] w-80 overflow-y-auto border border-gray-200 bg-white shadow-overlay {align ===
			'right'
				? 'right-0'
				: 'left-0'}"
			role="dialog"
			aria-label={t('notifications.title')}
		>
			<div class="border-b border-gray-200 px-4 py-2">
				<span class="eyebrow text-gray-600">{t('notifications.title')}</span>
			</div>

			<div class="px-3 py-1">
				<NotificationPanel {held} {unread} onpick={() => (open = false)} />
			</div>
		</div>
	{/if}
</div>
