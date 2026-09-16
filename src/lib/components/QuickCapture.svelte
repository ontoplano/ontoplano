<script lang="ts">
	import CaptureDialog from '$lib/components/CaptureDialog.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import { captureByShortcut, visibleCaptures, type Capture } from '$lib/capture';
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
		Four buttons that were four identical grey pills, distinguishable only by
		reading them. The one thing that actually tells them apart is where each
		one writes — and those rooms already have colours. So the glyph carries the
		section's accent and the row becomes scannable at a glance, while the
		button itself stays neutral: the colour marks the destination, it does not
		make four buttons shout.
	-->
	<div class="hidden items-center gap-1 lg:flex">
		{#each captures as capture (capture.key)}
			<button type="button" onclick={() => show(capture)} class="btn btn-sm">
				<span style="color:{capture.color}"><Icon name={capture.icon} /></span>
				{t(capture.label)}
				<!--
					`kbd-hint` so a touch screen wide enough for this row still drops
					it: a keystroke is noise where there is no keyboard. `gray-600`
					rather than `gray-500` because it sits on a button's face, which
					is lighter than the page — twelve-point type needs 4.5:1 and grey
					on that ground was 4.27.
				-->
				<span class="kbd-hint text-gray-600">({capture.shortcut})</span>
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
				<!-- The same accent as the row on a wide screen: these are the same
				     four buttons and they cannot look like two different ideas. -->
				<span style="color:{capture.color}"><Icon name={capture.icon} size={18} /></span>
				<!-- No keystroke here: this is the phone, where there is no keyboard
				     to press it on. The desktop row above says it instead. -->
				<span>{t(capture.label)}</span>
			</button>
		{/each}
	</div>
{/if}

<CaptureDialog capture={open} {error} onclose={() => (open = null)} />
