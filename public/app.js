import { DECISIONS, EXAMPLES, MAX_IDEA, draftPlan, scopeFor } from './plan.js';
import { makeDemo } from './demo.js';

const byId = id => document.getElementById(id);
const ideaInput = byId('idea');
const form = byId('idea-form');
const start = byId('start');
const chapters = ['brief', 'blueprint', 'scope', 'build'];
const rail = Array.from(document.querySelectorAll('[data-jump]'));
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const sessionKey = 'scrollworks.active-build';
const view = byId('blueprint-model');
const icons = {
  grid: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M7 3v4m10-4v4"/>',
  message: '<path d="M20 15a3 3 0 0 1-3 3H9l-5 3V7a3 3 0 0 1 3-3h10a3 3 0 0 1 3 3zM8 9h8m-8 4h5"/>',
  spark: '<path d="m12 2 2.5 7.5L22 12l-7.5 2.5L12 22l-2.5-7.5L2 12l7.5-2.5z"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m4 7 8 6 8-6"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.6 2.6 0 1 1 3.4 2.5c-.7.4-.9.8-.9 1.5m0 3v.1"/>',
  search: '<circle cx="10.5" cy="10.5" r="5.5"/><path d="m15 15 5 5"/>',
  heart: '<path d="m12 20-8-8c-5-5 3-11 8-5 5-6 13 0 8 5z"/>',
  check: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="m7 12 3 3 7-7"/>',
  chart: '<path d="M4 4v16h16M8 15l4-5 3 2 5-7"/>',
};

const guide = [
  ['Read the brief', 'Start with what the site should do and who will use it. In live mode, Scrollworks starts a dedicated Hermes sandbox on Agent37 and asks it to turn that brief into a short plan.'],
  ['Sketch the structure', 'The plan names the main screens and suggests a layout. The Three.js blueprint uses that layout to show the page frame, then fills in its content and details as you scroll.'],
  ['Set the scope', 'Keep goes into the first build. Later keeps a feature in your plan for a future pass. Never tells the builder to leave it out. Unsorted cards go to Later.'],
  ['Build and check', 'Hermes writes the approved site in its sandbox. Scrollworks checks that the preview loads before it offers a link. In demo mode, your browser assembles a downloadable HTML prototype.'],
];

const benchGuide = [
  ['From brief to files', 'A live build sends your original idea and all three feature groups to Hermes. The agent writes the HTML, styles, and interactions in its own sandbox. Demo builds assemble an HTML page using the selected features.'],
  ['What the builder checks', 'Scrollworks checks that a live build has an index page and that the sandbox can serve it over HTTPS. You can then open the preview and try the interactions yourself.'],
  ['Preview and sharing', 'Live previews use a short-lived Agent37 link. Publishing opens the generated site to anyone with its link. Demo builds can be opened here or downloaded as a single HTML file.'],
];

let liveAvailable = false;
let job;
let blueprint;
let wireframe;
let demoFile = '';
let scrollQueued = false;
let operation = false;

function element(tag, className, content) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (content !== undefined) node.textContent = content;
  return node;
}

function button(label, className, onClick) {
  const control = element('button', className, label);
  control.type = 'button';
  control.addEventListener('click', onClick);
  return control;
}

function visit(id) {
  const target = byId(id);
  if (target.hidden) return;
  const focus = id === 'brief' ? ideaInput : target.querySelector('h2');
  focus?.focus({ preventScroll: true });
  target.scrollIntoView({ behavior: reducedMotion.matches ? 'instant' : 'smooth', block: 'start' });
}

function updateMode() {
  const live = job ? job.live : liveAvailable;
  byId('mode').classList.toggle('live', live);
  byId('mode').lastElementChild.textContent = live ? 'AGENT37 MODE' : 'DEMO MODE';
  byId('footer-mode').textContent = live ? 'POWERED BY AGENT37' : 'INTERACTIVE DEMO';
}

function updateScroll() {
  scrollQueued = false;
  let active = 'brief';
  const threshold = window.innerHeight * .45;
  for (const id of chapters.slice(1)) {
    const section = byId(id);
    if (!section.hidden && section.getBoundingClientRect().top < threshold) active = id;
  }
  const atEnd = window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 2;
  if (atEnd && !byId('build').hidden) active = 'build';
  for (const tab of rail) {
    if (tab.dataset.jump === active) tab.setAttribute('aria-current', 'step');
    else tab.removeAttribute('aria-current');
  }
  if (!job) return;
  const rect = byId('blueprint').getBoundingClientRect();
  const modelRect = view.getBoundingClientRect();
  const narrow = matchMedia('(max-width: 790px)').matches;
  const raw = narrow ? (window.innerHeight * .66 - modelRect.top) / (window.innerHeight * .59)
    : (173 - rect.top) / (rect.height * .52 + 55);
  const progress = Math.max(0, Math.min(raw, 1));
  const stage = Math.min(2, Math.floor(progress * 3));
  view.dataset.fill = String(stage);
  for (const marker of byId('fill-steps').children) {
    const current = Number(marker.dataset.layer) === stage;
    marker.classList.toggle('is-active', current);
    if (current) marker.setAttribute('aria-current', 'step');
    else marker.removeAttribute('aria-current');
  }
  blueprint?.setProgress(reducedMotion.matches ? stage / 2 : progress);
}

function queueScroll() {
  if (!scrollQueued) {
    scrollQueued = true;
    requestAnimationFrame(updateScroll);
  }
}

function save() {
  try {
    if (job) sessionStorage.setItem(sessionKey, JSON.stringify(job));
    else sessionStorage.removeItem(sessionKey);
  } catch {
    // The builder still works when the browser disables storage.
  }
}

function record(message) {
  if (!message || job.log.at(-1)?.message === message) return;
  job.log.push({ time: Date.now(), message });
  if (job.log.length > 7) job.log.shift();
  save();
  renderLog();
}

function renderLog() {
  const items = job.log.map(({ time, message }) => {
    const item = element('li');
    const date = new Date(time);
    const clock = element('time', '', date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
    clock.dateTime = date.toISOString();
    item.append(clock, element('span', '', message));
    return item;
  });
  byId('activity').replaceChildren(...items);
}

function updatePlan() {
  byId('surfaces').replaceChildren(...job.plan.surfaces.map(surface => element('span', '', surface)));
  byId('model-name').textContent = job.plan.title.toUpperCase();
  if (!blueprint && wireframe) blueprint = wireframe.mountWireframe(view, job.plan.layout, 0);
  blueprint?.setLayout(job.plan.layout);
  renderCards();
  queueScroll();
}

function renderCards() {
  const cards = job.plan.features.map(feature => {
    const card = element('article', 'feature-card');
    card.dataset.feature = feature.id;
    const copy = element('div', 'feature-copy');
    const icon = element('span', 'feature-icon');
    icon.setAttribute('aria-hidden', 'true');
    icon.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">' + (icons[feature.icon] || icons.spark) + '</svg>';
    const description = element('div');
    const title = element('h3', '', feature.title);
    title.id = 'title-' + feature.id;
    description.append(title, element('p', '', feature.detail));
    copy.append(icon, description);
    const choices = element('div', 'choices');
    choices.setAttribute('role', 'group');
    choices.setAttribute('aria-labelledby', title.id);
    for (const choice of DECISIONS) {
      const control = button(choice[0].toUpperCase() + choice.slice(1), '', () => {
        if (job.choices[feature.id] === choice) delete job.choices[feature.id];
        else job.choices[feature.id] = choice;
        save();
        updateScope();
      });
      control.dataset.choice = choice;
      choices.append(control);
    }
    card.append(copy, choices);
    return card;
  });
  byId('feature-grid').replaceChildren(...cards);
  updateScope();
}

function updateScope() {
  const counts = { keep: 0, later: 0, never: 0, undecided: 0 };
  for (const card of byId('feature-grid').children) {
    const choice = job.choices[card.dataset.feature] || 'undecided';
    counts[choice]++;
    card.dataset.choice = choice;
    for (const control of card.querySelectorAll('button')) {
      control.setAttribute('aria-pressed', String(control.dataset.choice === choice));
      control.disabled = job.stage !== 'scoping';
    }
  }
  byId('scope-counts').replaceChildren(...Object.entries(counts).map(([key, count]) => {
    const item = element('span', '', key[0].toUpperCase() + key.slice(1) + ' ' + count);
    item.dataset.scope = key;
    return item;
  }));
  byId('compile').disabled = job.stage !== 'scoping';
  byId('restart').hidden = job.stage !== 'scoping';
  byId('restart').textContent = job.id ? 'Delete sandbox' : 'New brief';
}

function render() {
  const active = Boolean(job);
  const reviewed = active && (job.stage === 'building' || job.stage === 'ready' || job.failedAt === 'build');
  document.body.toggleAttribute('data-build-active', active);
  byId('blueprint').hidden = !active;
  byId('scope').hidden = !active;
  byId('build').hidden = !reviewed;
  byId('how').hidden = active;
  rail[1].disabled = !active;
  rail[2].disabled = !active;
  rail[3].disabled = !reviewed;
  ideaInput.readOnly = active;
  for (const example of byId('examples').children) example.disabled = active;
  start.disabled = operation;
  start.firstChild.textContent = active ? 'Continue build ' : 'Start building ';
  updateMode();
  queueScroll();
  if (!active) return;

  const planning = job.stage === 'planning';
  const planFailed = job.stage === 'error' && !reviewed;
  byId('scope-wait').hidden = !(planning || planFailed);
  byId('feature-grid').hidden = planning || planFailed;
  byId('scope-footer').hidden = planning || planFailed;
  byId('scope-wait-text').textContent = planFailed ? job.error : 'Preparing your feature cards…';
  byId('scope-wait').querySelector('button')?.remove();
  if (planFailed) {
    byId('scope-wait').append(button(job.id ? 'Delete sandbox and restart' : 'Start again', 'text-button', discard));
  }
  byId('blueprint-note').textContent = planning
    ? 'The diagram starts with a draft layout while Agent37 prepares the build plan.'
    : job.live
      ? 'These screen names describe the proposed layout. Your feature choices set what goes into the first version.'
      : 'Your browser chose a demo layout from the brief. Review the suggested features to generate an HTML prototype.';
  updateScope();
  if (!reviewed) return;

  const ready = job.stage === 'ready';
  const failed = job.stage === 'error';
  byId('build-title').textContent = ready ? 'Your preview is ready.' : failed ? 'The build needs attention.' : 'Your site is taking shape.';
  byId('build-description').textContent = ready
    ? 'Open the first version and try it with your approved scope.'
    : 'The builder uses your approved scope to create and check the first version. The preview opens here as soon as it’s ready.';
  byId('build-state').textContent = ready ? 'READY' : failed ? 'PAUSED' : 'BUILDING';
  byId('build-state').dataset.status = job.stage;
  renderLog();
  renderResult();
}

function showFeedback(message = '') {
  byId('build-feedback').textContent = message;
  byId('build-feedback').hidden = !message;
}

function previewDemo() {
  byId('demo-frame').srcdoc = demoFile;
  byId('preview-dialog').showModal();
}

function downloadDemo() {
  const file = new Blob([demoFile], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(file);
  const link = document.createElement('a');
  link.href = url;
  link.download = (job.plan.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'scrollworks-site') + '.html';
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function renderResult() {
  const ready = job.stage === 'ready';
  const failed = job.stage === 'error';
  const panel = byId('result');
  panel.hidden = !(ready || failed);
  if (panel.hidden) return;

  const scope = scopeFor(job.plan, job.choices);
  const summary = scope.keep.length + ' kept · ' + scope.later.length + ' for later · ' + scope.never.length + ' left out';
  const actions = element('div', 'result-actions');
  panel.replaceChildren(element('h3', '', job.plan.title), element('p', '', failed ? job.error : summary), actions);
  if (ready && job.live) {
    const preview = element('a', 'button primary', 'Open private preview ↗');
    preview.href = '/api/builds/' + encodeURIComponent(job.id) + '/preview';
    preview.target = '_blank';
    preview.rel = 'noopener noreferrer';
    actions.append(preview);
    if (!job.publicUrl) actions.append(button('Publish public link', 'button quiet', publish));
    else {
      const link = element('a', 'result-link', job.publicUrl);
      link.href = job.publicUrl;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      panel.append(link);
    }
  } else if (ready) {
    demoFile = makeDemo(job.idea, job.plan, scope);
    actions.append(button('Open demo preview ↗', 'button primary', previewDemo), button('Download HTML', 'button quiet', downloadDemo));
  }

  if (failed && job.id) actions.append(button('Revise scope and retry', 'button quiet', retry));
  actions.append(button('New brief', 'button quiet', reset));
  if (job.id) panel.append(button('Delete sandbox', 'text-button danger', discard));
}

async function api(url, options) {
  const response = await fetch(url, options);
  if (response.ok) return response;
  const problem = await response.json().catch(() => ({}));
  const error = new Error(problem.error || 'The builder could not reach the server. Try again.');
  error.status = response.status;
  throw error;
}

const post = (url, data = {}) => api(url, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(data),
});

function buildPath(suffix = '') {
  return '/api/builds/' + encodeURIComponent(job.id) + suffix;
}

async function readEvents(response) {
  if (!response.body) throw new Error('The build connection ended before it sent a result.');
  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = '';
  let terminal = false;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += value;
      const lines = buffer.split('\n');
      buffer = lines.pop();
      for (const line of lines) {
        if (!line) continue;
        const event = JSON.parse(line);
        if (event.type === 'status') record(event.message);
        if (event.type === 'sandbox') {
          job.id = event.id;
          save();
        }
        if (event.type === 'plan') {
          job.stage = 'scoping';
          job.plan = event.plan;
          save();
          updatePlan();
          terminal = true;
        }
        if (event.type === 'ready') {
          job.stage = 'ready';
          save();
          terminal = true;
        }
        if (event.type === 'error') {
          const error = new Error(event.message);
          error.terminal = true;
          throw error;
        }
      }
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  if (!terminal) throw new Error('The build connection ended before it sent a result.');
}

function fail(error, stage) {
  job.stage = 'error';
  job.error = error.message;
  job.failedAt = stage;
  save();
  render();
}

const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

async function recover(phase) {
  const activeJob = job;
  const deadline = Date.now() + 12 * 60 * 1000;
  record('Reconnecting to the sandbox…');
  while (job === activeJob && Date.now() < deadline) {
    let state;
    try {
      state = await (await api(buildPath())).json();
    } catch (error) {
      if (error.status === 404 || error.status === 503 || error.status === 403) throw error;
    }
    if (job !== activeJob) return;
    if (state?.stage === 'error') throw new Error(state.error || 'The sandbox reported a build error.');
    if (state?.stage === 'scoping' || state?.stage === 'ready') {
      job.stage = state.stage;
      job.plan = state.plan;
      job.choices = state.choices || job.choices;
      job.publicUrl = state.publicUrl;
      delete job.failedAt;
      record(state.stage === 'ready' ? 'Preview verified.' : 'Build plan ready to review.');
      save();
      updatePlan();
      return;
    }
    await pause(4500);
  }
  if (job === activeJob) throw new Error(phase === 'plan' ? 'The sandbox is still preparing the plan.' : 'The sandbox is still building. Reopen this page to check again.');
}

async function finishOperation(action, phase) {
  operation = true;
  render();
  try {
    await action();
  } catch (error) {
    if (job.id && !error.terminal && (!error.status || (phase === 'build' && error.status === 409))) {
      try {
        await recover(phase);
      } catch (retryError) {
        fail(retryError, phase);
      }
    } else {
      fail(error, phase);
    }
  } finally {
    operation = false;
    render();
  }
}

async function begin(event) {
  event.preventDefault();
  if (job) {
    visit(job.stage === 'planning' ? 'blueprint' : byId('build').hidden ? 'scope' : 'build');
    return;
  }
  if (operation) return;
  const idea = ideaInput.value.trim();
  if (idea.length < 8) {
    ideaInput.setCustomValidity('Describe your idea in at least 8 characters.');
    ideaInput.reportValidity();
    return;
  }
  start.disabled = true;
  await configuration;
  job = { idea, live: liveAvailable, stage: liveAvailable ? 'planning' : 'scoping', plan: draftPlan(idea), choices: {}, log: [] };
  save();
  render();
  updatePlan();
  visit('blueprint');
  if (!job.live) return;
  await finishOperation(async () => {
    await readEvents(await post('/api/builds', { idea }));
  }, 'plan');
}

async function compile() {
  if (operation || job.stage !== 'scoping') return;
  for (const feature of job.plan.features) job.choices[feature.id] ??= 'later';
  job.stage = 'building';
  job.log = [];
  delete job.failedAt;
  save();
  showFeedback();
  render();
  visit('build');

  await finishOperation(async () => {
    if (job.live) {
      await readEvents(await post(buildPath('/compile'), { choices: job.choices }));
      return;
    }
    record('Applied your feature choices.');
    await pause(400);
    record('Assembling the demo page in your browser.');
    const html = makeDemo(job.idea, job.plan, scopeFor(job.plan, job.choices));
    await pause(520);
    const document = new DOMParser().parseFromString(html, 'text/html');
    if (!document.querySelector('main h1')) throw new Error('The demo preview could not be assembled.');
    record('Demo HTML is ready to open.');
    job.stage = 'ready';
    save();
  }, 'build');
}

function retry() {
  job.stage = 'scoping';
  delete job.error;
  delete job.failedAt;
  save();
  render();
  visit('scope');
}

async function publish(event) {
  const control = event.currentTarget;
  if (!confirm('Publish this website? Anyone with the link will be able to open it.')) return;
  const current = job;
  control.disabled = true;
  showFeedback('Creating a public link…');
  try {
    const { url } = await (await post(buildPath('/publish'))).json();
    if (job !== current) return;
    job.publicUrl = url;
    save();
    showFeedback('Public link created.');
    renderResult();
  } catch (error) {
    if (job !== current) return;
    showFeedback(error.message);
    control.disabled = false;
  }
}

async function discard(event) {
  if (job.id && !confirm('Delete this sandbox and its site? Its preview and public links will stop working.')) return;
  const current = job;
  const control = event.currentTarget;
  control.disabled = true;
  try {
    if (job.id) await api(buildPath(), { method: 'DELETE' });
    if (job === current) reset();
  } catch (error) {
    if (job !== current) return;
    if (!byId('build').hidden) showFeedback(error.message);
    else if (!byId('scope-wait').hidden) byId('scope-wait-text').textContent = error.message;
    else {
      byId('scope-feedback').textContent = error.message;
      byId('scope-feedback').hidden = false;
    }
    control.disabled = false;
  }
}

function reset() {
  if (operation) return;
  job = null;
  demoFile = '';
  ideaInput.value = '';
  updateInput();
  showFeedback();
  byId('scope-feedback').hidden = true;
  save();
  render();
  visit('brief');
}

function updateInput() {
  ideaInput.setCustomValidity('');
  byId('idea-count').textContent = ideaInput.value.length + ' / ' + MAX_IDEA;
}

async function restore() {
  let saved;
  try {
    saved = JSON.parse(sessionStorage.getItem(sessionKey));
  } catch {
    return;
  }
  if (!saved?.idea || !saved.plan?.features?.length) return;
  if (saved.live && !saved.id) return;
  job = saved;
  ideaInput.value = job.idea;
  updateInput();
  if (!job.live && job.stage === 'building') job.stage = 'scoping';
  render();
  updatePlan();
  if (job.live && (job.stage === 'building' || job.stage === 'planning')) {
    const phase = job.stage === 'planning' ? 'plan' : 'build';
    await finishOperation(async () => {
      try {
        await recover(phase);
      } catch (error) {
        error.terminal = true;
        throw error;
      }
    }, phase);
  }
}

function populateGuide(id) {
  byId(id).replaceChildren(...guide.map(([title, detail], index) => {
    const item = element('article', 'process-step');
    item.append(element('span', 'mono', '0' + (index + 1)), element('h3', '', title), element('p', '', detail));
    return item;
  }));
}

populateGuide('process-steps');
populateGuide('dialog-steps');
byId('build-notes').append(...benchGuide.map(([title, detail], index) => {
  const item = element('details');
  item.open = index === 0;
  item.append(element('summary', '', title), element('p', '', detail));
  return item;
}));
for (const example of EXAMPLES) {
  byId('examples').append(button(example.label, 'example', () => {
    ideaInput.value = example.idea;
    updateInput();
    ideaInput.focus();
  }));
}

const configuration = fetch('/api/config')
  .then(response => response.ok ? response.json() : {})
  .then(data => { liveAvailable = data.live === true; })
  .catch(() => {})
  .finally(updateMode);

byId('how-link').addEventListener('click', () => {
  if (job) byId('how-dialog').showModal();
  else visit('how');
});
byId('close-guide').addEventListener('click', () => byId('how-dialog').close());
byId('close-preview').addEventListener('click', () => byId('preview-dialog').close());
byId('preview-dialog').addEventListener('close', () => { byId('demo-frame').srcdoc = ''; });
byId('compile').addEventListener('click', compile);
byId('restart').addEventListener('click', discard);
ideaInput.addEventListener('input', updateInput);
form.addEventListener('submit', begin);
for (const control of document.querySelectorAll('[data-jump], [data-go]')) {
  control.addEventListener('click', () => visit(control.dataset.jump || control.dataset.go));
}
window.addEventListener('scroll', queueScroll, { passive: true });
window.addEventListener('resize', queueScroll);
import('./wireframe.js').then(module => {
  wireframe = module;
  wireframe.mountWireframe(byId('hero-model'), 'landing', 1);
  if (job) updatePlan();
}).catch(() => {});
restore();
