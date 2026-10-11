<script lang="ts">
	import TabbedRoom from '$lib/components/TabbedRoom.svelte';
	import { resolve } from '$app/paths';
	import type { Snippet } from 'svelte';
	import { useT } from '$lib/i18n';
	import Icon from '$lib/components/Icon.svelte';
	import Modal from '$lib/components/Modal.svelte';
	import RoomSurface from '$lib/components/RoomSurface.svelte';
	import { askAgainOnThisPhone, inPhoneApp } from '$lib/instance-choice';
	import type { LayoutData } from './$types';

	const t = useT();

	let { children, data }: { children: Snippet; data: LayoutData } = $props();

	/*
	 * Nothing can reach a device's own instance, so there is nothing here to
	 * set up — but the room still comes, because somebody who installed the
	 * app and went looking for their assistant deserves the reason and the way
	 * to an instance that has one, not a refusal.
	 */
	const onDevice = $derived(data.reachable === false);
	let explaining = $state(false);

	/** What an instance with a server adds, in the order people ask for it. */
	const HOSTED_GIVES = [
		'settings.integrations.device.hostedAssistants',
		'settings.integrations.device.hostedComputer',
		'settings.integrations.device.hostedBackups',
		'settings.integrations.device.hostedFeeds'
	] as const;

	const tabs = [
		{ href: resolve('/settings/integrations'), label: t('rooms.integrations.tabs.ai') },
		{
			href: resolve('/settings/integrations/connections'),
			label: t('rooms.integrations.tabs.connections')
		},
		{
			href: resolve('/settings/integrations/widget'),
			label: t('rooms.integrations.tabs.widgets')
		}
	];
</script>

<!--
	Inside Settings, which already has a bar and its tabs.

	`nested` so this draws only its own strip, at the top of the surface
	Settings put there — it used to draw the whole of a room again, which gave
	the page two bars, two titles and two bands of page ground between them.
-->
{#if onDevice}
	<RoomSurface>
		<div class="flex flex-col items-start gap-2 px-4 py-6" data-tour="integrations-device">
			<p class="flex items-center gap-2 text-sm text-gray-900">
				<Icon name="robot" />
				{t('settings.integrations.device.cannotConnect')}
			</p>
			<button
				type="button"
				class="text-sm font-medium text-gray-700 underline hover:text-gray-900"
				onclick={() => (explaining = true)}
			>
				{t('settings.integrations.device.why')}
			</button>
		</div>
	</RoomSurface>

	<Modal bind:open={explaining} title={t('settings.integrations.device.whyTitle')} size="sm">
		<div class="space-y-4 text-sm text-gray-700">
			<p>{t('settings.integrations.device.whyBody')}</p>
			<div>
				<h3 class="eyebrow text-gray-600">{t('settings.integrations.device.hostedTitle')}</h3>
				<ul class="mt-2 space-y-2">
					{#each HOSTED_GIVES as key (key)}
						<li class="flex gap-2">
							<Icon name="check" />
							<span>{t(key)}</span>
						</li>
					{/each}
				</ul>
			</div>
			<p class="text-gray-500">{t('settings.integrations.device.hostedNow')}</p>
		</div>
		{#snippet footer()}
			{#if inPhoneApp()}
				<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- the question, on the phone's own copy -->
				<a href={askAgainOnThisPhone()} class="btn btn-primary"
					><Icon name="server" />{t('settings.integrations.device.switch')}</a
				>
			{:else}
				<a href={resolve('/instance')} class="btn btn-primary"
					><Icon name="server" />{t('settings.integrations.device.switch')}</a
				>
			{/if}
		{/snippet}
	</Modal>
{:else}
	<div class="integrations">
		<TabbedRoom
			nested
			title={t('rooms.integrations.title')}
			{tabs}
			label={t('rooms.integrations.sections')}
		>
			<div class="integrations-body">{@render children()}</div>
		</TabbedRoom>
	</div>
{/if}

<style>
	/*
	 * The surface steps out to the edges of the room, as it does one level up.
	 *
	 * Settings' own body pulls a full-width surface flush with its sides, but
	 * only a few levels down, and a page under this strip sits deeper than
	 * that — so the tabs' pages were an inset card with a rem of white round
	 * it while Account and Preferences ran edge to edge.
	 */
	@media (width >= 40rem) {
		/* Its rule runs edge to edge under the tabs, like the surface under it. */
		.integrations :global(.room-tabs-nested) {
			margin-inline: -1rem;
			padding-inline: 1rem;
		}

		.integrations-body :global(.room-surface) {
			margin-inline: -1rem;
			border-inline-width: 0;
			border-radius: 0 !important;
		}
	}

	@media (width < 40rem) {
		.integrations-body :global(.room-surface) {
			border-inline-width: 0;
		}
	}

	/*
	 * And it ends the room: no band of the body's padding under its last row,
	 * and no rule across the foot. The room's own rule for this follows the
	 * last child down only so far, and these pages sit deeper than it looks.
	 */
	:global(.room-body:has(.integrations-body > * > .room-surface)) {
		padding-bottom: 0;
	}

	.integrations-body :global(.room-surface) {
		border-bottom-color: transparent;
	}
</style>
