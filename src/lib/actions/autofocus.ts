export function autofocus(node: HTMLElement) {
	const target = node.matches('input:not([type="hidden"]), textarea, select')
		? node
		: node.querySelector<HTMLElement>('input:not([type="hidden"]), textarea, select');
	target?.focus();
}
