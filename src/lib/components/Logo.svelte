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

	let {
		size = 24,
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
		background?: boolean;
		label?: string;
		class?: string;
	} = $props();
</script>

<span
	class="ontoplano-logo inline-flex shrink-0 items-center justify-center {klass}"
	style="width: {size}px; height: {size}px; {background ? `background: ${BRAND_GROUND}` : ''}"
	role={label ? 'img' : 'presentation'}
	aria-label={label || undefined}
	aria-hidden={label ? undefined : 'true'}
>
	<img src={mark} alt="" width={size} height={size} />
</span>

<style>
	.ontoplano-logo :global(img) {
		width: 100%;
		height: 100%;
		display: block;
		object-fit: contain;
	}
</style>
