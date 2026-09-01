/**
 * A recipe, read out of somebody else's page.
 *
 * Nearly every food site on the web publishes its recipes as schema.org
 * JSON-LD, because Google's rich results require it — which means the same
 * handful of fields are there in the same shape whatever the page looks like.
 * That is the whole trick: this does not scrape a layout, it reads a standard,
 * so it does not break when a blog is redesigned.
 *
 * Pure on purpose. It takes HTML as a string and returns fields; fetching the
 * page is somebody else's job (`services/recipe-fetch.ts`, which has the part
 * that can be dangerous). That split is what lets this be tested against a
 * shelf of real-world shapes without a network.
 *
 * What it does NOT try to do: understand the ingredients. A line arrives as
 * written — "2 cloves garlic, crushed" — and `importIngredients` already knows
 * how to split a line into quantity, unit, name and note. One parser for that,
 * not two.
 */

export type ImportedRecipe = {
	title: string;
	/** One ingredient per line, as written on the page. */
	ingredients: string[];
	/** The method, as paragraphs. Empty when the page has none. */
	method: string;
	/** Servings and total minutes, when the page says. */
	servings: number | null;
	minutes: number | null;
};

/** How much of somebody else's page is worth reading. */
const MAX_INGREDIENTS = 100;
const MAX_METHOD_LENGTH = 20_000;

/**
 * Every JSON-LD block on the page, parsed, with anything unparseable skipped.
 *
 * A malformed block is common and is not a reason to give up: pages routinely
 * carry three or four, one of which is broken.
 */
function jsonLdBlocks(html: string): unknown[] {
	const out: unknown[] = [];
	const pattern = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;

	for (const match of html.matchAll(pattern)) {
		try {
			out.push(JSON.parse(match[1].trim()));
		} catch {
			// Unclosed strings, trailing commas, HTML comments wrapped around it.
			// One bad block is not a bad page.
		}
	}

	return out;
}

/** Whether a node's `@type` says Recipe, however the site spelled it. */
function isRecipe(node: unknown): boolean {
	if (!node || typeof node !== 'object') return false;
	const type = (node as { '@type'?: unknown })['@type'];
	const names = Array.isArray(type) ? type : [type];
	return names.some((n) => typeof n === 'string' && n.toLowerCase().endsWith('recipe'));
}

/**
 * The Recipe node, wherever it is hiding.
 *
 * Three shapes in the wild and all of them common: the block IS the recipe, the
 * block is an array with the recipe somewhere in it, or the block is a `@graph`
 * of every entity on the page with the recipe among them. Walked rather than
 * pattern-matched, because there is always a fourth shape.
 */
function findRecipe(value: unknown, depth = 0): Record<string, unknown> | null {
	if (depth > 6 || !value || typeof value !== 'object') return null;

	if (isRecipe(value)) return value as Record<string, unknown>;

	if (Array.isArray(value)) {
		for (const item of value) {
			const found = findRecipe(item, depth + 1);
			if (found) return found;
		}
		return null;
	}

	for (const key of ['@graph', 'mainEntity', 'mainEntityOfPage', 'itemListElement']) {
		const found = findRecipe((value as Record<string, unknown>)[key], depth + 1);
		if (found) return found;
	}

	return null;
}

/** Tags stripped, entities unescaped, whitespace collapsed. */
export function plainText(value: unknown): string {
	if (typeof value !== 'string') return '';

	return value
		.replace(/<br\s*\/?>/gi, '\n')
		.replace(/<\/(p|li|div|h[1-6])>/gi, '\n')
		.replace(/<[^>]*>/g, '')
		.replace(/&nbsp;/gi, ' ')
		.replace(/&amp;/gi, '&')
		.replace(/&lt;/gi, '<')
		.replace(/&gt;/gi, '>')
		.replace(/&quot;/gi, '"')
		.replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
		.replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
		.replace(/[ \t]+/g, ' ')
		.replace(/\n{3,}/g, '\n\n')
		.trim();
}

/**
 * `PT1H30M` → 90.
 *
 * ISO 8601 durations, which is what schema.org uses. Days are counted because
 * a few things really do say `P1DT2H` — a brine, a dough — and dropping the
 * day would turn two days into two hours.
 */
export function minutesFromDuration(value: unknown): number | null {
	if (typeof value !== 'string') return null;

	const match = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:\d+S)?)?$/i.exec(value.trim());
	if (!match) return null;

	const minutes =
		Number(match[1] ?? 0) * 24 * 60 + Number(match[2] ?? 0) * 60 + Number(match[3] ?? 0);

	return minutes > 0 ? minutes : null;
}

/**
 * `recipeYield` → a number of servings.
 *
 * Sites write it as a number, as "4", as "4 servings", as "Serves 4-6" and as
 * an array of two of those. The first plain number is the answer; a range takes
 * its lower end, because cooking for the smaller number is the recoverable
 * mistake.
 */
export function servingsFrom(value: unknown): number | null {
	const first = Array.isArray(value) ? value[0] : value;
	if (typeof first === 'number') return Number.isInteger(first) && first > 0 ? first : null;
	if (typeof first !== 'string') return null;

	const match = /(\d+)/.exec(first);
	if (!match) return null;

	const n = Number(match[1]);
	return n > 0 && n <= 1000 ? n : null;
}

/**
 * `recipeInstructions` → paragraphs.
 *
 * A string, a list of strings, a list of `HowToStep` objects, or a list of
 * `HowToSection` each holding its own steps. All four appear on real sites, and
 * the sections one is why this recurses.
 */
function instructionsFrom(value: unknown, depth = 0): string[] {
	if (depth > 4) return [];
	if (typeof value === 'string') {
		const text = plainText(value);
		return text ? text.split('\n').filter(Boolean) : [];
	}

	if (Array.isArray(value)) return value.flatMap((item) => instructionsFrom(item, depth + 1));

	if (value && typeof value === 'object') {
		const node = value as Record<string, unknown>;
		// A section carries its steps; a step carries its text.
		if (node.itemListElement) return instructionsFrom(node.itemListElement, depth + 1);
		const text = plainText(node.text ?? node.name);
		return text ? [text] : [];
	}

	return [];
}

/** How long the whole thing takes, by whichever fields the page carries. */
function totalMinutes(node: Record<string, unknown>): number | null {
	const total = minutesFromDuration(node.totalTime);
	if (total !== null) return total;

	const parts =
		(minutesFromDuration(node.prepTime) ?? 0) + (minutesFromDuration(node.cookTime) ?? 0);
	return parts > 0 ? parts : null;
}

/** `<title>` and `og:title`, for a page whose JSON-LD has no name. */
function titleFrom(html: string): string {
	const og = /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i.exec(html);
	if (og) return plainText(og[1]);
	const title = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
	return title ? plainText(title[1]) : '';
}

/**
 * A recipe from a page, or null when there is not one.
 *
 * Null rather than a guess: a page with no structured recipe on it is a page
 * this cannot read, and inventing a title from the `<title>` tag with no
 * ingredients under it would be worse than saying so.
 */
export function parseRecipeFromHtml(html: string): ImportedRecipe | null {
	const node = jsonLdBlocks(html)
		.map((block) => findRecipe(block))
		.find((found): found is Record<string, unknown> => found !== null);

	if (!node) return null;

	const rawIngredients = node.recipeIngredient ?? node.ingredients;
	const ingredients = (Array.isArray(rawIngredients) ? rawIngredients : [rawIngredients])
		.map((line) => plainText(line))
		.filter(Boolean)
		.slice(0, MAX_INGREDIENTS);

	// The one field that makes it a recipe rather than an article. A page whose
	// structured data claims Recipe and lists nothing is not importable.
	if (ingredients.length === 0) return null;

	const title = plainText(node.name) || titleFrom(html);
	if (!title) return null;

	const method = instructionsFrom(node.recipeInstructions).join('\n\n').slice(0, MAX_METHOD_LENGTH);

	return {
		title,
		ingredients,
		method,
		servings: servingsFrom(node.recipeYield),
		// `totalTime` is the honest one. Falling back to prep plus cook rather
		// than to cook alone: "20 minutes" on a recipe that needs an hour of
		// chopping first is the number that makes people give up mid-way.
		minutes: totalMinutes(node)
	};
}
