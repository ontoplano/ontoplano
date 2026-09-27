<script lang="ts">
	/**
	 * A key somebody can press, drawn as a key: every shortcut hint in the app.
	 *
	 * Hints were spelled three ways — "(i)" in brackets on the dashboard, a bare
	 * "n" in monospace on a button, "j/k e" run into a sentence — because a
	 * `<kbd>` with no class looks like nothing, and each screen that wanted a
	 * cap drew its own. This is the one cap. A touch screen hides it, with every
	 * other `<kbd>`, since there is no keyboard to press it on.
	 */
	let {
		/** The key or keys, as the reader should press them — "n", "Ctrl", "↑↓". */
		keys,
		/** `chrome` on the site header's dark ground, where the cap is an outline. */
		tone = 'surface',
		title,
		class: klass = ''
	}: {
		keys: string;
		tone?: 'surface' | 'chrome';
		title?: string;
		class?: string;
	} = $props();
</script>

<kbd class="kbd {tone === 'chrome' ? 'kbd-chrome' : ''} {klass}" {title}>{keys}</kbd>
