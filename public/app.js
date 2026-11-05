import { DECISIONS, EXAMPLES, MAX_IDEA, draftPlan, scopeFor, screensFor } from './plan.js?v=inline';
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
  ['Sketch the structure', 'The plan names the main screens and suggests a layout. Scrolling brings the Three.js frame together and adds its content and details.'],
  ['Set the scope', 'Review one feature per step. Keep goes into this build, Later goes into the backlog, and Never leaves it out. Scrolling past the recap starts the build.'],
  ['Build and check', 'Hermes writes the site in its own sandbox. Each actual update adds a step to the page. When the preview passes its HTTPS check, the site appears inside the final frame.'],
];

const blueprintBeats = [
  ['Frame', 'Start with the shell.', 'The plan identifies the main screens. Their frames sit on separate layers so you can see how the application is laid out.'],
  ['Content', 'Give each screen a job.', 'Scroll the panels together and watch the main blocks fill in. A catalog, dashboard, and landing page each have a different structure.'],
  ['Detail', 'See the shape of the first release.', 'Controls and visual details complete the sketch. The next chapter lets you decide which features go into the actual build.'],
];

const buildNotes = [
  [/feature choices|Applied your/, 'The approved scope travels with your original idea. Hermes uses Keep for this release and leaves both Later and Never out of the generated files.'],
  [/building the site|Assembling/, 'The builder turns the scope into a working page. In live mode Hermes can edit and test files inside its dedicated sandbox while you stay here.'],
  [/running commands/, 'The sandbox has its own filesystem and tools. Hermes can inspect what it has made and test it before asking Scrollworks to verify the preview.'],
  [/writing site files/, 'Hermes creates the page, styles, and browser interactions together. The result is a static site the sandbox can serve on its private preview port.'],
  [/Checking the index/, 'Scrollworks checks for a real index page, starts its preview server, and verifies that the site responds over HTTPS.'],
  [/verified|ready to open/, 'The checked website loads inside an isolated frame. In live mode its files are read through Scrollworks while the sandbox stays private.'],
  [/Reconnecting/, 'The build state is saved on the Agent37 instance. Scrollworks can recover the current run after a connection interruption.'],
];

let liveAvailable = false;
let job;
let blueprint;
let wireframe;
let demoFile = '';
let loadedPreview = '';
let scrollQueued = false;
let operation = false;
let lastScrollY = window.scrollY;
let blueprintStep = -1;
let drawnProgress;
let plannedScreens = [];
let scopeStep = -1;
let scopeSeen = 0;
let scopeArmedAt = null;
let feedStep = -1;
let feedCount = -1;
let feedMessage = '';

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

function animateBeat(node) {
  if (reducedMotion.matches) return;
  node.getAnimations().forEach(animation => animation.cancel());
  node.animate(
    [{ opacity: .35, transform: 'translateY(14px)' }, { opacity: 1, transform: 'translateY(0)' }],
    { duration: 370, easing: 'cubic-bezier(.16, 1, .3, 1)' },
  );
}

function setTrack(id, beats) {
  const section = byId(id);
  if (section.dataset.beats === String(beats)) return;
  section.dataset.beats = String(beats);
  section.style.setProperty('--beats', beats);
}

function trackPosition(id, top) {
  const section = byId(id);
  const travel = section.clientHeight - section.firstElementChild.offsetHeight;
  return travel > 0 ? Math.max(0, (top - section.getBoundingClientRect().top) * Number(section.dataset.beats) / travel) : 0;
}

function updateBlueprint(position) {
  const index = Math.min(2, Math.floor(position + .1));
  if (index !== blueprintStep) {
    blueprintStep = index;
    const [name, title, copy] = blueprintBeats[index];
    const lead = plannedScreens[0];
    const count = '0' + (index + 1) + ' / 03';
    view.dataset.fill = String(index);
    byId('blueprint-view-step').textContent = count;
    byId('blueprint-index').textContent = count + ' · ' + name;
    byId('blueprint-beat-title').textContent = title;
    byId('blueprint-beat-copy').textContent = index === 1 && lead
      ? lead.name + ' takes shape with ' + lead.blocks.map(block => block.label).join(', ') + '. Scroll to see the details fill in.'
      : copy;
    byId('blueprint-cue').textContent = ['Scroll to add content', 'Scroll to finish the sketch', 'Scroll to review features'][index];
    for (const marker of byId('fill-steps').children) {
      const current = Number(marker.dataset.layer) === index;
      marker.classList.toggle('is-active', current);
      if (current) marker.setAttribute('aria-current', 'step');
      else marker.removeAttribute('aria-current');
    }
    animateBeat(byId('blueprint-beat'));
  }
  const progress = reducedMotion.matches ? index / 2 : Math.min(1, position / 2.6);
  if (blueprint && progress !== drawnProgress) {
    blueprint.setProgress(progress);
    drawnProgress = progress;
  }
}

function updateScroll() {
  scrollQueued = false;
  const y = window.scrollY;
  const moving = y !== lastScrollY;
  const movingDown = y > lastScrollY;
  lastScrollY = y;
  const top = document.querySelector('.masthead').offsetHeight + document.querySelector('.rail-wrap').offsetHeight;
  let active = 'brief';
  const threshold = Math.max(top + 24, window.innerHeight * .38);
  for (const id of chapters.slice(1)) {
    const section = byId(id);
    if (!section.hidden && section.getBoundingClientRect().top < threshold) active = id;
  }
  const atEnd = y + window.innerHeight >= document.documentElement.scrollHeight - 2;
  if (atEnd && !byId('build').hidden) active = 'build';
  for (const tab of rail) {
    if (tab.dataset.jump === active) tab.setAttribute('aria-current', 'step');
    else tab.removeAttribute('aria-current');
  }
  if (!job) return;
  updateBlueprint(trackPosition('blueprint', top));
  updateScopeBeat(trackPosition('scope', top), movingDown, y);
  if (!byId('build').hidden) updateFeed(trackPosition('build', top), moving);
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
  if (!message || job.log.some(entry => entry.message === message)) return;
  job.log.push({ time: Date.now(), message });
  save();
  if (job.stage === 'planning') updatePlanningCopy();
  else prepareFeed();
}

function updatePlanningCopy() {
  const status = job.log.at(-1)?.message || 'Agent37 is preparing your plan.';
  byId('blueprint-note').textContent = status;
  byId('scope-wait-text').textContent = status;
}

function feedEntries() {
  return job.failedAt === 'build' ? [...job.log, { message: job.error, error: true }] : job.log;
}

function prepareFeed() {
  const count = feedEntries().length;
  if (count !== feedCount) {
    feedCount = count;
    const steps = Array.from({ length: count }, (_, index) => {
      const tick = element('li', '', String(index + 1).padStart(2, '0'));
      tick.setAttribute('aria-label', 'Update ' + (index + 1));
      return tick;
    });
    byId('feed-steps').replaceChildren(...steps);
    setTrack('build', Math.max(0, count - 1));
  }
  queueScroll();
}

function updateFeed(position, moving) {
  const entries = feedEntries();
  const next = entries.length ? Math.min(entries.length - 1, Math.floor(position + .08)) : 0;
  // Growing the track leaves the current entry in place until the visitor scrolls.
  const index = moving || feedStep < 0 ? next : Math.min(feedStep, Math.max(0, entries.length - 1));
  const entry = entries[index];
  const message = entry?.message || 'Waiting for the sandbox.';
  if (feedStep !== index || message !== feedMessage) {
    feedStep = index;
    feedMessage = message;
    const time = entry?.time ? new Date(entry.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
    byId('build-index').textContent = entry ? 'UPDATE ' + String(index + 1).padStart(2, '0') + (time ? ' · ' + time : '') : 'ON STANDBY';
    byId('build-message').textContent = message;
    byId('build-guide-copy').textContent = entry?.error
      ? 'Scroll back through the activity or revise the scope and retry from the same sandbox.'
      : buildNotes.find(([pattern]) => pattern.test(message))?.[1] ||
        'Scrollworks sends the approved scope to the sandbox and waits for the first confirmed event.';
    animateBeat(byId('build-beat'));
  }
  const remaining = entries.length - index - 1;
  const ready = job.stage === 'ready' && remaining === 0;
  const cue = remaining > 0 ? 'Scroll for the next update · ' + remaining + ' ahead'
    : entry?.error ? 'Build paused' : ready ? 'Scroll into your preview' : 'Caught up · waiting for the next update';
  if (byId('build-cue').textContent !== cue) byId('build-cue').textContent = cue;
  byId('build-state').textContent = ready ? 'VERIFIED' : entry?.error ? 'PAUSED' : 'BUILDING';
  byId('build-state').dataset.status = ready ? 'ready' : entry?.error ? 'error' : 'building';
  byId('build-recovery').hidden = !entry?.error;
  for (const [step, tick] of Array.from(byId('feed-steps').children).entries()) {
    tick.dataset.step = step === index ? 'current' : step < index ? 'past' : 'ahead';
    if (step === index) tick.setAttribute('aria-current', 'step');
    else tick.removeAttribute('aria-current');
  }
}

function updatePlan() {
  plannedScreens = screensFor(job.plan, job.idea);
  blueprintStep = -1;
  byId('surfaces').replaceChildren(...plannedScreens.map(screen => element('span', '', screen.name)));
  byId('model-name').textContent = job.plan.title.toUpperCase();
  if (!blueprint && wireframe) {
    blueprint = wireframe.mountWireframe(view, job.plan.layout, 0);
    drawnProgress = undefined;
  }
  blueprint?.setPlan(job.plan.layout, plannedScreens);
  renderCards();
  queueScroll();
}

function renderCards() {
  const cards = job.plan.features.map((feature, index) => {
    const card = element('article', 'feature-card');
    card.dataset.feature = feature.id;
    card.inert = true;
    card.append(element('span', 'mono story-label', 'FEATURE ' + String(index + 1).padStart(2, '0')));
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
  byId('feature-ledger').replaceChildren(...job.plan.features.map((feature, index) => {
    const item = element('li');
    item.append(element('span', 'mono', String(index + 1).padStart(2, '0')), element('span', 'ledger-name', feature.title));
    return item;
  }));
  scopeStep = -1;
  updateScope();
}

function updateScopeBeat(position, movingDown, y) {
  if (byId('scope-footer').hidden) return;
  const cards = Array.from(byId('feature-grid').children);
  const total = cards.length;
  if (!total) return;
  const index = Math.min(total, Math.floor(position + .08));
  const recap = index === total;
  const scoping = job.stage === 'scoping';
  if (recap && scoping && !operation && scopeArmedAt === null) {
    scopeArmedAt = y;
    setTrack('scope', total + 1);
  }
  if (scopeStep !== index) {
    scopeStep = index;
    scopeSeen = Math.max(scopeSeen, Math.min(total, index + 1));
    for (const [step, card] of cards.entries()) {
      const active = step === index;
      card.toggleAttribute('data-active', active);
      card.inert = !active;
    }
    for (const [step, item] of Array.from(byId('feature-ledger').children).entries()) {
      item.dataset.step = step === index ? 'current' : step < scopeSeen ? 'past' : 'ahead';
      item.lastElementChild.hidden = step >= scopeSeen;
      if (step === index) item.setAttribute('aria-current', 'step');
      else item.removeAttribute('aria-current');
    }
    byId('scope-review').hidden = !recap;
    byId('feature-index').textContent = recap ? 'RECAP' : String(index + 1).padStart(2, '0') + ' / ' + String(total).padStart(2, '0');
    if (recap) animateBeat(byId('scope-review'));
  }
  byId('scope-review-title').textContent = scoping ? 'Ready to build?' : 'Scope locked.';
  byId('scope-review-copy').textContent = scoping
    ? 'Scroll once more to start the build. Any undecided cards go to Later.'
    : 'The builder has the approved scope. Scroll into the Build Desk to follow its progress.';
  byId('scope-cue').textContent = recap
    ? scoping ? 'Scroll to start the build' : 'Scroll to follow the build'
    : index === total - 1 ? 'Scroll to review your scope' : 'Scroll for the next feature';
  if (recap && scoping && !operation && movingDown && scopeArmedAt !== null &&
      y > scopeArmedAt && position >= total + .93) {
    void compile();
  }
}

function updateScope() {
  const counts = { keep: 0, later: 0, never: 0, undecided: 0 };
  for (const [index, card] of Array.from(byId('feature-grid').children).entries()) {
    const choice = job.choices[card.dataset.feature] || 'undecided';
    counts[choice]++;
    card.dataset.choice = choice;
    byId('feature-ledger').children[index].dataset.choice = choice;
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
  byId('preview').hidden = job?.stage !== 'ready';
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
  setTrack('blueprint', 3);
  setTrack('scope', planning || planFailed ? 0 : job.plan.features.length + (scopeArmedAt !== null || reviewed ? 1 : 0));
  byId('scope-wait').hidden = !(planning || planFailed);
  byId('feature-deck').hidden = planning || planFailed;
  byId('scope-footer').hidden = planning || planFailed;
  byId('scope-wait-text').textContent = planFailed ? job.error : 'Preparing your feature cards…';
  byId('scope-wait').querySelector('button')?.remove();
  if (planning || planFailed) {
    byId('feature-index').textContent = planning ? 'WAITING' : 'PAUSED';
    byId('scope-cue').textContent = planning ? 'Feature review unlocks when the plan arrives' : 'The plan needs attention';
  }
  if (planFailed) {
    byId('scope-wait').append(button(job.id ? 'Delete sandbox and restart' : 'Start again', 'text-button', discard));
  }
  if (planning) updatePlanningCopy();
  else byId('blueprint-note').textContent = job.live ? 'Plan ready for feature review.' : 'Demo plan · assembled in your browser.';
  updateScope();
  if (!reviewed) return;
  prepareFeed();
  renderRecovery();
  if (job.stage === 'ready') renderPreview();
}

function showFeedback(message = '') {
  byId('build-feedback').textContent = message;
  byId('build-feedback').hidden = !message;
  byId('recovery-feedback').textContent = message;
  byId('recovery-feedback').hidden = !message;
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

function renderPreview() {
  const scope = scopeFor(job.plan, job.choices);
  const summary = scope.keep.length + ' kept · ' + scope.later.length + ' for later · ' + scope.never.length + ' left out';
  const actions = byId('preview-actions');
  const frame = byId('preview-frame');
  frame.title = job.plan.title + ' website preview';
  byId('preview-name').textContent = job.plan.title;
  byId('preview-summary').textContent = summary + '. Try your first release in the frame below.';
  actions.replaceChildren(button('New brief', 'button quiet', reset));
  if (job.live) {
    void loadPreview(frame);
    actions.append(button('Delete sandbox', 'text-button danger', discard));
  } else {
    demoFile = makeDemo(job.idea, job.plan, scope);
    frame.removeAttribute('src');
    if (frame.srcdoc !== demoFile) frame.srcdoc = demoFile;
    actions.append(button('Download HTML', 'button quiet', downloadDemo));
  }
}

async function loadPreview(frame) {
  const path = buildPath('/preview/');
  if (loadedPreview === path) return;
  loadedPreview = path;
  const current = job;
  showFeedback('Loading the verified site…');
  try {
    const response = await api(path);
    const html = await response.text();
    const nonce = byId('app-entry').nonce;
    if (!nonce) throw new Error('Refresh Scrollworks to load the inline preview.');
    if (job !== current) return;
    frame.srcdoc = html.replaceAll('__SCROLLWORKS_PREVIEW_NONCE__', nonce);
    showFeedback();
  } catch (error) {
    if (job !== current) return;
    loadedPreview = '';
    showFeedback(error.message);
  }
}

function renderRecovery() {
  if (job.failedAt !== 'build') return;
  const panel = byId('recovery-actions');
  panel.replaceChildren(button('New brief', 'button quiet', reset));
  if (job.id) panel.append(
    button('Revise scope and retry', 'button quiet', retry),
    button('Delete sandbox', 'text-button danger', discard),
  );
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
  feedStep = -1;
  feedCount = -1;
  feedMessage = '';
  delete job.failedAt;
  save();
  showFeedback();
  render();

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
  scopeArmedAt = null;
  delete job.error;
  delete job.failedAt;
  save();
  render();
  visit('scope');
}

async function discard(event) {
  if (job.id && !confirm('Delete this sandbox and its site? The preview will stop working.')) return;
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
  loadedPreview = '';
  blueprintStep = -1;
  scopeStep = -1;
  scopeSeen = 0;
  scopeArmedAt = null;
  feedStep = -1;
  feedCount = -1;
  feedMessage = '';
  byId('preview-frame').removeAttribute('src');
  byId('preview-frame').removeAttribute('srcdoc');
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
byId('restart').addEventListener('click', discard);
ideaInput.addEventListener('input', updateInput);
form.addEventListener('submit', begin);
for (const control of rail) {
  control.addEventListener('click', () => visit(control.dataset.jump));
}
window.addEventListener('scroll', queueScroll, { passive: true });
window.addEventListener('resize', queueScroll);
import('./wireframe.js?v=inline').then(module => {
  wireframe = module;
  wireframe.mountWireframe(byId('hero-model'), 'landing', 1);
  if (job) updatePlan();
}).catch(() => {});
restore();
