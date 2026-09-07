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
		id,
		/*
		 * The rest exists so this is a drop-in for `<input type="text">`.
		 *
		 * It was not, so every form that needed a width, an accessible name or
		 * the focus on open kept a plain input and kept raising the autofill
		 * bar. A component that fits four forms is a rule people have to
		 * remember; one that fits every form is the default.
		 *
		 * `list` is the one thing it cannot take: a textarea has no datalist, so
		 * a field that completes from one stays an input and is named in
		 * `tests/autofill-field-names.test.ts` as the exception it is.
		 */
		class: className = 'input',
		ariaLabel = undefined,
		autofocus = false,
		maxlength = undefined,
		autocapitalize = undefined,
		/** For the tour anchors, which point at a field by `data-tour`. */
		dataTour = undefined,
		disabled = false,
		readonly = false,
		oninput = undefined,
		onblur = undefined
	}: {
		name: string;
		value?: string;
		required?: boolean;
		placeholder?: string;
		id?: string;
		class?: string;
		ariaLabel?: string;
		autofocus?: boolean;
		maxlength?: number;
		autocapitalize?: 'none' | 'off' | 'sentences' | 'words' | 'characters';
		dataTour?: string;
		disabled?: boolean;
		readonly?: boolean;
		oninput?: (event: Event) => void;
		onblur?: (event: FocusEvent) => void;
	} = $props();

	function onkeydown(event: KeyboardEvent) {
		if (event.key !== 'Enter' || event.shiftKey) return;
		event.preventDefault();
		// The form's own submit, so every validation and every enhance handler
		// runs exactly as it does for the button.
		(event.currentTarget as HTMLTextAreaElement).form?.requestSubmit();
	}

	/*
	 * Focused on mount, not by the native attribute.
	 *
	 * `autofocus` is honoured once per document in most browsers and not at all
	 * for a field that appears later, which is every field in a dialog. The
	 * app's own action does it on mount instead, and callers that asked for
	 * `use:autofocus` on an input were asking for exactly that.
	 */
	function focusOnMount(node: HTMLTextAreaElement) {
		if (autofocus) node.focus();
	}

	function handleInput(event: Event) {
		if (/[\n\r]/.test(value)) value = value.replace(/\s*[\n\r]+\s*/g, ' ').trim();
		oninput?.(event);
	}
</script>

<textarea
	{name}
	{id}
	{required}
	{placeholder}
	{maxlength}
	{autocapitalize}
	data-tour={dataTour}
	{disabled}
	{readonly}
	{onblur}
	aria-label={ariaLabel}
	rows="1"
	autocomplete="off"
	spellcheck="false"
	bind:value
	use:focusOnMount
	{onkeydown}
	oninput={handleInput}
	class="{className} one-line"
></textarea>
