<script lang="ts">
	import TabbedRoom from '$lib/components/TabbedRoom.svelte';
	import { resolve } from '$app/paths';
	import type { Snippet } from 'svelte';
	import { useT } from '$lib/i18n';

	/**
	 * The Health room: its strip and its body.
	 *
	 * Drawn by `/health` and by `/data/<slug>` both, because a data stream is a
	 * tab of this room while its page answers at its own address — the one a
	 * script pushes readings to. Without the room drawn there too, pressing
	 * Sleep took the strip away and the page read as belonging to nothing.
	 */
	const t = useT();

	let {
		children,
		data
	}: {
		children: Snippet;
		data: { streams: { slug: string; name: string }[] };
	} = $props();

	/**
	 * The room's own tabs come from `HEALTH_TABS`; after them, whatever this
	 * account measures. "Weight" was a hardcoded tab, which told every stranger
	 * the app had opinions about their body; a data stream earns a tab by
	 * existing.
	 */
	// Through `resolve` rather than a template string: a stream's slug reaches
	// the URL as a parameter of the route that owns it, so a slug with anything
	// interesting in it is escaped rather than pasted.
	const streams = $derived(
		data.streams.map((s) => ({ href: resolve('/data/[slug]', { slug: s.slug }), label: s.name }))
	);
</script>

<TabbedRoom
	title={t('rooms.health.title')}
	room="health"
	extra={streams}
	label={t('rooms.health.sections')}
>
	{@render children()}
</TabbedRoom>
