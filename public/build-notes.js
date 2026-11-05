import { scopeFor, screensFor } from './plan.js';

const blockNotes = {
  hero: 'Make the purpose clear at a glance.',
  grid: 'Give visitors choices they can scan and compare.',
  list: 'Keep the most useful details easy to spot.',
  chart: 'Put the key trend in view first.',
  form: 'Show what to enter and what happens next.',
  calendar: 'Make dates and availability easy to find.',
  detail: 'Answer the questions people have before they act.',
};

export function buildNotesFor({ idea, plan, choices, live }) {
  const screens = screensFor(plan, idea);
  const { keep, later } = scopeFor(plan, choices);
  const pages = [
    {
      title: 'A first visit.',
      copy: 'Imagine opening ' + plan.title + ' for the first time. What would you want to see, and where would you go next?',
      points: screens.map(screen => screen.name),
    },
    ...screens.map((screen, focus) => ({
      title: screen.name,
      copy: 'A closer look at what the sketch sets out for this screen.',
      points: screen.blocks.map(block => block.label + ' · ' + (blockNotes[block.kind] || blockNotes.detail)),
      focus,
    })),
    {
      title: 'Try the main action.',
      copy: keep.length
        ? 'When the preview opens, try one of the features you kept from start to finish. Look for a clear next step and a visible result.'
        : 'Your first version starts with the basic site. Open it and see whether the main message and navigation are clear.',
      points: keep.slice(0, 3).map(feature => feature.title),
    },
    {
      title: 'Look at the small screen.',
      copy: 'On a phone, check that you can read the text without zooming and reach the main action without hunting for it.',
    },
    {
      title: live ? 'Inside the sandbox.' : 'How the demo comes together.',
      copy: live
        ? 'The builder saves the generated page in a folder for this idea. Scrollworks checks that it can serve the page before opening the private preview.'
        : 'Scrollworks assembles the demo in your browser and checks that it has a page to open. The last scroll brings it into the preview.',
    },
  ];
  if (later.length) pages.push({
    title: 'Save a second pass.',
    copy: 'Try the first version before deciding which of these ideas to bring back.',
    points: later.slice(0, 3).map(feature => feature.title),
  });
  return pages;
}
