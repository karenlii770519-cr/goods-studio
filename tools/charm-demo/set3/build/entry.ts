// 三層壓克力磁鐵吊飾組：卡片（磁鐵吸牆、有插槽）→ 中片（插片插進卡片槽，板面垂直於牆）→ 開口圈 → 下片吊飾。
// 每一片都吃同一種輸入（art.png / white.png / cut.json），換圖時換資料夾重建即可。
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

type Circle = { cx: number; cy: number; r: number };
type PieceSpec = {
  outer: [number, number][];                       // 刀模外框 mm（左上原點、y 向下）
  circles?: Circle[]; polyHoles?: [number, number][][];
  hole?: Circle; centroid?: [number, number];
  art?: string; white?: string;
  tex?: { originMm: [number, number]; sizeMm: [number, number] };
  mount?: { slot?: { cx: number; cy: number; w: number; h: number }; tab?: { x0: number; cy: number; len: number; h: number } };
};
declare const SET: { card: PieceSpec; mid: PieceSpec; bottom: PieceSpec };

const qs = new URLSearchParams(location.search);
const CLEAN = qs.has('clean'), CAPTURE = qs.has('capture');
const T = 3;
const MAGNET = { d: 10, h: 2 };
const RING = { R: 4.0, r: 0.5 };     // 開口圈 外徑 9mm、線徑 1mm
const D = THREE.MathUtils.degToRad;

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
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
Object.assign(key.shadow.camera, { left: -130, right: 130, top: 130, bottom: -130, near: 1, far: 700 });
key.shadow.radius = 4; key.shadow.bias = -0.0004;
scene.add(key, key.target);
const fill = new THREE.DirectionalLight(0xffffff, 0.45); scene.add(fill);

const wall = new THREE.Mesh(new THREE.PlaneGeometry(2000, 2000), new THREE.MeshStandardMaterial({ color: 0xe2ded8, roughness: 0.95, envMapIntensity: 0.38 }));
wall.receiveShadow = true; scene.add(wall);
const camera = new THREE.PerspectiveCamera(22, W0 / H0, 1, 4000);

const metal = new THREE.MeshPhysicalMaterial({ color: 0xe4e7eb, metalness: 1, roughness: 0.15, envMapIntensity: 1.4, clearcoat: 0.4, clearcoatRoughness: 0.1 });
const magnetMat = new THREE.MeshPhysicalMaterial({ color: 0xc9ccd1, metalness: 1, roughness: 0.3, envMapIntensity: 1.2 });
const acrylicFace = new THREE.MeshPhysicalMaterial({
  color: 0xffffff, roughness: 0, transmission: 1, thickness: T, ior: 1.49,
  attenuationColor: new THREE.Color(0xe3f6f0), attenuationDistance: 40,
  clearcoat: 0.3, clearcoatRoughness: 0.02, envMapIntensity: 0.6, side: THREE.DoubleSide,
});
const acrylicEdge = new THREE.MeshPhysicalMaterial({
  color: 0xf2fffb, roughness: 0.06, transmission: 0.85, thickness: 6, ior: 1.49,
  attenuationColor: new THREE.Color(0xc9ebe1), attenuationDistance: 10,
  clearcoat: 1, clearcoatRoughness: 0.03, envMapIntensity: 2.4, emissive: new THREE.Color(0x1c2624), side: THREE.DoubleSide,
});

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

/** 建一片壓克力：local 座標 X = x、Y = -y（mm），z 置中；印刷（彩＋白墨）在背面，從 +z 看是正的 */
async function buildPiece(spec: PieceSpec) {
  const v = ([x, y]: [number, number]) => new THREE.Vector2(x, -y);
  const shape = new THREE.Shape(spec.outer.map(v));
  for (const c of spec.circles ?? []) { const p = new THREE.Path(); p.absarc(c.cx, -c.cy, c.r, 0, Math.PI * 2, true); shape.holes.push(p); }
  for (const h of spec.polyHoles ?? []) shape.holes.push(new THREE.Path(h.map(v)));
  const bev = 0.3;
  const body = new THREE.Mesh(
    new THREE.ExtrudeGeometry(shape, { depth: T - bev * 2, bevelEnabled: true, bevelThickness: bev, bevelSize: bev * 0.6, bevelOffset: -bev * 0.6, bevelSegments: 3, curveSegments: 48 }),
    [acrylicFace, acrylicEdge],
  );
  body.position.z = -T / 2 + bev;
  const g = new THREE.Group(); g.add(body);
  const uvGeo = (z: number) => {
    const geo = new THREE.ShapeGeometry(shape, 48);
    const [ox, oy] = spec.tex!.originMm, [tw, th] = spec.tex!.sizeMm;
    const p = geo.attributes.position, uv = geo.attributes.uv;
    for (let i = 0; i < p.count; i++) uv.setXY(i, (p.getX(i) - ox) / tw, 1 - (-p.getY(i) - oy) / th);
    geo.translate(0, 0, z); return geo;
  };
  if (spec.art && spec.tex) {
    const art = new THREE.Mesh(uvGeo(-T / 2 - 0.02), new THREE.MeshStandardMaterial({ map: await imageTexture(spec.art), alphaTest: 0.5, roughness: 0.6, envMapIntensity: 0.55 }));
    art.castShadow = true; g.add(art);
    if (spec.white) {
      const w = new THREE.Mesh(uvGeo(-T / 2 - 0.045), new THREE.MeshStandardMaterial({ map: await imageTexture(spec.white, true), alphaTest: 0.5, roughness: 0.7, side: THREE.DoubleSide }));
      w.castShadow = true; g.add(w);
    }
  }
  return g;
}

// ---------- 組裝 ----------
let ringJoint!: THREE.Group, charmJoint!: THREE.Group;
const CARD_Z = MAGNET.h + T / 2; // 卡片中心離牆
async function assemble() {
  const { card, mid, bottom } = SET;
  const slot = card.mount!.slot!, tab = mid.mount!.tab!;
  // 卡片：插槽中心放在世界 (0,0)
  const cardG = await buildPiece(card);
  cardG.position.set(-slot.cx, slot.cy, CARD_Z);
  scene.add(cardG);
  // 磁鐵：卡片背面、插槽上方（避開插槽，從槽看不到磁鐵）
  const cardTop = slot.cy - Math.min(...card.outer.map((p) => p[1]));
  const mag = new THREE.Mesh(new THREE.CylinderGeometry(MAGNET.d / 2, MAGNET.d / 2, MAGNET.h, 64), magnetMat);
  mag.rotation.x = Math.PI / 2;
  mag.position.set(0, slot.h / 2 + (cardTop - slot.h / 2) * 0.5, MAGNET.h / 2 - 0.05);
  mag.castShadow = true; scene.add(mag);

  // 中片：插片穿過卡片插槽（板面垂直於牆，插片長≈卡片厚），肩部頂在卡片正面
  const midRoot = new THREE.Group();
  midRoot.rotation.y = Math.PI / 2;                 // local +x → 世界 -z（朝牆），印刷面朝世界 +x
  midRoot.position.set(0, 0, CARD_Z + T / 2);
  const midG = await buildPiece(mid);
  midG.position.set(-tab.x0, tab.cy, 0);            // 肩部中線在 midRoot 原點
  midRoot.add(midG); scene.add(midRoot);
  scene.updateMatrixWorld(true);

  // 開口圈：上緣線材穿過中片底部掛孔（孔軸 = 世界 x），環面平行牆面
  const h = mid.hole!;
  const holeW = new THREE.Vector3(h.cx, -h.cy, 0); midG.localToWorld(holeW);
  ringJoint = new THREE.Group();
  ringJoint.position.copy(holeW).add(new THREE.Vector3(0, -h.r + RING.r, 0));
  scene.add(ringJoint);
  const gap = 0.42;
  const rg = new THREE.TorusGeometry(RING.R, RING.r, 20, 120, Math.PI * 2 - gap);
  rg.rotateZ(gap / 2 - Math.PI * 0.12 + Math.PI); // 開口在左下側
  const ring = new THREE.Mesh(rg, metal);
  ring.position.y = -RING.R; ring.castShadow = true;
  ringJoint.add(ring);

  // 下片：掛在開口圈最低點，板面與中片同向（孔軸 = 世界 x）
  charmJoint = new THREE.Group();
  charmJoint.position.y = -2 * RING.R + RING.r;
  ringJoint.add(charmJoint);
  const bh = bottom.hole!;
  const face = new THREE.Group(); face.rotation.y = Math.PI / 2; charmJoint.add(face);
  const grav = new THREE.Group(); face.add(grav);
  const bG = await buildPiece(bottom);
  bG.position.set(-bh.cx, bh.cy - bh.r, 0);        // 原點 = 孔頂
  grav.add(bG);
  if (bottom.centroid) { const cx = bottom.centroid[0] - bh.cx, cy = -(bottom.centroid[1] - bh.cy); grav.rotation.z = Math.atan(cx / cy); }
}

// ---------- 動畫：8 秒一循環 ----------
const LOOP = 8;
function pose(t: number) {
  const s = (period: number, ph = 0) => Math.sin((Math.PI * 2 * t) / period + ph);
  ringJoint.rotation.x = D(9) * s(1.6);              // 前後擺（在下片板面內）
  ringJoint.rotation.z = D(4) * s(2, 0.5);           // 左右
  charmJoint.rotation.x = D(6) * s(1.6, -0.8);
  charmJoint.rotation.y = D(14) * s(LOOP, 0.3);      // 緩慢扭轉
}

let controls: OrbitControls | null = null;
const target = new THREE.Vector3();
let dist = 300;
function setCam(az: number, el: number) {
  camera.position.copy(target).add(new THREE.Vector3().setFromSpherical(new THREE.Spherical(dist, D(90 - el), D(az))));
  camera.lookAt(target);
}
const camAt = (t: number) => ({ az: 44 + 28 * Math.sin((Math.PI * 2 * t) / LOOP), el: 13 + 5 * Math.sin((Math.PI * 4 * t) / LOOP) });

(async () => {
  await assemble();
  // r163+（含本 repo 的 three r186）：scene.environment 不吃 material.envMapIntensity，明確指定 envMap 讓各材質強度生效
  scene.traverse((o) => { const m = (o as THREE.Mesh).material; (Array.isArray(m) ? m : m ? [m] : []).forEach((mm: any) => { if ('envMap' in mm && !mm.envMap) { mm.envMap = ENV; mm.needsUpdate = true; } }); });
  pose(0); scene.updateMatrixWorld(true);
  const box = new THREE.Box3();
  scene.traverse((o) => { if ((o as THREE.Mesh).isMesh && o !== wall) box.expandByObject(o); });
  box.getCenter(target);
  const size = box.getSize(new THREE.Vector3());
  const fitH = Math.max(size.y, Math.hypot(size.x, size.z) / camera.aspect);
  dist = (fitH * 0.62) / Math.tan(D(camera.fov / 2));
  key.position.copy(target).add(new THREE.Vector3(-70, 100, 120));
  key.target.position.copy(target);
  fill.position.copy(target).add(new THREE.Vector3(120, 20, 40));
  const az0 = qs.has('az') ? Number(qs.get('az')) : null, el0 = qs.has('el') ? Number(qs.get('el')) : 14;
  setCam(az0 ?? 50, el0);
  (window as any).__renderAt = (t: number, az?: number, el?: number) => { pose(t); const c = camAt(t); setCam(az ?? az0 ?? c.az, el ?? (qs.has('el') ? el0 : c.el)); renderer.render(scene, camera); return true; };
  (window as any).__minWallZ = (t: number) => { pose(t); scene.updateMatrixWorld(true); let mz = Infinity; const v = new THREE.Vector3();
    charmJoint.traverse((o) => { const gg = (o as THREE.Mesh).geometry; if (!gg) return; const p = gg.attributes.position; for (let i = 0; i < p.count; i += 3) { v.fromBufferAttribute(p, i).applyMatrix4(o.matrixWorld); mz = Math.min(mz, v.z); } }); return mz; };
  (window as any).__ready = true;
  if (CLEAN) document.body.classList.add('clean');
  if (CAPTURE) return;
  controls = new OrbitControls(camera, renderer.domElement);
  controls.target.copy(target);
  controls.enableDamping = true; controls.enablePan = false;
  controls.minDistance = dist * 0.3; controls.maxDistance = dist * 2.2;
  controls.minAzimuthAngle = D(-85); controls.maxAzimuthAngle = D(85);
  controls.update();
  const t0 = performance.now();
  const loop = () => { pose((performance.now() - t0) / 1000); controls!.update(); renderer.render(scene, camera); requestAnimationFrame(loop); };
  loop();
  addEventListener('resize', () => { renderer.setSize(innerWidth, innerHeight); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); });
})();
