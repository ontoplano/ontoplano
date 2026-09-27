<script lang="ts">
	import type { Snippet } from 'svelte';
	import Icon from '$lib/components/Icon.svelte';

	/**
	 * The box that says a task is finished — the one drawing of it.
	 *
	 * A todo was ticked with a 28px square on the list, a 16px square on the
	 * board, a 20px blue circle on the wishlist and nothing at all on the
	 * board's rail. This is the square, and the thing pressed is the caller's
	 * (a submit button, an onclick one): it only draws.
	 *
	 * Blue while the task is the one being worked on (`.doing-box`), filled grey
	 * with a tick once it is done. `children` replaces the tick — a count, say.
	 */
	let {
		done = false,
		doing = false,
		children
	}: {
		done?: boolean;
		doing?: boolean;
		children?: Snippet;
	} = $props();
</script>

<span class="tick-box" class:is-done={done} class:doing-box={doing && !done} aria-hidden="true">
	{#if children}{@render children()}{:else if done}<Icon name="check" size={16} />{/if}
</span>

<style>
	.tick-box {
		display: flex;
		flex: none;
		align-items: center;
		justify-content: center;
		width: 1.75rem;
		height: 1.75rem;
		border: 1px solid var(--color-gray-400);
		background-color: var(--color-white);
		color: var(--color-white);
	}

	.tick-box.is-done {
		background-color: var(--color-gray-400);
	}

	:global(button:hover) > .tick-box:not(.is-done) {
		border-color: var(--color-gray-600);
	}
</style>
