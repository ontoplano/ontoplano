/**
 * The model providers the in-app chat can speak to.
 *
 * One list, read by the settings form, the validating service and the chat
 * backend, so a provider added here is added everywhere at once. The labels
 * are proper nouns and stay as they are in every language.
 *
 * The key is the person's own — the app never holds a provider account of
 * its own and never calls a model on anybody's behalf without one. Ollama is
 * the way to point the chat at a machine of your own instead of a company.
 */

export const PROVIDER_IDS = ['anthropic', 'openai', 'openrouter', 'ollama'] as const;

export type ProviderId = (typeof PROVIDER_IDS)[number];

/** OpenRouter speaks the OpenAI shape at one fixed address. */
export const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';

/** Where Ollama listens when nobody has moved it. */
export const OLLAMA_DEFAULT_BASE_URL = 'http://127.0.0.1:11434/v1';

export type Provider = {
	id: ProviderId;
	label: string;
	/**
	 * The model used when the person names none. Null where there is nothing
	 * sensible to guess: OpenRouter routes to hundreds and Ollama runs
	 * whatever was pulled, so those two ask for a name.
	 */
	defaultModel: string | null;
	/** An example model name, shown as the field's placeholder. */
	modelHint: string;
	/** Whether the person types a key at all. Ollama has no accounts. */
	needsKey: boolean;
	/** Whether the person can point this provider at an address of their own. */
	editableBaseUrl: boolean;
};

export const PROVIDERS: readonly Provider[] = [
	{
		id: 'anthropic',
		label: 'Anthropic',
		defaultModel: 'claude-sonnet-5',
		modelHint: 'claude-sonnet-5',
		needsKey: true,
		editableBaseUrl: false
	},
	{
		id: 'openai',
		label: 'OpenAI',
		defaultModel: 'gpt-5',
		modelHint: 'gpt-5',
		needsKey: true,
		editableBaseUrl: false
	},
	{
		id: 'openrouter',
		label: 'OpenRouter',
		defaultModel: null,
		modelHint: 'anthropic/claude-sonnet-5',
		needsKey: true,
		editableBaseUrl: false
	},
	{
		id: 'ollama',
		label: 'Ollama',
		defaultModel: null,
		modelHint: 'llama3.3',
		needsKey: false,
		editableBaseUrl: true
	}
];

export function providerOf(id: string): Provider | null {
	return PROVIDERS.find((one) => one.id === id) ?? null;
}
