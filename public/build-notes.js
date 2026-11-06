import { scopeFor } from './plan.js';

export function buildNotesFor({ plan, choices }) {
  const { later } = scopeFor(plan, choices);
  return [
    {
      title: 'Make the work visible.',
      copy: 'Start by mapping the steps and decisions your team already knows. This Customware walkthrough shows how diagrams, charts, and a live build log help people follow a change.',
      clip: { id: 'diagrams-and-build-logs', length: '1:31' },
    },
    {
      title: 'Try the change in a copy.',
      copy: 'A first piece of software gives the team something concrete to test. In this example, the Chief agent creates a copy of Rental Desk so the team can try changes before applying them to the working project.',
      clip: { id: 'test-in-a-copy', length: '1:08' },
    },
    {
      title: 'Give people the final call.',
      copy: 'Shared workflows give people and AI the same process to follow. Watch App Pilot use the app in a browser while the team decides when reviewed work is ready to merge.',
      clip: { id: 'app-pilot-and-review', length: '1:37' },
    },
    {
      title: 'One estimate, three handoffs.',
      copy: 'At Lifestyle Drywall, Jannie shapes software around the way she estimates a job. The same workflow carries the work from takeoff to a quote and then into coordination.',
      points: ['Measure the work', 'Put the quote together', 'Hand it off to the team'],
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
