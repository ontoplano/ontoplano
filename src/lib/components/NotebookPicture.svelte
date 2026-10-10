<script lang="ts">
	/**
	 * A notebook's one picture, and the way to change it — `PicturePicker`,
	 * with a notebook's words and its own form actions.
	 *
	 * Only for a notebook of your own. One shared into the family is somebody
	 * else's to dress.
	 */
	import PicturePicker from '$lib/components/PicturePicker.svelte';
	import { useT } from '$lib/i18n';

	const t = useT();

	let {
		notebook,
		/** What the server will accept, so the browser can refuse first. */
		kilobytes,
		/** Tailwind size class for the square — `size-12` on a page, `size-10` in a dialog. */
		size = 'size-12',
		/** Offer a bin under the picture. The page has its own; a dialog does not. */
		removable = false,
		/** Where pressing it opens the notebook rather than the file chooser. */
		onpress,
		/** A corner handle: the picture dragged bigger, and the size kept on this device. */
		resizable = false,
		viewOnTouch = false
	}: {
		notebook: { id: number; title: string; pictureId: number | null; mine?: boolean };
		kilobytes: number;
		size?: string;
		removable?: boolean;
		onpress?: () => void;
		resizable?: boolean;
		viewOnTouch?: boolean;
	} = $props();
</script>

<PicturePicker
	id={notebook.id}
	pictureId={notebook.pictureId}
	icon="notebook"
	{kilobytes}
	setAction="?/setPicture"
	removeAction="?/removePicture"
	fields={{ title: notebook.title }}
	chooseLabel={t('notebooks.id.aPictureFor', { title: notebook.title })}
	changeLabel={t('notebooks.id.changeThePicture')}
	removeLabel={t('notebooks.id.removeThePicture')}
	{size}
	{removable}
	{onpress}
	pressLabel={t('notebooks.id.editNotebook')}
	{resizable}
	{viewOnTouch}
	sizeKey="notebook"
/>
