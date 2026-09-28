<script lang="ts">
	import Kbd from '$lib/components/Kbd.svelte';
	import CaptureDialog from '$lib/components/CaptureDialog.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import { captureByShortcut, visibleCaptures, type Capture } from '$lib/capture';
	import { DEFAULT_CAPTURE_SETTINGS, startingNotebook } from '$lib/capture-settings';
	import { page } from '$app/state';
	import { useT } from '$lib/i18n';

	const t = useT();

	/**
	 * Capture, on a phone.
	 *
	 * Someone who opens the app to write down an idea before it evaporates
	 * should not have to find the Ideas section, wait for it to load and press
	 * New. Four buttons at the top of the dashboard, one tap each, and the thing
	 * is written where it belongs.
	 *
	 * On a phone it is a row of tiles at the top of the dashboard; on a desktop
	 * the same four sit inline in the header, where they cost one line and save
	 * a page load. Both post to the same actions the pages do, so there is no
	 * second write path to keep correct.
	 */
	let {
		error = null,
		/** The desktop shape: a row of small buttons rather than tiles. */
		inline = false,
		hidden = []
	}: { error?: string | null; inline?: boolean; hidden?: readonly string[] } = $props();

	const captures = $derived(visibleCaptures(hidden));

	let open = $state<Capture | null>(null);

	/** The same starting notebook the wheel's forms get. */
	const notebookId = $derived(
		startingNotebook(page.data.captureSettings ?? DEFAULT_CAPTURE_SETTINGS, {
			id: page.route.id,
			params: page.params,
			search: page.url.searchParams
		})
	);

	function show(capture: Capture) {
		open = capture;
	}

	/** Opened by key from the page that hosts this. */
	export function openByShortcut(key: string): boolean {
		const match = captureByShortcut(key);
		// A hidden section's keystroke is off with its buttons — a shortcut
		// that writes into a room the menus say is not there is a haunting.
		if (!match || captures.every((c) => c.key !== match.key)) return false;
		show(match);
		return true;
	}
</script>

{#if inline}
	<!--
		Four buttons told apart by their glyphs and their words. The glyphs wore
		their rooms' colours once, which put a small red icon in the header of
		every day — colour belongs to categories, and red is the one hue a
		red-green colourblind eye cannot place.
	-->
	<div class="hidden items-center gap-1 lg:flex">
		{#each captures as capture (capture.key)}
			<button type="button" onclick={() => show(capture)} class="btn btn-sm">
				<Icon name={capture.icon} />
				{t(capture.label)}
				<!-- A key cap like every other hint; a touch screen drops it. -->
				<Kbd keys={capture.shortcut} />
			</button>
		{/each}
	</div>
{:else}
	<div class="flex gap-2 lg:hidden">
		{#each captures as capture (capture.key)}
			<button
				type="button"
				onclick={() => show(capture)}
				class="lift flex flex-1 flex-col items-center gap-1 border border-gray-200 bg-white px-2 py-3 text-xs text-gray-700 shadow-card"
			>
				<span class="text-gray-500"><Icon name={capture.icon} size={18} /></span>
				<!-- No keystroke here: this is the phone, where there is no keyboard
				     to press it on. The desktop row above says it instead. -->
				<span>{t(capture.label)}</span>
			</button>
		{/each}
	</div>
{/if}

<CaptureDialog capture={open} {error} {notebookId} onclose={() => (open = null)} />
