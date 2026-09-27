<script lang="ts">
	/**
	 * A picture, looked at properly, without leaving the page.
	 *
	 * Pressing one used to open it in a new tab — which is the browser's answer
	 * to a link, not the app's answer to "let me see that". You lost your place,
	 * came back to a second tab, and the picture was on a blank white page with
	 * the app nowhere in sight; in the Android app there was no tab to come
	 * back from at all.
	 *
	 * Mounted once by the shell and armed for every picture in the app at once:
	 * the handler listens for a press on any `img.md-image`, which is what
	 * `$lib/markdown` emits, and on any `a.written-picture`, which is how a
	 * task's or an idea's notes draw theirs. A screen that renders either gets
	 * this without knowing it exists.
	 *
	 * Pinch, drag, wheel and double-tap zoom are `@panzoom/panzoom`'s. Back —
	 * the phone's gesture or the browser's button — closes it, like any other
	 * screen laid over the page (`$lib/back-closes`).
	 */
	import type { PanzoomObject } from '@panzoom/panzoom';
	import { BackCloses } from '$lib/back-closes';
	import { useT } from '$lib/i18n';

	const t = useT();

	/** How far in a pinch or the wheel may go. */
	const MAX_SCALE = 6;
	/** Where a double tap lands, and the other end of it is the whole picture. */
	const TAP_SCALE = 2.5;

	/** The picture being looked at, or null when nothing is. */
	let showing = $state<{ src: string; alt: string } | null>(null);
	let dialog = $state<HTMLDialogElement | null>(null);
	let picture = $state<HTMLImageElement | null>(null);
	let zoom: PanzoomObject | null = null;

	const back = new BackCloses(() => close());
	$effect(() => back.watch());

	/*
	 * Pressed anywhere in the document, caught on the way down.
	 *
	 * Capture, so this runs before whatever the picture sits inside — a note
	 * row that unfolds when pressed, a card that opens, a link that would open
	 * a tab. Looking at a picture should not also do the thing behind it.
	 */
	function pressed(event: MouseEvent) {
		const target = event.target instanceof Element ? event.target : null;
		if (!target || dialog?.contains(target)) return;

		const image = target.closest('img.md-image') as HTMLImageElement | null;
		const link = target.closest('a.written-picture') as HTMLAnchorElement | null;
		if (!image && !link) return;
		// A modified press on a link still means a new tab, as it does anywhere.
		if (link && (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0)) return;

		event.preventDefault();
		event.stopPropagation();
		showing = image
			? { src: image.currentSrc || image.src, alt: image.alt }
			: { src: link!.href, alt: link!.getAttribute('aria-label') ?? '' };
		back.claim();
	}

	function close() {
		if (!showing) return;
		showing = null;
		void back.release();
	}

	$effect(() => {
		if (!showing || !dialog || !picture) return;
		dialog.showModal();

		const image = picture;
		const stage = image.parentElement!;
		let gone = false;
		/*
		 * Loaded when a picture is first opened, and only in the browser: the
		 * package's `main` is a UMD file marked as a module, which Node cannot
		 * import on the server, and nobody needs it until they press a picture.
		 */
		void import('@panzoom/panzoom').then(({ default: Panzoom }) => {
			if (gone) return;
			zoom = Panzoom(image, {
				maxScale: MAX_SCALE,
				minScale: 1,
				contain: 'outside',
				panOnlyWhenZoomed: true,
				cursor: 'grab'
			});
		});
		const wheel = (event: WheelEvent) => zoom?.zoomWithWheel(event);
		const twice = (event: MouseEvent) => {
			if (!zoom) return;
			if (zoom.getScale() > 1) zoom.reset();
			else zoom.zoomToPoint(TAP_SCALE, event);
		};
		stage.addEventListener('wheel', wheel, { passive: false });
		image.addEventListener('dblclick', twice);

		return () => {
			gone = true;
			stage.removeEventListener('wheel', wheel);
			image.removeEventListener('dblclick', twice);
			zoom?.destroy();
			zoom = null;
			if (dialog?.open) dialog.close();
		};
	});

	/** The ground closes it, unless the picture is zoomed and it is being panned. */
	function groundPressed(event: MouseEvent) {
		if (event.target === picture) return;
		if (zoom && zoom.getScale() > 1) return;
		close();
	}
</script>

<svelte:document onclickcapture={pressed} />

{#if showing}
	<dialog
		bind:this={dialog}
		class="image-viewer"
		aria-label={showing.alt || t('imageViewer.picture')}
		oncancel={(event) => {
			event.preventDefault();
			close();
		}}
		onclick={groundPressed}
	>
		<div class="image-viewer-stage">
			<img bind:this={picture} src={showing.src} alt={showing.alt} draggable="false" />
		</div>
		<button type="button" class="image-viewer-close" onclick={close} aria-label={t('ui.close')}>
			×
		</button>
	</dialog>
{/if}

<style>
	/* The whole screen, in the top layer, on a black ground in both themes. */
	.image-viewer {
		width: 100vw;
		max-width: none;
		height: 100dvh;
		max-height: none;
		margin: 0;
		padding: 0;
		border: 0;
		background: rgb(0 0 0 / 0.9);
		overflow: hidden;
	}

	.image-viewer::backdrop {
		background: transparent;
	}

	.image-viewer-stage {
		display: flex;
		height: 100%;
		width: 100%;
		align-items: center;
		justify-content: center;
		padding: 1rem;
		/* Pinch and pan belong to the picture, not to the page behind it. */
		touch-action: none;
	}

	.image-viewer-stage img {
		max-height: 100%;
		max-width: 100%;
		object-fit: contain;
		user-select: none;
	}

	/*
	 * Its own colours, not the palette's: this sits on a black ground in both
	 * themes, so a token that inverts would put dark ink on dark.
	 */
	.image-viewer-close {
		position: absolute;
		top: calc(var(--safe-top, 0px) + 1rem);
		right: 1rem;
		display: flex;
		height: 2.75rem;
		width: 2.75rem;
		align-items: center;
		justify-content: center;
		border-radius: 9999px;
		background: rgb(255 255 255 / 0.12);
		color: #fff;
		font-size: 1.5rem;
		line-height: 1;
		transition: background-color 120ms ease;
	}

	.image-viewer-close:hover {
		background: rgb(255 255 255 / 0.24);
	}
</style>
