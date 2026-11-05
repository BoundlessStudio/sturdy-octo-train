import * as THREE from '/vendor/three.module.js';

const ink = '#c2aaff';
const soft = '#9280c7';
const mint = '#8be7ca';

export function mountWireframe(panel, layout, progress) {
  const viewport = panel.querySelector('.viewport');
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
  } catch {
    return null;
  }

  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  viewport.append(renderer.domElement);
  panel.classList.add('has-webgl');
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-5, 5, 3.4, -3.4, 0.1, 50);
  const deck = new THREE.Group();
  scene.add(deck);
  let fades = [];
  let screens = [];
  let planSignature = '';
  let spread = 0;
  let lastWidth = 0;
  let lastHeight = 0;

  function box(parent, x, y, width, height, options = {}) {
    const { fill, edge, z = 0, layer = 0, alpha = 1 } = options;
    if (fill) {
      const material = new THREE.MeshBasicMaterial({
        color: fill,
        opacity: alpha,
        transparent: layer > 0 || alpha < 1,
        depthWrite: layer === 0,
      });
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height), material);
      mesh.position.set(x, y, z);
      if (layer) mesh.renderOrder = layer * 10 + z * 100;
      parent.add(mesh);
      if (layer) fades.push({ material, layer, alpha, floor: 0 });
    }
    if (edge) {
      line(parent, x, y, [
        [-width / 2, -height / 2], [width / 2, -height / 2],
        [width / 2, height / 2], [-width / 2, height / 2], [-width / 2, -height / 2],
      ], edge, z + .003, layer, alpha);
    }
  }

  function line(parent, x, y, points, color, z = .01, layer = 0, alpha = 1) {
    const geometry = new THREE.BufferGeometry().setFromPoints(points.map(([px, py]) => new THREE.Vector3(px, py, 0)));
    const material = new THREE.LineBasicMaterial({ color, opacity: alpha, transparent: alpha < 1 || layer > 0, depthWrite: false });
    const stroke = new THREE.Line(geometry, material);
    stroke.position.set(x, y, z);
    if (layer) stroke.renderOrder = layer * 10 + z * 100;
    parent.add(stroke);
    if (layer) fades.push({ material, layer, alpha, floor: .23 });
  }

  function bar(parent, left, y, width, color, layer = 1, height = .045) {
    box(parent, left + width / 2, y, width, height, { fill: color, layer, z: .045 });
  }

  function makeLayer(x, y, z, tint) {
    const page = new THREE.Group();
    page.position.set(x, y, z);
    deck.add(page);
    box(page, 0, 0, 7, 4.42, { fill: tint, edge: soft, z: -.01 });
    box(page, 0, 0, 6.83, 4.25, { edge: '#554c80', alpha: .58 });
    line(page, 0, 1.73, [[-3.48, 0], [3.48, 0]], '#8373bb', .012, 0, .78);
    for (let i = 0; i < 3; i++) {
      const dot = new THREE.Mesh(new THREE.CircleGeometry(.045, 12), new THREE.MeshBasicMaterial({
        color: [ink, soft, '#61558d'][i],
      }));
      dot.position.set(-3.16 + i * .18, 1.98, .02);
      page.add(dot);
    }
    box(page, 0, 1.97, 2.8, .16, { fill: '#292143', edge: '#5d4e89', z: .02 });
    return page;
  }

  function picture(parent, x, y, width, height) {
    box(parent, x, y, width, height, { fill: '#32254e', edge: '#aa91e5', layer: 1, z: .026 });
    const half = width / 2;
    for (let i = 0; i < 7; i++) {
      const tick = -half + width * (i + 1) / 8;
      line(parent, x + tick, y, [[0, -height / 2], [0, height / 2]], '#8a70bf', .031, 2, .28);
    }
    for (let i = 1; i < 4; i++) {
      const tick = -height / 2 + height * i / 4;
      line(parent, x, y + tick, [[-half, 0], [half, 0]], '#8a70bf', .031, 2, .28);
    }
    line(parent, x, y, [[-.42 * width, -.32 * height], [-.15 * width, .16 * height], [.02 * width, -.08 * height],
      [.18 * width, .28 * height], [.4 * width, -.32 * height]], ink, .042, 2, .95);
    const circle = Array.from({ length: 21 }, (_, i) => {
      const angle = Math.PI * i / 10;
      return [Math.cos(angle) * .096, Math.sin(angle) * .096];
    });
    line(parent, x - .22 * width, y + .23 * height, circle, mint, .042, 2, .95);
  }

  function tile(parent, x, y, width, height, detail = true) {
    box(parent, x, y, width, height, { fill: '#23203b', edge: '#8271b5', layer: 1, z: .02 });
    const left = x - width / 2 + .14;
    if (detail) {
      box(parent, left + .085, y + height / 2 - .19, .17, .17, { fill: '#7563ab', edge: ink, layer: 2, z: .04 });
      bar(parent, left, y - .04, width * .62, '#b4a0e8', 2);
      bar(parent, left, y - .20, width * .42, '#7e70a9', 2, .03);
    }
  }

  function landing(page) {
    box(page, -1.63, .73, 3.08, 1.45, { edge: '#62558e', layer: 1, z: .027, alpha: .77 });
    bar(page, -3, 1.16, .78, mint, 2, .035);
    bar(page, -3, .87, 2.42, '#e6d8ff', 1, .105);
    bar(page, -3, .62, 1.75, ink, 1, .095);
    bar(page, -3, .38, 2.03, soft, 2, .042);
    box(page, -2.58, .115, .84, .18, { fill: '#9b85df', edge: '#bca7f5', layer: 2, z: .046 });
    picture(page, 1.61, .73, 3.14, 1.45);
    bar(page, -3.16, -.36, 1.34, '#cbb7f8', 2);
    for (let i = 0; i < 3; i++) tile(page, -2.16 + i * 2.16, -1.17, 1.99, 1.08);
  }

  function catalog(page) {
    bar(page, -3.18, 1.29, 2.26, '#e6d8ff', 1, .10);
    bar(page, -3.18, 1.04, 1.62, soft, 2);
    for (let i = 0; i < 4; i++) {
      box(page, -2.83 + i * .82, .66, .7, .23, { fill: '#3b315d', edge: '#9b86d3', layer: 2, z: .026 });
    }
    for (let i = 0; i < 3; i++) {
      const x = -2.16 + i * 2.16;
      tile(page, x, -.67, 1.99, 1.87, false);
      picture(page, x, -.39, 1.69, 1.06);
      bar(page, x - .84, -1.08, 1.23, ink, 2, .06);
      bar(page, x - .84, -1.3, .49, mint, 2);
    }
  }

  function dashboard(page) {
    box(page, -2.57, -.14, 1.27, 3.13, { fill: '#241f3d', edge: '#8373bb', layer: 1, z: .024 });
    for (let i = 0; i < 5; i++) bar(page, -3.04, 1.13 - i * .37, i % 2 ? .60 : .83, i ? soft : mint, 2);
    bar(page, -1.68, 1.22, 1.8, '#e6d8ff', 1, .10);
    for (let i = 0; i < 3; i++) tile(page, -.97 + i * 1.73, .39, 1.52, .86);
    box(page, .74, -.98, 4.95, 1.47, { fill: '#292344', edge: '#9b86d3', layer: 1, z: .025 });
    const points = [[-2, -.34], [-1.35, -.04], [-.69, -.14], [-.12, .16], [.52, .05], [1.23, .36], [1.97, .48]];
    for (let i = 0; i < 3; i++) {
      line(page, .74, -1.39 + i * .34, [[-2.19, 0], [2.19, 0]], '#5a4a83', .032, 2);
    }
    line(page, .74, -1.02, points, mint, .04, 2);
  }

  function drawLabel(parent, value, left, y, width) {
    const canvas = document.createElement('canvas');
    canvas.width = 400;
    canvas.height = 48;
    const context = canvas.getContext('2d');
    if (!context) return;
    context.font = '600 28px monospace';
    context.fillStyle = '#e1d4ff';
    context.textBaseline = 'middle';
    context.fillText(value, 2, 24, 396);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    const material = new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, width * 48 / 400), material);
    mesh.position.set(left + width / 2, y, .075);
    mesh.renderOrder = 30;
    parent.add(mesh);
    fades.push({ material, layer: 2, alpha: 1, floor: 0 });
  }

  function plannedBlock(page, block, x, y, width, height) {
    const area = (px, py, w, h, tint = '#483765', edge = soft) => box(
      page, x + px * width, y + py * height, width * w, height * h,
      { fill: tint, edge, z: .039, layer: 2 },
    );
    box(page, x, y, width, height, { fill: '#27203e', edge: soft, z: .025, layer: 1 });
    drawLabel(page, block.label, x - width * .44, y + height * .33, Math.min(width * .88, 2.15));
    switch (block.kind) {
      case 'grid':
        for (const px of [-.28, 0, .28]) {
          area(px, -.085, .236, .41);
          area(px - .026, -.35, .14, .028, ink);
        }
        break;
      case 'list':
        for (const py of [.10, -.11, -.32]) {
          area(-.36, py, .065, .09, mint);
          area(-.025, py, .49, .033, ink);
          area(.355, py, .10, .026, soft);
        }
        break;
      case 'chart': {
        const points = [[-.42, -.31], [-.27, -.13], [-.12, -.19], [.06, .08], [.21, -.02], [.39, .15]];
        for (const py of [-.31, -.12, .07]) {
          line(page, x, y + py * height, [[-.43 * width, 0], [.43 * width, 0]], soft, .042, 2, .55);
        }
        line(page, x, y, points.map(([px, py]) => [px * width, py * height]), mint, .052, 2);
        break;
      }
      case 'form':
        area(0, .09, .83, .12);
        area(0, -.12, .83, .12);
        area(-.255, -.32, .32, .11, '#8872c6', ink);
        break;
      case 'calendar':
        for (let row = 0; row < 3; row++) {
          for (let col = 0; col < 7; col++) {
            const accent = (row + col) % 5 === 2;
            area((col - 3) * .117, .11 - row * .19, .098, .135, accent ? '#476d6c' : '#42325e', accent ? mint : soft);
          }
        }
        break;
      default:
        area(.218, -.115, .41, .49, '#493861');
        area(-.25, .055, .35, .075, ink);
        area(-.28, -.11, .29, .037, soft);
        area(-.325, -.30, .21, .085, block.kind === 'hero' ? '#8872c6' : '#476d6c');
        break;
    }
  }

  function plannedScreen(page, screen) {
    drawLabel(page, screen.name, .78, 1.97, 2);
    const [primary, second, third] = screen.blocks;
    if (!primary) return;
    plannedBlock(page, primary, 0, second ? .70 : -.05, 6.37, second ? 1.62 : 3.12);
    if (second) plannedBlock(page, second, third ? -1.63 : 0, -1.02, third ? 3.11 : 6.37, 1.49);
    if (third) plannedBlock(page, third, 1.63, -1.02, 3.11, 1.49);
  }

  function rebuild(nextLayout, planned = []) {
    deck.traverse(object => {
      object.geometry?.dispose();
      object.material?.map?.dispose();
      object.material?.dispose();
    });
    deck.clear();
    fades = [];
    screens = ['#18172a', '#2f2449', '#241b39'].slice(0, planned.length || 3)
      .map((tint, index) => makeLayer(index * .27, index * -.27, index * -.48, tint));
    if (planned.length) {
      screens.forEach((page, index) => plannedScreen(page, planned[index]));
      panel.dataset.layout = nextLayout;
      return;
    }
    const [front] = screens;
    box(front, 0, -.18, 6.56, 3.55, { edge: '#574973', z: .018, alpha: .78 });
    ({ landing, catalog, dashboard }[nextLayout] || landing)(front);
    panel.dataset.layout = nextLayout;
  }

  function render() {
    const width = viewport.clientWidth;
    const height = viewport.clientHeight;
    if (!width || !height) return;
    const aspect = width / height;
    const span = Math.max(5.9 + .55 * spread, (8.85 + .6 * spread) / aspect);
    camera.left = -span * aspect / 2;
    camera.right = span * aspect / 2;
    camera.top = span / 2;
    camera.bottom = -span / 2;
    camera.updateProjectionMatrix();
    if (width !== lastWidth || height !== lastHeight) {
      renderer.setSize(width, height, false);
      lastWidth = width;
      lastHeight = height;
    }
    renderer.render(scene, camera);
  }

  function setProgress(next) {
    progress = next;
    spread = 1 - THREE.MathUtils.smoothstep(next, .02, .91);
    screens[0].position.set(-.38 * spread, .25 * spread, .38 * spread);
    screens[1]?.position.set(.27 + .29 * spread, -.27 - .18 * spread, -.48 - .66 * spread);
    screens[2]?.position.set(.53 + .55 * spread, -.54 - .25 * spread, -.95 - 1.26 * spread);
    deck.rotation.set(-.09 * spread, -.12 * spread, .105 * spread);
    deck.scale.setScalar(1 - .075 * spread);
    for (const { material, layer, alpha, floor } of fades) {
      const start = layer === 1 ? .11 : .48;
      const step = THREE.MathUtils.smoothstep(next, start, start + .36);
      material.opacity = alpha * (floor + (1 - floor) * step);
      material.visible = material.opacity > .001;
    }
    camera.position.set(4.48 + 3.25 * spread, 3.87 + 1.75 * spread, 12.2);
    camera.lookAt(.13 + .18 * spread, -.19 - .04 * spread, -.37 - .31 * spread);
    render();
  }

  rebuild(layout);
  setProgress(progress);
  const resize = new ResizeObserver(render);
  resize.observe(viewport);
  renderer.domElement.addEventListener('webglcontextlost', () => panel.classList.remove('has-webgl'));
  renderer.domElement.addEventListener('webglcontextrestored', () => {
    panel.classList.add('has-webgl');
    render();
  });
  return {
    setProgress,
    setPlan(nextLayout, planned) {
      const signature = JSON.stringify([nextLayout, planned]);
      if (signature === planSignature) return;
      planSignature = signature;
      rebuild(nextLayout, planned);
      setProgress(progress);
    },
  };
}
