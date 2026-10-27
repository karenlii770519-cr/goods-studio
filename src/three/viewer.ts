import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { FILMS } from '../lib/films';
import type { Rect } from '../lib/geometry';
import type { AcrylicOutline } from '../lib/outline';
import { getProduct } from '../lib/products';
import { designRegion, renderFoilIdMap, renderLayers, shapePath } from '../lib/render';
import type { Project } from '../lib/types';
import { foilFragment, foilVertex } from './foilShader';

export interface LightState {
  az: number; // 方位角（度），0 = 正前方
  el: number; // 仰角（度）
}

const TEX_PX_PER_MM = 10;

function pathFromPolygon(pts: { x: number; y: number }[], target: THREE.Shape | THREE.Path) {
  pts.forEach((p, i) => (i === 0 ? target.moveTo(p.x, -p.y) : target.lineTo(p.x, -p.y)));
  target.closePath();
}

/** 用 Canvas 的 shapePath 指令產生 three.js Shape（自動把 y 反轉） */
function roundedRectShape(x: number, y: number, w: number, h: number, r: number): THREE.Shape {
  const s = new THREE.Shape();
  const proxy = {
    moveTo: (a: number, b: number) => s.moveTo(x + a, -(y + b)),
    lineTo: (a: number, b: number) => s.lineTo(x + a, -(y + b)),
    arcTo: (x1: number, y1: number, x2: number, y2: number) => {
      // 用二次曲線近似圓角
      s.quadraticCurveTo(x + x1, -(y + y1), x + x2, -(y + y2));
    },
    closePath: () => s.closePath(),
  };
  shapePath(proxy as unknown as CanvasRenderingContext2D, 'rect', w, h, r);
  return s;
}

function gradientBackground(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = 4;
  c.height = 256;
  const ctx = c.getContext('2d')!;
  const g = ctx.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, '#f6f7fa');
  g.addColorStop(0.6, '#e6e9ef');
  g.addColorStop(1, '#d7dbe3');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 4, 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function shadowTexture(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(20,24,40,0.35)');
  g.addColorStop(1, 'rgba(20,24,40,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

export class ProductViewer {
  readonly renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(28, 1, 1, 5000);
  private controls: OrbitControls;
  private outer = new THREE.Group(); // 陀螺儀／錄影旋轉
  private product = new THREE.Group();
  private lightOrb: THREE.Mesh;
  private lightHit: THREE.Mesh;
  private pointLight = new THREE.PointLight(0xffffff, 2.2, 0, 0);
  private materials: THREE.ShaderMaterial[] = [];
  private textures: THREE.Texture[] = [];
  private shadow: THREE.Mesh;
  private size = 100;
  private light: LightState = { az: -35, el: 32 };
  private intensity = 1;
  private raf = 0;
  private dragging = false;
  private gyroTarget = { x: 0, y: 0 };
  private gyroOn = false;
  private recording: { start: number; dur: number } | null = null;
  autoRotate = false;
  onLightChange?: (l: LightState) => void;
  private ro: ResizeObserver;
  private disposed = false;

  constructor(private container: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.toneMapping = THREE.NeutralToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(this.renderer.domElement);
    this.renderer.domElement.style.touchAction = 'none';

    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.background = gradientBackground();
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x8890a0, 0.6));
    this.scene.add(this.pointLight);
    this.scene.add(this.outer);
    this.outer.add(this.product);

    this.lightOrb = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16), new THREE.MeshBasicMaterial({ color: 0xfff3c4, toneMapped: false }));
    const halo = new THREE.Mesh(
      new THREE.SphereGeometry(1.9, 24, 16),
      new THREE.MeshBasicMaterial({ color: 0xffd76a, transparent: true, opacity: 0.25, depthWrite: false }),
    );
    this.lightOrb.add(halo);
    this.lightHit = new THREE.Mesh(new THREE.SphereGeometry(3.2, 12, 8), new THREE.MeshBasicMaterial({ visible: false }));
    this.lightOrb.add(this.lightHit);
    this.scene.add(this.lightOrb);

    this.shadow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: shadowTexture(), transparent: true, depthWrite: false }));
    this.shadow.rotation.x = -Math.PI / 2;
    this.scene.add(this.shadow);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.enablePan = false;
    this.controls.rotateSpeed = 0.7;

    this.bindPointer();
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(container);
    this.resize();
    this.loop();
  }

  private resize() {
    if (this.recording) return;
    const w = this.container.clientWidth || 1, h = this.container.clientHeight || 1;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  private bindPointer() {
    const el = this.renderer.domElement;
    const ray = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    const setNdc = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(ndc, this.camera);
    };
    el.addEventListener('pointerdown', (e) => {
      setNdc(e);
      if (ray.intersectObject(this.lightHit, false).length) {
        this.dragging = true;
        this.controls.enabled = false;
        el.setPointerCapture(e.pointerId);
        el.style.cursor = 'grabbing';
      }
    });
    el.addEventListener('pointermove', (e) => {
      setNdc(e);
      if (!this.dragging) {
        el.style.cursor = ray.intersectObject(this.lightHit, false).length ? 'grab' : '';
        return;
      }
      // 光源在以產品為中心的球面上移動
      const R = this.lightDistance();
      const sphere = new THREE.Sphere(new THREE.Vector3(), R);
      const hit = new THREE.Vector3();
      let p: THREE.Vector3;
      if (ray.ray.intersectSphere(sphere, hit)) p = hit;
      else {
        ray.ray.closestPointToPoint(new THREE.Vector3(), hit);
        p = hit.setLength(R);
      }
      const d = p.clone().normalize();
      const el2 = THREE.MathUtils.radToDeg(Math.asin(THREE.MathUtils.clamp(d.y, -1, 1)));
      const az = THREE.MathUtils.radToDeg(Math.atan2(d.x, d.z));
      this.setLight({ az: THREE.MathUtils.clamp(az, -170, 170), el: THREE.MathUtils.clamp(el2, -80, 85) });
      this.onLightChange?.(this.light);
    });
    const up = () => {
      this.dragging = false;
      this.controls.enabled = true;
      el.style.cursor = '';
    };
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
  }

  private lightDistance() {
    return this.size * 0.85;
  }

  setLight(l: LightState) {
    this.light = l;
    const az = THREE.MathUtils.degToRad(l.az), el = THREE.MathUtils.degToRad(l.el);
    const d = new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el));
    const p = d.multiplyScalar(this.lightDistance());
    this.lightOrb.position.copy(p);
    this.pointLight.position.copy(p);
    for (const m of this.materials) m.uniforms.uLightPos.value.copy(p);
  }

  getLight() {
    return this.light;
  }

  setIntensity(v: number) {
    this.intensity = v;
    this.pointLight.intensity = 2.2 * v;
    for (const m of this.materials) m.uniforms.uLightIntensity.value = v;
  }

  resetView() {
    const dist = (this.size / (2 * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)))) * 1.25;
    this.camera.position.set(dist * 0.18, dist * 0.08, dist);
    this.camera.near = dist / 50;
    this.camera.far = dist * 20;
    this.camera.updateProjectionMatrix();
    this.controls.target.set(0, 0, 0);
    this.controls.minDistance = dist * 0.35;
    this.controls.maxDistance = dist * 3;
    this.controls.update();
  }

  /** 傾斜：x、y 為弧度 */
  setTilt(x: number, y: number) {
    this.gyroOn = true;
    this.gyroTarget = { x, y };
  }

  stopTilt() {
    this.gyroOn = false;
    this.gyroTarget = { x: 0, y: 0 };
  }

  private clearProduct() {
    this.product.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.geometry) m.geometry.dispose();
    });
    this.product.clear();
    this.materials.forEach((m) => m.dispose());
    this.materials = [];
    this.textures.forEach((t) => t.dispose());
    this.textures = [];
  }

  private makeDecalMaterial(print: HTMLCanvasElement, foil: HTMLCanvasElement, white: HTMLCanvasElement, region: Rect, acrylic: boolean) {
    const tp = new THREE.CanvasTexture(print);
    tp.colorSpace = THREE.SRGBColorSpace;
    tp.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
    const tf = new THREE.CanvasTexture(foil);
    tf.colorSpace = THREE.NoColorSpace;
    tf.anisotropy = tp.anisotropy;
    const tw = new THREE.CanvasTexture(white);
    tw.colorSpace = THREE.NoColorSpace;
    this.textures.push(tp, tf, tw);
    const m = new THREE.ShaderMaterial({
      vertexShader: foilVertex,
      fragmentShader: foilFragment,
      transparent: acrylic,
      side: THREE.DoubleSide,
      uniforms: {
        uPrint: { value: tp },
        uFoil: { value: tf },
        uWhite: { value: tw },
        uRegion: { value: new THREE.Vector4(region.x, region.y, region.width, region.height) },
        uLightPos: { value: this.lightOrb.position.clone() },
        uLightIntensity: { value: this.intensity },
        uFilmColor: { value: FILMS.map((f) => new THREE.Vector3(...f.color)) },
        uFilmKind: { value: FILMS.map((f) => f.kind) },
        uFilmRough: { value: FILMS.map((f) => f.roughness) },
        uAcrylic: { value: acrylic ? 1 : 0 },
        uPaperGloss: { value: 0.1 },
        uSubstrate: { value: -1 },
        uInkClarity: { value: 0.6 },
      },
    });
    this.materials.push(m);
    return m;
  }

  /** 依專案內容重建 3D 模型 */
  async setProject(project: Project, outline: AcrylicOutline | null) {
    const product = getProduct(project.productId);
    const region = designRegion(project);
    const k = Math.min(TEX_PX_PER_MM, 2400 / Math.max(region.width, region.height));
    const print = await renderLayers(project, {
      region,
      pxPerMm: k,
      processes: ['print'],
      mode: 'raw',
      background: product.family === 'acrylic' ? null : project.options.background,
    });
    const foil = await renderFoilIdMap(project, region, k);
    const white = await renderLayers(project, { region, pxPerMm: k, processes: ['white'], mode: 'raw' });
    if (this.disposed) return;

    this.clearProduct();
    const o = project.options;
    const W = project.width, H = project.height;
    const t = o.thickness;
    const paperMat = new THREE.MeshStandardMaterial({ color: 0xf5f3ef, roughness: 0.85 });
    const metalMat = new THREE.MeshStandardMaterial({ color: 0xd4d8de, metalness: 1, roughness: 0.28 });
    const acrylicMat = new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      metalness: 0,
      roughness: 0.03,
      transparent: true,
      opacity: 0.14,
      clearcoat: 1,
      clearcoatRoughness: 0.02,
      envMapIntensity: 1.6,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const decal = this.makeDecalMaterial(print, foil, white, region, product.family === 'acrylic');
    decal.uniforms.uSubstrate.value = o.substrate ? FILMS.findIndex((f) => f.id === o.substrate) : -1;
    decal.uniforms.uInkClarity.value = o.inkClarity ?? 0.6;

    if (product.family === 'paper') {
      const shape = roundedRectShape(0, 0, W, H, product.cornerRadius);
      const body = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: t, bevelEnabled: false, curveSegments: 12 }), paperMat);
      body.position.z = -t / 2;
      const front = new THREE.Mesh(new THREE.ShapeGeometry(shape, 12), decal);
      front.position.z = t / 2 + 0.01;
      this.product.add(body, front);
    } else if (product.family === 'badge') {
      const R = W / 2;
      const h = 2.6;
      const Rs = (R * R + h * h) / (2 * h);
      const g = new THREE.RingGeometry(0.0001, R, 128, 48);
      const pos = g.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i), y = pos.getY(i);
        const r2 = x * x + y * y;
        pos.setZ(i, Math.sqrt(Math.max(0, Rs * Rs - r2)) - (Rs - h));
      }
      g.translate(R, -R, 0);
      g.computeVertexNormals();
      const front = new THREE.Mesh(g, decal);
      const rim = new THREE.Mesh(new THREE.CylinderGeometry(R + 0.35, R + 0.6, 2.6, 128, 1, true), metalMat);
      rim.rotation.x = Math.PI / 2;
      rim.position.set(R, -R, -1.2);
      const back = new THREE.Mesh(new THREE.CircleGeometry(R + 0.6, 96), metalMat);
      back.rotation.y = Math.PI;
      back.position.set(R, -R, -2.5);
      const pin = new THREE.Mesh(new THREE.BoxGeometry(R * 1.1, 1.2, 0.8), metalMat);
      pin.position.set(R, -R + R * 0.25, -3);
      this.product.add(front, rim, back, pin);
    } else {
      // 壓克力
      if (!outline || outline.polygon.length < 3) {
        const shape = roundedRectShape(0, 0, W, H, 3);
        const body = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: t, bevelEnabled: false }), acrylicMat);
        body.position.z = -t / 2;
        this.product.add(body);
      } else {
        const shape = new THREE.Shape();
        pathFromPolygon(outline.polygon, shape);
        if (outline.hole) {
          const hole = new THREE.Path();
          hole.absarc(outline.hole.x, -outline.hole.y, outline.hole.r, 0, Math.PI * 2, true);
          shape.holes.push(hole);
        }
        const bev = Math.min(0.3, t * 0.12);
        const body = new THREE.Mesh(
          new THREE.ExtrudeGeometry(shape, { depth: t - bev * 2, bevelEnabled: true, bevelThickness: bev, bevelSize: bev, bevelSegments: 2, curveSegments: 24 }),
          acrylicMat,
        );
        body.position.z = -t / 2 + bev;
        body.renderOrder = 2;
        const print = new THREE.Mesh(new THREE.ShapeGeometry(shape, 24), decal);
        print.position.z = -t / 2 + 0.05;
        print.renderOrder = 1;
        this.product.add(print, body);

        if (outline.hole) {
          const rr = Math.max(3.2, outline.hole.r * 2.6);
          const ring = new THREE.Mesh(new THREE.TorusGeometry(rr, 0.55, 16, 72), metalMat);
          ring.rotation.y = Math.PI / 2;
          ring.position.set(outline.hole.x, -outline.hole.y + rr, 0);
          const link = new THREE.Mesh(new THREE.TorusGeometry(rr * 0.75, 0.5, 16, 60), metalMat);
          link.scale.set(0.7, 1, 1);
          link.position.set(outline.hole.x, -outline.hole.y + rr * 2 + rr * 0.75 - 1.1, 0);
          this.product.add(ring, link);
        }
        if (outline.tab) {
          const tb = outline.tab;
          const cx = tb.x + tb.width / 2;
          const base = roundedRectShape(-o.baseWidth / 2, -o.baseDepth / 2, o.baseWidth, o.baseDepth, 4);
          const slot = new THREE.Path();
          slot.moveTo(-tb.width / 2 - 0.1, -t / 2);
          slot.lineTo(tb.width / 2 + 0.1, -t / 2);
          slot.lineTo(tb.width / 2 + 0.1, t / 2);
          slot.lineTo(-tb.width / 2 - 0.1, t / 2);
          slot.closePath();
          base.holes.push(slot);
          const bg = new THREE.ExtrudeGeometry(base, { depth: t, bevelEnabled: true, bevelThickness: 0.25, bevelSize: 0.25, bevelSegments: 2 });
          bg.rotateX(-Math.PI / 2);
          const baseMesh = new THREE.Mesh(bg, acrylicMat);
          // 底座上緣 = 板子本體下緣
          baseMesh.position.set(cx, -(tb.y + tb.height), 0);
          baseMesh.renderOrder = 3;
          this.product.add(baseMesh);
        }
      }
    }

    // 置中
    this.product.position.set(0, 0, 0);
    const box = new THREE.Box3().setFromObject(this.product);
    const c = box.getCenter(new THREE.Vector3());
    const sz = box.getSize(new THREE.Vector3());
    this.product.position.set(-c.x, -c.y, 0);
    const newSize = Math.max(sz.x, sz.y);
    const sizeChanged = Math.abs(newSize - this.size) > 0.5;
    this.size = newSize;
    const orbR = Math.max(1.2, this.size * 0.022);
    this.lightOrb.scale.setScalar(orbR);
    this.shadow.scale.set(sz.x * 1.5, Math.max(sz.z * 6, sz.x * 0.4), 1);
    this.shadow.position.set(0, -sz.y / 2 - (project.productId === 'acrylic-stand' ? 0.2 : sz.y * 0.12), 0);
    this.setLight(this.light);
    this.setIntensity(this.intensity);
    if (sizeChanged || !this.camera.position.lengthSq()) this.resetView();
  }

  private loop = () => {
    this.raf = requestAnimationFrame(this.loop);
    const now = performance.now();
    if (this.recording) {
      const t = Math.min(1, (now - this.recording.start) / this.recording.dur);
      const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      this.outer.rotation.set(0.08 * Math.sin(t * Math.PI * 2), e * Math.PI * 2, 0);
    } else {
      if (this.autoRotate) this.outer.rotation.y += 0.008;
      else if (this.gyroOn) {
        this.outer.rotation.x += (this.gyroTarget.x - this.outer.rotation.x) * 0.15;
        this.outer.rotation.y += (this.gyroTarget.y - this.outer.rotation.y) * 0.15;
      }
    }
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  };

  resetRotation() {
    this.outer.rotation.set(0, 0, 0);
  }

  /** 錄製旋轉影片 */
  async record(seconds = 6, size = 1080): Promise<{ blob: Blob; ext: string }> {
    const canvas = this.renderer.domElement;
    const types = ['video/mp4;codecs=avc1.42E01E', 'video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];
    const mime = types.find((t) => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(t));
    if (!mime) throw new Error('這個瀏覽器不支援錄影（MediaRecorder）');
    const prevPR = this.renderer.getPixelRatio();
    const prevAuto = this.autoRotate;
    this.autoRotate = false;
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(size, size, false);
    this.camera.aspect = 1;
    this.camera.updateProjectionMatrix();
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.objectFit = 'contain';
    const stream = canvas.captureStream(30);
    const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 10_000_000 });
    const chunks: Blob[] = [];
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    const done = new Promise<void>((r) => (rec.onstop = () => r()));
    this.outer.rotation.set(0, 0, 0);
    rec.start(250);
    this.recording = { start: performance.now(), dur: seconds * 1000 };
    await new Promise((r) => setTimeout(r, seconds * 1000 + 150));
    rec.stop();
    await done;
    this.recording = null;
    this.outer.rotation.set(0, 0, 0);
    this.autoRotate = prevAuto;
    this.renderer.setPixelRatio(prevPR);
    canvas.style.objectFit = '';
    this.resize();
    const type = mime.split(';')[0];
    return { blob: new Blob(chunks, { type }), ext: type === 'video/mp4' ? 'mp4' : 'webm' };
  }

  snapshot(): string {
    this.renderer.render(this.scene, this.camera);
    return this.renderer.domElement.toDataURL('image/png');
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.ro.disconnect();
    this.controls.dispose();
    this.clearProduct();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
