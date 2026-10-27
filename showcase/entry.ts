/**
 * 雷射卡即時 3D 展示頁（單一 HTML、離線可開）。
 * 與 3D 預覽共用 foilShader 與膜材設定：整張卡印在雷射膜上，白墨（遮罩黑色）處不透光，其餘印刷透光。
 * 一個 WebGL canvas 以 scissor 分區畫出所有卡片。
 */
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { FILMS } from '../src/lib/films';
import { foilFragment, foilVertex } from '../src/three/foilShader';

interface CardData { id: string; label: string; art: string; mask?: string }
interface ShowcaseData { cards: CardData[]; back?: string; film?: string; inkClarity?: number; width?: number; height?: number; radius?: number; thickness?: number }
declare const SHOWCASE: ShowcaseData;

const D = SHOWCASE;
const W = D.width ?? 63, H = D.height ?? 88, R = D.radius ?? 3, T = D.thickness ?? 0.35;
const LIGHT = { az: -35, el: 32 };
const deg = THREE.MathUtils.degToRad;

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const i = new Image();
    i.onload = () => res(i);
    i.onerror = () => rej(new Error('圖片載入失敗'));
    i.src = src;
  });
}

/** 同 blackWhiteToAlpha：黑 = 有白墨 */
function maskCanvas(img: HTMLImageElement): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = img.naturalWidth; c.height = img.naturalHeight;
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0);
  const d = ctx.getImageData(0, 0, c.width, c.height);
  const p = d.data;
  for (let i = 0; i < p.length; i += 4) {
    const lum = 0.299 * p[i] + 0.587 * p[i + 1] + 0.114 * p[i + 2];
    const a = (p[i + 3] / 255) * (1 - lum / 255);
    const t = Math.min(1, Math.max(0, (a - 0.35) / 0.3));
    p[i] = p[i + 1] = p[i + 2] = 255;
    p[i + 3] = Math.round(t * 255);
  }
  ctx.putImageData(d, 0, 0);
  return c;
}

function roundedRect(w: number, h: number, r: number): THREE.Shape {
  const s = new THREE.Shape();
  s.moveTo(r, 0);
  s.lineTo(w - r, 0); s.quadraticCurveTo(w, 0, w, -r);
  s.lineTo(w, -(h - r)); s.quadraticCurveTo(w, -h, w - r, -h);
  s.lineTo(r, -h); s.quadraticCurveTo(0, -h, 0, -(h - r));
  s.lineTo(0, -r); s.quadraticCurveTo(0, 0, r, 0);
  s.closePath();
  return s;
}

const canvas = document.getElementById('gl') as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.setClearColor(0x000000, 0);
renderer.setScissorTest(true);
const maxAniso = renderer.capabilities.getMaxAnisotropy();
const envTex = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;

const empty = new THREE.DataTexture(new Uint8Array([0, 0, 0, 0]), 1, 1);
empty.needsUpdate = true;
const holoIdx = Math.max(0, FILMS.findIndex((f) => f.id === (D.film ?? 'holo')));
const SIZE = Math.max(W, H);
const lightPos = (() => {
  const az = deg(LIGHT.az), el = deg(LIGHT.el);
  return new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el)).multiplyScalar(SIZE * 0.85);
})();

function tex(src: TexImageSource, srgb: boolean) {
  const t = new THREE.Texture(src as HTMLImageElement);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.anisotropy = maxAniso;
  t.needsUpdate = true;
  return t;
}

function decal(print: THREE.Texture, white: THREE.Texture, substrate: number, flipX: number) {
  return new THREE.ShaderMaterial({
    vertexShader: foilVertex,
    fragmentShader: foilFragment,
    side: THREE.DoubleSide,
    uniforms: {
      uPrint: { value: print },
      uFoil: { value: empty },
      uWhite: { value: white },
      uRegion: { value: new THREE.Vector4(0, 0, W, H) },
      uLightPos: { value: lightPos.clone() },
      uLightIntensity: { value: 1 },
      uFilmColor: { value: FILMS.map((f) => new THREE.Vector3(...f.color)) },
      uFilmKind: { value: FILMS.map((f) => f.kind) },
      uFilmRough: { value: FILMS.map((f) => f.roughness) },
      uAcrylic: { value: 0 },
      uPaperGloss: { value: 0.1 },
      uSubstrate: { value: substrate },
      uInkClarity: { value: D.inkClarity ?? 0.6 },
      uFlipX: { value: flipX },
    },
  });
}

const shape = roundedRect(W, H, R);
const bodyGeo = new THREE.ExtrudeGeometry(shape, { depth: T, bevelEnabled: false, curveSegments: 12 });
const frontGeo = new THREE.ShapeGeometry(shape, 12);
const backGeo = new THREE.ShapeGeometry(shape, 12);
backGeo.rotateY(Math.PI);
backGeo.translate(W, 0, 0);
const paperMat = new THREE.MeshStandardMaterial({ color: 0xf5f3ef, roughness: 0.85 });

interface Card {
  el: HTMLElement; view: HTMLElement; scene: THREE.Scene; camera: THREE.PerspectiveCamera; outer: THREE.Group;
  rx: number; ry: number; tx: number; ty: number; flip: number; flipTo: number; hover: boolean; phase: number;
}
const cards: Card[] = [];

async function build() {
  const backTex = D.back ? tex(await loadImage(D.back), true) : null;
  const grid = document.getElementById('cards')!;
  for (const [i, c] of D.cards.entries()) {
    const el = document.createElement('figure');
    el.className = 'card';
    el.innerHTML = `<div class="view" role="button" tabindex="0" aria-label="${c.label}：點一下翻面"></div><figcaption><span>${c.label}</span><button type="button" class="flip">翻面</button></figcaption>`;
    grid.appendChild(el);
    const view = el.querySelector('.view') as HTMLElement;

    const [art, mask] = await Promise.all([loadImage(c.art), c.mask ? loadImage(c.mask) : Promise.resolve(null)]);
    const scene = new THREE.Scene();
    scene.environment = envTex;
    scene.add(new THREE.HemisphereLight(0xffffff, 0x8890a0, 0.6));
    const pl = new THREE.PointLight(0xffffff, 2.2, 0, 0);
    pl.position.copy(lightPos);
    scene.add(pl);
    const outer = new THREE.Group();
    const product = new THREE.Group();
    product.position.set(-W / 2, H / 2, 0);
    outer.add(product);
    scene.add(outer);

    const body = new THREE.Mesh(bodyGeo, paperMat);
    body.position.z = -T / 2;
    const front = new THREE.Mesh(frontGeo, decal(tex(art, true), mask ? tex(maskCanvas(mask), false) : empty, holoIdx, 0));
    front.position.z = T / 2 + 0.01;
    product.add(body, front);
    if (backTex) {
      const back = new THREE.Mesh(backGeo, decal(backTex, empty, -1, W));
      back.position.z = -T / 2 - 0.01;
      product.add(back);
    }
    const camera = new THREE.PerspectiveCamera(28, 63 / 88, 1, 5000);
    const card: Card = { el, view, scene, camera, outer, rx: 0, ry: 0, tx: 0, ty: 0, flip: 0, flipTo: 0, hover: false, phase: i * 1.7 };
    cards.push(card);
    bind(card);
  }
}

function bind(c: Card) {
  const v = c.view;
  let down: { x: number; y: number } | null = null;
  const aim = (e: PointerEvent) => {
    const r = v.getBoundingClientRect();
    const nx = ((e.clientX - r.left) / r.width) * 2 - 1;
    const ny = -(((e.clientY - r.top) / r.height) * 2 - 1);
    c.ty = deg(28) * Math.max(-1, Math.min(1, nx));
    c.tx = -deg(18) * Math.max(-1, Math.min(1, ny));
  };
  v.addEventListener('pointerenter', (e) => { c.hover = true; aim(e); });
  v.addEventListener('pointermove', (e) => { if (e.pointerType === 'mouse' || down) { c.hover = true; aim(e); } });
  v.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') c.hover = false; });
  v.addEventListener('pointerdown', (e) => {
    down = { x: e.clientX, y: e.clientY };
    c.hover = true; aim(e);
    if (e.pointerType !== 'mouse') v.setPointerCapture(e.pointerId);
  });
  const end = (e: PointerEvent, tap: boolean) => {
    if (down && tap && Math.hypot(e.clientX - down.x, e.clientY - down.y) < 10) toggle(c);
    down = null;
    if (e.pointerType !== 'mouse') c.hover = false;
  };
  v.addEventListener('pointerup', (e) => end(e, true));
  v.addEventListener('pointercancel', (e) => end(e, false));
  v.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(c); } });
  c.el.querySelector('.flip')!.addEventListener('click', () => toggle(c));
}

function toggle(c: Card, to?: number) {
  c.flipTo = to ?? (c.flipTo > 0.5 ? 0 : 1);
  c.el.classList.toggle('flipped', c.flipTo > 0.5);
  const b = c.el.querySelector('.flip')!;
  b.textContent = c.flipTo > 0.5 ? '翻回正面' : '翻面';
}

document.getElementById('flipAll')!.addEventListener('click', (e) => {
  const anyFront = cards.some((c) => c.flipTo < 0.5);
  cards.forEach((c, i) => setTimeout(() => toggle(c, anyFront ? 1 : 0), i * 90));
  (e.currentTarget as HTMLElement).textContent = anyFront ? '全部翻回正面' : '全部翻面';
});

function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  if (canvas.width !== Math.round(w * renderer.getPixelRatio()) || canvas.height !== Math.round(h * renderer.getPixelRatio())) renderer.setSize(w, h, false);
}

let last = performance.now();
function frame(now: number) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  resize();
  const vh = window.innerHeight, vw = window.innerWidth;
  renderer.setScissor(0, 0, vw, vh);
  renderer.setViewport(0, 0, vw, vh);
  renderer.clear();
  const t = now / 1000;
  for (const c of cards) {
    // 閒置時微微晃動；滑鼠／手指在卡上時朝指標傾斜
    const ix = c.hover ? c.tx : deg(5) * Math.cos(t * 0.9 + c.phase);
    const iy = c.hover ? c.ty : deg(16) * Math.sin(t * 0.7 + c.phase);
    const k = 1 - Math.exp(-dt * (c.hover ? 10 : 3));
    c.rx += (ix - c.rx) * k;
    c.ry += (iy - c.ry) * k;
    // 翻面：固定速度 + smoothstep
    const sp = dt / 0.85;
    c.flip = c.flipTo > c.flip ? Math.min(c.flipTo, c.flip + sp) : Math.max(c.flipTo, c.flip - sp);
    const f = c.flip * c.flip * (3 - 2 * c.flip);
    c.outer.rotation.set(c.rx + deg(10) * Math.sin(f * Math.PI), c.ry + f * Math.PI, 0);

    const r = c.view.getBoundingClientRect();
    if (r.bottom < 0 || r.top > vh || r.right < 0 || r.left > vw || r.width < 2) continue;
    const x = r.left, y = vh - r.bottom;
    renderer.setViewport(x, y, r.width, r.height);
    renderer.setScissor(x, y, r.width, r.height);
    const cam = c.camera;
    cam.aspect = r.width / r.height;
    const fill = 0.8;
    const half = deg(cam.fov / 2);
    const d = Math.max(H / fill / (2 * Math.tan(half)), W / fill / (2 * Math.tan(half) * cam.aspect));
    cam.position.set(0, 0, d);
    cam.near = d / 50; cam.far = d * 20;
    cam.lookAt(0, 0, 0);
    cam.updateProjectionMatrix();
    renderer.render(c.scene, cam);
  }
}

build()
  .then(() => {
    document.body.classList.add('ready');
    requestAnimationFrame(frame);
  })
  .catch((e) => {
    document.getElementById('status')!.textContent = '載入失敗：' + (e?.message ?? e);
    console.error(e);
  });
