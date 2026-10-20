<script lang="ts">
	/**
	 * A colour, chosen: the browser's colour input dressed as a field.
	 *
	 * Left to itself the input is a grey-framed chip that matches nothing
	 * beside it, and every screen that offered a colour gave it a different
	 * height, width and border. This one wears the `.input` frame at the small
	 * control height, so it sits in a row of `input-sm` fields and `btn-sm`
	 * buttons as one of them, with the colour filling the frame.
	 */
	let {
		name = undefined,
		value = $bindable(),
		label,
		onchange = undefined,
		class: klass = ''
	}: {
		name?: string;
		value?: string;
		/** What the colour is of — the field has no visible label of its own. */
		label: string;
		onchange?: (event: Event & { currentTarget: HTMLInputElement }) => void;
		class?: string;
	} = $props();

	/*
	 * Its default is the colour it shows.
	 *
	 * A form answered in place resets itself after the save (`$lib/enhance`),
	 * and a colour input's own default was never set — the value is bound as a
	 * property — so the reset painted the well black over the blue that had
	 * just been saved. Keeping the default in step makes a reset land on the
	 * colour on screen.
	 */
	let well = $state<HTMLInputElement>();
	$effect(() => {
		if (well && value) well.defaultValue = value;
	});
</script>

<input
	bind:this={well}
	type="color"
	{name}
	bind:value
	{onchange}
	aria-label={label}
	title={label}
	class="input input-sm color-well {klass}"
/>

<style>
	.color-well {
		flex: none;
		width: calc(var(--control-sm) * 1.5);
		height: var(--control-sm);
		min-height: var(--control-sm);
		padding: 0.1875rem;
		cursor: pointer;
	}

	.color-well::-webkit-color-swatch-wrapper {
		padding: 0;
	}

	.color-well::-webkit-color-swatch {
		border: none;
		border-radius: inherit;
	}

	.color-well::-moz-color-swatch {
		border: none;
		border-radius: inherit;
	}
</style>
