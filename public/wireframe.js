import * as THREE from '/vendor/three.module.js';

const paper = '#d0f64f';
const ink = '#242c13';
const chalk = '#f1f2e9';
const padWidth = 9.4;
const padDepth = 6.7;
const padTop = .11;
const places = [
  { x: .12, z: .42, width: 4.08, height: 2.56 },
  { x: -3.24, z: .72, width: 1.75, height: 2.86 },
  { x: 3.20, z: 1.02, width: 1.86, height: 2.06 },
];
const opening = [7.7, 13.2, 13.4, 0, 0];

function canvasTexture(width, height) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  return { ctx: canvas.getContext('2d'), map };
}

function stroke(ctx, points, color, width = 2) {
  ctx.beginPath();
  ctx.moveTo(...points[0]);
  for (const point of points.slice(1)) ctx.lineTo(...point);
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.stroke();
}

function drawPad(ctx, title, count) {
  ctx.fillStyle = paper;
  ctx.fillRect(0, 0, 1400, 1000);
  for (let x = 34; x < 1400; x += 38) stroke(ctx, [[x, 0], [x, 1000]], '#536a241b', 1);
  for (let y = 34; y < 1000; y += 38) stroke(ctx, [[0, y], [1400, y]], '#536a241b', 1);
  ctx.strokeStyle = '#596f2d';
  ctx.lineWidth = 2;
  ctx.strokeRect(31, 31, 1338, 938);
  ctx.fillStyle = ink;
  ctx.font = 'bold 22px monospace';
  ctx.fillText('SCROLLWORKS  /  DESIGN PAD', 63, 77);
  ctx.font = '20px monospace';
  ctx.fillText('FIG. 01', 1220, 77);

  stroke(ctx, [[65, 707], [432, 707], [476, 672], [805, 672], [842, 706], [1335, 706]], '#5b7131', 3);
  stroke(ctx, [[1150, 826], [1280, 826], [1315, 789]], '#5b7131', 3);
  ctx.strokeRect(1103, 805, 46, 46);
  ctx.strokeRect(1168, 862, 124, 62);
  ctx.font = '22px monospace';
  ctx.fillText('V1', 1208, 900);

  if (!count) {
    ctx.setLineDash([11, 9]);
    ctx.strokeRect(407, 166, 586, 389);
    ctx.strokeRect(130, 248, 212, 355);
    ctx.strokeRect(1053, 285, 222, 291);
    ctx.setLineDash([]);
    stroke(ctx, [[458, 334], [693, 334], [693, 445], [458, 445], [458, 334], [693, 445]], '#71893c');
    stroke(ctx, [[739, 342], [932, 342]], '#71893c');
    stroke(ctx, [[739, 381], [900, 381]], '#71893c');
    stroke(ctx, [[739, 421], [852, 421]], '#71893c');
    ctx.font = '21px monospace';
    ctx.fillText('SCREENS GO HERE', 451, 225);
  }

  ctx.font = 'italic bold 84px Georgia, serif';
  const rows = [''];
  for (const word of title.split(/\s+/)) {
    const last = rows.length - 1;
    const joined = rows[last] ? rows[last] + ' ' + word : word;
    if (rows[last] && rows.length === 1 && ctx.measureText(joined).width > 1000) rows.push(word);
    else rows[last] = joined;
  }
  for (const [index, row] of rows.entries()) ctx.fillText(row, 64, 817 + index * 87, 1000);
  const finalWidth = Math.min(990, ctx.measureText(rows.at(-1)).width);
  const lineY = 839 + (rows.length - 1) * 87;
  stroke(ctx, [[70, lineY], [68 + finalWidth * .56, lineY - 7], [70 + finalWidth, lineY - 3]], ink, 4);
}

function drawBlock(ctx, kind, x, y, width, height, filled) {
  const fg = filled ? '#4f6924' : '#a3bd6c';
  const muted = filled ? '#9aaa81' : '#46543a';
  const line = (x1, y1, x2, y2, color = fg) => {
    stroke(ctx, [[x + width * x1, y + height * y1], [x + width * x2, y + height * y2]], color, 3);
  };
  const tile = (tx, ty, w, h, emphasis = false) => {
    const rect = [x + width * tx, y + height * ty, width * w, height * h];
    ctx.strokeStyle = emphasis ? fg : muted;
    ctx.lineWidth = 2;
    if (filled) {
      ctx.fillStyle = emphasis ? paper : '#e5ecd4';
      ctx.fillRect(...rect);
    }
    ctx.strokeRect(...rect);
  };
  switch (kind) {
    case 'calendar':
      for (let row = 0; row < 3; row++) {
        for (let col = 0; col < 7; col++) tile(col / 7, row * .325, .12, .25, (row + col) % 6 === 3);
      }
      break;
    case 'chart':
      for (const gy of [.17, .48, .82]) line(0, gy, 1, gy, muted);
      stroke(ctx, [[x, y + height * .86], [x + width * .26, y + height * .58], [x + width * .46, y + height * .68],
        [x + width * .69, y + height * .32], [x + width * .83, y + height * .45], [x + width, y + height * .06]], fg, 4);
      break;
    case 'list':
      for (const ly of [.16, .48, .8]) {
        tile(0, ly - .09, .065, .18, true);
        line(.12, ly, .65, ly);
        line(.77, ly, .99, ly, muted);
      }
      break;
    case 'form':
      tile(0, .02, 1, .21);
      tile(0, .34, 1, .21);
      tile(0, .67, .34, .26, true);
      break;
    case 'grid':
      for (const lx of [0, .345, .69]) {
        tile(lx, .02, .30, .60, lx === 0);
        line(lx, .82, lx + .22, .82);
        if (!filled) line(lx, .02, lx + .30, .62, muted);
      }
      break;
    default:
      line(0, .16, .36, .16);
      line(0, .37, .27, .37, muted);
      tile(0, .62, .29, .24, true);
      tile(.52, .02, .48, .9);
      if (!filled) {
        line(.52, .02, 1, .92, muted);
        line(1, .02, .52, .92, muted);
      }
  }
}

function drawScreen(ctx, screen, width, height, filled) {
  const border = filled ? '#91a478' : '#66794a';
  ctx.fillStyle = filled ? '#edf1df' : '#1b2016';
  ctx.fillRect(0, 0, width, height);
  if (!filled) {
    for (let x = 25; x < width - 12; x += 34) stroke(ctx, [[x, 12], [x, height - 12]], '#303b24', 1);
    for (let y = 25; y < height - 12; y += 34) stroke(ctx, [[12, y], [width - 12, y]], '#303b24', 1);
  }
  ctx.strokeStyle = border;
  ctx.lineWidth = 6;
  ctx.strokeRect(7, 7, width - 14, height - 14);

  const side = 30;
  const head = 58;
  const content = width - side * 2;
  ctx.fillStyle = filled ? '#dce6c6' : '#252c1d';
  ctx.fillRect(11, 11, width - 22, head);
  for (let index = 0; index < 3; index++) {
    ctx.beginPath();
    ctx.arc(side + index * 17, 39, 4, 0, Math.PI * 2);
    ctx.fillStyle = index === 0 && filled ? '#73973a' : border;
    ctx.fill();
  }
  ctx.fillStyle = filled ? ink : chalk;
  ctx.font = 'bold 41px system-ui, sans-serif';
  ctx.fillText(screen.name, side, head + 56, content);
  const top = head + 85;
  const gap = 12;
  const rows = Math.max(1, screen.blocks.length);
  const row = (height - top - side - (rows - 1) * gap) / rows;
  for (const [index, block] of screen.blocks.entries()) {
    const y = top + index * (row + gap);
    if (filled) {
      ctx.fillStyle = '#f9faef';
      ctx.fillRect(side, y, content, row);
    }
    ctx.strokeStyle = border;
    ctx.lineWidth = 2;
    ctx.strokeRect(side, y, content, row);
    ctx.fillStyle = filled ? ink : chalk;
    ctx.font = '600 23px system-ui, sans-serif';
    ctx.fillText(block.label, side + 14, y + 30, content - 28);
    drawBlock(ctx, block.kind, side + 16, y + 45, content - 32, Math.max(15, row - 58), filled);
  }
}

export function mountWireframe(panel, reducedMotion) {
  const viewport = panel.querySelector('.viewport');
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
  } catch {
    return null;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(35, 1, .1, 65);
  const stage = new THREE.Group();
  scene.add(stage);
  const pad = canvasTexture(1400, 1000);
  const face = new THREE.MeshBasicMaterial({ map: pad.map });
  const edge = new THREE.MeshBasicMaterial({ color: '#789632' });
  const bottom = new THREE.MeshBasicMaterial({ color: '#5d752c' });
  stage.add(new THREE.Mesh(new THREE.BoxGeometry(padWidth, padTop * 2, padDepth), [edge, edge, face, bottom, edge, edge]));
  const pieces = new THREE.Group();
  stage.add(pieces);

  let screens = [];
  let title = '';
  let signature = '';
  let view = [0, ...opening, 0];
  let destination = view;
  let pull = 0;
  let frame = 0;
  let lastWidth = 0;
  let lastHeight = 0;
  let lastFov = 0;
  let lost = false;

  function device(screen, index) {
    const { x, z, width, height } = places[index];
    const pivot = new THREE.Group();
    pivot.position.set(x, padTop + .015, z);
    pieces.add(pivot);
    const cast = new THREE.Mesh(new THREE.PlaneGeometry(width, height), new THREE.MeshBasicMaterial({
      color: '#303b19', transparent: true, depthWrite: false,
    }));
    cast.rotation.x = -Math.PI / 2;
    cast.position.set(x + .15, padTop + .008, z - .27);
    pieces.add(cast);

    const pixels = width > 2 ? 768 : 480;
    const tall = Math.round(pixels * height / width);
    const mock = canvasTexture(pixels, tall);
    const sketch = canvasTexture(pixels, tall);
    drawScreen(sketch.ctx, screen, pixels, tall, false);
    drawScreen(mock.ctx, screen, pixels, tall, true);
    const body = new THREE.Mesh(new THREE.BoxGeometry(width + .035, height + .035, .085),
      new THREE.MeshBasicMaterial({ color: '#21261b' }));
    body.position.set(0, height / 2, -.029);
    pivot.add(body);
    const draft = new THREE.Mesh(new THREE.PlaneGeometry(width, height), new THREE.MeshBasicMaterial({ map: sketch.map }));
    draft.position.set(0, height / 2, .019);
    pivot.add(draft);
    const finished = new THREE.Mesh(new THREE.PlaneGeometry(width, height), new THREE.MeshBasicMaterial({ map: mock.map }));
    finished.position.set(0, height / 2, .022);
    pivot.add(finished);
    return { pivot, body, cast, finished, draft, height };
  }

  function render() {
    const { clientWidth: width, clientHeight: height } = viewport;
    if (lost || !width || !height) return;
    const [open, x, y, z, lookX, lookY, fill] = view;
    for (const [index, { pivot, body, cast, finished, draft, height }] of screens.entries()) {
      const raised = THREE.MathUtils.smoothstep(open - index, 0, 1);
      pivot.rotation.x = -Math.PI / 2 + raised * (Math.PI / 2 - .09);
      body.visible = raised > .08;
      cast.material.opacity = raised * .24;
      cast.scale.set(1, .28 + raised * .18, 1);
      const delay = index * .075;
      const filled = raised * THREE.MathUtils.clamp((fill - delay) / (1 - delay), 0, 1);
      // Crop the surface and its texture together so the filled area never stretches.
      finished.scale.y = filled;
      finished.position.y = height * (1 - filled / 2);
      finished.material.map.repeat.y = filled;
      finished.material.map.offset.y = 1 - filled;
      finished.visible = filled > 0;
      draft.visible = filled < 1;
    }
    stage.rotation.y = pull * -.085;
    stage.rotation.z = pull * -.026;
    camera.position.set(x - pull * .55, y - pull * .35, z);
    camera.lookAt(lookX, lookY + pull * .1, -.12);
    const aspect = width / height;
    const fit = Math.max(.87, (1.06 + .14 * Math.min(1, open)) / aspect);
    const fov = THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(35) / 2) * fit));
    if (width !== lastWidth || height !== lastHeight || fov !== lastFov) {
      camera.aspect = aspect;
      camera.fov = fov;
      camera.updateProjectionMatrix();
      lastFov = fov;
    }
    if (width !== lastWidth || height !== lastHeight) {
      renderer.setSize(width, height, false);
      lastWidth = width;
      lastHeight = height;
    }
    renderer.render(scene, camera);
  }

  function setSketch(nextTitle, plan) {
    const nextSignature = JSON.stringify(plan);
    if (nextSignature !== signature) {
      pieces.traverse(object => {
        object.geometry?.dispose();
        object.material?.map?.dispose();
        object.material?.dispose();
      });
      pieces.clear();
      screens = plan.slice(0, places.length).map(device);
      signature = nextSignature;
    } else if (title === nextTitle) {
      return;
    }
    title = nextTitle;
    drawPad(pad.ctx, title, screens.length);
    pad.map.needsUpdate = true;
    render();
  }

  function setView(open, focus, event = 0, fill = 0) {
    const drift = Math.sin(event * .83) * .9;
    const spot = places[focus];
    const target = spot
      ? [open, spot.x * .75 + 2.6, 7.0 + focus * .32, 15.2, spot.x * .08, .90]
      : open ? [open, 4.0 + drift, 8.7, 15.1, 0, .76]
        : event ? [0, 6.0 + drift, 12.0, 14.5, 0, 0]
          : [0, ...opening];
    target.push(fill);
    if (target.every((value, index) => value === destination[index])) return;
    destination = target;
    cancelAnimationFrame(frame);
    if (reducedMotion.matches) {
      view = target;
      render();
      return;
    }
    const origin = view;
    const start = performance.now();
    function animate(now) {
      const fraction = Math.min(1, (now - start) / 800);
      const eased = fraction * fraction * (3 - 2 * fraction);
      view = origin.map((value, index) => THREE.MathUtils.lerp(value, target[index], eased));
      render();
      if (fraction < 1) frame = requestAnimationFrame(animate);
    }
    frame = requestAnimationFrame(animate);
  }

  viewport.append(renderer.domElement);
  panel.classList.add('has-webgl');
  new ResizeObserver(render).observe(viewport);
  renderer.domElement.addEventListener('webglcontextlost', event => {
    event.preventDefault();
    lost = true;
    panel.classList.remove('has-webgl');
  });
  renderer.domElement.addEventListener('webglcontextrestored', () => {
    lost = false;
    panel.classList.add('has-webgl');
    render();
  });
  return {
    setSketch,
    setView,
    setPull(next) {
      if (pull === next) return;
      pull = next;
      render();
    },
  };
}
