const STEP_THRESHOLD = 32;
const GESTURE_IDLE_MS = 220;

// Only one screen is mounted in the scrollport. A short native scroll range
// absorbs the rest of a wheel burst or swipe after it has delivered one step.
export function attachReader(reader, content, onStep, onPull) {
  let consumed = false;
  let touching = false;
  let settleTimer;

  const limit = () => reader.scrollHeight - reader.clientHeight;
  const center = () => Math.round(limit() / 2);
  function showStroke(distance, committed = false) {
    const progress = Math.min(1, Math.abs(distance) / STEP_THRESHOLD);
    const pull = committed ? 0 : Math.sign(distance) * progress;
    reader.style.setProperty('--pull', -pull * 18 + 'px');
    reader.style.setProperty('--charge', progress);
    onPull(pull);
  }

  function settle() {
    clearTimeout(settleTimer);
    if (touching) return;
    settleTimer = setTimeout(() => {
      reader.scrollTop = center();
      consumed = false;
      showStroke(0);
    }, GESTURE_IDLE_MS);
  }

  reader.scrollTop = center();
  reader.addEventListener('scroll', () => {
    const distance = reader.scrollTop - center();
    if (Math.abs(distance) < 1) {
      if (!consumed) showStroke(0);
      return;
    }
    showStroke(distance, consumed || Math.abs(distance) >= STEP_THRESHOLD);
    if (!consumed && Math.abs(distance) >= STEP_THRESHOLD) {
      consumed = true;
      onStep(Math.sign(distance));
    }
    settle();
  }, { passive: true });

  // Wheel momentum can keep firing when the scrollport is already at an edge.
  reader.addEventListener('wheel', () => {
    if (consumed || reader.scrollTop !== center()) settle();
  }, { capture: true, passive: true });
  reader.addEventListener('touchstart', () => {
    touching = true;
    clearTimeout(settleTimer);
  }, { passive: true });
  for (const type of ['touchend', 'touchcancel']) {
    reader.addEventListener(type, event => {
      touching = event.touches.length > 0;
      settle();
    }, { passive: true });
  }

  document.addEventListener('keydown', event => {
    if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.isComposing) return;
    const { key, target } = event;
    const editing = target.closest?.('textarea, input, select, [contenteditable]');
    const paging = key === 'PageDown' || key === 'PageUp';
    if (editing && !paging) return;
    if (key === ' ' && target.closest?.('button, a, summary')) return;
    const direction = {
      ArrowUp: -1, PageUp: -1, Home: -1,
      ArrowDown: 1, PageDown: 1, End: 1,
      ' ': event.shiftKey ? -1 : 1,
    }[key];
    if (!direction) return;
    event.preventDefault();
    if (event.repeat) return;

    // At high zoom or on short displays, allow reading the whole current pane.
    const remaining = direction > 0
      ? content.scrollHeight - content.clientHeight - content.scrollTop
      : content.scrollTop;
    if (remaining > 2 && key !== 'Home' && key !== 'End') {
      content.scrollBy({ top: direction * (key.startsWith('Arrow') ? 48 : content.clientHeight * .85), behavior: 'instant' });
      return;
    }
    reader.scrollTop = direction > 0 ? limit() : 0;
    settle();
  });
}
