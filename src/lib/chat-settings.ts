import type { PROVIDERS } from '$lib/assistant-providers';
import type { ModelKeyDescription } from '$lib/server/services/model-keys';

/**
 * What the chat's own settings need from the page they sit on.
 *
 * They sit on the AI tab now rather than on a tab of their own, so the shapes
 * they read are named here instead of being inferred from one route's
 * `$types` — the component is `ChatSettings.svelte` and the load that fills it
 * is `src/routes/settings/integrations/+page.server.ts`.
 */
export type ChatSettingsData = {
	configured: ModelKeyDescription | null;
	mayDelete: boolean;
	/** Whether this instance can reach a model on its own machine. */
	selfHosted: boolean;
	providers: typeof PROVIDERS;
};

/**
 * Whatever the last submission said, if anything has been submitted.
 *
 * Only the two fields this component reads are named: the page it sits on has
 * other forms on it, and their answers land in the same place.
 */
export type ChatSettingsForm = ({ message?: string | null } & Record<string, unknown>) | null;
