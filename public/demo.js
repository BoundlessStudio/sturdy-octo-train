const escape = value => String(value).replace(/[&<>"']/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[character]);

const themes = {
  landing: { label: 'PROJECT SHOWCASE', headline: 'Made with intention.', items: ['Featured work', 'In the studio', 'What’s next'], color: '#9f4e35', paper: '#f8efe7' },
  catalog: { label: 'THE COLLECTION', headline: 'Find your next favorite.', items: ['Everyday pick', 'Small-space pick', 'Weekend pick'], color: '#316454', paper: '#edf4ea' },
  dashboard: { label: 'YOUR WORKSPACE', headline: 'A little progress, every day.', items: ['Today’s focus', 'Weekly activity', 'Up next'], color: '#4e529c', paper: '#f2f0fb' },
};

function contentFor(feature, theme) {
  const names = theme.items.map(escape);
  switch (feature.icon) {
    case 'grid':
      return '<div class="items">' + names.map((name, index) =>
        '<article><div class="swatch swatch-' + index + '" aria-hidden="true"></div><h3>' + name + '</h3></article>'
      ).join('') + '</div>';
    case 'help':
      return '<details><summary>What can I do here?</summary><p>Use the sections on this page to explore the first version.</p></details>'
        + '<details><summary>Where do I start?</summary><p>Pick one of the links at the top to jump to its section.</p></details>';
    case 'check':
    case 'heart':
      return names.map(name => '<label class="check"><input type="checkbox"> ' + name + '</label>').join('');
    case 'chart':
      return '<div class="chart" aria-label="Example activity from Monday to Sunday">'
        + [2, 4, 3, 6, 5, 7, 6].map((height, index) =>
          '<div><meter min="0" max="7" value="' + height + '"></meter><span>' + ['M', 'T', 'W', 'T', 'F', 'S', 'S'][index] + '</span></div>').join('')
        + '</div>';
    case 'calendar':
      return '<details><summary>See an example time</summary><p>Saturday, 10:00 am. This is a sample listing.</p></details>';
    case 'search':
      return names.map(name => '<details><summary>' + name + '</summary><p>Example collection item</p></details>').join('');
    case 'mail':
    case 'message':
      return '<p>Add your contact details here when you edit the downloaded page.</p>';
    default:
      return '<p>Use this space to share practical details with your visitors.</p>';
  }
}

export function makeDemo(idea, plan, scope, { starter = false } = {}) {
  const theme = themes[plan.layout];
  const title = escape(plan.title);
  const navigation = scope.keep.map(feature =>
    '<a href="#' + feature.id + '">' + escape(feature.title) + '</a>'
  ).join('');
  const sections = scope.keep.map(feature =>
    '<section id="' + feature.id + '"><p class="label">IN THIS BUILD</p><h2>' + escape(feature.title)
    + '</h2><p>' + escape(feature.detail) + '</p>' + contentFor(feature, theme) + '</section>'
  ).join('');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<style>
  :root{color-scheme:light;--paper:${theme.paper};--ink:#242629;--brand:${theme.color};--line:#24262933}
  *{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;background:var(--paper);color:var(--ink);font:16px/1.55 system-ui,sans-serif}
  header,main,footer{width:min(100% - 36px,940px);margin:auto}header{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:8px;padding:17px 0;border-bottom:1px solid var(--line)}
  header strong{font-size:1.1rem}nav{display:flex;flex-wrap:wrap;gap:12px}a{color:var(--brand);text-underline-offset:3px}
  .intro{position:relative;isolation:isolate;overflow:hidden;padding:clamp(25px,7vw,78px);margin:18px 0;background:#fff8;border:1px solid var(--line);border-radius:14px}
  .intro:after{content:"";position:absolute;z-index:-1;right:-6rem;bottom:-12rem;width:24rem;aspect-ratio:1;border-radius:50%;background:repeating-radial-gradient(circle,var(--brand) 0 1px,transparent 1px 17px);opacity:.23}
  .label{color:var(--brand);font:700 .72rem ui-monospace,monospace;letter-spacing:.12em;margin:0 0 .6rem}
  h1{margin:0 0 12px;line-height:.98;font-size:clamp(2.2rem,8vw,5rem);letter-spacing:-.08em;overflow-wrap:anywhere}
  h2,h3,p{margin:0 0 8px}h2{font-size:clamp(1.35rem,4vw,2.2rem);line-height:1.1;letter-spacing:-.04em}
  section:not(.intro){margin:12px 0;padding:21px 24px;border:1px solid var(--line);border-radius:12px;background:#fffa}
  .brief{max-width:55ch}footer{padding:15px 0 24px;color:#555;font-size:.8rem}
  .items{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin-top:13px}.items article{border:1px solid var(--line);border-radius:6px;overflow:hidden}
  .items h3{margin:8px;font-size:.95rem}.swatch{height:74px;background:linear-gradient(125deg,var(--brand),transparent)}.swatch-1{background:repeating-linear-gradient(135deg,var(--paper) 0 7px,#ffffff 7px 12px)}.swatch-2{background:radial-gradient(ellipse at bottom,var(--brand),transparent)}
  details,.check{display:block;border-top:1px solid var(--line);padding:8px 0}summary,.check{cursor:pointer}details p{margin:.45rem 0 0}input{accent-color:var(--brand)}
  .chart{display:flex;flex-wrap:wrap;gap:12px;margin-top:14px}.chart div{display:grid;gap:4px;text-align:center}.chart meter{width:45px}
  @media(max-width:420px){.items{grid-template-columns:1fr}.swatch{height:54px}}
  @media(prefers-reduced-motion:reduce){html{scroll-behavior:auto}}
</style>
</head>
<body>
<header><strong>${title}</strong><nav aria-label="Page sections">${navigation}</nav></header>
<main>
  <section class="intro"><p class="label">${theme.label}</p><h1>${starter ? title : theme.headline}</h1><p class="brief">${escape(idea)}</p></section>
  ${sections}
</main>
<footer>${starter ? 'Starter preview by Scrollworks' : 'Demo prototype created with Scrollworks'}</footer>
</body>
</html>`;
}
