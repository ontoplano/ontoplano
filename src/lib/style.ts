/**
 * Layout styles: the shape of the interface, independent of light and dark.
 *
 * `playful` is the default: rounded corners, no shadows, and section colour
 * allowed onto the chrome — the app looking like the thing the landing page
 * describes. `sober` is for people who find that too much: square corners, flat
 * shadows, colour reserved for the user's own categories. It is the style the
 * app was originally built in, which is why it reads as the plain one.
 *
 * Two, deliberately. A third would need a reason beyond "why not".
 */
export const STYLES = ['sober', 'playful'] as const;
export type Style = (typeof STYLES)[number];

export const STYLE_LABELS: Record<Style, string> = {
	sober: 'Sober',
	playful: 'Playful'
};

export const STYLE_HINTS: Record<Style, string> = {
	sober: 'Square, flat, quiet. Colour belongs to your categories.',
	playful: 'Rounded, shadowless, and section colour on the chrome.'
};

export function isStyle(value: unknown): value is Style {
	return typeof value === 'string' && (STYLES as readonly string[]).includes(value);
}
