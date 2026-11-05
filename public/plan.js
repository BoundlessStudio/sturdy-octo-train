export const MAX_IDEA = 500;
export const DECISIONS = ['keep', 'later', 'never'];

export const EXAMPLES = [
  { label: 'Studio portfolio', idea: 'A portfolio for a ceramics studio called Kiln & Kind, with a gallery and workshop bookings.' },
  { label: 'Plant shop', idea: 'A plant shop called Fern Supply, with a catalog for low-light plants and simple care guides.' },
  { label: 'Habit tracker', idea: 'A habit tracker called Daily Loop, with a weekly dashboard and a place to check off habits.' },
];

const presets = {
  landing: {
    surfaces: ['Home', 'Showcase', 'Contact'],
    features: [
      ['grid', 'Gallery', 'Give projects, photos, or examples a dedicated space.'],
      ['calendar', 'Booking', 'Let visitors see what they can book and how to get started.'],
      ['message', 'Contact section', 'Make it easy for people to ask a question or get in touch.'],
      ['spark', 'About section', 'Introduce the people and purpose behind the site.'],
      ['mail', 'Newsletter', 'Invite visitors to hear about future updates.'],
      ['help', 'FAQ', 'Answer practical questions before visitors need to ask.'],
    ],
  },
  catalog: {
    surfaces: ['Shop', 'Collection', 'Product detail'],
    features: [
      ['grid', 'Product catalog', 'Give visitors a browsable collection with clear product details.'],
      ['search', 'Category filters', 'Help shoppers narrow the collection by what matters to them.'],
      ['heart', 'Shortlist', 'Let shoppers mark items they want to come back to.'],
      ['spark', 'Buying guide', 'Explain how to choose the right item for their needs.'],
      ['mail', 'Restock updates', 'Give visitors a place to express interest in upcoming stock.'],
      ['help', 'FAQ', 'Answer questions about products, care, or delivery.'],
    ],
  },
  dashboard: {
    surfaces: ['Overview', 'Activity', 'Details'],
    features: [
      ['grid', 'Overview cards', 'Put the most important information up front.'],
      ['check', 'Checklist', 'Give people a clear way to record what they finish.'],
      ['chart', 'Weekly progress', 'Make recent activity and patterns easy to see.'],
      ['calendar', 'Calendar view', 'Organize activity by date and help users plan ahead.'],
      ['heart', 'Pinned items', 'Keep the things users return to close at hand.'],
      ['help', 'Getting started', 'Give first-time visitors a few clear steps to follow.'],
    ],
  },
};

export function draftPlan(idea) {
  const named = /\b(?:called|named)\s+["“]?(.+?)(?=["”.,!?]|\s+with\b|\s+that\b|\s+for\b|$)/iu.exec(idea)?.[1];
  const subject = idea.replace(/^(?:build|create|make|design)\s+(?:me\s+)?/i, '')
    .replace(/^(?:a|an|the)\s+/i, '').split(/[.!?]|\bwith\b/i)[0].trim();
  const title = (named?.trim() || subject || 'New build').slice(0, 48);
  const layout = /\b(dashboard|track(?:er|ing)?|planner|habit|monitor)\b/i.test(idea) ? 'dashboard'
    : /\b(shop|store|catalog|products|ecommerce|marketplace)\b/i.test(idea) ? 'catalog' : 'landing';
  const preset = presets[layout];

  return {
    title: title.charAt(0).toUpperCase() + title.slice(1),
    layout,
    surfaces: preset.surfaces,
    features: preset.features.map(([icon, title, detail], index) => ({ id: 'f' + (index + 1), icon, title, detail })),
  };
}

export function parseAgentPlan(output, idea) {
  const fallback = draftPlan(idea);
  const raw = String(output ?? '').trim();
  const first = raw.indexOf('{');
  const last = raw.lastIndexOf('}');
  if (first === -1 || last < first) return fallback;
  try {
    const data = JSON.parse(raw.slice(first, last + 1));
    const clean = (value, limit) => typeof value === 'string' ? value.trim().slice(0, limit) : '';
    const features = (Array.isArray(data.features) ? data.features : []).slice(0, 6)
      .map((feature, index) => ({
        id: 'f' + (index + 1),
        icon: fallback.features[index].icon,
        title: clean(feature?.title, 38),
        detail: clean(feature?.detail, 105),
      })).filter(feature => feature.title && feature.detail);
    const surfaces = (Array.isArray(data.surfaces) ? data.surfaces : []).slice(0, 3)
      .map(surface => clean(surface, 24)).filter(Boolean);
    const layout = Object.hasOwn(presets, data.layout) ? data.layout : fallback.layout;
    return {
      title: clean(data.title, 48) || fallback.title,
      layout,
      surfaces: surfaces.length >= 2 ? surfaces : presets[layout].surfaces,
      features: features.length >= 3 ? features : fallback.features,
    };
  } catch {
    return fallback;
  }
}

export function scopeFor(plan, choices) {
  const scope = { keep: [], later: [], never: [] };
  for (const feature of plan.features) {
    const selected = choices?.[feature.id];
    scope[DECISIONS.includes(selected) ? selected : 'later'].push(feature);
  }
  return scope;
}
