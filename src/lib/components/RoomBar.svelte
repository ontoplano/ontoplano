<script lang="ts">
	import { resolve } from '$app/paths';
	import Icon from '$lib/components/Icon.svelte';

	/**
	 * A room's name, its tabs, and the way back — in one place for every room.
	 *
	 * On a phone this is the app's header: it stays at the top while the room
	 * scrolls under it, so the name of where you are and the way between its
	 * tabs are always there. That is what a native app does and what a web page
	 * usually does not, and the difference is most of why one feels like an
	 * app.
	 *
	 * The house is the way out — a phone has a system back gesture, but it
	 * unwinds history rather than going home, and "take me back to today" is
	 * the commonest thing to want from four screens deep. It is a phone
	 * affordance only: on a wide screen the navigation bar is already on the
	 * page and a second way home would be noise.
	 *
	 * Four rooms drew this markup themselves and had already drifted — Tasks
	 * hid its own name on a phone, the others did not.
	 */
	let { title, children }: { title: string; children?: import('svelte').Snippet } = $props();
</script>

<div class="room-bar">
	<div class="flex items-center gap-2 pb-2 sm:pb-0">
		<a
			href={resolve('/')}
			class="icon-btn -ml-1 shrink-0 sm:hidden"
			aria-label="Back to today"
			title="Back to today"
		>
			<Icon name="home" />
		</a>
		<h1 class="min-w-0 shrink-0 truncate text-lg font-bold text-gray-900">{title}</h1>
	</div>
	{@render children?.()}
</div>
