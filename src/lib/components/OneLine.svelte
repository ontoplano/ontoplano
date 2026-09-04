<script lang="ts">
	/**
	 * A single-line field that is not an `<input>`.
	 *
	 * Android's autofill service decides what to offer by the element: it puts
	 * its key, card and pin bar over the keyboard for an `<input>` and never for
	 * a `<textarea>`. That is not a heuristic any attribute reaches — the quick
	 * todo form carried `autocomplete="off"`, every ignore flag `$lib/autofill`
	 * stamps, and a field name nothing classifies as an address, and still got
	 * the bar; the idea form beside it, identical but for leading with a
	 * textarea, never did.
	 *
	 * So this is a textarea that behaves like an input: one row, no resize
	 * handle, no scrollbar, and Enter submits instead of adding a line. It looks
	 * like every other field because it wears the same class.
	 *
	 * Newlines cannot be typed, but they can be pasted; the value is flattened
	 * on the way out so a pasted paragraph becomes one line rather than a title
	 * with a line break hidden in it.
	 */
	let {
		name,
		/*
		 * Bindable, because some callers watch what is typed — the shopping page
		 * enables its save button on it — and a one-way copy would leave them
		 * looking at an empty string while somebody types.
		 */
		value = $bindable(''),
		required = false,
		placeholder = '',
		id
	}: {
		name: string;
		value?: string;
		required?: boolean;
		placeholder?: string;
		id?: string;
	} = $props();

	function onkeydown(event: KeyboardEvent) {
		if (event.key !== 'Enter' || event.shiftKey) return;
		event.preventDefault();
		// The form's own submit, so every validation and every enhance handler
		// runs exactly as it does for the button.
		(event.currentTarget as HTMLTextAreaElement).form?.requestSubmit();
	}

	function flatten() {
		if (/[\n\r]/.test(value)) value = value.replace(/\s*[\n\r]+\s*/g, ' ').trim();
	}
</script>

<textarea
	{name}
	{id}
	{required}
	{placeholder}
	rows="1"
	autocomplete="off"
	spellcheck="false"
	bind:value
	{onkeydown}
	oninput={flatten}
	class="input one-line"
></textarea>
