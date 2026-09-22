/**
 * Things that are built and not currently offered.
 *
 * A flag rather than a commented-out block in four files: what is switched off
 * here keeps compiling, keeps its tests, and comes back by changing one word —
 * which is the difference between parking a feature and abandoning it.
 */

/**
 * The chat inside the app, where this instance calls a model on your behalf.
 *
 * Switched off while the shape of it is decided. It was built the way most
 * apps build one — you bring a provider key, the server calls the provider —
 * and that is the opposite of what ontoplano is for: the point is that the
 * assistant you already use reaches *in*, over MCP, with your own account and
 * your own model. A person running Ollama on their laptop can already point
 * Claude Code or any other MCP client at this instance; what they cannot do is
 * make a server on the internet dial their laptop, which is what the chat's
 * "base URL" field kept promising and could never deliver.
 *
 * Nothing is deleted. `/assistant`, `ChatSettings.svelte`, the model catalogue
 * and the provider list all stay; the two places that *offer* the chat are
 * behind this, and the specs that drive it skip while it is false. Turning it
 * back on is this one line.
 *
 * See the note "What should we do about the in-app chat?" in the Ontoplano
 * Development notebook for what the alternatives are.
 */
export const CHAT_IN_APP = false;
