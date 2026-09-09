<script lang="ts">
	import Icon from '$lib/components/Icon.svelte';

	/**
	 * Something to copy, with the copying inside it.
	 *
	 * The button used to float in the margin beside the block, which read as a
	 * control belonging to the page rather than to the thing under it — and left
	 * a column of empty space next to every snippet. It belongs in the corner of
	 * the box it copies, as a glyph, the way every other place that offers this
	 * does it.
	 *
	 * One component because there are four of these on one page and more in the
	 * app; four hand-rolled copies drift, and three of them were already drifting.
	 */
	let {
		text,
		label = 'Copy',
		wrap = true
	}: {
		text: string;
		/** What the button says to a screen reader, and in its tooltip. */
		label?: string;
		/** Long prose wraps; a command is better scrolled than broken. */
		wrap?: boolean;
	} = $props();

	let copied = $state(false);
	let timer: ReturnType<typeof setTimeout> | undefined;

	async function copy() {
		try {
			await navigator.clipboard.writeText(text);
		} catch {
			// A browser that will not: the text is on screen to select by hand, and
			// saying "Copied!" when nothing was would be worse than saying nothing.
			return;
		}
		copied = true;
		clearTimeout(timer);
		timer = setTimeout(() => (copied = false), 1600);
	}
</script>

<div class="relative">
	<!--
		Room at the top right for the button, so a long first line runs under it
		rather than behind it.
	-->
	<pre
		class="overflow-x-auto border border-gray-200 bg-gray-50 py-3 pr-14 pl-4 font-mono text-xs leading-relaxed text-gray-900 {wrap
			? 'whitespace-pre-wrap'
			: 'whitespace-pre'}">{text}</pre>

	<button
		type="button"
		onclick={copy}
		title={label}
		aria-label={label}
		class="icon-btn absolute top-1.5 right-1.5 border border-gray-200 bg-gray-50 text-gray-500 hover:text-gray-900"
	>
		<Icon name="copy" size={16} />
	</button>

	<!--
		The word, where the glyph is, only after it worked.

		Not a toast in the corner of the window: the answer to "did that copy?"
		belongs where the eye already is, which is the button just pressed. It
		covers the glyph rather than moving anything, so nothing on the page
		shifts under the pointer.
	-->
	{#if copied}
		<span
			class="pointer-events-none absolute top-1.5 right-1.5 flex h-9 items-center border border-gray-300 bg-gray-100 px-2 text-xs font-medium text-gray-900"
			aria-live="polite">Copied!</span
		>
	{/if}
</div>
