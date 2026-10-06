<script lang="ts">
	/**
	 * One picture of one thing, and the way to change it.
	 *
	 * Pressing the picture is how it is set or replaced, rather than hunting
	 * for a field in a form: a face, a notebook's cover, a thing in the
	 * cupboard. Written once for the notebook and needed again for the
	 * inventory, so it is this component and the notebook's is a wrapper.
	 *
	 * Its own form, deliberately: a file goes up as multipart the moment it is
	 * chosen, which is not the same submission as the rest of the thing's
	 * fields. That is why a caller puts this beside its form rather than inside
	 * one — a form cannot nest in a form.
	 *
	 * Pressing the picture is spoken for, so looking at it is a badge beside
	 * it: `data-view-src`, which the shell's `ImageViewer` answers with the
	 * picture over the whole screen. And where the caller says `resizable`,
	 * the square has a handle in its corner — a desktop thing — and the size
	 * it is dragged to is remembered on this device, under `sizeKey`.
	 *
	 * A picture can also be dropped on the square, from the desktop or another
	 * tab: the same file the chooser would have given, sent the same way.
	 */
	import Banner from '$lib/components/Banner.svelte';
	import Icon, { type IconName } from '$lib/components/Icon.svelte';
	import { enhance } from '$lib/enhance';
	import { ACCEPTED_TYPES } from '$lib/services/media';
	import { useT } from '$lib/i18n';

	const t = useT();

	let {
		id,
		pictureId,
		/** What the empty square draws: the mark of what the picture belongs to. */
		icon,
		/** What the server will accept, so the browser can refuse first. */
		kilobytes,
		/** Where the file goes, and where the remove posts. */
		setAction,
		removeAction,
		/** More fields the set posts beside the file — a title for the alt text. */
		fields = {},
		/** Said on the square: setting one, changing it, and taking it off. */
		chooseLabel,
		changeLabel,
		removeLabel,
		/** Tailwind size class for the square. */
		size = 'size-12',
		/** Offer a bin under the picture. Where the thing's page has none of its own. */
		removable = false,
		/**
		 * Where pressing it opens the thing rather than the file chooser — and
		 * what that press is called.
		 */
		onpress,
		pressLabel = '',
		/** A corner handle, and the size it is dragged to kept under `sizeKey`. */
		resizable = false,
		sizeKey = ''
	}: {
		id: number;
		pictureId: number | null;
		icon: IconName;
		kilobytes: number;
		setAction: string;
		removeAction: string;
		fields?: Record<string, string>;
		chooseLabel: string;
		changeLabel: string;
		removeLabel: string;
		size?: string;
		removable?: boolean;
		onpress?: () => void;
		pressLabel?: string;
		resizable?: boolean;
		sizeKey?: string;
	} = $props();

	let form: HTMLFormElement | undefined = $state();
	let field: HTMLInputElement | undefined = $state();
	let uploading = $state(false);
	let problem = $state('');
	/** Whether a file is being held over the square. */
	let dropping = $state(false);

	/** The chosen or dropped file goes up at once, if the server would take it. */
	function send(file: File | undefined) {
		problem = '';
		if (!file || !field) return;
		if (file.size > kilobytes * 1024) {
			problem = t('pictures.tooBig', {
				limit: kilobytes,
				name: file.name,
				size: Math.ceil(file.size / 1024)
			});
			field.value = '';
			return;
		}
		uploading = true;
		form?.requestSubmit();
	}

	const carriesFiles = (e: DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes('Files');

	function onDragOver(e: DragEvent) {
		if (!carriesFiles(e)) return;
		e.preventDefault();
		dropping = true;
	}

	function onDrop(e: DragEvent) {
		if (!carriesFiles(e)) return;
		e.preventDefault();
		dropping = false;
		const file = Array.from(e.dataTransfer?.files ?? []).find((one) =>
			ACCEPTED_TYPES.includes(one.type)
		);
		if (!file || !field) return;
		// Into the form's own field, so the drop posts exactly what choosing would.
		const carried = new DataTransfer();
		carried.items.add(file);
		field.files = carried.files;
		send(file);
	}

	/** Where a dragged size is kept: per kind of thing, per device. */
	const STORAGE_PREFIX = 'onto.pictureSize.';

	/** The size the square was last dragged to here, or nothing. */
	function remembered(): { width: number; height: number } | null {
		if (!resizable || !sizeKey) return null;
		try {
			const raw = localStorage.getItem(STORAGE_PREFIX + sizeKey);
			if (!raw) return null;
			const parsed = JSON.parse(raw) as { width?: number; height?: number };
			if (typeof parsed.width !== 'number' || typeof parsed.height !== 'number') return null;
			return { width: parsed.width, height: parsed.height };
		} catch {
			return null;
		}
	}

	function remember(width: number, height: number) {
		if (!resizable || !sizeKey) return;
		try {
			localStorage.setItem(STORAGE_PREFIX + sizeKey, JSON.stringify({ width, height }));
		} catch {
			// nowhere to keep it: the square is still resizable for this visit
		}
	}

	let kept = $state<{ width: number; height: number } | null>(null);
	$effect(() => {
		kept = remembered();
	});

	/** Watches the square the person drags, and keeps where it ends up. */
	function watched(box: HTMLElement) {
		if (!resizable) return;
		let first = true;
		const observer = new ResizeObserver(([entry]) => {
			// The first call reports the size it opened at, not a drag.
			if (first) {
				first = false;
				return;
			}
			const { width, height } = entry!.contentRect;
			if (width > 0 && height > 0) remember(Math.round(width), Math.round(height));
		});
		observer.observe(box);
		return { destroy: () => observer.disconnect() };
	}
</script>

{#snippet face()}
	{#if pictureId}
		<span
			class="picture-box {size} block rounded-lg border border-gray-200 bg-white"
			class:resizable
			style:width={kept ? `${kept.width}px` : undefined}
			style:height={kept ? `${kept.height}px` : undefined}
			use:watched
		>
			<img
				src="/media/{pictureId}"
				alt=""
				loading="lazy"
				class="size-full rounded-lg object-cover"
			/>
		</span>
	{:else}
		<!-- Not a photograph: the empty square says what the thing is, the way
		     every other empty picture in the app draws the mark of its owner. -->
		<span
			aria-hidden="true"
			class="{size} flex items-center justify-center rounded-lg border border-dashed border-gray-300 bg-gray-100 text-gray-500"
		>
			<Icon name={icon} />
		</span>
	{/if}
{/snippet}

<div class="shrink-0">
	<div
		class="relative w-fit rounded-lg"
		class:ring-2={dropping}
		class:ring-gray-900={dropping}
		role="group"
		aria-label={pictureId ? changeLabel : chooseLabel}
		ondragover={onDragOver}
		ondragleave={() => (dropping = false)}
		ondrop={onDrop}
	>
		<form
			bind:this={form}
			method="post"
			action={setAction}
			enctype="multipart/form-data"
			use:enhance={() =>
				async ({ update }) => {
					uploading = false;
					await update({ reset: false });
				}}
		>
			<input type="hidden" name="id" value={id} />
			{#each Object.entries(fields) as [key, value] (key)}
				<input type="hidden" name={key} {value} />
			{/each}
			<!--
			As wide as the picture and no wider: a ring around a column-wide
			label drew a rounded rectangle twice the square, which reads as a
			switch somebody has flipped.
		-->
			<label
				class="block w-fit cursor-pointer rounded-lg transition focus-within:ring-2 focus-within:ring-gray-900 hover:opacity-80"
				hidden={Boolean(onpress)}
				title={pictureId ? changeLabel : chooseLabel}
			>
				{@render face()}
				<span class="sr-only">{chooseLabel}</span>
				<input
					type="file"
					name="file"
					bind:this={field}
					accept={ACCEPTED_TYPES.join(',')}
					class="sr-only"
					onchange={(e) => send((e.currentTarget as HTMLInputElement).files?.[0])}
				/>
			</label>
		</form>

		{#if onpress}
			<button
				type="button"
				onclick={onpress}
				class="block w-fit cursor-pointer rounded-lg transition hover:opacity-80 focus-visible:ring-2 focus-visible:ring-gray-900"
				aria-label={pressLabel}
				title={pressLabel}
			>
				{@render face()}
			</button>
		{/if}

		<!-- Looking at it, since pressing it is spoken for. The shell's viewer
	     answers `data-view-src`. Top corner: the bottom one is the resize handle. -->
		{#if pictureId}
			<button
				type="button"
				class="picture-view icon-btn"
				data-view-src="/media/{pictureId}"
				aria-label={t('pictures.view')}
				title={t('pictures.view')}
			>
				<Icon name="maximize" size={12} />
			</button>
		{/if}
	</div>

	{#if uploading}
		<p class="mt-1 text-xs text-gray-500">{t('pictures.uploading')}</p>
	{/if}
	{#if problem}
		<div class="mt-2"><Banner message={problem} /></div>
	{/if}

	<!-- A bin rather than a sentence: one small destructive act beside the
	     thing it acts on. -->
	{#if removable && pictureId}
		<form method="post" action={removeAction} use:enhance class="mt-1 flex justify-center">
			<input type="hidden" name="id" value={id} />
			<button class="icon-btn icon-btn-danger" aria-label={removeLabel} title={removeLabel}>
				<Icon name="trash" size={16} />
			</button>
		</form>
	{/if}
</div>

<style>
	.picture-box {
		overflow: hidden;
	}

	/*
	 * A handle in the corner, which only a pointer finds — a phone pinches the
	 * viewer instead. The floor is the square it started as; the ceiling keeps
	 * a header a header.
	 */
	.picture-box.resizable {
		resize: both;
		min-width: 3rem;
		min-height: 3rem;
		max-width: 30rem;
		max-height: 30rem;
	}

	.picture-view {
		position: absolute;
		top: -0.4rem;
		right: -0.4rem;
		width: 1.4rem;
		height: 1.4rem;
		min-width: 0;
		min-height: 0;
		padding: 0;
		border-radius: 9999px;
		border: 1px solid var(--color-gray-300);
		background: var(--color-white);
	}
</style>
