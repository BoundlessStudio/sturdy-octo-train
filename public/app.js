import { DECISIONS, MAX_IDEA, draftPlan, scopeFor, screensFor } from './plan.js';
import { buildNotesFor } from './build-notes.js';
import { makeDemo } from './demo.js';
import { attachReader } from './reader.js?v=paper';

const byId = id => document.getElementById(id);
const reader = byId('reader');
const viewport = byId('stage-viewport');
const workbench = byId('workbench');
const ideaInput = byId('idea');
const resetButton = byId('reset-build');
const model = byId('blueprint-model');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const sessionKey = 'scrollworks.active-build';
const phaseNames = { idea: 'Idea', plan: 'Plan', blueprint: 'Blueprint', scope: 'Scope', build: 'Build', preview: 'Preview' };
const decisionNames = { keep: 'Keep', later: 'Later', never: 'Never' };
const ideaStep = { id: 'idea', pane: 'idea', phase: 'idea' };
const planStart = { id: 'plan-start', pane: 'blueprint', phase: 'plan', index: 0 };
const recap = { id: 'recap', pane: 'recap', phase: 'scope' };
const buildStart = { id: 'build-start', pane: 'feed', phase: 'build', message: 'Your scope is locked.' };
const preview = { id: 'preview', pane: 'preview', phase: 'preview' };
const NOTE_HISTORY_LIMIT = 24;
const NOTE_CUE = 'Scroll down for a build note';
const planNotes = [
  { title: 'From idea to screens.', copy: 'The builder reads your brief and proposes screens. Each block in the wireframe represents a part of the site, such as a gallery, a calendar, or a form.' },
  { title: 'Decide what ships first.', copy: 'You’ll see one feature at a time. Keep adds it to the first version, Later saves it for another pass, and Never leaves it out. Scroll down to file each choice.' },
  { title: 'From blueprint to preview.', copy: 'After you review the scope, the builder turns it into a page. The finished site opens right here in the last step.' },
].map((note, index, all) => ({ ...note, id: 'plan-note-' + index, pane: 'build-note', phase: 'plan', index, total: all.length }));
const notes = [
  [/feature choices/i, 'A deliberate first release', 'Keep becomes the build scope. Later stays in the backlog and Never is left out.'],
  [/building the site|building the features|assembling/i, 'From scope to site', 'The builder turns the approved features into a page with styles and interactions.'],
  [/running commands/i, 'Checking the work', 'Hermes can run checks inside the workspace while the site is taking shape.'],
  [/writing site files/i, 'The site takes shape', 'Hermes writes the site files in its workspace and connects the pieces of the approved design.'],
  [/checking the index|checking the private preview/i, 'A working preview', 'Scrollworks checks that the generated site responds before making the final frame available.'],
  [/verified|ready to open/i, 'A private frame', 'The finished site opens inside an isolated frame on the last scroll step.'],
  [/reconnecting/i, 'Picking up the build', 'The workspace saves the build state so Scrollworks can recover after a connection interruption.'],
];

let job;
let current = ideaStep;
let liveAvailable = false;
let configured = false;
let operation;
let disposing = false;
let previewLoad;
let demoFile = '';
let wireframe;

function node(tag, text, className) {
  const element = document.createElement(tag);
  if (text !== undefined) element.textContent = text;
  if (className) element.className = className;
  return element;
}

function button(text, action, className = 'button') {
  const element = node('button', text, className);
  element.type = 'button';
  element.addEventListener('click', action);
  return element;
}

function save() {
  try {
    if (job) sessionStorage.setItem(sessionKey, JSON.stringify(job));
    else sessionStorage.removeItem(sessionKey);
  } catch {
    // A blocked storage API does not prevent building in the current tab.
  }
}

function errorStep(phase) {
  return { id: phase + '-error', pane: 'feed', phase, error: true, message: job.error };
}

function buildNoteStep(entry, pages) {
  const index = (entry.number - 1) % pages.length;
  return { ...pages[index], id: 'build-note-' + entry.number, pane: 'build-note', phase: 'build', index, total: pages.length };
}

function steps() {
  if (!job) return [ideaStep];
  const flow = [ideaStep];
  if (job.stage === 'planning' || job.sketchSeen || job.failedAt === 'plan') {
    flow.push(planStart, ...planNotes.slice(0, job.stage === 'planning' ? planNotes.length : job.planNotesSeen || 0));
  }
  if (job.failedAt === 'plan') return [...flow, errorStep('plan')];
  if (job.stage === 'planning') return flow;
  flow.push(
    ...screensFor(job.plan, job.idea).map((screen, index, screens) => ({
      id: 'blueprint-' + index, pane: 'blueprint', phase: 'blueprint', index, screen, total: screens.length,
    })),
    ...job.plan.features.map((feature, index) => ({ id: 'feature-' + feature.id, pane: 'feature', phase: 'scope', feature, index })),
    recap,
  );
  if (job.stage === 'scoping') return flow;
  const updates = [buildStart, ...job.log.map((entry, index) => ({
    ...entry, id: 'build-' + index, pane: 'feed', phase: 'build', number: index + 1,
  }))];
  const history = job.buildNotes || [];
  const pages = history.length ? buildNotesFor(job) : [];
  for (const [after, update] of updates.entries()) {
    flow.push(update);
    for (const entry of history) {
      if (entry.after === after) flow.push(buildNoteStep(entry, pages));
    }
  }
  if (job.failedAt === 'build') flow.push(errorStep('build'));
  if (job.stage === 'ready') flow.push(preview);
  return flow;
}

function nextStep(flow, index) {
  if (job && job.stage !== 'planning' && job.failedAt !== 'plan' && (current === ideaStep || current.phase === 'plan')) {
    return flow.find(step => step.phase === 'blueprint');
  }
  const next = flow[index + 1];
  if (current.phase === 'build' && next?.pane === 'build-note') {
    return flow.slice(index + 1).find(step => step.pane !== 'build-note') || next;
  }
  return next;
}

function recordBuild(message) {
  if (!message || job.log.at(-1)?.message === message) return;
  job.log.push({ message, time: Date.now() });
  save();
  updatePrompt();
}

function choiceFor(feature) {
  return job.drafts[feature.id] || job.choices[feature.id] || 'later';
}

function canBrowseBuildNotes() {
  return current.phase === 'build' && job?.stage === 'building';
}

function cueFor(next) {
  if (disposing) return ['wait', 'Deleting this build…'];
  if (current === ideaStep && !job) {
    return ['next', ideaInput.value.trim().length >= 8 ? 'Scroll down to send your idea' : 'Type an idea, then scroll down'];
  }
  if (current.pane === 'feature' && job.stage === 'scoping') {
    return ['next', 'Scroll down to save ' + decisionNames[choiceFor(current.feature)]];
  }
  if (current === recap && job.stage === 'scoping') {
    return operation ? ['wait', 'Finishing the plan…'] : ['next', 'Scroll down to start the build'];
  }
  if (current.error && !operation) {
    if (current.phase === 'build' && job.id) return ['next', 'Scroll down to retry the build'];
    if (!job.id) return ['next', 'Scroll down to edit your idea'];
  }
  if (next) {
    if (next === preview) return ['next', 'Scroll down to open the preview'];
    if (next.pane === 'build-note') return ['next', next.phase === 'plan' ? 'Scroll down for a planning note' : NOTE_CUE];
    if (next === recap) return ['next', 'Scroll down to review your choices'];
    if (next.pane === 'feature') return ['next', next.index === 0 ? 'Scroll down to choose features' : 'Scroll down to see the next feature'];
    if (next === planStart) return ['next', 'Scroll down to see the draft blueprint'];
    if (next.pane === 'blueprint') return ['next', next.index === 0 ? 'Scroll down to see your 3D blueprint' : 'Scroll down to lift the next screen'];
    return ['next', 'Scroll down to read the next update'];
  }
  if (canBrowseBuildNotes()) return ['next', NOTE_CUE];
  if (current === preview) return ['done', 'This is the final step'];
  if (current.error) return ['done', 'This run is paused'];
  if (job?.stage === 'planning') return ['wait', 'Finishing your blueprint…'];
  return ['wait', 'Waiting for the next update'];
}

function updatePrompt() {
  const flow = steps();
  const index = flow.findIndex(step => step.id === current.id);
  const [state, label] = cueFor(nextStep(flow, index));
  resetButton.disabled = disposing || (!job && !ideaInput.value);
  byId('scroll-prompt').dataset.state = state;
  byId('scroll-arrow').textContent = state === 'done' ? '·' : state === 'wait' ? '…' : '↓';
  const instruction = byId('scroll-instruction');
  if (instruction.textContent !== label) instruction.textContent = label;
  byId('scroll-help').textContent = state === 'next' ? 'Wheel, swipe up, or Page Down'
    : state === 'wait' ? 'Scroll again when an update arrives' : 'Scroll up to review earlier steps';
  if (label === NOTE_CUE && canBrowseBuildNotes()) byId('scroll-help').textContent = 'Build in progress';
  if (job?.stage === 'planning' && current.phase === 'plan' && state === 'next') byId('scroll-help').textContent = 'Blueprint in progress';
  const stepNumber = flow.slice(0, index + 1).filter(step => step.pane !== 'build-note').length;
  byId('step-marker').textContent = current.pane === 'build-note' ? phaseNames[current.phase] + ' notes'
    : String(stepNumber).padStart(2, '0') + ' / ' + phaseNames[current.phase];
  byId('back-hint').hidden = index <= 0 || state === 'done';
}

function updateMode() {
  const live = job ? job.live : liveAvailable;
  byId('mode').classList.toggle('live', live);
  byId('mode').lastElementChild.textContent = live ? 'Agent37 live' : configured ? 'Demo mode' : 'Connecting';
}

function feedback(id, text = '') {
  const element = byId(id);
  element.textContent = text;
  element.hidden = !text;
}

function show(step, direction = 0) {
  current = step;
  if (job) {
    if (step === planStart) job.sketchSeen = true;
    if (step.phase === 'plan' && step.pane === 'build-note') job.planNotesSeen = Math.max(job.planNotesSeen || 0, step.index + 1);
    job.step = step.id;
    save();
  }
  const pane = byId(step.pane + '-pane');
  workbench.dataset.phase = step.phase;
  for (const other of viewport.children) other.hidden = other !== pane;
  if (step === ideaStep) {
    ideaInput.readOnly = !!job;
    updateIdea();
  } else if (step.pane === 'feed') {
    renderFeed(step);
  } else if (step.pane === 'build-note') {
    renderBuildNote(step);
  } else if (step.pane === 'blueprint') {
    renderBlueprint(step);
  } else if (step.pane === 'feature') {
    renderFeature(step);
  } else if (step === recap) {
    renderRecap();
  } else if (step === preview) {
    renderPreview();
  }
  if (step !== ideaStep) renderModel(step);
  viewport.scrollTop = 0;
  updateMode();
  updatePrompt();
  if (direction) {
    reader.focus({ preventScroll: true });
    byId('step-announcement').textContent = pane.querySelector('h1, h2').textContent;
    if (!reducedMotion.matches) {
      const contents = pane.firstElementChild;
      contents.getAnimations().forEach(animation => animation.cancel());
      contents.animate([
        { opacity: 0, transform: 'translateY(' + direction * 32 + 'px)', clipPath: 'inset(0 0 10% 0)' },
        { opacity: 1, transform: 'translateY(0)', clipPath: 'inset(0 0 0 0)' },
      ], { duration: 460, easing: 'cubic-bezier(.2,.75,.25,1)' });
    }
  }
}

function updateIdea() {
  ideaInput.removeAttribute('aria-invalid');
  byId('idea-count').textContent = ideaInput.value.length + ' / ' + MAX_IDEA;
  byId('idea-feedback').textContent = job ? 'Idea already sent. Scroll down to see the blueprint.' : '';
  if (current === ideaStep) renderModel(current);
  updatePrompt();
}

function renderFeed(step) {
  const { phase, error, message, number, time } = step;
  const plan = phase === 'plan';
  const note = error
    ? ['What you can do', 'Scroll up to reread the last update. ' + (plan ? 'Start with a fresh idea if you want to try again.' : 'Scroll down to retry with the approved scope.')]
    : step === buildStart
      ? ['The build is underway', 'Your choices define the first version. Each update waits for you to scroll to it.']
      : (notes.find(([pattern]) => pattern.test(message))?.slice(1) ||
        ['Inside the build', 'This update comes from the sandbox running your brief.']);
  byId('feed-label').textContent = (plan ? 'PLANNING' : 'BUILD') + (error ? ' PAUSED' : ' UPDATE');
  byId('feed-title').textContent = message;
  const clock = time ? new Date(time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
  byId('feed-index').textContent = number ? String(number).padStart(2, '0') + ' / ' + clock : phaseNames[phase].toUpperCase();
  byId('guide-title').textContent = note[0];
  byId('guide-copy').textContent = note[1];
  const actions = byId('feed-actions');
  actions.hidden = !(error && job.id);
  actions.replaceChildren();
  if (error && job.id) actions.append(button('Delete build', discard, 'button danger'));
  feedback('feed-feedback');
}

function renderBlueprint(step) {
  const draft = step === planStart;
  const { index, screen = screensFor(draftPlan(job.idea), job.idea)[0], total } = step;
  byId('blueprint-index').textContent = draft ? 'DRAFT BLUEPRINT' : 'BLUEPRINT / ' + (index + 1) + ' OF ' + total;
  byId('blueprint-title').textContent = screen.name;
  byId('blueprint-copy').textContent = draft
    ? 'Your brief starts as a 3D sketch. The full blueprint adds the screens and features for your build.'
    : index === 0
      ? 'The first screen lifts out of your sketch. Here’s what belongs on it.'
      : 'This screen connects to the rest of your site. Here’s what belongs on it.';
  byId('blueprint-blocks').replaceChildren(...screen.blocks.map(block => node('li', block.label)));
}

function renderBuildNote({ title, copy, points = [], index, total, phase }) {
  byId('build-note-label').textContent = phase === 'plan' ? 'PLANNING NOTES' : 'BUILD NOTES';
  byId('build-note-index').textContent = (index + 1) + ' / ' + total;
  byId('build-note-title').textContent = title;
  byId('build-note-copy').textContent = copy;
  const list = byId('build-note-points');
  list.replaceChildren(...points.map(point => node('li', point)));
  list.hidden = !points.length;
}

function renderModel(step) {
  model.hidden = step === preview;
  if (model.hidden) return;
  const idea = step === ideaStep ? ideaInput.value.trim() : job.idea;
  const drafting = step === ideaStep || step.phase === 'plan';
  const plan = drafting ? draftPlan(idea) : job.plan;
  const title = idea ? plan.title : 'Untitled idea';
  const screens = idea ? screensFor(plan, idea) : [];
  const focus = step.pane === 'blueprint' ? step.index : step.focus ?? -1;
  const open = step.pane === 'blueprint' ? focus + 1
    : step.phase === 'scope' || step.phase === 'build' ? screens.length : step.phase === 'plan' ? 1 : 0;
  const detail = {
    idea: job ? 'ORIGINAL SKETCH' : 'SKETCH / AS YOU TYPE',
    plan: 'DRAFT SKETCH',
    blueprint: 'SCREEN ' + open + ' / ' + screens.length,
    scope: 'FIRST RELEASE / SCOPE',
    build: step.pane === 'build-note' ? 'BUILD NOTES' : step.number ? 'SANDBOX / UPDATE ' + step.number : 'SANDBOX / BUILD',
  }[step.phase];
  byId('model-name').textContent = title;
  byId('model-detail').textContent = detail;
  model.querySelector('.paper-title').textContent = title;
  model.querySelector('.paper-screens').replaceChildren(...screens.map((screen, index) => {
    const sheet = node('div', undefined, 'flat-screen');
    sheet.dataset.raised = String(index < open);
    sheet.append(node('strong', screen.name));
    for (const block of screen.blocks) sheet.append(node('span', block.label, 'flat-block'));
    return sheet;
  }));
  wireframe?.setSketch(title, screens);
  const event = step.number || 0;
  wireframe?.setView(open, focus, step.phase === 'build' ? event : 0);
}

function renderFeature({ feature, index }) {
  byId('feature-index').textContent = (index + 1) + ' / ' + job.plan.features.length;
  const editable = job.stage === 'scoping';
  byId('feature-help').textContent = editable
    ? 'Pick Keep, Later, or Never. Scroll down to save your choice.'
    : 'This is the choice you sent to the builder.';
  const card = byId('feature-card');
  const title = node('h3', feature.title);
  title.id = 'current-feature-title';
  const detail = node('p', feature.detail, 'feature-detail');
  const note = node('div', undefined, 'feature-note');
  note.append(title, detail);
  const choices = node('div', undefined, 'choices');
  choices.setAttribute('role', 'radiogroup');
  choices.setAttribute('aria-labelledby', title.id);
  const committed = Object.values(job.choices);
  for (const decision of DECISIONS) {
    const label = node('label', undefined, 'choice');
    label.dataset.choice = decision;
    const radio = node('input');
    radio.type = 'radio';
    radio.name = 'feature-decision';
    radio.value = decision;
    radio.checked = choiceFor(feature) === decision;
    radio.disabled = !editable;
    radio.addEventListener('change', () => {
      job.drafts[feature.id] = decision;
      save();
      updatePrompt();
    });
    const sorted = committed.filter(choice => choice === decision).length;
    label.append(radio, node('span', decisionNames[decision]), node('small', sorted + ' filed'));
    choices.append(label);
  }
  card.replaceChildren(note, choices);
}

function renderRecap() {
  byId('recap-copy').textContent = job.stage === 'scoping'
    ? 'Scroll down to hand this scope to the builder. Scroll up to revise a choice.'
    : 'This is the scope you sent to the builder.';
  const scope = scopeFor(job.plan, job.choices);
  byId('scope-list').replaceChildren(...DECISIONS.map(decision => {
    const group = node('div', undefined, 'scope-group');
    group.dataset.choice = decision;
    const features = scope[decision];
    const list = node('ul');
    list.append(...features.map(feature => node('li', feature.title)));
    group.append(node('h3', decisionNames[decision] + ' · ' + features.length));
    group.append(features.length ? list : node('p', 'No features'));
    return group;
  }));
}

function renderPreview() {
  const scope = scopeFor(job.plan, job.choices);
  const frame = byId('preview-frame');
  frame.title = job.plan.title + ' website preview';
  byId('preview-name').textContent = job.plan.title;
  byId('preview-summary').textContent = scope.keep.length + ' kept · ' + scope.later.length + ' for later · ' + scope.never.length + ' left out'
    + (job.live ? ' · Preview expires one hour after the build starts' : '');
  const actions = byId('preview-actions');
  actions.replaceChildren(button('New idea', () => reset(false)));
  if (job.live) {
    actions.append(button('Delete build', discard, 'button danger'));
    if (previewLoad !== job) void loadPreview(job, frame);
  } else {
    if (!demoFile) demoFile = makeDemo(job.idea, job.plan, scope);
    if (frame.srcdoc !== demoFile) frame.srcdoc = demoFile;
    actions.append(button('Download HTML', downloadDemo));
  }
}

async function loadPreview(active, frame) {
  previewLoad = active;
  feedback('preview-feedback', 'Loading the verified site…');
  try {
    const response = await api(buildPath('/preview/'), { redirect: 'error' });
    const html = await response.text();
    const nonce = byId('app-entry').nonce;
    if (!nonce) throw new Error('Refresh Scrollworks to load the inline preview.');
    if (job !== active) return;
    frame.srcdoc = html.replaceAll('__SCROLLWORKS_PREVIEW_NONCE__', nonce);
    feedback('preview-feedback');
  } catch (error) {
    if (job !== active) return;
    previewLoad = undefined;
    feedback('preview-feedback', error.message);
  }
}

function downloadDemo() {
  const link = node('a');
  link.href = URL.createObjectURL(new Blob([demoFile], { type: 'text/html;charset=utf-8' }));
  link.download = (job.plan.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'scrollworks-site') + '.html';
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}

async function api(url, options) {
  const response = await fetch(url, options);
  if (response.ok) return response;
  const problem = await response.json().catch(() => ({}));
  const error = new Error(problem.error || 'The builder could not reach the server. Try again.');
  error.status = response.status;
  throw error;
}

const post = (url, data, signal) => api(url, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(data),
  signal,
});

function buildPath(suffix = '') {
  return '/api/builds/' + encodeURIComponent(job.id) + suffix;
}

function completePlan(plan) {
  job.plan = plan;
  job.stage = 'scoping';
  save();
  updatePrompt();
}

function completeBuild() {
  job.stage = 'ready';
  save();
  updatePrompt();
}

async function readEvents(response, phase, signal) {
  if (!response.body) throw new Error('The build connection ended before it sent a result.');
  const stream = response.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = '';
  let terminal = false;
  try {
    for (;;) {
      const { value, done } = await stream.read();
      signal.throwIfAborted();
      buffer += value || '';
      const lines = buffer.split('\n');
      buffer = done ? '' : lines.pop();
      for (const line of lines) {
        if (!line.trim()) continue;
        const event = JSON.parse(line);
        if (event.type === 'status' && phase === 'build') recordBuild(event.message);
        if (event.type === 'sandbox') {
          job.id = event.id;
          save();
        }
        if (event.type === 'plan') {
          completePlan(event.plan);
          terminal = true;
        }
        if (event.type === 'ready') {
          completeBuild();
          terminal = true;
        }
        if (event.type === 'error') {
          const error = new Error(event.message);
          error.terminal = true;
          throw error;
        }
      }
      if (done) break;
    }
  } finally {
    await stream.cancel().catch(() => {});
  }
  if (!terminal) throw new Error('The build connection ended before it sent a result.');
}

const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

async function recover(phase, signal) {
  const deadline = Date.now() + 12 * 60 * 1000;
  if (phase === 'build') recordBuild('Reconnecting to the sandbox…');
  while (Date.now() < deadline) {
    signal.throwIfAborted();
    let state;
    try {
      state = await (await api(buildPath(), { signal })).json();
    } catch (error) {
      if ([403, 404, 410, 503].includes(error.status)) throw error;
    }
    signal.throwIfAborted();
    if (state?.stage === 'error') throw new Error(state.error || 'The sandbox reported a build error.');
    if (phase === 'plan' && state?.stage === 'scoping') {
      completePlan(state.plan);
      return;
    }
    if (phase === 'build' && state?.stage === 'ready') {
      job.plan = state.plan;
      job.choices = state.choices || job.choices;
      recordBuild('Preview verified.');
      completeBuild();
      return;
    }
    if (phase === 'build' && state?.stage === 'scoping') throw new Error('The sandbox did not receive the build. Scroll to retry.');
    await pause(4500);
  }
  throw new Error('The sandbox has not reported a result yet. Reload Scrollworks to reconnect.');
}

async function run(phase, task, reconnect = true) {
  const controller = new AbortController();
  const { signal } = controller;
  operation = controller;
  try {
    try {
      await task(signal);
    } catch (error) {
      if (signal.aborted) return;
      if (!reconnect || !job.id || error.terminal || (error.status && error.status !== 409)) throw error;
      await recover(phase, signal);
    }
  } catch (error) {
    if (signal.aborted) return;
    if (job.live && [404, 410].includes(error.status)) delete job.id;
    job.stage = 'error';
    job.failedAt = phase;
    job.error = error.message;
    save();
  } finally {
    if (operation === controller) {
      operation = undefined;
      updatePrompt();
    }
  }
}

async function sendIdea() {
  if (job) return;
  const idea = ideaInput.value.trim();
  if (idea.length < 8 || idea.length > MAX_IDEA) {
    ideaInput.setAttribute('aria-invalid', 'true');
    byId('idea-feedback').textContent = 'Use 8 to ' + MAX_IDEA + ' characters before you scroll.';
    return;
  }
  const active = job = {
    idea, live: liveAvailable, stage: liveAvailable || !configured ? 'planning' : 'scoping',
    plan: draftPlan(idea), choices: {}, drafts: {}, log: [],
  };
  show(steps()[1], 1);
  await configuration;
  if (job !== active) return;
  if (!liveAvailable) {
    if (job.stage === 'planning') completePlan(job.plan);
    return;
  }
  job.live = true;
  save();
  updateMode();
  await run('plan', async signal => readEvents(await post('/api/builds', { idea }, signal), 'plan', signal));
}

async function compile() {
  if (operation) return;
  job.stage = 'building';
  job.log = [];
  job.buildNotes = [];
  delete job.failedAt;
  delete job.error;
  show(buildStart, 1);
  await run('build', async signal => {
    if (job.live) {
      await readEvents(await post(buildPath('/compile'), { choices: job.choices }, signal), 'build', signal);
      return;
    }
    recordBuild('Applied your feature choices.');
    await pause(400);
    signal.throwIfAborted();
    recordBuild('Assembling the demo page in your browser.');
    await pause(450);
    signal.throwIfAborted();
    demoFile = makeDemo(job.idea, job.plan, scopeFor(job.plan, job.choices));
    const document = new DOMParser().parseFromString(demoFile, 'text/html');
    if (!document.querySelector('main h1')) throw new Error('The demo preview could not be assembled.');
    recordBuild('Demo HTML is ready to open.');
    completeBuild();
  });
}

function stepBy(direction) {
  if (disposing) return;
  if (!job) {
    if (direction > 0) void sendIdea();
    return;
  }
  const flow = steps();
  const index = flow.findIndex(step => step.id === current.id);
  const next = direction > 0 ? nextStep(flow, index) : flow[index - 1];
  if (direction > 0) {
    if (current.pane === 'feature' && job.stage === 'scoping') {
      job.choices[current.feature.id] = choiceFor(current.feature);
      delete job.drafts[current.feature.id];
    }
    if (current === recap && job.stage === 'scoping') {
      void compile();
      return;
    }
    if (current.error && !operation) {
      if (current.phase === 'build' && job.id) void compile();
      else if (!job.id) reset(true);
      return;
    }
  }
  if (next) show(next, direction);
  else if (direction > 0 && canBrowseBuildNotes()) {
    // Attach notes to the update they follow. Newly arriving updates then land after them.
    const history = job.buildNotes ||= [];
    const entry = { after: job.log.length, number: (history.at(-1)?.number || 0) + 1 };
    history.push(entry);
    if (history.length > NOTE_HISTORY_LIMIT) history.shift();
    show(buildNoteStep(entry, buildNotesFor(job)), direction);
  }
}

async function discard(event) {
  if (operation || disposing || !confirm('Delete this build and its preview?')) return;
  const control = event.currentTarget;
  const feedbackId = current === preview ? 'preview-feedback' : 'feed-feedback';
  disposing = true;
  control.disabled = true;
  updatePrompt();
  try {
    await api(buildPath(), { method: 'DELETE' });
    disposing = false;
    reset(false);
  } catch (error) {
    disposing = false;
    if ([404, 410].includes(error.status)) return reset(false);
    control.disabled = false;
    feedback(feedbackId, error.message);
    updatePrompt();
  }
}

function reset(keepIdea) {
  if (disposing) return;
  operation?.abort();
  operation = undefined;
  job = undefined;
  demoFile = '';
  previewLoad = undefined;
  byId('preview-frame').removeAttribute('srcdoc');
  feedback('preview-feedback');
  if (!keepIdea) ideaInput.value = '';
  save();
  show(ideaStep, -1);
  ideaInput.focus({ preventScroll: true });
}

function restore() {
  let saved;
  try {
    saved = JSON.parse(sessionStorage.getItem(sessionKey));
  } catch {
    return;
  }
  if (!saved?.idea || !saved.plan?.features?.length) return;
  ideaInput.value = saved.idea;
  if (saved.live && !saved.id && saved.stage !== 'error') return;
  const wasPlanning = saved.stage === 'planning' || saved.stage === 'scoping' || saved.failedAt === 'plan';
  const { planLog, ...state } = saved;
  job = {
    ...state, choices: saved.choices || {}, drafts: saved.drafts || {},
    log: !planLog && wasPlanning ? [] : saved.log || [],
  };
  if (!job.live && ['planning', 'building'].includes(job.stage)) job.stage = 'scoping';
  const flow = steps();
  const resumed = flow.find(step => step.id === job.step)
    || (job.step?.startsWith('blueprint-') && flow.findLast(step => step.phase === 'blueprint'));
  const fallback = job.failedAt === 'plan' ? flow.at(-1) : job.stage === 'planning' ? planStart
    : job.stage === 'building' || job.stage === 'ready' ? buildStart : flow.find(step => step.phase === 'blueprint');
  show(resumed || fallback);
  if (job.live && ['planning', 'building'].includes(job.stage)) {
    const phase = job.stage === 'planning' ? 'plan' : 'build';
    void run(phase, signal => recover(phase, signal), false);
  }
}

const configuration = fetch('/api/config', { signal: AbortSignal.timeout(8000) })
  .then(response => response.ok ? response.json() : {})
  .then(data => { liveAvailable = data.live === true; })
  .catch(() => {})
  .finally(() => { configured = true; updateMode(); });

ideaInput.addEventListener('input', updateIdea);
resetButton.addEventListener('click', () => reset(false));
history.scrollRestoration = 'manual';
attachReader(reader, viewport, stepBy, pull => {
  if (!reducedMotion.matches && !model.hidden) wireframe?.setPull(pull);
});
restore();
updateIdea();
import('./wireframe.js?v=paper').then(({ mountWireframe }) => {
  wireframe = mountWireframe(model, reducedMotion);
  renderModel(current);
}).catch(() => {});
