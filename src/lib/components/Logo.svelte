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
	import isolatedMark from '$lib/logo/mark-isolated.png';
	import { MARK_TURN_HOLE_RADIUS, MARK_TURN_RADIUS } from '$lib/logo/mark-geometry';
	import { MARK_FIELD } from '$lib/logo/mark-shape';
	import { isIsolatedBuild } from '$lib/isolated/mode';

	/*
	 * What the mark carries inside, as its own layer, with a hole beneath it.
	 *
	 * The mark is drawn twice: the rim with a disc taken out of it, and that
	 * disc on top. While a navigation drags, `$lib/mark-spin` turns the rim
	 * (`.mark-turn`) and nothing else, so the octagon goes round a bird that
	 * no animation ever touches. The circle the two are cut on is flat dark
	 * field, the same at any angle, so the seam does not show.
	 *
	 * The layer underneath has the disc taken out rather than being the whole
	 * picture: identical pixels over identical pixels change nothing only while
	 * both are at rest, and the moment one turned there were two puffins.
	 *
	 * The radius is a fraction of the half width. `circle()` percentages
	 * resolve against the side, hence the halving; a radial gradient sized to
	 * `closest-side` resolves against the half, so it takes the fraction
	 * itself. Both land on the same circle.
	 */
	const TURN_CLIP = `circle(${((MARK_TURN_RADIUS / 2) * 100).toFixed(2)}%)`;
	const HOLE_STOP = `${(MARK_TURN_HOLE_RADIUS * 100).toFixed(2)}%`;
	const TURN_HOLE = `radial-gradient(circle closest-side, transparent 0 ${HOLE_STOP}, #000 ${HOLE_STOP})`;

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
		 * offered, and the page has to be able to give it the device's blue
		 * field for the phone's own copy and the ordinary dark for one behind a
		 * server — in a single build, with nothing about it moving as the answer
		 * changes.
		 */
		device: saysDevice = undefined,
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
		device?: boolean;
		hollow?: boolean;
		label?: string;
		element?: HTMLElement;
		class?: string;
	} = $props();

	/*
	 * Blue behind the bird on the device, the mark's own dark everywhere else.
	 *
	 * The mark in the bar is the handle of the main menu and the mark in the
	 * middle of the wheel is the same drawing: it rises out of one and lands in
	 * the other, so two different fields between them would read as two objects.
	 * Both wear it, and only in the build that runs on the device — a copy
	 * behind a server is untouched, so somebody running both can tell at a
	 * glance which one they are writing into.
	 *
	 * It was the drained mark until this, which read as the app with its lights
	 * off rather than as another instance. `mark-isolated.png` (`yarn icons`
	 * derives it) is the same drawing in full colour with that field painted
	 * `MARK_FIELD_ISOLATED`. The hollow copy has no field at all: there the page
	 * is what shows through, which is the point of it.
	 */
	/*
	 * The device's copy wins over `hollow`, because it is the field that says it.
	 *
	 * The hollow drawing has no field at all — the page shows through the ring —
	 * so a hollow mark standing for the device had nothing left to say it with,
	 * and the instance chooser offered two identical marks. Where the two meet,
	 * the blue field is the answer and the window is not.
	 */
	const secondary = $derived(saysDevice ?? isIsolatedBuild());
	const artwork = $derived(secondary ? isolatedMark : hollow ? hollowMark : mark);
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
		class="mark-turn"
		src={artwork}
		alt=""
		width={fill ? undefined : size}
		height={fill ? undefined : size}
		style="-webkit-mask-image: {TURN_HOLE}; mask-image: {TURN_HOLE}"
	/>
	<img class="mark-still" src={artwork} alt="" aria-hidden="true" style="clip-path: {TURN_CLIP}" />
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

	/* Never animated: the rim turns around it. */
	.ontoplano-logo :global(.mark-still) {
		position: absolute;
		inset: 0;
	}
</style>
