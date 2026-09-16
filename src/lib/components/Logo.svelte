<script lang="ts">
	/**
	 * The ontoplano mark, wherever the app draws itself.
	 *
	 * The artwork is `$lib/logo/mark.png` and nothing here knows what is in it —
	 * replace that file and every use of this component follows, including the
	 * pie in the bar. `yarn icons` redraws the favicon and the PWA icons from
	 * the same file, so there is one logo and not five.
	 *
	 * Sized by CSS rather than by the file's own dimensions, so a replacement of
	 * any size still lands where it is asked to.
	 */
	import mark from '$lib/logo/mark.png';
	import hollowMark from '$lib/logo/mark-hollow.png';
	import liftedMark from '$lib/logo/mark-lifted.png';
	import { MARK_DRAINED } from '$lib/logo/brand';
	import { MARK_TURN_RADIUS } from '$lib/logo/mark-geometry';
	import { MARK_FIELD } from '$lib/logo/mark-shape';
	import { isIsolatedBuild } from '$lib/isolated/mode';

	/*
	 * What the mark carries inside, as its own layer over the whole mark.
	 *
	 * A second copy of the same picture, clipped to a disc inside the ring —
	 * identical pixels over identical pixels, so nothing changes to look at.
	 * What it buys is a part that can turn while the rim stands still: a disc
	 * turns in place, and the circle it is cut on is flat dark field, the same
	 * at any angle. `$lib/mark-spin` turns it while a navigation drags.
	 *
	 * The radius is a fraction of the half width; circle() percentages resolve
	 * against the side, hence the halving.
	 */
	const TURN_CLIP = `circle(${((MARK_TURN_RADIUS / 2) * 100).toFixed(2)}%)`;

	let {
		size = 24,
		/**
		 * Take the size of whatever contains this, rather than a number.
		 *
		 * For the one place where the container's size IS the mark's — the
		 * raised button on the phone bar, which is clipped to the mark's own
		 * outline. Given as a number there, the two drifted apart and the mark
		 * ended up a quarter smaller than the shape it was supposed to fill.
		 */
		fill = false,
		/**
		 * Paint the brand ground behind the mark. Off nearly everywhere: the mark
		 * carries its own dark field inside a bright rim, so it holds up on the
		 * app's dark bar and on a white card without help. On only where the mark
		 * has to sit on a surface whose colour is somebody else's to choose.
		 */
		background = false,
		/**
		 * Say which copy this mark stands for, rather than which build drew it.
		 *
		 * Left alone it answers for the build it is in, which is right
		 * everywhere the mark IS this app. The instance chooser is the one
		 * place it is not: there the mark stands for the instance being
		 * offered, and the page has to be able to drain it for the phone's own
		 * copy and leave it in colour for one behind a server — in a single
		 * build, with nothing about it moving as the answer changes.
		 */
		drained: saysDrained = undefined,
		/**
		 * Let whatever is behind show through the mark's own field.
		 *
		 * The drawing carries a dark field between the ring and the medallion,
		 * which is right nearly everywhere — it is what lets the mark sit on a
		 * white card and on the app's dark bar without a halo. `hollow` is the
		 * same drawing with that field knocked out (`yarn icons` derives it),
		 * for the one place the mark is meant to be a window rather than a
		 * badge: the ring becomes a ring, and the page is what is inside it.
		 */
		hollow = false,
		label = '',
		/**
		 * The mark's own element, for a caller that has to animate it.
		 *
		 * The instance chooser swells it when an answer is chosen, and a CSS
		 * animation cannot be restarted reliably from state — so it needs the
		 * node itself to call `animate()` on.
		 */
		element = $bindable(),
		class: klass = ''
	}: {
		size?: number;
		fill?: boolean;
		background?: boolean;
		drained?: boolean;
		hollow?: boolean;
		label?: string;
		element?: HTMLElement;
		class?: string;
	} = $props();

	/*
	 * Drained of colour on the device, in full colour everywhere else.
	 *
	 * The mark in the bar is the handle of the main menu and the mark in the
	 * middle of the wheel is the same drawing: it rises out of one and lands in
	 * the other, so colour on the button and none in the wheel is one object
	 * changing colour in flight. Both are drained, and only in the build that
	 * runs on the device — a copy behind a server is untouched by this, so
	 * somebody running both can tell at a glance which one they are writing
	 * into.
	 */
	const secondary = $derived(saysDrained ?? isIsolatedBuild());
	const drained = $derived(secondary ? `saturate(${MARK_DRAINED})` : 'none');

	/*
	 * And on the lifted artwork while it is at it.
	 *
	 * Draining alone leaves the mark's own dark exactly as dark as it was, which
	 * turns a mark whose middle is mostly field into a near-black disc with a
	 * grey edge — at the size the bar and a launcher draw it, unreadable. The
	 * lifted copy (`yarn icons` derives it) is the same drawing with that field
	 * a little nearer white. The hollow copy has no field to lift: there the
	 * page is what shows through, which is the point of it.
	 */
	const artwork = $derived(hollow ? hollowMark : secondary ? liftedMark : mark);
</script>

<span
	bind:this={element}
	class="ontoplano-logo relative inline-flex shrink-0 items-center justify-center {fill
		? 'h-full w-full'
		: ''} {klass}"
	style="{fill ? '' : `width: ${size}px; height: ${size}px;`} {background
		? `background: ${MARK_FIELD}`
		: ''}"
	role={label ? 'img' : 'presentation'}
	aria-label={label || undefined}
	aria-hidden={label ? undefined : 'true'}
>
	<img
		src={artwork}
		alt=""
		width={fill ? undefined : size}
		height={fill ? undefined : size}
		style="filter: {drained}"
	/>
	<img
		class="mark-turn"
		src={artwork}
		alt=""
		aria-hidden="true"
		style="clip-path: {TURN_CLIP}; filter: {drained}"
	/>
</span>

<style>
	.ontoplano-logo :global(img) {
		width: 100%;
		height: 100%;
		display: block;
		object-fit: contain;
	}

	/* The colour goes and comes back rather than cutting, for the one place
	   the answer changes under the reader — the instance chooser. */
	@media (prefers-reduced-motion: no-preference) {
		.ontoplano-logo :global(img) {
			transition: filter 200ms ease;
		}
	}

	.ontoplano-logo :global(.mark-turn) {
		position: absolute;
		inset: 0;
	}
</style>
