<script lang="ts">
	import TabbedRoom from '$lib/components/TabbedRoom.svelte';
	import { isHidden, HEALTH_TABS, type HideableSection } from '$lib/sections';
	import { resolve } from '$app/paths';
	import type { Snippet } from 'svelte';
	import { useT } from '$lib/i18n';

	const t = useT();

	let {
		children,
		data
	}: {
		children: Snippet;
		data: { streams: { slug: string; name: string }[]; hiddenSections: string[] };
	} = $props();

	/**
	 * Habits, and then whatever this account measures.
	 *
	 * "Weight" was a hardcoded tab, which told every stranger the app had
	 * opinions about their body and was empty for almost all of them. Weight is
	 * one data stream that one producer pushes; it earns a tab by existing.
	 */
	// Through `resolve` rather than a template string: a stream's slug reaches
	// the URL as a parameter of the route that owns it, so a slug with anything
	// interesting in it is escaped rather than pasted.
	/*
	 * The tabs this account keeps.
	 *
	 * Each is a thing that can be put away on its own — hiding Recipes leaves
	 * Workouts where it is — which the Notebooks room beside this one has
	 * always honoured and this one did not, so the preference existed and did
	 * nothing here.
	 */
	const tabs = $derived([
		...HEALTH_TABS.filter((tab) => !isHidden(data.hiddenSections, tab.id as HideableSection)).map(
			(tab) => ({ href: resolve(tab.href as '/health/habits'), label: t(tab.label) })
		),
		...data.streams.map((s) => ({ href: resolve('/data/[slug]', { slug: s.slug }), label: s.name }))
	]);
</script>

<TabbedRoom title={t('rooms.health.title')} {tabs} label={t('rooms.health.sections')}>
	{@render children()}
</TabbedRoom>
