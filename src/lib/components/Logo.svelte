<script lang="ts">
	/**
	 * The ontoplano mark, wherever the app draws itself.
	 *
	 * The artwork is `$lib/logo/mark.svg` and nothing here knows what is in it —
	 * replace that file and every use of this component follows, including the
	 * pie in the bar. `yarn icons` redraws the favicon and the PWA icons from
	 * the same file, so there is one logo and not five.
	 *
	 * Sized by CSS rather than by the file's own attributes: a CSS rule beats a
	 * presentation attribute, so a replacement carrying width/height still
	 * lands at the size asked for here.
	 */
	import mark from '$lib/logo/mark.svg?raw';
	import { BRAND_GROUND } from '$lib/logo/brand';

	let {
		size = 24,
		/**
		 * Paint the brand ground behind the mark. Off on the app's own chrome,
		 * which is already that colour in both themes; on anywhere the surface
		 * underneath is not known to be dark.
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
	<!-- eslint-disable-next-line svelte/no-at-html-tags -- a build-time asset, not input -->
	{@html mark}
</span>

<style>
	.ontoplano-logo :global(svg) {
		width: 100%;
		height: 100%;
		display: block;
	}
</style>
