/**
 * Which environment variables an entry may name as its credential.
 *
 * The prefix is a permission, not a spelling rule: whatever an entry names is
 * read out of `process.env` and sent as a Bearer token to the endpoint the
 * same entry names, so a console operator must not be able to reach a secret
 * that has nothing to do with a model.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { isApiKeyEnvName } from '@/lib/domain/generation';
import { configuredLlmApiKeyEnvs, isAllowedApiKeyEnv } from '@/lib/infrastructure/ai/llm';

const saved = { ...process.env };

afterEach(() => {
  for (const name of Object.keys(process.env)) {
    if (!(name in saved)) delete process.env[name];
  }
  Object.assign(process.env, saved);
});

describe('api key environment names', () => {
  it('allows the default variable and any name carrying its prefix', () => {
    expect(isAllowedApiKeyEnv('LLM_PROVIDER_API_KEY')).toBe(true);
    expect(isAllowedApiKeyEnv('LLM_PROVIDER_API_KEY_AGNES')).toBe(true);
    expect(isAllowedApiKeyEnv('LLM_PROVIDER_API_KEY_MINIMAX')).toBe(true);
  });

  it('refuses a secret that is well-formed but not a model credential', () => {
    /* Shape alone would pass all three -- the prefix is what stops the
       console's own authority from being sent to an operator's endpoint. */
    for (const name of ['DATABASE_URL', 'SESSION_SIGNING_SECRET', 'CREDENTIAL_ENCRYPTION_KEY']) {
      expect(isApiKeyEnvName(name)).toBe(true);
      expect(isAllowedApiKeyEnv(name)).toBe(false);
    }
  });

  it('refuses a name that is not shell-shaped even under the prefix', () => {
    expect(isAllowedApiKeyEnv('LLM_PROVIDER_API_KEY-AGNES')).toBe(false);
    expect(isAllowedApiKeyEnv('llm_provider_api_key_agnes')).toBe(false);
  });

  it('offers the credentials the deployment actually holds, and only those', () => {
    process.env.LLM_PROVIDER_API_KEY_AGNES = 'sk-fixture';
    process.env.LLM_PROVIDER_API_KEY_EMPTY = '';
    process.env.SESSION_SIGNING_SECRET = 'not-a-model-key';
    const offered = configuredLlmApiKeyEnvs();
    expect(offered).toContain('LLM_PROVIDER_API_KEY');
    expect(offered).toContain('LLM_PROVIDER_API_KEY_AGNES');
    expect(offered).not.toContain('LLM_PROVIDER_API_KEY_EMPTY');
    expect(offered).not.toContain('SESSION_SIGNING_SECRET');
  });
});
