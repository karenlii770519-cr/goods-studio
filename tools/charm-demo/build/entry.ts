// 壓克力吊飾 3D 預覽（獨立單檔）：上片（磁鐵吸在牆上、固定）＋開口圈＋下片（鐘擺擺動）。
// 沿用 goods-studio viewer 的設定（RoomEnvironment + PMREM、NeutralToneMapping、壓克力參數），改用 transmission 做 3mm 透明厚度。
// 上片與下片走同一套輸入（art / white / cut），上片沒給圖時用預設圓角片＋白墨底。
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

type PieceSpec = {
  outer: [number, number][];               // 刀模外框，mm，設計稿座標（左上原點、y 向下）
  hole: { cx: number; cy: number; r: number };
  centroid?: [number, number];
  art?: string; white?: string;            // PNG data URI（同一個貼圖範圍）
  tex?: { originMm: [number, number]; sizeMm: [number, number] };
  fillInset?: number;                      // 沒有圖時：外框內縮多少 mm 做一層白墨底
};
declare const CHARM: PieceSpec;
declare const TOP: PieceSpec | null;

const qs = new URLSearchParams(location.search);
const CLEAN = qs.has('clean');
const CAPTURE = qs.has('capture');
const T = 3;                                   // 壓克力厚度 mm
const MAGNET = { d: 10, h: 2 };                // 釹磁鐵 10×2mm
const RING = { R: 4.0, r: 0.5 };               // 開口圈：外徑 9mm、線徑 1mm

// ---------- renderer / scene ----------
const W0 = CAPTURE ? 1080 : innerWidth, H0 = CAPTURE ? 1350 : innerHeight;
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(CAPTURE ? 1 : Math.min(devicePixelRatio, 2));
renderer.setSize(W0, H0);
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
document.getElementById('stage')!.appendChild(renderer.domElement);
renderer.domElement.style.touchAction = 'none';

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xd9d6d0);
const pmrem = new THREE.PMREMGenerator(renderer);
const ENV = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environment = ENV;
scene.add(new THREE.HemisphereLight(0xffffff, 0x9a958c, 0.15));
const key = new THREE.DirectionalLight(0xffffff, 2.3);
key.position.set(-60, 85, 55);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
Object.assign(key.shadow.camera, { left: -80, right: 80, top: 80, bottom: -100, near: 1, far: 500 });
key.shadow.radius = 6; key.shadow.bias = -0.0004;
scene.add(key, key.target);
const fill = new THREE.DirectionalLight(0xffffff, 0.35); fill.position.set(70, 10, 50); scene.add(fill);

// 牆
const wall = new THREE.Mesh(new THREE.PlaneGeometry(1200, 1200), new THREE.MeshStandardMaterial({ color: 0xe2ded8, roughness: 0.95, envMapIntensity: 0.38 }));
wall.receiveShadow = true;
scene.add(wall);

const camera = new THREE.PerspectiveCamera(22, W0 / H0, 1, 3000);

// ---------- materials ----------
const metal = new THREE.MeshPhysicalMaterial({ color: 0xe4e7eb, metalness: 1, roughness: 0.15, envMapIntensity: 1.4, clearcoat: 0.4, clearcoatRoughness: 0.1 });
const magnetMat = new THREE.MeshPhysicalMaterial({ color: 0xc9ccd1, metalness: 1, roughness: 0.3, envMapIntensity: 1.2 });
const acrylicFace = new THREE.MeshPhysicalMaterial({
  color: 0xffffff, roughness: 0, transmission: 1, thickness: T, ior: 1.49,
  attenuationColor: new THREE.Color(0xe3f6f0), attenuationDistance: 40,
  clearcoat: 0.3, clearcoatRoughness: 0.02, envMapIntensity: 0.6, side: THREE.DoubleSide,
});
const acrylicEdge = new THREE.MeshPhysicalMaterial({
  color: 0xf2fffb, roughness: 0.06, transmission: 0.85, thickness: 6, ior: 1.49,
  attenuationColor: new THREE.Color(0xd2efe7), attenuationDistance: 14,
  clearcoat: 1, clearcoatRoughness: 0.03, envMapIntensity: 2.4, emissive: new THREE.Color(0x1c2624), side: THREE.DoubleSide,
});

// ---------- 片（上片／下片共用） ----------
async function imageTexture(src: string, forceWhite = false) {
  const img = new Image(); img.src = src; await img.decode();
  const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
  const g = c.getContext('2d')!; g.drawImage(img, 0, 0);
  if (forceWhite) {
    const d = g.getImageData(0, 0, c.width, c.height);
    for (let i = 0; i < d.data.length; i += 4) d.data[i] = d.data[i + 1] = d.data[i + 2] = 248;
    g.putImageData(d, 0, 0);
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return t;
}

function insetPolygon(pts: THREE.Vector2[], d: number) {
  // 簡單內縮：沿各點角平分線往內移（適用於平滑外框）
  const n = pts.length; let area = 0;
  for (let i = 0; i < n; i++) { const a = pts[i], b = pts[(i + 1) % n]; area += a.x * b.y - b.x * a.y; }
  const s = area > 0 ? 1 : -1;
  return pts.map((p, i) => {
    const a = pts[(i - 1 + n) % n], b = pts[(i + 1) % n];
    const t = b.clone().sub(a).normalize();
    return p.clone().add(new THREE.Vector2(-t.y, t.x).multiplyScalar(d * s));
  });
}

/** 回傳 group：原點 = 孔頂（掛點），y 向上，z 置中（-T/2..T/2），印刷在背面 */
async function buildPiece(spec: PieceSpec, opts: { gravity: boolean; castShadow: boolean; magnet?: { d: number } }) {
  const { hole } = spec;
  const toLocal = (x: number, y: number) => new THREE.Vector2(x - hole.cx, -(y - hole.cy));
  const outerPts = spec.outer.map(([x, y]) => toLocal(x, y));
  const holePath = (r: number) => { const p = new THREE.Path(); p.absarc(0, 0, r, 0, Math.PI * 2, true); return p; };
  const shape = new THREE.Shape(outerPts); shape.holes.push(holePath(hole.r));

  const bev = 0.3;
  const body = new THREE.Mesh(
    new THREE.ExtrudeGeometry(shape, { depth: T - bev * 2, bevelEnabled: true, bevelThickness: bev, bevelSize: bev * 0.6, bevelOffset: -bev * 0.6, bevelSegments: 3, curveSegments: 48 }),
    [acrylicFace, acrylicEdge],
  );
  body.position.z = -T / 2 + bev;
  const g = new THREE.Group(); g.add(body);

  const uvGeo = (sh: THREE.Shape, z: number) => {
    const geo = new THREE.ShapeGeometry(sh, 48);
    if (spec.tex) {
      const [ox, oy] = spec.tex.originMm, [tw, th] = spec.tex.sizeMm;
      const p = geo.attributes.position, uv = geo.attributes.uv;
      for (let i = 0; i < p.count; i++) uv.setXY(i, (p.getX(i) + hole.cx - ox) / tw, 1 - (hole.cy - p.getY(i) - oy) / th);
    }
    geo.translate(0, 0, z); return geo;
  };
  const prints: THREE.Mesh[] = [];
  if (qs.has("dbg")) console.log("piece", !!spec.art, spec.fillInset);
  if (spec.art) prints.push(new THREE.Mesh(uvGeo(shape, -T / 2 - 0.02), new THREE.MeshStandardMaterial({ map: await imageTexture(spec.art), alphaTest: 0.5, roughness: 0.6, envMapIntensity: 0.55 })));
  if (spec.white) prints.push(new THREE.Mesh(uvGeo(shape, -T / 2 - 0.045), new THREE.MeshStandardMaterial({ map: await imageTexture(spec.white, true), alphaTest: 0.5, roughness: 0.7, side: THREE.DoubleSide })));
  else if (spec.fillInset) {
    const fs = new THREE.Shape(insetPolygon(outerPts, spec.fillInset)); fs.holes.push(holePath(hole.r + 0.6));
    // 霧白底：磁鐵貼在背後，從正面隔著白墨隱約看得到一個灰圓
    const geo = uvGeo(fs, -T / 2 - 0.03);
    const bb = new THREE.Box2().setFromPoints(outerPts), sz = bb.getSize(new THREE.Vector2()), ctr = bb.getCenter(new THREE.Vector2());
    const p = geo.attributes.position, uv = geo.attributes.uv;
    for (let i = 0; i < p.count; i++) uv.setXY(i, (p.getX(i) - bb.min.x) / sz.x, (p.getY(i) - bb.min.y) / sz.y);
    const k = 24, c = document.createElement('canvas'); c.width = Math.ceil(sz.x * k); c.height = Math.ceil(sz.y * k);
    const g2 = c.getContext('2d')!; g2.fillStyle = '#f6f5f2'; g2.fillRect(0, 0, c.width, c.height);
    if (opts.magnet) {
      const r = (opts.magnet.d / 2) * k, x = (ctr.x - bb.min.x) * k, y = c.height - (ctr.y - bb.min.y) * k;
      const gr = g2.createRadialGradient(x, y, r * 0.2, x, y, r * 1.08);
      gr.addColorStop(0, 'rgba(120,123,128,0.5)'); gr.addColorStop(0.9, 'rgba(110,113,118,0.6)'); gr.addColorStop(1, 'rgba(140,142,146,0)');
      g2.fillStyle = gr; g2.beginPath(); g2.arc(x, y, r * 1.08, 0, Math.PI * 2); g2.fill();
    }
    const ft = new THREE.CanvasTexture(c); ft.colorSpace = THREE.SRGBColorSpace;
    prints.push(new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: ft, roughness: 0.75, side: THREE.DoubleSide })));
  }
  prints.forEach((m) => { m.castShadow = opts.castShadow; g.add(m); });

  const out = new THREE.Group();
  g.position.y = -hole.r;
  out.add(g);
  if (opts.gravity && spec.centroid) { const c = toLocal(...spec.centroid); out.rotation.z = Math.atan(c.x / c.y); }
  // 外框中心（local，供磁鐵定位）
  const bb = new THREE.Box2().setFromPoints(outerPts);
  return { group: out, center: bb.getCenter(new THREE.Vector2()).add(new THREE.Vector2(0, -hole.r)) };
}

// 預設上片：30×18mm 圓角片，孔在下緣上方 3mm
function placeholderTop(): PieceSpec {
  const w = 30, h = 18, r = 7, pts: [number, number][] = [];
  const corner = (cx: number, cy: number, a0: number) => { for (let i = 0; i <= 12; i++) { const a = a0 + (i / 12) * (Math.PI / 2); pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]); } };
  corner(w - r, r, -Math.PI / 2); corner(w - r, h - r, 0); corner(r, h - r, Math.PI / 2); corner(r, r, Math.PI);
  return { outer: pts, hole: { cx: w / 2, cy: h - 3.5, r: 1.25 }, fillInset: 1.2 };
}

// ---------- assemble ----------
let ringJoint!: THREE.Group, charmJoint!: THREE.Group;
const PHI = 0.27; // 開口圈被牆擋住，往前傾約 15°
async function assemble() {
  const topSpec = TOP ?? placeholderTop();
  const top = await buildPiece(topSpec, { gravity: false, castShadow: true, magnet: MAGNET });
  // 上片背面貼在磁鐵上，磁鐵吸在牆上（牆 z=0）
  const topRoot = new THREE.Group();
  topRoot.position.set(0, 0, MAGNET.h + T / 2);
  topRoot.add(top.group);
  scene.add(topRoot);
  const mag = new THREE.Mesh(new THREE.CylinderGeometry(MAGNET.d / 2, MAGNET.d / 2, MAGNET.h, 64), magnetMat);
  mag.rotation.x = Math.PI / 2;
  mag.position.set(top.center.x, top.center.y, -T / 2 - 0.08 - MAGNET.h / 2);
  mag.castShadow = true;
  topRoot.add(mag);

  // 開口圈：上緣線材穿過上片孔、靠在孔的下緣
  const hr = topSpec.hole.r;
  ringJoint = new THREE.Group();
  ringJoint.position.set(0, -2 * hr + RING.r, 0); // top.group 原點在孔頂，所以孔底 = -2r
  topRoot.add(ringJoint);
  const ringCenter = new THREE.Vector3(0, -RING.R * Math.cos(PHI), RING.R * Math.sin(PHI));
  const gap = 0.42;
  const rg = new THREE.TorusGeometry(RING.R, RING.r, 20, 120, Math.PI * 2 - gap);
  rg.rotateZ(gap / 2 + Math.PI * 0.12); // 開口在前側偏上
  const ring = new THREE.Mesh(rg, metal);
  ring.rotation.y = -Math.PI / 2;
  ring.position.copy(ringCenter);
  ring.castShadow = true;
  ringJoint.add(ring);

  // 下片：孔頂靠在開口圈最低點的線材上
  charmJoint = new THREE.Group();
  charmJoint.position.copy(ringCenter).add(new THREE.Vector3(0, -RING.R + RING.r, 0));
  ringJoint.add(charmJoint);
  const charm = await buildPiece(CHARM, { gravity: true, castShadow: true });
  charmJoint.add(charm.group);
}

// ---------- animation（上片固定，下片鐘擺） ----------
const D = THREE.MathUtils.degToRad;
function pose(t: number) {
  const w = (Math.PI * 2) / 1.5;          // 擺盪週期 1.5 秒（放慢）
  const tw = (Math.PI * 2 * t) / 6;       // 6 秒一輪的緩慢扭轉
  ringJoint.rotation.z = D(4) * Math.sin(w * t);
  ringJoint.rotation.y = D(2) * Math.sin(tw);
  charmJoint.rotation.z = D(3) * Math.sin(w * t - 0.6);
  charmJoint.rotation.x = -D(1.2) * (0.5 + 0.5 * Math.sin(w * t * 0.5 + 0.4)); // 只往前擺，不會撞牆
  charmJoint.rotation.y = D(6) * Math.sin(tw - 0.3); // 離牆只有約 3mm，扭轉幅度受限
}

let controls: OrbitControls | null = null;
const target = new THREE.Vector3();
let baseSph = new THREE.Spherical();
function setCam(dAz: number) {
  const s = baseSph.clone(); s.theta += D(dAz);
  camera.position.copy(target).add(new THREE.Vector3().setFromSpherical(s));
  camera.lookAt(target);
}

(async () => {
  await assemble();
  // r163+（含本 repo 的 three r186）：scene.environment 不吃 material.envMapIntensity，明確指定 envMap 讓各材質強度生效
  scene.traverse((o) => { const m = (o as THREE.Mesh).material; (Array.isArray(m) ? m : m ? [m] : []).forEach((mm: any) => { if ('envMap' in mm && !mm.envMap) { mm.envMap = ENV; mm.needsUpdate = true; } }); });
  pose(0);
  scene.updateMatrixWorld(true);
  const box = new THREE.Box3();
  scene.traverse((o) => { if ((o as THREE.Mesh).isMesh && o !== wall) box.expandByObject(o); });
  box.getCenter(target);
  const size = box.getSize(new THREE.Vector3());
  const dist = (Math.max(size.y, size.x / camera.aspect) * 0.72) / Math.tan(D(camera.fov / 2));
  const az = Number(qs.get('az') ?? 42), el = Number(qs.get('el') ?? 10);
  baseSph = new THREE.Spherical(dist, D(90 - el), D(az));
  key.target.position.copy(target);
  setCam(0);
  (window as any).__renderAt = (t: number, camAz = 0) => { pose(t); setCam(camAz); renderer.render(scene, camera); return true; };
  (window as any).__dbg = { scene, renderer, key, wall, THREE };
  (window as any).__ready = true;
  if (CLEAN) document.body.classList.add('clean');
  if (CAPTURE) return;
  controls = new OrbitControls(camera, renderer.domElement);
  controls.target.copy(target);
  controls.enableDamping = true; controls.enablePan = false;
  controls.minDistance = dist * 0.35; controls.maxDistance = dist * 2.2;
  controls.minAzimuthAngle = D(-80); controls.maxAzimuthAngle = D(80); // 不轉到牆後
  controls.update();
  const t0 = performance.now();
  const loop = () => { pose((performance.now() - t0) / 1000); controls!.update(); renderer.render(scene, camera); requestAnimationFrame(loop); };
  loop();
  addEventListener('resize', () => { renderer.setSize(innerWidth, innerHeight); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); });
})();
// 撞牆檢查（除錯用）：回傳吊飾最靠牆的 z
(window as any).__minZ = (t: number) => { pose(t); scene.updateMatrixWorld(true); let mz = Infinity; const v = new THREE.Vector3();
  charmJoint.traverse((o) => { const g = (o as THREE.Mesh).geometry; if (!g) return; const p = g.attributes.position; for (let i = 0; i < p.count; i += 3) { v.fromBufferAttribute(p, i).applyMatrix4(o.matrixWorld); mz = Math.min(mz, v.z); } }); return mz; };
