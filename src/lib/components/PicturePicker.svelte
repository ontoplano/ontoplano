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
	 */
	import Banner from '$lib/components/Banner.svelte';
	import Icon, { type IconName } from '$lib/components/Icon.svelte';
	import { enhance } from '$lib/enhance';
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
		pressLabel = ''
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
	} = $props();

	let form: HTMLFormElement | undefined = $state();
	let uploading = $state(false);
	let problem = $state('');
</script>

{#snippet face()}
	{#if pictureId}
		<img
			src="/media/{pictureId}"
			alt=""
			loading="lazy"
			class="{size} rounded-lg border border-gray-200 bg-white object-cover"
		/>
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
				accept="image/png,image/jpeg,image/webp,image/gif"
				class="sr-only"
				onchange={(e) => {
					const field = e.currentTarget as HTMLInputElement;
					const file = field.files?.[0];
					problem = '';
					if (!file) return;
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
				}}
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
