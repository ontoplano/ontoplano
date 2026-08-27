/**
 * Reading colours out of a page, without parsing CSS.
 *
 * Every previous attempt at this failed on syntax rather than on colour:
 * Tailwind 4 emits `oklch(0.21 0.034 264.665)` for a palette entry,
 * `color(srgb 0.925 0.932 0.943)` for a computed one and plain `rgb()` for the
 * rest, and a hand-written parser has to get all three right or it invents
 * failures. A canvas already contains a complete CSS colour parser, so these
 * run inside the page and ask the browser.
 */

/**
 * Source for a function body, not a snippet to `eval`.
 *
 * `eval` inside a module gives its `const`s their own scope and the caller sees
 * none of them; `new Function(COLOUR_TOOLS)()` hands them back as an object.
 */
export const COLOUR_TOOLS = `
	const ctx = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
	/** Any CSS colour → [r, g, b, a] in sRGB bytes. */
	const toRGBA = (css) => {
		ctx.clearRect(0, 0, 1, 1);
		ctx.fillStyle = '#000';
		ctx.fillStyle = css;
		ctx.fillRect(0, 0, 1, 1);
		return [...ctx.getImageData(0, 0, 1, 1).data];
	};
	const luminance = ([r, g, b]) => {
		const chan = (v) => {
			const s = v / 255;
			return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
		};
		return 0.2126 * chan(r) + 0.7152 * chan(g) + 0.0722 * chan(b);
	};
	/** WCAG contrast ratio, 1 (identical) to 21 (black on white). */
	const contrast = (a, b) => {
		const [x, y] = [luminance(a), luminance(b)].sort((m, n) => n - m);
		return (x + 0.05) / (y + 0.05);
	};
	/**
	 * What is actually behind an element.
	 *
	 * Walking up to the first non-transparent background is not enough: the
	 * playful style tints cards with \`color-mix(… 10%, transparent)\`, and
	 * reading that 10% wash as though it were opaque paints the card in a
	 * saturated colour it never has on screen. Every translucent layer is
	 * collected and composited down onto the first opaque one, which is what the
	 * eye sees.
	 */
	const groundOf = (el) => {
		const layers = [];
		let node = el;
		let base = toRGBA('white');
		while (node) {
			const rgba = toRGBA(getComputedStyle(node).backgroundColor);
			if (rgba[3] >= 255) { base = rgba; break; }
			if (rgba[3] > 0) layers.push(rgba);
			node = node.parentElement;
		}
		let [r, g, b] = base;
		for (let i = layers.length - 1; i >= 0; i--) {
			const [lr, lg, lb, la] = layers[i];
			const a = la / 255;
			r = lr * a + r * (1 - a);
			g = lg * a + g * (1 - a);
			b = lb * a + b * (1 - a);
		}
		return [r, g, b, 255];
	};
	return { toRGBA, luminance, contrast, groundOf };
`;
