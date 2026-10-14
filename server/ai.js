/**
 * Research-assistant adapter.
 *
 * Two modes:
 *   mock  — no key configured. A deterministic reader (shared with the browser,
 *           in assets/js/lib/research.js) turns the brief into preferences. No
 *           network call is made at all, so the app is fully usable offline.
 *   model — NVIDIA-hosted chat completions at NVIDIA_BASE_URL. The model is
 *           asked for a preference JSON object and nothing else.
 *
 * The model is never trusted:
 *   - the response is parsed defensively (code fences and prose are rejected)
 *   - unknown fields are discarded and the rest is clamped by the same
 *     normaliser the browser uses
 *   - matching, scoring, cost maths and explanations are computed in code
 *   - the key stays on the server: it is never returned, logged or echoed
 */
import { normalisePreferences, extractPreferences, PREFERENCE_FIELDS, BRIEF_LIMIT } from '../assets/js/lib/research.js';
import { LISTINGS } from '../assets/js/data/listings.js';
import { logger } from './logger.js';

export const DEFAULT_MODEL = 'poolside/laguna-xs-2.1';
/** Models known to be unavailable on this endpoint. Never used. */
export const BLOCKED_MODELS = Object.freeze(['meta/llama-3.3-70b-instruct']);
export const DISABLED_MODEL_FAMILIES = Object.freeze(['mistral', 'nemotron']);

export const MODEL_SYSTEM_PROMPT = [
  'You convert a renter\'s brief into a small JSON object of preferences.',
  'Reply with JSON only. No prose, no markdown, no code fences.',
  `Allowed keys: ${PREFERENCE_FIELDS.join(', ')}.`,
  'Types: city (string), cities (array of strings), area (string), maxRentAmount (number), maxRentCurrency (3-letter code),',
  'bedroomsMin (integer), propertyType ("apartment"|"house"|"studio"|"townhouse"|"loft"|"shared"|"room"),',
  'furnished (boolean), leaseMonthsMin (integer), commuteMaxMinutes (integer), walkable (boolean),',
  'mustHaveAmenities (array of strings), niceToHaveAmenities (array of strings), notes (string, under 200 characters).',
  'Omit any key you cannot determine from the brief. Never guess a number that was not stated. Never add keys.'
].join(' ');

/** Strip a code fence or stray prose and parse the first JSON object found. */
export function parseModelJson(text) {
  if (typeof text !== 'string') return { ok: false, reason: 'empty_response' };
  let cleaned = text.trim();
  const fence = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) cleaned = fence[1].trim();
  if (!cleaned.startsWith('{')) {
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start === -1 || end === -1 || end <= start) return { ok: false, reason: 'not_json' };
    cleaned = cleaned.slice(start, end + 1);
  }
  try {
    const value = JSON.parse(cleaned);
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return { ok: false, reason: 'not_an_object' };
    return { ok: true, value };
  } catch {
    return { ok: false, reason: 'invalid_json' };
  }
}

export function createAiAdapter(config, { fetchImpl = globalThis.fetch } = {}) {
  const { enabled, model, baseUrl, temperature, maxTokens, timeoutMs, textLimit } = config.ai;

  function status() {
    return {
      adapter: enabled ? 'model' : 'mock',
      model: enabled ? model : null,
      modelConfigured: enabled,
      provider: enabled ? 'nvidia-hosted chat completions' : null,
      temperature,
      maxTokens,
      textLimit,
      timeoutSeconds: Math.round(timeoutMs / 1000),
      disclosure: enabled
        ? 'The model extracts preferences as JSON. Matching, scoring and every figure are computed in code on the server.'
        : 'No model key is configured, so a deterministic demo reader extracts preferences from your words. It reads the fictional sample records only and makes no network calls.',
      warning: enabled
        ? 'Model output is untrusted: unknown fields are discarded and values are clamped before anything is scored.'
        : 'Demo adapter: preferences are read with fixed rules from the sample dataset. No language model is involved and no internet search happens.',
      blockedModels: BLOCKED_MODELS,
      unavailableModelFamilies: DISABLED_MODEL_FAMILIES
    };
  }

  function mockExtract(brief) {
    const extracted = extractPreferences(brief, { listings: LISTINGS });
    return {
      adapter: 'mock',
      model: null,
      preferences: extracted.preferences,
      dropped: [],
      warning: 'No model key is configured, so this was read with the deterministic demo reader. It reads the sample dataset only.',
      understood: extracted.understood
    };
  }

  /** Ask the model for preferences. Returns { ok, preferences, dropped, reason }. */
  async function modelExtract(brief) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(`${baseUrl.replace(/\/$/, '')}/chat/completions`, {
        method: 'POST',
        redirect: 'error',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          Authorization: `Bearer ${config.runtimeSecrets.nvidiaApiKey}`
        },
        body: JSON.stringify({
          model,
          temperature,
          max_tokens: maxTokens,
          messages: [
            { role: 'system', content: MODEL_SYSTEM_PROMPT },
            { role: 'user', content: brief.slice(0, textLimit) }
          ]
        })
      });
      if (!response.ok) {
        // Status only: an error body can echo the request, including the key.
        logger.warn(`research assistant upstream returned HTTP ${response.status}`);
        return { ok: false, reason: `upstream_http_${response.status}` };
      }
      const payload = await response.json();
      const content = payload?.choices?.[0]?.message?.content;
      const parsed = parseModelJson(content);
      if (!parsed.ok) {
        logger.warn(`research assistant response was not usable JSON (${parsed.reason})`);
        return { ok: false, reason: 'unusable_response' };
      }
      const normalised = normalisePreferences(parsed.value);
      return { ok: true, preferences: normalised.preferences, dropped: normalised.dropped };
    } catch (error) {
      const aborted = error?.name === 'AbortError';
      logger.warn(aborted ? 'research assistant upstream timed out' : 'research assistant upstream could not be reached');
      return { ok: false, reason: aborted ? 'upstream_timeout' : 'upstream_unreachable' };
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Extract preferences for a brief. Always resolves; never throws; never
   * returns a key. Falls back to the mock reader when the model is unavailable.
   */
  async function extract(brief) {
    const text = String(brief ?? '').slice(0, textLimit);
    if (!enabled) return mockExtract(text);
    const result = await modelExtract(text);
    if (!result.ok) {
      return {
        ...mockExtract(text),
        adapter: 'mock',
        model: null,
        warning: `The model adapter could not be used (${result.reason}), so the deterministic demo reader produced these preferences instead.`
      };
    }
    // The mock reader still supplies the "what was understood" context in code.
    const context = extractPreferences(text, { listings: LISTINGS });
    return {
      adapter: 'model',
      model,
      preferences: result.preferences,
      dropped: result.dropped,
      warning: result.dropped.length
        ? `${result.dropped.length} field(s) the model returned are not part of this app's preference vocabulary and were discarded.`
        : null,
      understood: context.understood
    };
  }

  return { status, extract, mockExtract };
}
