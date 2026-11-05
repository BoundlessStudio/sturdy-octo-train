import { DECISIONS, MAX_IDEA, draftPlan, scopeFor, screensFor } from './plan.js?v=reader';
import { makeDemo } from './demo.js';
import { attachReader } from './reader.js?v=reader';

const byId = id => document.getElementById(id);
const reader = byId('reader');
const viewport = byId('stage-viewport');
const ideaInput = byId('idea');
const model = byId('blueprint-model');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const sessionKey = 'scrollworks.active-build';
const phaseNames = { idea: 'Idea', plan: 'Plan', blueprint: 'Blueprint', scope: 'Scope', build: 'Build', preview: 'Preview' };
const decisionNames = { keep: 'Keep', later: 'Later', never: 'Never' };
const decisionDetails = { keep: 'Build it now', later: 'Save it for another release', never: 'Leave it out' };
const ideaStep = { id: 'idea', pane: 'idea', phase: 'idea' };
const planStart = { id: 'plan-start', pane: 'feed', phase: 'plan', message: 'Your idea is in.' };
const recap = { id: 'recap', pane: 'recap', phase: 'scope' };
const buildStart = { id: 'build-start', pane: 'feed', phase: 'build', message: 'Your scope is locked.' };
const preview = { id: 'preview', pane: 'preview', phase: 'preview' };
const blueprintSteps = [
  ['Frame', 'Lay out the screens.', 'Each sheet is a screen from your plan. Scrolling brings the sheets together into one blueprint.'],
  ['Content', 'Put the blocks in place.', 'Each block represents a piece of your site, from navigation to a calendar or form.'],
  ['Detail', 'See the proposed site.', 'The filled wireframe shows how your screens and blocks fit together. Next you’ll decide which features make the first release.'],
];
const notes = [
  [/requesting a dedicated/i, 'A separate workspace', 'Agent37 creates an isolated workspace for this idea. Hermes can build and check its files there.'],
  [/waiting for Hermes/i, 'Meet the builder', 'Hermes starts inside the workspace and receives your idea as its brief.'],
  [/turning the brief|blueprint plan/i, 'From words to screens', 'The plan identifies the screens and what belongs on each one. Scrollworks uses that structure to draw your wireframe.'],
  [/feature choices/i, 'A deliberate first release', 'Keep becomes the build scope. Later stays in the backlog and Never is left out.'],
  [/building the site|assembling/i, 'From scope to site', 'The builder turns the approved features into pages, styles, and interactions.'],
  [/running commands/i, 'Checking the work', 'Hermes can run checks inside the workspace while the site is taking shape.'],
  [/writing site files/i, 'The site takes shape', 'Hermes writes the site files in its workspace and connects the pieces of the approved design.'],
  [/checking the index/i, 'A working preview', 'Scrollworks checks that the generated site responds before making the final frame available.'],
  [/verified|ready to open/i, 'A private frame', 'The finished site opens inside an isolated frame on the last scroll step.'],
  [/reconnecting/i, 'Picking up the build', 'The workspace saves the build state so Scrollworks can recover after a connection interruption.'],
];

let job;
let current = ideaStep;
let liveAvailable = false;
let starting = false;
let operation = false;
let disposing = false;
let previewLoad;
let demoFile = '';
let wireframe;
let wireframeModule;
let attemptedWireframe = false;
let modelProgress = 0;
let modelAnimation = 0;

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

function eventsFor(phase, entries) {
  return entries.map((entry, index) => ({
    ...entry, id: phase + '-' + index, pane: 'feed', phase, number: index + 1,
  }));
}

function errorStep(phase) {
  return { id: phase + '-error', pane: 'feed', phase, error: true, message: job.error };
}

function steps() {
  if (!job) return [ideaStep];
  const flow = [ideaStep, planStart, ...eventsFor('plan', job.planLog)];
  if (job.failedAt === 'plan') return [...flow, errorStep('plan')];
  if (job.stage === 'planning') return flow;
  flow.push(
    ...blueprintSteps.map((_, index) => ({ id: 'blueprint-' + index, pane: 'blueprint', phase: 'blueprint', index })),
    ...job.plan.features.map((feature, index) => ({ id: 'feature-' + feature.id, pane: 'feature', phase: 'scope', feature, index })),
    recap,
  );
  if (job.stage === 'scoping') return flow;
  flow.push(buildStart, ...eventsFor('build', job.log));
  if (job.failedAt === 'build') flow.push(errorStep('build'));
  if (job.stage === 'ready') flow.push(preview);
  return flow;
}

function record(phase, message) {
  const entries = phase === 'plan' ? job.planLog : job.log;
  if (!message || entries.at(-1)?.message === message) return;
  entries.push({ message, time: Date.now() });
  save();
  updatePrompt();
}

function choiceFor(feature) {
  return job.drafts[feature.id] || job.choices[feature.id] || 'later';
}

function cueFor(next) {
  if (disposing) return ['wait', 'Deleting the sandbox…'];
  if (current === ideaStep && !job) {
    if (starting) return ['wait', 'Sending your idea…'];
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
    if (next === recap) return ['next', 'Scroll down to review your choices'];
    if (next.pane === 'feature') return ['next', 'Scroll down to see the next feature'];
    if (next.pane === 'blueprint') return ['next', 'Scroll down to reveal the ' + blueprintSteps[next.index][0].toLowerCase()];
    return ['next', 'Scroll down to read the next update'];
  }
  if (current === preview) return ['done', 'This is the final step'];
  if (current.error) return ['done', 'This run is paused'];
  return ['wait', 'Waiting for the next update'];
}

function updatePrompt() {
  const flow = steps();
  const index = flow.findIndex(step => step.id === current.id);
  const [state, label] = cueFor(flow[index + 1]);
  byId('scroll-prompt').dataset.state = state;
  byId('scroll-arrow').textContent = state === 'done' ? '·' : state === 'wait' ? '…' : '↓';
  const instruction = byId('scroll-instruction');
  if (instruction.textContent !== label) instruction.textContent = label;
  byId('scroll-help').textContent = state === 'next' ? 'Wheel, swipe up, or Page Down'
    : state === 'wait' ? 'Scroll again when an update arrives' : 'Scroll up to review earlier steps';
  byId('step-marker').textContent = String(index + 1).padStart(2, '0') + ' / ' + phaseNames[current.phase];
  byId('back-hint').hidden = index <= 0 || state === 'done';
}

function updateMode() {
  const live = job ? job.live : liveAvailable;
  byId('mode').classList.toggle('live', live);
  byId('mode').lastElementChild.textContent = live ? 'Agent37 live' : 'Demo mode';
}

function feedback(id, text = '') {
  const element = byId(id);
  element.textContent = text;
  element.hidden = !text;
}

function show(step, direction = 0) {
  current = step;
  if (job) {
    job.step = step.id;
    save();
  }
  const pane = byId(step.pane + '-pane');
  for (const other of viewport.children) other.hidden = other !== pane;
  if (step.pane !== 'blueprint') cancelAnimationFrame(modelAnimation);
  if (step === ideaStep) {
    ideaInput.readOnly = !!job;
    updateIdea();
  } else if (step.pane === 'feed') {
    renderFeed(step);
  } else if (step.pane === 'blueprint') {
    renderBlueprint(step);
  } else if (step.pane === 'feature') {
    renderFeature(step);
  } else if (step === recap) {
    renderRecap();
  } else if (step === preview) {
    renderPreview();
  }
  viewport.scrollTop = 0;
  updateMode();
  updatePrompt();
  if (direction) {
    reader.focus({ preventScroll: true });
    byId('step-announcement').textContent = pane.querySelector('h1, h2').textContent;
    if (!reducedMotion.matches) {
      const contents = pane.firstElementChild;
      contents.getAnimations().forEach(animation => animation.cancel());
      contents.animate(
        [{ opacity: .25, transform: 'translateY(' + direction * 18 + 'px)' }, { opacity: 1, transform: 'translateY(0)' }],
        { duration: 280, easing: 'cubic-bezier(.2,.75,.3,1)' },
      );
    }
  }
}

function updateIdea() {
  ideaInput.removeAttribute('aria-invalid');
  byId('idea-count').textContent = ideaInput.value.length + ' / ' + MAX_IDEA;
  byId('idea-feedback').textContent = job ? 'Idea already sent. Scroll down to reread the plan.' : '';
  updatePrompt();
}

function renderFeed(step) {
  const { phase, error, message, number, time } = step;
  const plan = phase === 'plan';
  const note = error
    ? ['What you can do', 'Scroll up to reread the last update. ' + (plan ? 'Start with a fresh idea if you want to try again.' : 'Scroll down to retry with the approved scope.')]
    : step === planStart
      ? ['First comes the plan', job.live
        ? 'Agent37 takes your brief and proposes screens and features. The next scroll reads the first available update.'
        : 'Demo mode sketches screens and features in your browser. Scroll down to reveal the blueprint.']
      : step === buildStart
        ? ['The build is underway', 'Your choices define the first version. Each update waits for you to scroll to it.']
        : (notes.find(([pattern]) => pattern.test(message))?.slice(1) ||
          ['Inside the build', 'This update comes from the sandbox running your brief.']);
  byId('feed-label').textContent = (plan ? 'PLANNING' : 'BUILD') + (error ? ' PAUSED' : ' UPDATE');
  byId('feed-title').textContent = message;
  byId('feed-detail').textContent = step === planStart ? job.idea : '';
  byId('feed-detail').hidden = step !== planStart;
  const clock = time ? new Date(time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
  byId('feed-index').textContent = number ? String(number).padStart(2, '0') + ' / ' + clock : phaseNames[phase].toUpperCase();
  byId('guide-title').textContent = note[0];
  byId('guide-copy').textContent = note[1];
  const actions = byId('feed-actions');
  actions.hidden = !(error && job.id);
  actions.replaceChildren();
  if (error && job.id) actions.append(button('Delete sandbox', discard, 'button danger'));
  feedback('feed-feedback');
}

function renderBlueprint({ index }) {
  const screens = screensFor(job.plan, job.idea);
  const [label, title, description] = blueprintSteps[index];
  const lead = screens[0];
  byId('blueprint-index').textContent = 'BLUEPRINT / ' + (index + 1) + ' OF 3 / ' + label;
  byId('blueprint-title').textContent = title;
  byId('blueprint-copy').textContent = index === 1 && lead
    ? lead.name + ' takes shape with ' + lead.blocks.map(block => block.label).join(', ') + '.'
    : description;
  byId('surfaces').replaceChildren(...screens.map(screen => node('span', screen.name)));
  byId('model-name').textContent = job.plan.title;
  model.dataset.fill = String(index);
  for (const [position, stage] of [...model.querySelector('.model-bottom').children].entries()) {
    if (position === index) stage.setAttribute('aria-current', 'step');
    else stage.removeAttribute('aria-current');
  }
  const target = index / 2;
  if (wireframeModule && !attemptedWireframe) {
    attemptedWireframe = true;
    wireframe = wireframeModule.mountWireframe(model, job.plan.layout, target);
    modelProgress = target;
  }
  // Keep the same idea-specific screens available if the browser has no WebGL.
  model.querySelector('.model-fallback').replaceChildren(...screens.map(screen => {
    const sheet = node('div', undefined, 'flat-screen');
    sheet.append(node('strong', screen.name));
    for (const block of screen.blocks) sheet.append(node('span', block.label, 'flat-block'));
    return sheet;
  }));
  if (!wireframe) return;
  wireframe.setPlan(job.plan.layout, screens);
  cancelAnimationFrame(modelAnimation);
  const origin = modelProgress;
  if (origin === target || reducedMotion.matches) {
    wireframe.setProgress(target);
    modelProgress = target;
    return;
  }
  const startedAt = performance.now();
  function draw(now) {
    const fraction = Math.min(1, (now - startedAt) / 400);
    modelProgress = origin + (target - origin) * (1 - (1 - fraction) ** 3);
    wireframe.setProgress(modelProgress);
    if (fraction < 1) modelAnimation = requestAnimationFrame(draw);
  }
  modelAnimation = requestAnimationFrame(draw);
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
  const choices = node('div', undefined, 'choices');
  choices.setAttribute('role', 'radiogroup');
  choices.setAttribute('aria-labelledby', title.id);
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
    label.append(radio, node('span', decisionNames[decision]), node('small', decisionDetails[decision]));
    choices.append(label);
  }
  card.replaceChildren(title, detail, choices);
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
  byId('preview-summary').textContent = scope.keep.length + ' kept · ' + scope.later.length + ' for later · ' + scope.never.length + ' left out';
  const actions = byId('preview-actions');
  actions.replaceChildren(button('New idea', () => reset(false)));
  if (job.live) {
    actions.append(button('Delete sandbox', discard, 'button danger'));
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

const post = (url, data) => api(url, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(data),
});

function buildPath(suffix = '') {
  return '/api/builds/' + encodeURIComponent(job.id) + suffix;
}

function completePlan(plan) {
  job.plan = plan;
  job.stage = 'scoping';
  record('plan', 'Your blueprint plan is ready.');
  save();
}

function completeBuild() {
  job.stage = 'ready';
  save();
  updatePrompt();
}

async function readEvents(response, phase) {
  if (!response.body) throw new Error('The build connection ended before it sent a result.');
  const stream = response.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = '';
  let terminal = false;
  try {
    for (;;) {
      const { value, done } = await stream.read();
      buffer += value || '';
      const lines = buffer.split('\n');
      buffer = done ? '' : lines.pop();
      for (const line of lines) {
        if (!line.trim()) continue;
        const event = JSON.parse(line);
        if (event.type === 'status') record(phase, event.message);
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

async function recover(phase) {
  const deadline = Date.now() + 12 * 60 * 1000;
  record(phase, 'Reconnecting to the sandbox…');
  while (Date.now() < deadline) {
    let state;
    try {
      state = await (await api(buildPath())).json();
    } catch (error) {
      if ([403, 404, 503].includes(error.status)) throw error;
    }
    if (state?.stage === 'error') throw new Error(state.error || 'The sandbox reported a build error.');
    if (phase === 'plan' && state?.stage === 'scoping') {
      completePlan(state.plan);
      return;
    }
    if (phase === 'build' && state?.stage === 'ready') {
      job.plan = state.plan;
      job.choices = state.choices || job.choices;
      record('build', 'Preview verified.');
      completeBuild();
      return;
    }
    if (phase === 'build' && state?.stage === 'scoping') throw new Error('The sandbox did not receive the build. Scroll to retry.');
    await pause(4500);
  }
  throw new Error('The sandbox has not reported a result yet. Reload Scrollworks to reconnect.');
}

async function run(phase, task, reconnect = true) {
  operation = true;
  try {
    try {
      await task();
    } catch (error) {
      if (!reconnect || !job.id || error.terminal || (error.status && error.status !== 409)) throw error;
      await recover(phase);
    }
  } catch (error) {
    job.stage = 'error';
    job.failedAt = phase;
    job.error = error.message;
    save();
  } finally {
    operation = false;
    updatePrompt();
  }
}

async function sendIdea() {
  if (starting) return;
  const idea = ideaInput.value.trim();
  if (idea.length < 8 || idea.length > MAX_IDEA) {
    ideaInput.setAttribute('aria-invalid', 'true');
    byId('idea-feedback').textContent = 'Use 8 to ' + MAX_IDEA + ' characters before you scroll.';
    return;
  }
  starting = true;
  updatePrompt();
  await configuration;
  job = {
    idea, live: liveAvailable, stage: liveAvailable ? 'planning' : 'scoping',
    plan: draftPlan(idea), choices: {}, drafts: {}, planLog: [], log: [],
  };
  starting = false;
  show(planStart, 1);
  if (job.live) await run('plan', async () => readEvents(await post('/api/builds', { idea }), 'plan'));
}

async function compile() {
  if (operation) return;
  job.stage = 'building';
  job.log = [];
  delete job.failedAt;
  delete job.error;
  show(buildStart, 1);
  await run('build', async () => {
    if (job.live) {
      await readEvents(await post(buildPath('/compile'), { choices: job.choices }), 'build');
      return;
    }
    record('build', 'Applied your feature choices.');
    await pause(400);
    record('build', 'Assembling the demo page in your browser.');
    await pause(450);
    demoFile = makeDemo(job.idea, job.plan, scopeFor(job.plan, job.choices));
    const document = new DOMParser().parseFromString(demoFile, 'text/html');
    if (!document.querySelector('main h1')) throw new Error('The demo preview could not be assembled.');
    record('build', 'Demo HTML is ready to open.');
    completeBuild();
  });
}

function stepBy(direction) {
  if (starting || disposing) return;
  if (!job) {
    if (direction > 0) void sendIdea();
    return;
  }
  const flow = steps();
  const index = flow.findIndex(step => step.id === current.id);
  const next = flow[index + direction];
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
}

async function discard(event) {
  if (operation || disposing || !confirm('Delete this sandbox and its generated site?')) return;
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
    control.disabled = false;
    feedback(feedbackId, error.message);
    updatePrompt();
  }
}

function reset(keepIdea) {
  if (operation || disposing) return;
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
  job = {
    ...saved, choices: saved.choices || {}, drafts: saved.drafts || {},
    planLog: saved.planLog || (wasPlanning ? saved.log || [] : []),
    log: !saved.planLog && wasPlanning ? [] : saved.log || [],
  };
  if (!job.live && job.stage === 'building') job.stage = 'scoping';
  const flow = steps();
  const resumed = flow.find(step => step.id === job.step);
  show(resumed || (job.stage === 'building' || job.stage === 'ready' ? buildStart : planStart));
  if (job.live && ['planning', 'building'].includes(job.stage)) {
    const phase = job.stage === 'planning' ? 'plan' : 'build';
    void run(phase, () => recover(phase), false);
  }
}

const configuration = fetch('/api/config', { signal: AbortSignal.timeout(8000) })
  .then(response => response.ok ? response.json() : {})
  .then(data => { liveAvailable = data.live === true; })
  .catch(() => {})
  .finally(updateMode);

ideaInput.addEventListener('input', updateIdea);
history.scrollRestoration = 'manual';
attachReader(reader, viewport, stepBy);
restore();
updateIdea();
import('./wireframe.js?v=reader').then(module => {
  wireframeModule = module;
  if (current.pane === 'blueprint') renderBlueprint(current);
}).catch(() => {});
