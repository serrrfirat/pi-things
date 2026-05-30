/**
 * NEAR AI Cloud Provider Extension
 *
 * Adds NEAR AI Cloud (cloud-api.near.ai) as a provider in pi.
 * Uses the OpenAI-compatible /v1/chat/completions endpoint.
 * Models are fetched dynamically from /v1/model/list at startup.
 *
 * Based on: https://github.com/earendil-works/pi/pull/4795
 *
 * Usage:
 *   Set NEARAI_API_KEY in your environment, or run /login nearai
 *   Then use: pi --model nearai/<model-id>
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const NEARAI_BASE_URL = "https://cloud-api.near.ai/v1";

// ---------------------------------------------------------------------------
// Model list types matching the /v1/model/list response
// ---------------------------------------------------------------------------

interface NearAIModelCost {
  amount: number;
  scale: number;
  currency: string;
}

interface NearAIModel {
  modelId: string;
  inputCostPerToken: NearAIModelCost;
  outputCostPerToken: NearAIModelCost;
  cacheReadCostPerToken?: NearAIModelCost;
  metadata: {
    contextLength?: number;
    modelDisplayName?: string;
    providerType?: string;
    architecture?: {
      inputModalities?: string[];
      outputModalities?: string[];
    };
  };
}

interface NearAIModelListResponse {
  models: NearAIModel[];
}

// ---------------------------------------------------------------------------
// Fetch models from NEAR AI Cloud at startup
// ---------------------------------------------------------------------------

async function fetchNearAIModels() {
  try {
    const response = await fetch(`${NEARAI_BASE_URL}/model/list`);
    if (!response.ok) {
      console.error(`[nearai] Failed to fetch model list: HTTP ${response.status}`);
      return fallbackModels();
    }

    const data = (await response.json()) as NearAIModelListResponse;
    const models: ReturnType<typeof buildModel>[] = [];

    for (const m of data.models) {
      const id = m.modelId;

      // Only include models that output text
      const outputMods = m.metadata?.architecture?.outputModalities ?? [];
      if (!outputMods.includes("text")) continue;

      // Skip non-chat models: embeddings, rerankers, whisper, image gen, etc.
      if (/Embedding|Reranker|whisper|FLUX|privacy-filter/i.test(id)) continue;

      const input: ("text" | "image")[] = ["text"];
      if (m.metadata?.architecture?.inputModalities?.includes("image")) {
        input.push("image");
      }

      // Convert nano-dollars per token → $/MTok
      // amount is in nanodollars/token; scale is -9.
      // amount * 10^-9 $/token * 10^6 tokens/MTok = amount / 1000 $/MTok
      const toMTok = (cost?: NearAIModelCost): number =>
        (cost?.amount ?? 0) / 1000;

      const contextWindow = m.metadata?.contextLength ?? 128000;

      models.push(
        buildModel({
          id,
          name: m.metadata?.modelDisplayName || id,
          input,
          costInput: toMTok(m.inputCostPerToken),
          costOutput: toMTok(m.outputCostPerToken),
          costCacheRead: toMTok(m.cacheReadCostPerToken),
          contextWindow,
          // Cap maxTokens at 32k so we don't overrun context on long contexts
          maxTokens: Math.min(contextWindow, 32768),
          // Heuristic: models named o3, o4, or qwen3 support extended reasoning
          reasoning: /\b(o3|o4|qwen3)/i.test(id),
        })
      );
    }

    if (models.length === 0) {
      console.warn("[nearai] No chat-capable models found; using fallback");
      return fallbackModels();
    }

    console.log(`[nearai] Registered ${models.length} models from NEAR AI Cloud`);
    return models;
  } catch (err) {
    console.error("[nearai] Error fetching model list:", err);
    return fallbackModels();
  }
}

// ---------------------------------------------------------------------------
// Model builder helper
// ---------------------------------------------------------------------------

interface ModelSpec {
  id: string;
  name: string;
  input: ("text" | "image")[];
  costInput: number;
  costOutput: number;
  costCacheRead: number;
  contextWindow: number;
  maxTokens: number;
  reasoning: boolean;
}

function buildModel(spec: ModelSpec) {
  return {
    id: spec.id,
    name: spec.name,
    reasoning: spec.reasoning,
    input: spec.input,
    cost: {
      input: spec.costInput,
      output: spec.costOutput,
      cacheRead: spec.costCacheRead,
      cacheWrite: 0,
    },
    contextWindow: spec.contextWindow,
    maxTokens: spec.maxTokens,
    // Conservative compat: NEAR AI proxy doesn't support store/developer-role/strict
    compat: {
      maxTokensField: "max_tokens" as const,
      supportsDeveloperRole: false,
      supportsStore: false,
    },
  };
}

// ---------------------------------------------------------------------------
// Hardcoded fallback models if the API is unreachable at startup
// (mirrors the PR's default: zai-org/GLM-5.1-FP8 + a few popular ones)
// ---------------------------------------------------------------------------

function fallbackModels() {
  return [
    buildModel({
      id: "zai-org/GLM-5.1-FP8",
      name: "GLM-5.1 (self-hosted)",
      input: ["text"],
      costInput: 0,
      costOutput: 0,
      costCacheRead: 0,
      contextWindow: 202000,
      maxTokens: 32768,
      reasoning: false,
    }),
    buildModel({
      id: "qwen/qwen3-235b-a22b",
      name: "Qwen3 235B A22B",
      input: ["text"],
      costInput: 0,
      costOutput: 0,
      costCacheRead: 0,
      contextWindow: 128000,
      maxTokens: 32768,
      reasoning: true,
    }),
  ];
}

// ---------------------------------------------------------------------------
// Extension entry point
// ---------------------------------------------------------------------------

export default async function (pi: ExtensionAPI) {
  const models = await fetchNearAIModels();

  pi.registerProvider("nearai", {
    name: "NEAR AI Cloud",
    baseUrl: NEARAI_BASE_URL,
    // Set NEARAI_API_KEY in your environment, or /login nearai
    apiKey: "$NEARAI_API_KEY",
    api: "openai-completions",
    models,
  });
}
