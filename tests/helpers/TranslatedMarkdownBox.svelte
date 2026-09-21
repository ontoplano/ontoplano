<script lang="ts">
	/**
	 * A `MarkdownBox` with a translator over it, so a test can render one.
	 *
	 * The box asks for `useT()` the way every component does, and that comes
	 * from the root layout — which a test does not have. An empty catalogue is
	 * enough: what is being asserted is the preview pane, and a missing message
	 * renders as its own key.
	 */
	import { provideT } from '$lib/i18n';
	import { translator } from '$lib/i18n/core';
	import MarkdownBox from '$lib/components/MarkdownBox.svelte';
	import type { TodoRefs } from '$lib/markdown';

	let { value, todos }: { value: string; todos?: TodoRefs } = $props();

	const t = translator('en', {});
	provideT(() => t);
</script>

<MarkdownBox {value} {todos} />
