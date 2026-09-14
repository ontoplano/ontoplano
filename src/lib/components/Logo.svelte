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
	import { BRAND_GROUND } from '$lib/logo/brand';
	import { MARK_TURN_RADIUS } from '$lib/logo/mark-geometry';

	/*
	 * The medallion, as its own layer over the whole mark.
	 *
	 * A second copy of the same picture, clipped to a disc just past the
	 * medallion's measured edge — identical pixels over identical pixels, so
	 * nothing changes to look at. What it buys is a part that can turn while
	 * the rim stands still: a disc turns in place, and everything inside this
	 * one past the medallion is the flat dark field, the same at any angle.
	 * `$lib/mark-spin` turns it while a navigation drags.
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
		label = '',
		class: klass = ''
	}: {
		size?: number;
		fill?: boolean;
		background?: boolean;
		label?: string;
		class?: string;
	} = $props();
</script>

<span
	class="ontoplano-logo relative inline-flex shrink-0 items-center justify-center {fill
		? 'h-full w-full'
		: ''} {klass}"
	style="{fill ? '' : `width: ${size}px; height: ${size}px;`} {background
		? `background: ${BRAND_GROUND}`
		: ''}"
	role={label ? 'img' : 'presentation'}
	aria-label={label || undefined}
	aria-hidden={label ? undefined : 'true'}
>
	<img src={mark} alt="" width={fill ? undefined : size} height={fill ? undefined : size} />
	<img class="mark-turn" src={mark} alt="" aria-hidden="true" style="clip-path: {TURN_CLIP}" />
</span>

<style>
	.ontoplano-logo :global(img) {
		width: 100%;
		height: 100%;
		display: block;
		object-fit: contain;
	}

	.ontoplano-logo :global(.mark-turn) {
		position: absolute;
		inset: 0;
	}
</style>
