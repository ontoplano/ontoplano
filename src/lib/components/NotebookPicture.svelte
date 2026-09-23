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
		size = 'size-12',
		/**
		 * Whether to offer taking the picture off.
		 *
		 * Only on the notebook's own page and in the dialogue that edits it.
		 * Beside a name in a panel header it is a destructive link sitting under
		 * a thing you were only looking at.
		 */
		removable = false,
		/**
		 * Pressed to open the notebook's editor rather than the file chooser.
		 *
		 * Beside a name in a panel header the picture is the notebook, and
		 * pressing it should open the thing — the dialogue where the name, the
		 * labels and the picture all live. Only the editor itself hands over the
		 * file chooser, where changing the picture is what you came to do.
		 */
		onpress
	}: {
		notebook: { id: number; title: string; pictureId: number | null; mine?: boolean };
		kilobytes: number;
		size?: string;
		removable?: boolean;
		onpress?: () => void;
	} = $props();

	let form: HTMLFormElement | undefined = $state();
	let uploading = $state(false);
	let problem = $state('');
</script>

{#snippet face()}
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
{/snippet}

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
		<!--
			As wide as the picture and no wider.

			`block` made it as wide as the column, which is as wide as the widest
			thing under it — "Remove the picture", or "uploading…". The ring then
			drew a rounded rectangle twice the width of the square with the
			picture sitting in the left half of it, which reads as a switch
			somebody has flipped.
		-->

		<label
			class="block w-fit cursor-pointer rounded-lg transition focus-within:ring-2 focus-within:ring-gray-900 hover:opacity-80"
			hidden={Boolean(onpress)}
			title={notebook.pictureId
				? t('notebooks.id.changeThePicture')
				: t('notebooks.id.aPictureFor', { title: notebook.title })}
		>
			{@render face()}
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

	<!-- Where pressing it opens the notebook rather than the file chooser. -->
	{#if onpress}
		<button
			type="button"
			onclick={onpress}
			class="block w-fit cursor-pointer rounded-lg transition hover:opacity-80 focus-visible:ring-2 focus-visible:ring-gray-900"
			aria-label={t('notebooks.id.editNotebook')}
			title={t('notebooks.id.editNotebook')}
		>
			{@render face()}
		</button>
	{/if}

	{#if uploading}
		<p class="mt-1 text-xs text-gray-500">{t('pictures.uploading')}</p>
	{/if}
	{#if problem}
		<p class="mt-1 text-xs text-red-700">{problem}</p>
	{/if}

	<!-- A bin rather than a sentence: it is one small destructive act beside
	     the thing it acts on, and "Remove the picture" underlined was a line of
	     prose doing a button's job. -->
	{#if removable && notebook.pictureId}
		<form method="post" action="?/removePicture" use:enhance class="mt-1 flex justify-center">
			<input type="hidden" name="id" value={notebook.id} />
			<button
				class="icon-btn text-gray-500 hover:text-red-700"
				aria-label={t('notebooks.id.removeThePicture')}
				title={t('notebooks.id.removeThePicture')}
			>
				<Icon name="trash" size={16} />
			</button>
		</form>
	{/if}
</div>
