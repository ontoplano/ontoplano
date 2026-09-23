<script lang="ts">
	/**
	 * A notebook's one picture, and the way to change it.
	 *
	 * The same arrangement a person has: pressing the picture is how you set or
	 * replace it, rather than hunting for a field in the edit form. It was
	 * written out on the notebook's own page and nowhere else, so the two Edit
	 * notebook dialogues — the one on the list and the one on the page — could
	 * not offer it at all.
	 *
	 * Its own form, deliberately: a file goes up as multipart the moment it is
	 * chosen, which is not the same submission as the title and the description.
	 * That is why a caller puts this beside its form rather than inside one —
	 * a form cannot nest in a form.
	 *
	 * Only for a notebook of your own. One shared into the family is somebody
	 * else's to dress.
	 */
	import Icon from '$lib/components/Icon.svelte';
	import { enhance } from '$lib/enhance';
	import { useT } from '$lib/i18n';

	const t = useT();

	let {
		notebook,
		/** What the server will accept, so the browser can refuse first. */
		kilobytes,
		/** Tailwind size class for the square — `size-12` on a page, `size-10` in a dialog. */
		size = 'size-12'
	}: {
		notebook: { id: number; title: string; pictureId: number | null; mine?: boolean };
		kilobytes: number;
		size?: string;
	} = $props();

	let form: HTMLFormElement | undefined = $state();
	let uploading = $state(false);
	let problem = $state('');
</script>

<div class="shrink-0">
	<form
		bind:this={form}
		method="post"
		action="?/setPicture"
		enctype="multipart/form-data"
		use:enhance={() =>
			async ({ update }) => {
				uploading = false;
				await update({ reset: false });
			}}
	>
		<input type="hidden" name="id" value={notebook.id} />
		<input type="hidden" name="title" value={notebook.title} />
		<label
			class="block cursor-pointer rounded-lg transition focus-within:ring-2 focus-within:ring-gray-900 hover:opacity-80"
			title={notebook.pictureId
				? t('notebooks.id.changeThePicture')
				: t('notebooks.id.aPictureFor', { title: notebook.title })}
		>
			{#if notebook.pictureId}
				<img
					src="/media/{notebook.pictureId}"
					alt=""
					loading="lazy"
					class="{size} rounded-lg border border-gray-200 bg-white object-cover"
				/>
			{:else}
				<!-- A notebook, not a photograph: the placeholder says what the
				     thing is, and every other empty picture in the app draws the
				     mark of what it belongs to. -->
				<span
					aria-hidden="true"
					class="{size} flex items-center justify-center rounded-lg border border-dashed border-gray-300 bg-gray-100 text-gray-500"
				>
					<Icon name="notebook" />
				</span>
			{/if}
			<span class="sr-only">{t('notebooks.id.aPictureFor', { title: notebook.title })}</span>
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

	{#if uploading}
		<p class="mt-1 text-xs text-gray-500">{t('pictures.uploading')}</p>
	{/if}
	{#if problem}
		<p class="mt-1 text-xs text-red-700">{problem}</p>
	{/if}

	{#if notebook.pictureId}
		<form method="post" action="?/removePicture" use:enhance>
			<input type="hidden" name="id" value={notebook.id} />
			<button class="mt-1 text-xs text-gray-500 underline hover:text-gray-900">
				{t('notebooks.id.removeThePicture')}
			</button>
		</form>
	{/if}
</div>
