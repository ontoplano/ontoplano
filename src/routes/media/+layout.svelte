<script lang="ts">
	import TabbedRoom from '$lib/components/TabbedRoom.svelte';
	import type { Snippet } from 'svelte';
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import { ALBUM_SEPARATOR, leafAlbumName } from '$lib/album-path';
	import { NOTEBOOK_SEPARATOR } from '$lib/notebook-path';
	import { useT } from '$lib/i18n';

	const t = useT();

	let { children }: { children: Snippet } = $props();

	/**
	 * An album is a page inside the Gallery tab, so the bar names the album and
	 * its glyph becomes the way back to wherever the album sits — the album
	 * above it, or the gallery.
	 */
	const inside = $derived.by((): { title: string; back: string } | null => {
		const gallery = resolve('/media/gallery');
		const data = page.data as {
			album?: { id: number; name: string };
			albums?: { id: number; name: string }[];
			title?: string;
			path?: string;
		};
		if (page.route.id === '/media/gallery/[id]' && data.album) {
			const lineage = data.album.name.split(ALBUM_SEPARATOR);
			const parentName = lineage.slice(0, -1).join(ALBUM_SEPARATOR);
			const parent = parentName ? data.albums?.find((a) => a.name === parentName) : undefined;
			return {
				title: leafAlbumName(data.album.name),
				back: parent ? `${gallery}/${parent.id}` : gallery
			};
		}
		if (page.route.id === '/media/gallery/notebooks/[...path]' && data.title !== undefined) {
			const parts = data.path ? data.path.split(NOTEBOOK_SEPARATOR) : [];
			parts.pop();
			const back =
				parts.length > 0
					? `${gallery}/notebooks/${parts.map(encodeURIComponent).join('/')}`
					: data.path
						? `${gallery}/notebooks`
						: gallery;
			return { title: data.title, back };
		}
		return null;
	});
</script>

<TabbedRoom
	title={inside?.title ?? t('rooms.media.title')}
	back={inside?.back}
	backLabel={inside ? t('ui.back') : undefined}
	room="media"
	label={t('rooms.media.sections')}
>
	{@render children()}
</TabbedRoom>
