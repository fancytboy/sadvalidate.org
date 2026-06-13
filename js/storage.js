
const LEGACY_API_KEY = 'sdp.apiKey';
const LEGACY_ERROR_LOG = 'sdp.errors';
const API_KEY_PREFIX = 'sdp.key.';
const BASE_URL_PREFIX = 'sdp.baseUrl.'; // sdp.baseUrl.<provider>
const PROVIDER_KEY = 'sdp.provider';
const MODEL_KEY = 'sdp.model';
const DESIGN_PREFIX = 'sdp.design.';
const DESIGN_VERSION = 1;

function purgeStaleEntries(store) {
  const stale = [LEGACY_API_KEY, LEGACY_ERROR_LOG];
  for (let i = 0; i < store.length; i++) {
    const key = store.key(i);
    if (key && key.startsWith(API_KEY_PREFIX)) stale.push(key);
  }
  for (const key of stale) store.removeItem(key);
}

export function makeStorage(backend) {
  const store = backend || (typeof localStorage !== 'undefined' ? localStorage : null);
  if (!store) throw new Error('No storage backend available');
  purgeStaleEntries(store);
  const sessionApiKeys = new Map();

  return {
    getApiKey(provider) {
      return sessionApiKeys.get(provider) || null;
    },
    setSessionApiKey(provider, key) {
      sessionApiKeys.set(provider, key);
    },
    getBaseUrl(provider) {
      return store.getItem(BASE_URL_PREFIX + provider);
    },
    setBaseUrl(provider, url) {
      if (url) store.setItem(BASE_URL_PREFIX + provider, url);
      else store.removeItem(BASE_URL_PREFIX + provider);
    },
    getProvider() {
      return store.getItem(PROVIDER_KEY) || 'anthropic';
    },
    setProvider(provider) {
      store.setItem(PROVIDER_KEY, provider);
    },
    getModel() {
      return store.getItem(MODEL_KEY);
    },
    setModel(model) {
      store.setItem(MODEL_KEY, model);
    },
    saveDesign(design) {
      store.setItem(DESIGN_PREFIX + design.question, JSON.stringify({ v: DESIGN_VERSION, design }));
    },
    loadDesign(questionId) {
      const raw = store.getItem(DESIGN_PREFIX + questionId);
      if (!raw) return null;
      let parsed;
      try {
        parsed = JSON.parse(raw);
      } catch {
        return null;
      }
      if (parsed && parsed.v !== undefined) {
        return parsed.v === DESIGN_VERSION ? parsed.design : null;
      }
      return parsed;
    }
  };
}
