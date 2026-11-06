import { scopeFor } from './plan.js';

export const FEATURE_WALKTHROUGHS = [
  {
    id: 'test-in-a-copy', title: 'Test a change in a copy', duration: '1:08',
    description: 'The Chief agent copies Rental Desk so the team can try changes before applying them to the working project.',
  },
  {
    id: 'open-in-review', title: 'Open the result in Review', duration: '0:33',
    description: 'Open the equipment app beside an analysis so the team can compare the source with the result.',
  },
  {
    id: 'diagrams-and-build-logs', title: 'Follow diagrams and build logs', duration: '1:31',
    description: 'See how diagrams, charts, and a live build log help a team follow a change.',
  },
  {
    id: 'app-pilot-and-review', title: 'Review App Pilot’s work', duration: '1:37',
    description: 'Watch App Pilot use an app in the browser while the team reviews its work and decides when to merge.',
  },
  {
    id: 'agents-in-the-browser', title: 'Follow agents in the browser', duration: '1:28',
    description: 'See App Pilots work in separate browsers, then review their work and inspect how pages connect.',
  },
  {
    id: 'saved-analysis', title: 'Keep the evidence with the work', duration: '1:15',
    description: 'See a saved analysis, its task discussion, and a way to ask about the same project from ChatGPT.',
  },
];

export function buildNotesFor({ plan, choices }) {
  const { later } = scopeFor(plan, choices);
  // Priority notes come first so they remain available after a quick build.
  return [
    {
      priority: true,
      label: 'CUSTOMWARE PRICING',
      title: 'Try one workflow for $0.',
      copy: 'The Customware free trial includes 20 implementation tasks.',
      plans: [
        {
          name: 'Enterprise Pilot',
          price: '$50,000 in year 1',
          detail: '250 tasks in year 1, then $2,500/month from year 2 for 100 tasks.',
        },
        {
          name: 'Continuous Improvement',
          price: '$90,000 in year 1',
          detail: '$7,500/month with 750 tasks per year.',
        },
        {
          name: 'Partner Program',
          price: 'From $250,000',
          detail: 'Starting price for Level 1. Level 2 is quoted to scope.',
        },
      ],
      link: { label: 'See full pricing and AI credits', href: 'https://customware.ai/pricing' },
    },
    {
      priority: true,
      label: 'CUSTOMWARE OWNERSHIP',
      title: 'You own the software.',
      copy: 'With a paid plan, your business owns its application, source code, and data. Bring the whole team with unlimited users and no seat fees.',
      clip: 'test-in-a-copy',
      link: { label: 'See paid plan details', href: 'https://customware.ai/pricing' },
    },
    {
      priority: true,
      label: 'CUSTOMWARE CUSTOMER STORY',
      title: 'From takeoff to handoff.',
      copy: 'At Lifestyle Drywall, Jannie’s way of measuring and estimating a job became the starting point for her Customware application.',
      points: ['Measure and estimate → Quote → Coordinate'],
      link: { label: 'Read the Lifestyle Drywall story', href: 'https://customware.ai/use-cases/lifestyle-drywall' },
    },
    {
      label: 'CUSTOMWARE IMPLEMENTATION',
      title: 'Get help with rollout.',
      copy: 'Enterprise Pilot starts with one workflow. A dedicated implementation team helps plan the work each week, connect the systems it needs, and train the people who will use it.',
      clip: 'open-in-review',
      link: { label: 'See what Enterprise Pilot includes', href: 'https://customware.ai/pricing' },
    },
    {
      label: 'CUSTOMWARE WORKFLOWS',
      title: 'Share what your team knows.',
      copy: 'Capture how people handle requests, make decisions, and spot exceptions. Customware turns those details into procedures and software that teammates can use and improve together.',
      clip: 'diagrams-and-build-logs',
      link: { label: 'See how team knowledge becomes software', href: 'https://customware.ai/why-now' },
    },
    {
      label: 'CUSTOMWARE PEOPLE AND AI',
      title: 'Give people the final call.',
      copy: 'People and AI work from the same process. Agents can help with repeatable steps while the team guides decisions, reviews results, and handles exceptions.',
      clip: 'app-pilot-and-review',
    },
    {
      label: 'CUSTOMWARE INTEGRATIONS',
      title: 'Keep the tools you rely on.',
      copy: 'Customware can connect tools through APIs or MCP where those are available. With the right access, agents can also work through existing software interfaces. Your team helps scope what each system allows.',
      clip: 'agents-in-the-browser',
      link: { label: 'Explore Customware integrations', href: 'https://customware.ai/integrations' },
    },
    {
      label: 'CUSTOMWARE WORKFLOW EXAMPLE',
      title: 'From order to invoice.',
      copy: 'A store order can enter a shared workflow, get assigned for approval, and become an invoice in accounting. The confirmation and files can then go into the team’s shared drive.',
      link: { label: 'See the example workflow', href: 'https://customware.ai/integrations' },
    },
    {
      label: 'CUSTOMWARE CONTINUOUS IMPROVEMENT',
      title: 'Improve it from real use.',
      copy: 'Try ' + plan.title + ' with someone who does the work. Look for a handoff that still needs retyping, an approval that stalls, or an exception the team handles by hand. Pick one change for the next pass.',
      points: later.slice(0, 3).map(feature => feature.title),
      clip: 'saved-analysis',
    },
  ];
}
