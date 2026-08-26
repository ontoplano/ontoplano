/**
 * A textarea the size of what is in it.
 *
 * `rows` is a guess made when the markup was written, so opening an editor on
 * four paragraphs showed two lines and a scrollbar and the first thing anybody
 * did was drag the corner. This measures instead: the box is as tall as its
 * content, from the moment it appears and after every keystroke, up to a
 * ceiling so one long note cannot push the buttons off the screen.
 *
 * The `rows` attribute still sets the minimum, so an empty composer stays the
 * modest two lines it was written as.
 */
export function autogrow(node: HTMLTextAreaElement, maxHeight = 480) {
	const resize = () => {
		// Back to nothing first, or `scrollHeight` only ever reports the height it
		// already has and the box can grow but never shrink.
		node.style.height = 'auto';
		const wanted = Math.min(node.scrollHeight, maxHeight);
		node.style.height = `${wanted}px`;
		node.style.overflowY = node.scrollHeight > maxHeight ? 'auto' : 'hidden';
	};

	resize();
	node.addEventListener('input', resize);

	return {
		update(next: number) {
			maxHeight = next;
			resize();
		},
		destroy() {
			node.removeEventListener('input', resize);
		}
	};
}
