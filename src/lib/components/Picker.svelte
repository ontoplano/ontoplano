<script lang="ts" generics="T extends string">
	/**
	 * Choosing one of a few things, as a button that says which.
	 *
	 * A `<select>` in a toolbar looks like a form field that wandered in: it is
	 * as tall as an input, it carries the platform's own chrome, and beside the
	 * app's own buttons it reads as a different app. So the toolbars use this —
	 * the button says what the choice is now, pressing it shows the list, and a
	 * tick marks the one in force.
	 *
	 * Form fields stay `<select>`. This is for narrowing what is on screen,
	 * where nothing is being submitted and the control is one of a row of
	 * buttons. `SortControl` is this plus a direction arrow.
	 */
	import Icon from '$lib/components/Icon.svelte';

	let {
		value,
		options,
		onpick,
		label,
		class: klass = ''
	}: {
		value: T;
		/** What can be chosen, in the order they should be offered. */
		options: readonly { value: T; label: string }[];
		onpick: (next: T) => void;
		/** What this control is, for whoever is not looking at it. */
		label: string;
		class?: string;
	} = $props();

	let open = $state(false);
	let root = $state<HTMLElement>();

	const chosen = $derived(options.find((one) => one.value === value) ?? options[0]);

	/*
	 * Pressing anywhere else closes it. A menu that only closes by choosing
	 * something makes choosing nothing impossible.
	 */
	function elsewhere(event: MouseEvent) {
		if (!open || !root) return;
		if (!root.contains(event.target as Node)) open = false;
	}

	function onKey(event: KeyboardEvent) {
		if (open && event.key === 'Escape') {
			event.preventDefault();
			open = false;
		}
	}
</script>

<svelte:window onclick={elsewhere} onkeydown={onKey} />

<div bind:this={root} class="relative {klass}">
	<button
		type="button"
		class="btn btn-sm w-full justify-between"
		aria-haspopup="listbox"
		aria-expanded={open}
		aria-label={label}
		onclick={() => (open = !open)}
	>
		<span class="truncate">{chosen?.label ?? ''}</span>
		<Icon name="chevron-down" size={12} />
	</button>

	{#if open}
		<!--
			`max-h` and its own scroll: a label list is as long as somebody's
			vocabulary, and a menu taller than the screen cannot be reached to
			the end of.
		-->
		<ul
			class="overlay-face absolute top-full left-0 z-20 mt-1 max-h-64 min-w-full overflow-y-auto border shadow-overlay"
			role="listbox"
			aria-label={label}
		>
			{#each options as option (option.value)}
				<li role="presentation">
					<button
						type="button"
						role="option"
						aria-selected={option.value === value}
						class="flex w-full items-center gap-2 px-3 py-2 text-left text-sm whitespace-nowrap {option.value ===
						value
							? 'overlay-face-on'
							: ''}"
						onclick={() => {
							onpick(option.value);
							open = false;
						}}
					>
						<!-- The tick keeps its place, so the row does not shift when the
						     chosen one changes. -->
						<span class="w-3 shrink-0">
							{#if option.value === value}<Icon name="check" size={12} />{/if}
						</span>
						{option.label}
					</button>
				</li>
			{/each}
		</ul>
	{/if}
</div>
