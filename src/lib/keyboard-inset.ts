/**
 * How much of the screen the on-screen keyboard is covering.
 *
 * A phone does not resize the page when its keyboard opens: the layout
 * viewport stays the same height and the keyboard is drawn over the bottom of
 * it. Anything fixed to that bottom — this app's nav bar, and the strip above
 * it on the demo — therefore sits *between* the person and the field they are
 * typing into, which is what "i am typing, but the input is behind the bar"
 * is. The field is on screen; the bar is on top of it.
 *
 * `visualViewport` is the part still visible. The difference between it and
 * the window is the keyboard, and writing that down as a custom property lets
 * the CSS get out of the way — see `[data-keyboard]` in `layout.css`.
 *
 * Returns the function that stops listening.
 */
const OPEN_AT = 80;

export function watchKeyboard(): () => void {
	const view = typeof window === 'undefined' ? null : window.visualViewport;
	if (!view) return () => {};

	const root = document.documentElement;

	const measure = () => {
		const covered = Math.max(0, window.innerHeight - (view.height + view.offsetTop));
		root.style.setProperty('--keyboard-inset', `${Math.round(covered)}px`);
		// A threshold rather than "greater than zero": a URL bar sliding away
		// is a few pixels of the same measurement and is not a keyboard.
		if (covered > OPEN_AT) root.setAttribute('data-keyboard', 'open');
		else root.removeAttribute('data-keyboard');
	};

	measure();
	view.addEventListener('resize', measure);
	view.addEventListener('scroll', measure);

	return () => {
		view.removeEventListener('resize', measure);
		view.removeEventListener('scroll', measure);
		root.removeAttribute('data-keyboard');
		root.style.removeProperty('--keyboard-inset');
	};
}
