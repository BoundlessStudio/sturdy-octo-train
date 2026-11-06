import { scopeFor } from './plan.js';

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
      copy: 'With a paid plan, your business owns its application, source code, and data. Bring the whole team with unlimited users and no seat fees. Customware helps you scope connections to the tools you use.',
      clip: { id: 'test-in-a-copy', title: 'Test a change in a copy', length: '1:08' },
      link: { label: 'Explore Customware integrations', href: 'https://customware.ai/integrations' },
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
      title: 'Make the work visible.',
      copy: 'Start by mapping the steps and decisions your team already knows. This Customware walkthrough shows how diagrams, charts, and a live build log help people follow a change.',
      clip: { id: 'diagrams-and-build-logs', length: '1:31' },
    },
    {
      title: 'Give people the final call.',
      copy: 'Shared workflows give people and AI the same process to follow. Watch App Pilot use the app in a browser while the team decides when reviewed work is ready to merge.',
      clip: { id: 'app-pilot-and-review', length: '1:37' },
    },
    {
      title: 'Follow agents as they work.',
      copy: 'See several App Pilots use separate browsers, then review the work, hand it back, and see how the app’s pages connect in a flowchart.',
      clip: { id: 'agents-in-the-browser', length: '1:28' },
    },
    {
      title: 'Open the result in Review.',
      copy: 'A chart can raise a useful next question. This Rental Desk example opens the equipment app beside the analysis so the team can review the source and the result together.',
      clip: { id: 'open-in-review', length: '0:33' },
    },
    {
      title: 'Keep the evidence with the work.',
      copy: 'See how an analyst saves a chart and how a task keeps its discussion. The walkthrough also shows a way to ask about the same project from ChatGPT.',
      clip: { id: 'saved-analysis', length: '1:15' },
    },
    {
      title: 'Keep the systems you rely on.',
      copy: 'Choose the workflow you want to improve and decide which tools need to share data. In an implementation, the connections depend on each tool’s API and the permissions your team can grant.',
    },
    {
      title: 'Let the team shape the next pass.',
      copy: 'Try the first version of ' + plan.title + ' with someone who does the work. Ask where they hesitated and which exception the next version should handle.',
      points: later.slice(0, 3).map(feature => feature.title),
    },
  ];
}
