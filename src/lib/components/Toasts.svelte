<script lang="ts">
	/**
	 * The one place on the screen where the app speaks.
	 *
	 * Three stores feed it — `notify` for success and errors, `say` for a
	 * receipt, `undo` for something that can still be taken back — and they
	 * used to be two layers in opposite corners with two looks. One layer and
	 * one `Toast` now, so a message is a message wherever it came from.
	 */
	import { beforeNavigate } from '$app/navigation';
	import Toast from '$lib/components/Toast.svelte';
	import { dismiss, notices } from '$lib/notify.svelte';
	import { said, unsay } from '$lib/said.svelte';
	import { flushNow, takeBack, undo, undoable } from '$lib/undo.svelte';
	import { useT } from '$lib/i18n';
	import { tick } from 'svelte';
	import { FORM_ANSWERED, speechFor, type FormAnswer } from '$lib/form-answers';
	import { notify } from '$lib/notify.svelte';
	import { say } from '$lib/said.svelte';

	const t = useT();

	/**
	 * Whether the page already shows this sentence where it can be read — a
	 * banner in view says it better than a toast repeating it.
	 */
	function shownInView(text: string): boolean {
		for (const one of document.querySelectorAll<HTMLElement>('[role="alert"], [role="status"]')) {
			if (layer?.contains(one) || !one.textContent?.includes(text)) continue;
			const box = one.getBoundingClientRect();
			if (box.height > 0 && box.bottom > 0 && box.top < window.innerHeight) return true;
		}
		return false;
	}

	/** Every form answered through `$lib/enhance`, said here — see `$lib/form-answers`. */
	async function answered(event: Event) {
		const speech = speechFor((event as CustomEvent<FormAnswer>).detail);
		if (!speech) return;
		await tick();
		if ('key' in speech) return say(t(speech.key));
		if (speech.text && shownInView(speech.text)) return;
		if (speech.kind === 'receipt') say(speech.text);
		else notify.error(speech.text || t('toast.notDone'));
	}

	$effect(() => {
		window.addEventListener(FORM_ANSWERED, answered);
		return () => window.removeEventListener(FORM_ANSWERED, answered);
	});

	/** How often the counts are redrawn and the expired notices dropped. */
	const TICK_MS = 200;

	let now = $state(Date.now());

	const waiting = $derived(undoable());
	const timed = $derived(
		waiting.length > 0 || said.items.length > 0 || notices.items.some((n) => n.until !== null)
	);

	$effect(() => {
		if (!timed) return;
		const tick = setInterval(() => {
			now = Date.now();
			for (const n of notices.items) if (n.until !== null && n.until <= now) dismiss(n.id);
		}, TICK_MS);
		return () => clearInterval(tick);
	});

	beforeNavigate(flushNow);

	/*
	 * Above a dialog, too, and answering there.
	 *
	 * A modal dialog lives in the browser's top layer, where no z-index reaches,
	 * and it makes everything outside itself inert. So a refusal said while an
	 * editor was open landed behind it, and even drawn on top its close button
	 * could not be pressed.
	 *
	 * The stack is a popover — top layer too, so it is drawn against the
	 * viewport wherever it sits in the document — and while a modal dialog is
	 * open it sits *inside* that dialog, which is the one place the dialog does
	 * not make inert. It goes home when the dialog closes. Where the browser has
	 * no popovers it is an ordinary fixed layer, as it always was.
	 */
	const canPopover = typeof HTMLElement !== 'undefined' && 'showPopover' in HTMLElement.prototype;
	let layer: HTMLElement | undefined = $state();
	/* Over a dialog the stack moves to the top: the bottom is where a dialog
	   keeps its own buttons, and an error that stays until dismissed sat on
	   Save. */
	let overDialog = $state(false);

	function raise() {
		if (!layer) return;
		try {
			if (layer.matches(':popover-open')) layer.hidePopover();
			layer.showPopover();
		} catch {
			// Detached between the check and the call; the next change places it.
		}
	}

	/** The open modal dialog nearest the top — a nested one comes later in the document. */
	function topmostModal(): HTMLDialogElement | null {
		const open = [...document.querySelectorAll('dialog[open]')].filter((d) => d.matches(':modal'));
		return (open.at(-1) as HTMLDialogElement | undefined) ?? null;
	}

	$effect(() => {
		if (!layer || !canPopover) return;
		const home = layer.parentNode;
		if (!home) return;
		let top: Element | null = null;

		function place() {
			if (!layer) return;
			const modal = topmostModal();
			const host = modal ?? home!;
			overDialog = modal !== null;
			if (layer.parentNode !== host) {
				host.appendChild(layer);
				raise();
			} else if (modal !== top) raise();
			top = modal;
		}

		place();
		raise();
		// `open` is an attribute, and a dialog can also leave with its page, so
		// both are watched.
		const watch = new MutationObserver(place);
		watch.observe(document.body, {
			subtree: true,
			childList: true,
			attributes: true,
			attributeFilter: ['open']
		});
		return () => {
			watch.disconnect();
			if (layer && layer.parentNode !== home) home.appendChild(layer);
		};
	});
</script>

<svelte:window onbeforeunload={flushNow} />

<!-- Newest last, which is the bottom: nearest the thumb on a phone. Always
     there, so the live region exists before the first thing it announces. -->
<div
	bind:this={layer}
	class="toasts float-layer"
	class:over-dialog={overDialog}
	aria-live="polite"
	popover={canPopover ? 'manual' : undefined}
>
	{#each notices.items as notice (notice.id)}
		<Toast
			kind={notice.kind}
			message={notice.message}
			{now}
			until={notice.until}
			ondismiss={() => dismiss(notice.id)}
		/>
	{/each}
	{#each said.items as item (item.id)}
		<Toast
			message={item.message}
			{now}
			until={item.until}
			window={item.window}
			action={item.action
				? {
						label: item.action.label,
						run: () => {
							const run = item.action?.run;
							unsay(item.id);
							run?.();
						}
					}
				: undefined}
		/>
	{/each}
	{#each waiting as item (item.id)}
		<Toast
			kind="info"
			message={item.message}
			{now}
			until={item.until}
			window={undo.seconds * 1000}
			action={{ label: t('ui.undo'), icon: 'undo', run: () => takeBack(item.id) }}
		/>
	{/each}
</div>

<style>
	.toasts {
		position: fixed;
		/* Above the bar the rooms are on, and above whatever the phone itself
		   keeps down there. The same two numbers the bar is built from. */
		bottom: calc(var(--safe-bottom) + var(--mobile-nav-height) + 0.75rem);
		right: 0.75rem;
		left: 0.75rem;
		z-index: 60;
		/* What a popover brings with it by default: centred, bordered, painted. */
		top: auto;
		margin: 0;
		padding: 0;
		border: 0;
		background: transparent;
		color: inherit;
		overflow: visible;
		width: auto;
		height: auto;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		pointer-events: none;
	}

	@media (width >= 64rem) {
		.toasts {
			bottom: 1.5rem;
			right: 1.5rem;
			left: auto;
			width: 26rem;
		}
	}

	/* Centred at the top: a dialog's buttons are in its footer and its close is
	   in a corner, and neither is under the middle of the top edge. */
	.toasts.over-dialog {
		top: calc(var(--safe-top) + 0.75rem);
		bottom: auto;
	}

	@media (width >= 64rem) {
		.toasts.over-dialog {
			top: 1.5rem;
			right: auto;
			left: 50%;
			translate: -50% 0;
		}
	}
</style>
