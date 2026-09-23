<script lang="ts">
	/**
	 * A picture, looked at properly, without leaving the page.
	 *
	 * Pressing one used to open it in a new tab — which is the browser's answer
	 * to a link, not the app's answer to "let me see that". You lost your place,
	 * came back to a second tab, and the picture was on a blank white page with
	 * the app nowhere in sight.
	 *
	 * Mounted once by the shell and armed for every rendered picture in the app
	 * at once: the handler listens for a press on any `img.md-image`, which is
	 * what `$lib/markdown` emits. A screen that renders markdown gets this
	 * without knowing it exists, and one added later gets it too.
	 */
	import { useT } from '$lib/i18n';

	const t = useT();

	/** The picture being looked at, or null when nothing is. */
	let showing = $state<{ src: string; alt: string } | null>(null);

	/*
	 * Pressed anywhere in the document, caught on the way down.
	 *
	 * Capture, so this runs before whatever the picture sits inside — a note
	 * row that unfolds when pressed, a card that opens. Looking at a picture
	 * should not also do the thing behind it.
	 */
	function pressed(event: MouseEvent) {
		const target = event.target;
		if (!(target instanceof HTMLImageElement)) return;
		if (!target.classList.contains('md-image')) return;

		event.preventDefault();
		event.stopPropagation();
		showing = { src: target.currentSrc || target.src, alt: target.alt };
	}

	function close() {
		showing = null;
	}

	function onKey(event: KeyboardEvent) {
		if (showing && event.key === 'Escape') {
			event.preventDefault();
			close();
		}
	}
</script>

<svelte:document onclickcapture={pressed} onkeydown={onKey} />

{#if showing}
	<!--
		The ground closes it, which is what a person reaches for first — and the
		picture itself does not, so a press that lands on it is not a press that
		takes it away. Escape closes it too, and there is a button for anybody
		who wants one to press.
	-->
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
	<div
		class="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 p-4"
		role="dialog"
		aria-modal="true"
		aria-label={showing.alt || t('imageViewer.picture')}
		onclick={close}
	>
		<button type="button" class="image-viewer-close" onclick={close} aria-label={t('ui.close')}>
			×
		</button>

		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
		<img
			src={showing.src}
			alt={showing.alt}
			class="max-h-full max-w-full object-contain"
			onclick={(e) => e.stopPropagation()}
		/>
	</div>
{/if}

<style>
	/*
	 * Its own colours, not the palette's: this sits on a black ground in both
	 * themes, so a token that inverts would put dark ink on dark.
	 */
	.image-viewer-close {
		position: absolute;
		top: 1rem;
		right: 1rem;
		display: flex;
		height: 2.5rem;
		width: 2.5rem;
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
