// config.ts — runtime config from env (no YAML needed for the MVP).

export const config = {
  port: Number(process.env.PORT ?? 3000),
  anthropicApiKey: process.env.ANTHROPIC_API_KEY ?? '',
  // Model is env-configurable; defaults to the current Sonnet (good cost/quality for vision).
  anthropicModel: process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-4-6',
};

export const hasAnthropicKey = (): boolean => config.anthropicApiKey.length > 0;
