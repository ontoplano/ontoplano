const PALETTE: { emoji: string; r: number; g: number; b: number }[] = [
	{ emoji: '🟥', r: 0xef, g: 0x44, b: 0x44 },
	{ emoji: '🟧', r: 0xf9, g: 0x73, b: 0x16 },
	{ emoji: '🟨', r: 0xea, g: 0xb3, b: 0x08 },
	{ emoji: '🟩', r: 0x22, g: 0xc5, b: 0x5e },
	{ emoji: '🟦', r: 0x3b, g: 0x82, b: 0xf6 },
	{ emoji: '🟪', r: 0xa8, g: 0x55, b: 0xf7 },
	{ emoji: '🟫', r: 0x92, g: 0x40, b: 0x0e },
	{ emoji: '⬛', r: 0x11, g: 0x11, b: 0x11 },
	{ emoji: '⬜', r: 0xd1, g: 0xd5, b: 0xdb }
];

const DEFAULT_EMOJI = '⬜';

function parseHex(hex: string | null | undefined): { r: number; g: number; b: number } | null {
	if (!hex) return null;
	const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
	if (!m) return null;
	const int = parseInt(m[1], 16);
	return { r: (int >> 16) & 0xff, g: (int >> 8) & 0xff, b: int & 0xff };
}

export function categoryEmoji(hex: string | null | undefined): string {
	const rgb = parseHex(hex);
	if (!rgb) return DEFAULT_EMOJI;
	let best = DEFAULT_EMOJI;
	let bestDist = Infinity;
	for (const p of PALETTE) {
		const d = (rgb.r - p.r) ** 2 + (rgb.g - p.g) ** 2 + (rgb.b - p.b) ** 2;
		if (d < bestDist) {
			bestDist = d;
			best = p.emoji;
		}
	}
	return best;
}
