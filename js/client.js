
export const DEFAULT_PROVIDER = 'anthropic';

export const PROVIDERS = {
  anthropic: {
    label: 'Anthropic',
    models: ['claude-opus-4-8', 'claude-fable-5', 'claude-sonnet-4-6', 'claude-haiku-4-5'],
    keyPlaceholder: 'sk-ant-...',
    requiresApiKey: true,
    hosting: 'cloud'
  },
  openai: {
    label: 'OpenAI',
    models: ['gpt-5.5', 'gpt-5.2', 'gpt-5.2-chat-latest'],
    keyPlaceholder: 'sk-...',
    requiresApiKey: true,
    hosting: 'cloud'
  },
  gemini: {
    label: 'Google Gemini',
    models: ['gemini-3.5-flash', 'gemini-3.1-pro-preview'],
    keyPlaceholder: 'AIza...',
    requiresApiKey: true,
    hosting: 'cloud'
  },
  qwen: {
    label: 'Qwen (DashScope)',
    models: ['qwen3-max', 'qwen3.5-plus', 'qwen3.5-flash'],
    keyPlaceholder: 'sk-...',
    requiresApiKey: true,
    hosting: 'cloud'
  },
  ollama: {
    label: 'Ollama',
    models: ['llama3.3', 'qwen3', 'gemma3', 'deepseek-r1', 'gpt-oss'],
    keyPlaceholder: 'not required',
    requiresApiKey: false,
    allowsCustomModels: true,
    hosting: 'self-hosted'
  },
  custom: {
    label: 'Custom',
    models: [],
    keyPlaceholder: 'optional',
    requiresApiKey: false,
    allowsCustomModels: true,
    hosting: 'self-hosted'
  }
};

const DEFAULT_TIMEOUT_MS = 60000;
const DEFAULT_MAX_TOKENS = 1500;

function buildOpenAiCompatibleRequest({ url, maxTokensParam, apiKey, model, system, user, maxTokens }) {
  const body = {
    model,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user }
    ],
    [maxTokensParam]: maxTokens
  };
  const headers = { 'content-type': 'application/json' };
  if (apiKey) headers.authorization = `Bearer ${apiKey}`;
  return {
    url,
    options: { method: 'POST', headers, body: JSON.stringify(body) }
  };
}

function extractOpenAiCompatibleText(data) {
  return data.choices?.[0]?.message?.content || '';
}

const PROVIDER_ADAPTERS = {
  anthropic: {
    defaultBaseUrl: 'https://api.anthropic.com',
    buildRequest({ baseUrl, apiKey, model, system, user, maxTokens }) {
      const headers = {
        'content-type': 'application/json',
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true'
      };
      if (apiKey) headers['x-api-key'] = apiKey;
      return {
        url: `${baseUrl}/v1/messages`,
        options: {
          method: 'POST',
          headers,
          body: JSON.stringify({
            model,
            max_tokens: maxTokens,
            system,
            messages: [{ role: 'user', content: user }]
          })
        }
      };
    },
    extractText(data) {
      const textPart = (data.content || []).find(part => part.type === 'text');
      return textPart ? textPart.text : '';
    }
  },
  openai: {
    defaultBaseUrl: 'https://api.openai.com',
    buildRequest(params) {
      return buildOpenAiCompatibleRequest({
        ...params,
        url: `${params.baseUrl}/v1/chat/completions`,
        maxTokensParam: 'max_completion_tokens'
      });
    },
    extractText: extractOpenAiCompatibleText
  },
  qwen: {
    defaultBaseUrl: 'https://dashscope-intl.aliyuncs.com/compatible-mode',
    buildRequest(params) {
      return buildOpenAiCompatibleRequest({
        ...params,
        url: `${params.baseUrl}/v1/chat/completions`,
        maxTokensParam: 'max_tokens'
      });
    },
    extractText: extractOpenAiCompatibleText
  },
  ollama: {
    defaultBaseUrl: 'http://localhost:11434',
    defaultTimeoutMs: 300000,
    buildRequest(params) {
      return buildOpenAiCompatibleRequest({
        ...params,
        url: `${params.baseUrl}/v1/chat/completions`,
        maxTokensParam: 'max_tokens'
      });
    },
    extractText: extractOpenAiCompatibleText
  },
  custom: {
    defaultBaseUrl: '',
    buildRequest(params) {
      return buildOpenAiCompatibleRequest({
        ...params,
        url: `${params.baseUrl}/v1/chat/completions`,
        maxTokensParam: 'max_tokens'
      });
    },
    extractText: extractOpenAiCompatibleText
  },
  gemini: {
    defaultBaseUrl: 'https://generativelanguage.googleapis.com',
    buildRequest({ baseUrl, apiKey, model, system, user, maxTokens }) {
      const headers = { 'content-type': 'application/json' };
      if (apiKey) headers['x-goog-api-key'] = apiKey;
      return {
        url: `${baseUrl}/v1beta/models/${model}:generateContent`,
        options: {
          method: 'POST',
          headers,
          body: JSON.stringify({
            system_instruction: { parts: [{ text: system }] },
            contents: [{ role: 'user', parts: [{ text: user }] }],
            generationConfig: { maxOutputTokens: maxTokens }
          })
        }
      };
    },
    extractText(data) {
      const parts = data.candidates?.[0]?.content?.parts || [];
      return parts.map(part => part.text || '').join('');
    }
  }
};


export function buildRequest({ provider = DEFAULT_PROVIDER, apiKey, model, system, user, maxTokens = DEFAULT_MAX_TOKENS, baseUrl }) {
  const adapter = PROVIDER_ADAPTERS[provider];
  const resolvedBaseUrl = (baseUrl || adapter.defaultBaseUrl).replace(/\/+$/, '');
  return adapter.buildRequest({ baseUrl: resolvedBaseUrl, apiKey, model, system, user, maxTokens });
}

export function extractResponseText(provider, data) {
  return PROVIDER_ADAPTERS[provider].extractText(data);
}

export function isApiKeyRequired({ provider, baseUrl }) {
  return PROVIDERS[provider].requiresApiKey && !baseUrl;
}

function extractErrorDetail(data) {
  return data?.error?.message || '';
}

function resolveFetchImpl(fetchImpl) {
  const doFetch = fetchImpl || (typeof fetch !== 'undefined' ? fetch : null);
  if (!doFetch) throw new Error('No fetch implementation available');
  return doFetch;
}

async function sendRequestWithTimeout({ doFetch, url, options, timeoutMs }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await doFetch(url, { ...options, signal: controller.signal });
  } catch (err) {
    if (err && err.name === 'AbortError') {
      throw new Error(`Request timed out after ${Math.round(timeoutMs / 1000)}s`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

export function makeAiClient({ provider = DEFAULT_PROVIDER, apiKey, model, baseUrl, fetchImpl, timeoutMs } = {}) {
  const doFetch = resolveFetchImpl(fetchImpl);
  const resolvedModel = model || PROVIDERS[provider].models[0];
  const resolvedTimeoutMs = timeoutMs || PROVIDER_ADAPTERS[provider].defaultTimeoutMs || DEFAULT_TIMEOUT_MS;

  return {
    async evaluate({ system, user, maxTokens }) {
      if (!apiKey && isApiKeyRequired({ provider, baseUrl })) throw new Error('Missing API key');
      const { url, options } = buildRequest({ provider, apiKey, model: resolvedModel, system, user, maxTokens, baseUrl });
      const res = await sendRequestWithTimeout({ doFetch, url, options, timeoutMs: resolvedTimeoutMs });
      if (!res.ok) {
        let detail = '';
        try { detail = extractErrorDetail(await res.json()); } catch { /* ignore */ }
        throw new Error(`${PROVIDERS[provider].label} API error ${res.status}${detail ? ': ' + detail : ''}`);
      }
      return extractResponseText(provider, await res.json());
    }
  };
}

export function makeProxyClient({ provider, model, proxyUrl = '/api/evaluate', fetchImpl, timeoutMs } = {}) {
  const doFetch = resolveFetchImpl(fetchImpl);
  const resolvedTimeoutMs = timeoutMs || PROVIDER_ADAPTERS[provider]?.defaultTimeoutMs || DEFAULT_TIMEOUT_MS;

  return {
    async evaluate({ system, user, maxTokens }) {
      const options = {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ provider, model, system, user, maxTokens })
      };
      const res = await sendRequestWithTimeout({ doFetch, url: proxyUrl, options, timeoutMs: resolvedTimeoutMs });
      let data = null;
      try { data = await res.json(); } catch { /* non-JSON reply */ }
      if (!res.ok) {
        const detail = data && data.error ? ': ' + data.error : '';
        throw new Error(`Server proxy error ${res.status}${detail}`);
      }
      return data && typeof data.text === 'string' ? data.text : '';
    }
  };
}


export const DATA_FENCE = '[CANDIDATE_DATA]';

const INJECTION_PATTERNS = [
  /ignore (?:all |any |the )?(?:previous|prior|above|earlier)\s+(?:instructions?|prompts?|rules?)/i,
  /disregard (?:all |any |the )?(?:previous|prior|above|earlier)/i,
  /forget (?:everything|all|the above)/i,
  /system\s+prompt/i,
  /you are now\b/i,
  /respond with (?:a )?score\s*(?:of|:)?\s*\d/i,
  /(?:set|give)\s+(?:the\s+|me\s+|it\s+|this\s+)?(?:a\s+)?score\s*(?:of|to|:)?\s*\d/i,
  /new instructions?\s*:/i
];

export function scanForInjection(text) {
  const candidate = String(text == null ? '' : text);
  return INJECTION_PATTERNS.filter(pattern => pattern.test(candidate)).map(pattern => pattern.source);
}

export function neutralizeValue(value) {
  return String(value == null ? '' : value).split(DATA_FENCE).join('');
}

export function neutralizeDesign(serialized) {
  if (!serialized || typeof serialized !== 'object') return serialized;
  return {
    ...serialized,
    nodes: (serialized.nodes || []).map(node => {
      const out = { ...node };
      if ('label' in out) out.label = neutralizeValue(out.label);
      if ('description' in out) out.description = neutralizeValue(out.description);
      return out;
    }),
    edges: (serialized.edges || []).map(edge => ({ ...edge, label: neutralizeValue(edge.label) }))
  };
}

export function fenceData(text) {
  return `${DATA_FENCE}\n${text}\n${DATA_FENCE}`;
}


export function makeGuardedClient(client, guardrails = []) {
  const hooks = (Array.isArray(guardrails) ? guardrails : [guardrails]).filter(Boolean);

  function runInputHooks(req) {
    let result = req;
    for (const hook of hooks) {
      if (typeof hook.input !== 'function') continue;
      const next = hook.input(result);
      if (next !== undefined) result = next;
    }
    return result;
  }

  function runOutputHooks(text, req) {
    let result = text;
    for (const hook of hooks) {
      if (typeof hook.output !== 'function') continue;
      const next = hook.output(result, req);
      if (next !== undefined) result = next;
    }
    return result;
  }

  return {
    async evaluate(req) {
      const guardedReq = runInputHooks(req);
      const text = await client.evaluate(guardedReq);
      return runOutputHooks(text, guardedReq);
    }
  };
}

export function createSizeGuard({ maxPromptChars = 200000 } = {}) {
  return {
    input(req) {
      const promptLength = (req.system || '').length + (req.user || '').length;
      if (promptLength > maxPromptChars) {
        throw new Error(`Prompt too large (${promptLength} chars exceeds ${maxPromptChars} limit)`);
      }
      return req;
    }
  };
}

export function createInjectionGuard({ onDetect } = {}) {
  return {
    input(req) {
      const hits = scanForInjection(req.user || '');
      if (hits.length && typeof onDetect === 'function') onDetect(hits);
      return req;
    }
  };
}
