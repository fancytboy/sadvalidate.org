import { COMPONENTS } from './data/components.js';
import { QUESTIONS } from './data/questions.js';
import {
  createDesign, createNode, insertNode, createEdge, insertEdge,
  removeNode, removeEdge, canRetargetEdge, retargetEdge, serializeDesign,
  findEdgeBetween, markEdgeBidirectional
} from './design.js';
import { makeStorage } from './storage.js';
import {
  makeAiClient, makeProxyClient, PROVIDERS,
  makeGuardedClient, createSizeGuard, isApiKeyRequired
} from './client.js';
import { renderPalette } from './palette.js';
import { createCanvas } from './canvas.js';
import {
  renderFeedback, renderFeedbackError, evaluateDesign,
  reviewNodes, renderNodeReview, renderNodeReviewPrompt,
  buildEvaluationPrompt, buildNodeReviewPrompt, parseFeedback, parseNodeReviews
} from './feedback.js';
import { createTimer, formatTime } from './timer.js';
import { escapeHtml } from './util.js';

const storage = makeStorage();
const getEl = id => document.getElementById(id);


let proxyProviders = null;

async function detectProxyProviders() {
  try {
    const res = await fetch('/api/providers');
    if (!res.ok) return null;
    const data = await res.json();
    const providers = data && data.providers;
    return providers && Object.keys(providers).length ? providers : null;
  } catch {
    return null;
  }
}

function getAvailableProviders() {
  return proxyProviders || PROVIDERS;
}

function createGuardedAiClient(config) {
  return makeGuardedClient(createTransportClient(config), [createSizeGuard()]);
}

function createTransportClient(config) {
  if (config.transport === 'proxy') {
    return makeProxyClient({ provider: config.provider, model: config.model });
  }
  return makeAiClient({
    provider: config.provider,
    model: config.model,
    apiKey: config.apiKey,
    baseUrl: config.baseUrl
  });
}

let activeChallenge = null;

const PRESET_MINUTES = { Easy: 15, Medium: 30, Hard: 45 };
let interviewMode = false;
let timer = null;

function renderTimerDisplay(remainingSeconds) {
  const display = getEl('timer-display');
  display.textContent = `⏱ ${formatTime(remainingSeconds)}`;
  display.classList.toggle('expired', remainingSeconds <= 0);
}

function showTimeUpBanner() {
  getEl('timeup-banner').classList.remove('hidden');
}

function openTimerEditor() {
  const wrap = getEl('timer-wrap');
  if (wrap.querySelector('.timer-edit')) return;
  const display = getEl('timer-display');
  const currentMinutes = Math.max(1, Math.round(timer.getRemaining() / 60));
  const input = document.createElement('input');
  input.type = 'number';
  input.min = '1';
  input.max = '180';
  input.className = 'timer-edit';
  input.value = String(currentMinutes);
  display.classList.add('hidden');
  wrap.appendChild(input);
  input.focus();
  input.select();

  let closed = false;
  function close() {
    if (closed) return;
    closed = true;
    display.classList.remove('hidden');
    input.remove();
  }
  function apply() {
    if (closed) return;
    const minutes = Math.max(1, Math.min(180, parseInt(input.value, 10) || currentMinutes));
    timer.setRemaining(minutes * 60);
    getEl('timeup-banner').classList.add('hidden');
    close();
  }
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') apply();
    else if (e.key === 'Escape') close();
  });
  input.addEventListener('blur', apply);
}

function resetInterviewTimer() {
  if (timer) timer.stop();
  getEl('timer-wrap').classList.add('hidden');
  getEl('timeup-banner').classList.add('hidden');
  getEl('timer-display').classList.remove('expired');
}

function showPicker() {
  getEl('playground-screen').classList.add('hidden');
  getEl('picker-screen').classList.remove('hidden');
}
function showPlayground() {
  getEl('picker-screen').classList.add('hidden');
  getEl('playground-screen').classList.remove('hidden');
}

function renderPicker() {
  const filterBar = getEl('filter-bar');
  const grid = getEl('question-grid');
  const platforms = ['All', 'AWS', 'Azure', 'GCP', 'Agnostic'];
  let activePlatform = 'All';

  function drawQuestionCards() {
    grid.innerHTML = '';
    QUESTIONS.filter(q => activePlatform === 'All' || q.platform === activePlatform).forEach(question => {
      const card = document.createElement('div');
      card.className = 'q-card';
      card.innerHTML =
        `<h3>${escapeHtml(question.title)}</h3>` +
        `<div class="q-tags"><span class="tag">${escapeHtml(question.platform)}</span><span class="tag">${escapeHtml(question.difficulty)}</span></div>`;
      card.addEventListener('click', () => openChallenge(question));
      grid.appendChild(card);
    });
  }

  filterBar.innerHTML = '';
  platforms.forEach(platform => {
    const button = document.createElement('button');
    button.className = 'btn' + (platform === activePlatform ? ' btn-primary' : '');
    button.textContent = platform;
    button.addEventListener('click', () => {
      activePlatform = platform;
      [...filterBar.children].forEach(child => child.classList.toggle('btn-primary', child.textContent === platform));
      drawQuestionCards();
    });
    filterBar.appendChild(button);
  });
  drawQuestionCards();
}

const FEEDBACK_EMPTY_HTML =
  '<p class="feedback-empty">Click <strong>Evaluate</strong> to get feedback on your design.</p>' +
  '<p class="feedback-note">Evaluate and Deep Review send your design (labels, descriptions, ' +
  'connections) to the selected AI provider, under that provider\'s terms. ' +
  'Don\'t sketch confidential systems. ' +
  '<button type="button" class="btn-link" id="preview-request-btn">Preview the exact request</button></p>';

function clearFeedback() {
  getEl('feedback-panel').innerHTML = FEEDBACK_EMPTY_HTML;
}

function handleDesignChange() {
  if (activeChallenge && activeChallenge.reviews) {
    activeChallenge.reviews = null;
    activeChallenge.canvas.clearReviews();
  }
  clearFeedback();
}

function showNodeReview(nodeId) {
  if (!activeChallenge || !activeChallenge.reviews) return;
  const review = activeChallenge.reviews[nodeId];
  if (!review) return;
  const node = activeChallenge.design.nodes.find(n => n.id === nodeId);
  activeChallenge.canvas.setSelected(nodeId);
  renderNodeReview(getEl('feedback-panel'), node ? node.label : nodeId, review);
}

function openChallenge(question) {
  if (activeChallenge && activeChallenge.canvas && activeChallenge.canvas.destroy) {
    activeChallenge.canvas.destroy();
  }
  const savedDesign = storage.loadDesign(question.id);
  const design = savedDesign || createDesign(question.id);
  getEl('challenge-title').textContent = question.title;

  const reqsPanel = getEl('reqs-panel');
  reqsPanel.innerHTML = `<strong>${escapeHtml(question.prompt)}</strong><ul>` +
    question.requirements.map(req => `<li>${escapeHtml(req)}</li>`).join('') + '</ul>';
  reqsPanel.classList.add('hidden');

  renderPalette({
    root: getEl('palette'),
    components: COMPONENTS,
    onDragStartComponent: (component, dataTransfer) => {
      dataTransfer.setData('application/json', JSON.stringify(component));
    },
    onDropComponent: (component, clientX, clientY) => {
      if (activeChallenge) activeChallenge.canvas.dropComponentAt(component, clientX, clientY);
    }
  });

  const canvas = createCanvas({
    canvasEl: getEl('canvas'),
    edgeSvg: getEl('edge-layer'),
    design,
    deps: { createNode, insertNode, createEdge, insertEdge, removeNode, removeEdge, canRetargetEdge, retargetEdge, findEdgeBetween, markEdgeBidirectional },
    onChange: handleDesignChange,
    onSelectNode: showNodeReview
  });
  canvas.render();
  clearFeedback();

  resetInterviewTimer();
  if (interviewMode) {
    const minutes = PRESET_MINUTES[question.difficulty] || 30;
    getEl('timer-wrap').classList.remove('hidden');
    timer.start(minutes * 60);
  }

  activeChallenge = { question, design, canvas, reviews: null };
  showPlayground();
}

let settingsResolve = null;
let activeSettingsTab = 'cloud';

function fillProviderOptions(select, providers, selectedProvider) {
  select.innerHTML = '';
  for (const [id, providerInfo] of Object.entries(providers)) {
    const option = document.createElement('option');
    option.value = id;
    option.textContent = providerInfo.label;
    select.appendChild(option);
  }
  select.value = selectedProvider;
}

function fillModelOptions(select, models, selectedModel) {
  const options = selectedModel && !models.includes(selectedModel) ? [selectedModel, ...models] : models;
  select.innerHTML = '';
  for (const model of options) {
    const option = document.createElement('option');
    option.value = model;
    option.textContent = model;
    select.appendChild(option);
  }
  if (selectedModel) select.value = selectedModel;
}

function pickModel(info, storedModel) {
  const keepStored = storedModel && (info.models.includes(storedModel) || info.allowsCustomModels);
  return keepStored ? storedModel : info.models[0];
}

function resolveModelForProvider(provider, storedModel) {
  return pickModel(getAvailableProviders()[provider], storedModel);
}

async function fetchInstalledOllamaModels(baseUrl) {
  try {
    const res = await fetch(`${baseUrl.replace(/\/+$/, '')}/api/tags`);
    if (!res.ok) return null;
    const data = await res.json();
    const names = (data.models || []).map(model => model.name).filter(Boolean);
    return names.length ? names : null;
  } catch {
    return null;
  }
}

function refreshOllamaModelOptions() {
  const baseUrl = getEl('selfhosted-baseurl-input').value.trim()
    || storage.getBaseUrl('ollama')
    || 'http://localhost:11434';
  fetchInstalledOllamaModels(baseUrl).then(models => {
    if (!models || getEl('selfhosted-provider-select').value !== 'ollama') return;
    fillModelOptions(getEl('selfhosted-model-select'), models, getEl('selfhosted-model-select').value);
  });
}

function hostingOf(info) {
  return info.hosting || (info.requiresApiKey === false ? 'self-hosted' : 'cloud');
}

function providersByHosting(hosting) {
  const available = getAvailableProviders();
  return Object.fromEntries(Object.entries(available).filter(([, info]) => hostingOf(info) === hosting));
}

function firstProvider(providers, storedProvider) {
  return providers[storedProvider] ? storedProvider : Object.keys(providers)[0];
}

function fillKeyField(input, provider) {
  const info = PROVIDERS[provider];
  input.value = storage.getApiKey(provider) || '';
  input.placeholder = info ? info.keyPlaceholder : '';
}

function resolveSelectableProvider() {
  const available = getAvailableProviders();
  const stored = storage.getProvider();
  return available[stored] ? stored : Object.keys(available)[0];
}

function populateCloudTab() {
  const providers = providersByHosting('cloud');
  const ids = Object.keys(providers);
  getEl('cloud-empty').classList.toggle('hidden', ids.length > 0);
  getEl('cloud-fields').classList.toggle('hidden', ids.length === 0);
  if (!ids.length) return;
  const provider = firstProvider(providers, storage.getProvider());
  fillProviderOptions(getEl('cloud-provider-select'), providers, provider);
  fillModelOptions(getEl('cloud-model-select'), providers[provider].models, pickModel(providers[provider], storage.getModel()));
  fillKeyField(getEl('cloud-key-input'), provider);
}

function populateSelfHostedTab() {
  const providers = providersByHosting('self-hosted');
  const ids = Object.keys(providers);
  getEl('selfhosted-empty').classList.toggle('hidden', ids.length > 0);
  getEl('selfhosted-fields').classList.toggle('hidden', ids.length === 0);
  if (!ids.length) return;
  const provider = firstProvider(providers, storage.getProvider());
  fillProviderOptions(getEl('selfhosted-provider-select'), providers, provider);
  fillSelfHostedModel(provider, providers[provider]);
  fillKeyField(getEl('selfhosted-key-input'), provider);
  getEl('selfhosted-baseurl-input').value = storage.getBaseUrl(provider) || '';
  applySelfHostedProviderFields();
  if (provider === 'ollama' && !proxyProviders) refreshOllamaModelOptions();
}

function fillSelfHostedModel(provider, info) {
  if (provider === 'custom') {
    getEl('selfhosted-model-input').value = storage.getModel() || '';
    return;
  }
  fillModelOptions(getEl('selfhosted-model-select'), info.models, pickModel(info, storage.getModel()));
}

function applySelfHostedProviderFields() {
  const custom = getEl('selfhosted-provider-select').value === 'custom';
  getEl('selfhosted-model-select-row').classList.toggle('hidden', custom);
  getEl('selfhosted-model-input-row').classList.toggle('hidden', !custom);
  getEl('selfhosted-credentials').classList.toggle('hidden', !custom || Boolean(proxyProviders));
}

function applyProxyVisibility() {
  const proxy = Boolean(proxyProviders);
  getEl('cloud-credentials').classList.toggle('hidden', proxy);
  getEl('proxy-note').classList.toggle('hidden', !proxy);
}

function defaultSettingsTab() {
  const info = getAvailableProviders()[storage.getProvider()];
  return info && hostingOf(info) === 'self-hosted' ? 'selfhosted' : 'cloud';
}

function switchSettingsTab(tab) {
  activeSettingsTab = tab;
  const cloud = tab === 'cloud';
  getEl('tab-cloud').classList.toggle('active', cloud);
  getEl('tab-selfhosted').classList.toggle('active', !cloud);
  getEl('panel-cloud').classList.toggle('hidden', !cloud);
  getEl('panel-selfhosted').classList.toggle('hidden', cloud);
  getEl('settings-error').classList.add('hidden');
}

function openSettings() {
  populateCloudTab();
  populateSelfHostedTab();
  applyProxyVisibility();
  switchSettingsTab(defaultSettingsTab());
  getEl('settings-modal').classList.remove('hidden');
}

function closeSettings(result) {
  getEl('settings-modal').classList.add('hidden');
  if (settingsResolve) { settingsResolve(result); settingsResolve = null; }
}

function handleCloudProviderChange() {
  const providers = providersByHosting('cloud');
  const provider = getEl('cloud-provider-select').value;
  fillModelOptions(getEl('cloud-model-select'), providers[provider].models, null);
  fillKeyField(getEl('cloud-key-input'), provider);
}

function handleSelfHostedProviderChange() {
  const providers = providersByHosting('self-hosted');
  const provider = getEl('selfhosted-provider-select').value;
  if (provider === 'custom') {
    getEl('selfhosted-model-input').value = '';
  } else {
    fillModelOptions(getEl('selfhosted-model-select'), providers[provider].models, null);
  }
  fillKeyField(getEl('selfhosted-key-input'), provider);
  getEl('selfhosted-baseurl-input').value = storage.getBaseUrl(provider) || '';
  applySelfHostedProviderFields();
}

function showSettingsError(message) {
  const errorEl = getEl('settings-error');
  errorEl.textContent = message;
  errorEl.classList.remove('hidden');
}

function saveSettings() {
  if (activeSettingsTab === 'cloud') { saveCloudSettings(); return; }
  saveSelfHostedSettings();
}

function saveCloudSettings() {
  const provider = getEl('cloud-provider-select').value;
  if (!provider) {
    showSettingsError('No cloud models are available in this deployment.');
    return;
  }
  const model = getEl('cloud-model-select').value;
  storage.setProvider(provider);
  storage.setModel(model);
  if (proxyProviders) {
    closeSettings({ transport: 'proxy', provider, model });
    return;
  }
  const apiKey = getEl('cloud-key-input').value.trim();
  if (!apiKey && isApiKeyRequired({ provider })) {
    showSettingsError('Enter an API key for the selected provider.');
    return;
  }
  storage.setSessionApiKey(provider, apiKey);
  storage.setBaseUrl(provider, '');
  closeSettings({ transport: 'direct', provider, model, apiKey: apiKey || undefined });
}

function saveSelfHostedSettings() {
  const provider = getEl('selfhosted-provider-select').value;
  if (!provider) {
    showSettingsError('No self-hosted models are available in this deployment.');
    return;
  }
  const custom = provider === 'custom';
  const model = custom ? getEl('selfhosted-model-input').value.trim() : getEl('selfhosted-model-select').value;
  if (!model) {
    showSettingsError('Enter a model name.');
    return;
  }
  storage.setProvider(provider);
  storage.setModel(model);
  if (proxyProviders) {
    closeSettings({ transport: 'proxy', provider, model });
    return;
  }
  if (!custom) {
    storage.setSessionApiKey(provider, '');
    storage.setBaseUrl(provider, '');
    closeSettings({ transport: 'direct', provider, model });
    return;
  }
  const apiKey = getEl('selfhosted-key-input').value.trim();
  const baseUrl = getEl('selfhosted-baseurl-input').value.trim();
  if (!baseUrl) {
    showSettingsError('Enter the gateway base URL.');
    return;
  }
  if (!/^https?:\/\//.test(baseUrl)) {
    showSettingsError('The gateway base URL must start with https:// (or http:// for local gateways).');
    return;
  }
  storage.setSessionApiKey(provider, apiKey);
  storage.setBaseUrl(provider, baseUrl);
  closeSettings({ transport: 'direct', provider, model, apiKey: apiKey || undefined, baseUrl });
}

function readStoredProviderConfig() {
  const provider = resolveSelectableProvider();
  const model = resolveModelForProvider(provider, storage.getModel());
  if (proxyProviders) return { transport: 'proxy', provider, model };
  const apiKey = storage.getApiKey(provider);
  const baseUrl = storage.getBaseUrl(provider) || undefined;
  if (!apiKey && isApiKeyRequired({ provider, baseUrl })) return null;
  return { transport: 'direct', provider, model, apiKey: apiKey || undefined, baseUrl };
}

function requestProviderConfig() {
  return new Promise(resolve => {
    settingsResolve = resolve;
    openSettings();
  });
}

function readPreviewConfig() {
  const config = readStoredProviderConfig();
  if (config) return config;
  const provider = resolveSelectableProvider();
  return { transport: 'direct', provider, model: resolveModelForProvider(provider, storage.getModel()) };
}

function describeRequestDestination(config) {
  const label = getAvailableProviders()[config.provider].label;
  if (config.transport === 'proxy') {
    return `Sent to this site's server, which forwards it to ${label} (${config.model}). Your browser holds no API key.`;
  }
  if (config.baseUrl) {
    return `Sent from your browser to your configured gateway at ${config.baseUrl} (${label}, ${config.model}).`;
  }
  return `Sent directly from your browser to ${label} (${config.model}). No other destination receives it.`;
}

function formatPromptForPreview({ system, user }) {
  return `[system]\n${system}\n\n[user]\n${user}`;
}

function buildPreviewPayloadJson({ config, question, serializedDesign }) {
  return {
    provider: config.provider,
    model: config.model,
    question: question.id,
    requirements: question.requirements,
    design: serializedDesign,
    prompts: {
      evaluate: buildEvaluationPrompt(question, serializedDesign),
      deepReview: buildNodeReviewPrompt(question, serializedDesign)
    }
  };
}

function openRequestPreview() {
  if (!activeChallenge) return;
  const config = readPreviewConfig();
  const question = activeChallenge.question;
  const serializedDesign = serializeDesign(activeChallenge.design);
  getEl('preview-destination').textContent = describeRequestDestination(config);
  getEl('preview-evaluate').textContent =
    formatPromptForPreview(buildEvaluationPrompt(question, serializedDesign));
  getEl('preview-deep').textContent =
    formatPromptForPreview(buildNodeReviewPrompt(question, serializedDesign));
  getEl('preview-json').textContent =
    JSON.stringify(buildPreviewPayloadJson({ config, question, serializedDesign }), null, 2);
  getEl('preview-modal').classList.remove('hidden');
}

function closeRequestPreview() {
  getEl('preview-modal').classList.add('hidden');
}

const RATING_RANK = { problem: 0, warning: 1, good: 2 };

function findWorstNodeId(reviews) {
  let worstId = null, worstRank = 99;
  for (const [id, review] of Object.entries(reviews)) {
    const rank = RATING_RANK[review.rating] ?? 1;
    if (rank < worstRank) { worstRank = rank; worstId = id; }
  }
  return worstId;
}

function applyNodeReviews(reviews) {
  if (!activeChallenge) return;
  activeChallenge.reviews = reviews;
  activeChallenge.canvas.setNodeReviews(reviews);
  const worstId = findWorstNodeId(reviews);
  if (worstId) showNodeReview(worstId);
  else renderNodeReviewPrompt(getEl('feedback-panel'));
}

const AI_REVIEW_MODES = {
  evaluate: {
    buttonId: 'evaluate-btn',
    busyLabel: 'Evaluating…',
    emptyCanvasMessage: 'Add some components to the canvas first, then evaluate.',
    failureMessage: 'Evaluation failed. Check your API key and try again.',
    requestReview: evaluateDesign,
    applyResult: feedback => renderFeedback(getEl('feedback-panel'), feedback)
  },
  'deep-review': {
    buttonId: 'deep-review-btn',
    busyLabel: 'Reviewing…',
    emptyCanvasMessage: 'Add some components to the canvas first, then run a deep review.',
    failureMessage: 'Deep review failed. Check your API key and try again.',
    requestReview: reviewNodes,
    applyResult: applyNodeReviews
  }
};

async function runAiReview(modeKey) {
  if (!activeChallenge) return;
  const mode = AI_REVIEW_MODES[modeKey];
  const panel = getEl('feedback-panel');
  if (!activeChallenge.design.nodes.length) {
    renderFeedbackError(panel, mode.emptyCanvasMessage);
    return;
  }
  const config = readStoredProviderConfig() || await requestProviderConfig();
  if (!config) return;

  const button = getEl(mode.buttonId);
  button.disabled = true;
  const originalLabel = button.textContent;
  button.innerHTML = `<span class="spinner"></span> ${mode.busyLabel}`;

  try {
    const aiClient = createGuardedAiClient(config);
    const serializedDesign = serializeDesign(activeChallenge.design);
    const result = await mode.requestReview({
      question: activeChallenge.question,
      serializedDesign,
      aiClient
    });
    mode.applyResult(result);
  } catch (err) {
    renderFeedbackError(panel, err.message || mode.failureMessage);
  } finally {
    button.disabled = false;
    button.textContent = originalLabel;
  }
}

function openTestModal() {
  if (!activeChallenge) return;
  getEl('test-error').classList.add('hidden');
  getEl('test-modal').classList.remove('hidden');
  getEl('test-input').focus();
}
function closeTestModal() { getEl('test-modal').classList.add('hidden'); }

function renderManualResult(modeKey) {
  if (!activeChallenge) return;
  const text = getEl('test-input').value;
  try {
    if (modeKey === 'evaluate') {
      renderFeedback(getEl('feedback-panel'), parseFeedback(text));
    } else {
      applyNodeReviews(parseNodeReviews(text));
    }
    closeTestModal();
  } catch (err) {
    const errorEl = getEl('test-error');
    errorEl.textContent = err.message || 'Could not parse the input.';
    errorEl.classList.remove('hidden');
  }
}

function init() {
  renderPicker();
  detectProxyProviders().then(providers => { proxyProviders = providers; });

  timer = createTimer({ onTick: renderTimerDisplay, onExpire: showTimeUpBanner });
  getEl('interview-toggle').addEventListener('change', e => {
    interviewMode = e.target.checked;
  });
  getEl('timer-display').addEventListener('click', openTimerEditor);
  getEl('timeup-dismiss').addEventListener('click', () => getEl('timeup-banner').classList.add('hidden'));

  getEl('settings-btn').addEventListener('click', openSettings);
  getEl('tab-cloud').addEventListener('click', () => switchSettingsTab('cloud'));
  getEl('tab-selfhosted').addEventListener('click', () => switchSettingsTab('selfhosted'));
  getEl('cloud-provider-select').addEventListener('change', handleCloudProviderChange);
  getEl('selfhosted-provider-select').addEventListener('change', handleSelfHostedProviderChange);
  getEl('selfhosted-baseurl-input').addEventListener('change', () => {
    if (getEl('selfhosted-provider-select').value === 'ollama') refreshOllamaModelOptions();
  });
  getEl('settings-save').addEventListener('click', saveSettings);
  getEl('settings-cancel').addEventListener('click', () => closeSettings(null));

  getEl('preview-close').addEventListener('click', closeRequestPreview);

  getEl('feedback-panel').addEventListener('click', e => {
    if (e.target && e.target.id === 'preview-request-btn') openRequestPreview();
  });

  getEl('test-input-btn').addEventListener('click', openTestModal);
  getEl('test-cancel').addEventListener('click', closeTestModal);
  getEl('test-render-eval').addEventListener('click', () => renderManualResult('evaluate'));
  getEl('test-render-deep').addEventListener('click', () => renderManualResult('deep-review'));

  getEl('back-btn').addEventListener('click', () => { resetInterviewTimer(); showPicker(); });
  getEl('reqs-btn').addEventListener('click', () => getEl('reqs-panel').classList.toggle('hidden'));
  getEl('save-btn').addEventListener('click', () => {
    if (!activeChallenge) return;
    storage.saveDesign(activeChallenge.design);
    getEl('save-btn').textContent = 'Saved ✓';
    setTimeout(() => getEl('save-btn').textContent = 'Save', 1200);
  });
  getEl('evaluate-btn').addEventListener('click', () => runAiReview('evaluate'));
  getEl('deep-review-btn').addEventListener('click', () => runAiReview('deep-review'));
  showPicker();
}

init();

if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(err => {
      console.warn('[System Design Playground] Service worker registration failed:', err);
    });
  });
}
