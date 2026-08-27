<script lang="ts">
	import { enhance } from '$app/forms';
	import { autofocus } from '$lib/actions/autofocus';
	import { CAPTURES, type Capture } from '$lib/capture';
	import Modal from '$lib/components/Modal.svelte';
	import RadialMenu from '$lib/components/RadialMenu.svelte';

	/**
	 * Capture, from anywhere.
	 *
	 * The four tiles only ever existed on the dashboard, which is fine for
	 * somebody who opens the app to plan and useless for the far more common
	 * case: you are already looking at something else when the thing you must
	 * not forget arrives.
	 *
	 * So the pie lives in the shell. On a phone it sits bottom-centre, where the
	 * thumb already is — press, flick, release. On a desktop it is a button in
	 * the header that opens the same menu to a click. Navigation happens a few
	 * times an hour; this happens more often, which is why it is the pie's first
	 * job rather than its second.
	 */
	let { onopenchange }: { onopenchange?: (open: boolean) => void } = $props();

	let open = $state(false);
	let dragging = $state(false);
	let origin = $state({ x: 0, y: 0 });
	let writing = $state<Capture | null>(null);
	let inset = $state(0);

	const wedges = CAPTURES.map((c) => ({
		key: c.key,
		label: c.label,
		icon: c.icon,
		color: c.color
	}));

	/**
	 * Opened by whichever trigger the shell is showing.
	 *
	 * The menu and the form live here once; the buttons live where they make
	 * sense — bottom-centre under a thumb, in the header beside a cursor — and
	 * both call this. Two mounts would mean two dialogs and two half-written
	 * notes.
	 */
	export function summon(e: PointerEvent) {
		// Take the gesture before the browser can. Without this a press-and-hold
		// on a phone becomes a text selection or a scroll, and the release that
		// should have chosen a wedge never reaches us.
		e.preventDefault();
		const button = e.currentTarget as Element | null;
		button?.setPointerCapture?.(e.pointerId);

		// The pie opens under the finger, not under the button: on a phone the
		// button is at the very bottom of the screen and a menu drawn there would
		// be half off it.
		origin = { x: e.clientX, y: e.clientY };
		dragging = e.pointerType !== 'mouse' || e.button === 0;
		inset = bottomInset();
		open = true;
	}

	/**
	 * How much of the bottom of the screen belongs to something else.
	 *
	 * The phone's navigation bar is fixed there, and a pie drawn across it reads
	 * as two interfaces at once. The shell owns the number; this reads it rather
	 * than repeating it.
	 */
	function bottomInset(): number {
		if (typeof window === 'undefined') return 0;
		const style = getComputedStyle(document.documentElement);
		const px = (name: string) => parseFloat(style.getPropertyValue(name)) || 0;
		return window.innerWidth >= 1024 ? 0 : px('--mobile-nav-height') + px('--safe-bottom') + 24;
	}

	$effect(() => onopenchange?.(open));

	function choose(key: string) {
		open = false;
		writing = CAPTURES.find((c) => c.key === key) ?? null;
	}
</script>

<RadialMenu
	items={wedges}
	{open}
	{origin}
	{dragging}
	bottomInset={inset}
	onselect={choose}
	onclose={() => (open = false)}
/>

<Modal
	open={writing !== null}
	onclose={() => (writing = null)}
	title={writing ? `New ${writing.label.toLowerCase()}` : ''}
	size="sm"
>
	{#if writing}
		{@const capture = writing}
		<form
			id="pie-capture-form"
			method="post"
			action={capture.action}
			use:enhance={() =>
				async ({ update, result }) => {
					await update({ reset: true });
					if (result.type === 'success') writing = null;
				}}
		>
			<!-- Shopping needs to know which list; everything else has one shape. -->
			{#if capture.key === 'buy'}
				<input type="hidden" name="type" value="replenish" />
			{/if}

			{#if capture.multiline}
				<textarea
					name={capture.field}
					required
					rows="4"
					use:autofocus
					placeholder={capture.placeholder}
					class="textarea"
				></textarea>
			{:else}
				<input
					name={capture.field}
					required
					autocomplete="off"
					use:autofocus
					placeholder={capture.placeholder}
					class="input"
				/>
			{/if}
		</form>
	{/if}

	{#snippet footer()}
		<button type="submit" form="pie-capture-form" class="btn btn-primary">Save</button>
	{/snippet}
</Modal>
