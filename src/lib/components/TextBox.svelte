<script lang="ts">
	/**
	 * A box for more than one line.
	 *
	 * The app's textarea, in one place: the same border, the same focus ring
	 * and the same growing behaviour wherever somebody writes a paragraph.
	 * `rows` is the height it starts at; `grow` lets it follow what is typed,
	 * which is what a note wants and a fixed-size field does not.
	 *
	 * For a single line use `OneLine`, which is a textarea pretending to be an
	 * input for a reason worth reading there.
	 */
	import { autogrow, DEFAULT_AUTOGROW_MAX_HEIGHT } from '$lib/actions/autogrow';
	import type { HTMLTextareaAttributes } from 'svelte/elements';

	let {
		value = $bindable(''),
		element = $bindable(),
		rows = 3,
		grow = true,
		maxHeight = DEFAULT_AUTOGROW_MAX_HEIGHT,
		class: extra = '',
		...rest
	}: HTMLTextareaAttributes & {
		value?: string;
		/**
		 * The textarea itself, for the things that write into it — a picture
		 * dropping its markdown at the caret, a recording doing the same.
		 */
		element?: HTMLTextAreaElement;
		rows?: number;
		/** Follow what is typed instead of keeping one height. */
		grow?: boolean;
		/** Maximum height for a growing box, in pixels. */
		maxHeight?: number;
		class?: string;
	} = $props();
</script>

{#if grow}
	<textarea
		bind:this={element}
		bind:value
		{rows}
		use:autogrow={maxHeight}
		class="textarea {extra}"
		{...rest}
	></textarea>
{:else}
	<textarea bind:this={element} bind:value {rows} class="textarea {extra}" {...rest}></textarea>
{/if}
