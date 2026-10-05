<script lang="ts">
	/**
	 * One picture in a grid of them: a square that opens the picture.
	 *
	 * Three gallery screens drew this button, and the album's one also drags.
	 * Anything else given — `draggable`, the drag handlers, a `title` — goes
	 * onto the button.
	 */
	import type { HTMLButtonAttributes } from 'svelte/elements';

	let {
		picture,
		/** What the button is called when the picture has no words of its own. */
		fallback,
		onopen,
		...rest
	}: {
		picture: { id: number; alt: string | null; filename: string | null };
		fallback: string;
		onopen: () => void;
	} & HTMLButtonAttributes = $props();
</script>

<button
	class="block w-full overflow-hidden"
	aria-label={picture.alt || picture.filename || fallback}
	onclick={onopen}
	{...rest}
>
	<img
		src="/media/{picture.id}"
		alt={picture.alt}
		loading="lazy"
		class="aspect-square w-full bg-gray-50 object-cover"
	/>
</button>
