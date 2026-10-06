<script lang="ts">
	/**
	 * A thing's number inside its notebook — what `TASK:#4`, `GOAL:#2` or
	 * `IDEA:#7` in a note points at, shown where somebody can read it off.
	 * Nothing for a thing filed under no notebook.
	 */
	let {
		seq,
		title = undefined,
		class: klass = ''
	}: { seq: number | null | undefined; title?: string; class?: string } = $props();
</script>

{#if seq !== null && seq !== undefined}
	<span class="tabular text-[11px] text-gray-500 {klass}" {title}>#{seq}</span>
{/if}
