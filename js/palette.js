import { escapeHtml } from './util.js';

export function filterComponents(components, { platform, query }) {
  const normalizedQuery = (query || '').trim().toLowerCase();
  return components.filter(component => {
    const platformMatches = platform === 'All' || component.platform === platform;
    const queryMatches = !normalizedQuery ||
      component.type.toLowerCase().includes(normalizedQuery) ||
      component.description.toLowerCase().includes(normalizedQuery);
    return platformMatches && queryMatches;
  });
}

const PLATFORMS = ['All', 'AWS', 'Azure', 'GCP', 'Generic'];


function startTouchDrag({ component, item, event, onDropComponent }) {
  event.preventDefault();
  const ghost = document.createElement('div');
  ghost.className = 'palette-item palette-drag-ghost';
  ghost.innerHTML = item.innerHTML;
  ghost.style.left = event.clientX + 'px';
  ghost.style.top = event.clientY + 'px';
  document.body.appendChild(ghost);
  item.setPointerCapture(event.pointerId);

  function move(ev) {
    if (ev.pointerId !== event.pointerId) return;
    ghost.style.left = ev.clientX + 'px';
    ghost.style.top = ev.clientY + 'px';
  }
  function cleanup() {
    ghost.remove();
    item.removeEventListener('pointermove', move);
    item.removeEventListener('pointerup', up);
    item.removeEventListener('pointercancel', cancel);
  }
  function up(ev) {
    if (ev.pointerId !== event.pointerId) return;
    cleanup();
    if (onDropComponent) onDropComponent(component, ev.clientX, ev.clientY);
  }
  function cancel(ev) {
    if (ev.pointerId !== event.pointerId) return;
    cleanup();
  }
  item.addEventListener('pointermove', move);
  item.addEventListener('pointerup', up);
  item.addEventListener('pointercancel', cancel);
}

export function renderPalette({ root, components, onDragStartComponent, onDropComponent }) {
  let activePlatform = 'All';
  let query = '';

  root.innerHTML = '';
  const search = document.createElement('input');
  search.className = 'palette-search';
  search.placeholder = 'Search components…';
  search.setAttribute('aria-label', 'Search components');

  const tabs = document.createElement('div');
  tabs.className = 'palette-tabs';

  const list = document.createElement('div');
  list.className = 'palette-list';

  function renderList() {
    list.innerHTML = '';
    for (const component of filterComponents(components, { platform: activePlatform, query })) {
      const item = document.createElement('div');
      item.className = 'palette-item';
      item.draggable = true;
      item.innerHTML = `<span class="glyph">${escapeHtml(component.icon)}</span><span>${escapeHtml(component.type)}</span>`;
      item.title = `${component.platform} · ${component.description}`;
      item.addEventListener('dragstart', e => onDragStartComponent(component, e.dataTransfer));
      item.addEventListener('pointerdown', e => {
        if (e.pointerType === 'mouse') return;
        startTouchDrag({ component, item, event: e, onDropComponent });
      });
      list.appendChild(item);
    }
  }

  for (const platform of PLATFORMS) {
    const tab = document.createElement('button');
    tab.className = 'palette-tab' + (platform === activePlatform ? ' active' : '');
    tab.textContent = platform;
    tab.addEventListener('click', () => {
      activePlatform = platform;
      [...tabs.children].forEach(t => t.classList.toggle('active', t.textContent === platform));
      renderList();
    });
    tabs.appendChild(tab);
  }

  search.addEventListener('input', () => { query = search.value; renderList(); });

  root.append(search, tabs, list);
  renderList();
}
