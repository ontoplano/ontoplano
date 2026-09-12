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
	import { autogrow } from '$lib/actions/autogrow';
	import type { HTMLTextareaAttributes } from 'svelte/elements';

	let {
		value = $bindable(''),
		rows = 3,
		grow = true,
		class: extra = '',
		...rest
	}: HTMLTextareaAttributes & {
		value?: string;
		rows?: number;
		/** Follow what is typed instead of keeping one height. */
		grow?: boolean;
		class?: string;
	} = $props();
</script>

{#if grow}
	<textarea bind:value {rows} use:autogrow class="textarea {extra}" {...rest}></textarea>
{:else}
	<textarea bind:value {rows} class="textarea {extra}" {...rest}></textarea>
{/if}
