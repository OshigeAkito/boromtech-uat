// The iceberg chapter drawn in WebGL: a faceted berg in the brand oranges, a moving sea surface the camera
// dives through, and marine snow below it. Iceberg.astro owns the scroll beats and hands this module one
// camera framing per frame; this module only draws it.
import {
  AdditiveBlending,
  AmbientLight,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  CircleGeometry,
  Color,
  CylinderGeometry,
  DirectionalLight,
  DoubleSide,
  FogExp2,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  Points,
  PointsMaterial,
  Scene,
  ShaderMaterial,
  ShapeUtils,
  Vector2,
  Vector3,
  WebGLRenderer,
} from 'three'
import { createRescue } from './iceberg-sub'

// World units are the SVG's units / 100: the berg is 6 wide and 9 tall, and the origin is the point where
// the tip meets the water (300,270 in the SVG), so y > 0 is the tip and y < 0 is everything below.
export type View = {
  k: number // pixels per world unit at the look-at point
  x: number // where the look-at point lands on screen
  y: number
  ty: number // world height of the look-at point
  az: number // orbit around the berg, radians
  lift: number // how far the camera sits above the look-at point, in world units, so it is under water at any zoom
  swim: number // the BoromTech sub swimming in as the camera goes under, 0..1
  finale: number // the move to the last step, where the sub fixes the bug, 0..1
  fix: number // the sub's repair of the bug, 0..1
}

const FOV = 30
const SKY = new Color('#fce9e1')
const NIGHT = new Color('#1e2235')
const NIGHT_2 = new Color('#262b42')

// Facet colours down the berg, top to bottom: the same ramp as the SVG facets.
const RAMP: [number, Color][] = [
  [2.7, new Color('#f3a07c')],
  [1.2, new Color('#e56e3f')],
  [0, new Color('#c9592c')],
  [-2.6, new Color('#b4471d')],
  [-6.3, new Color('#8f3816')],
]

const rampAt = (y: number, out: Color) => {
  for (let i = 1; i < RAMP.length; i++) {
    const [hi, a] = RAMP[i - 1]
    const [lo, b] = RAMP[i]
    if (y >= lo) return out.copy(a).lerp(b, (hi - y) / (hi - lo))
  }
  return out.copy(RAMP[RAMP.length - 1][1])
}

// A seeded hash so the berg is the same shape on every load, and seam vertices that share a position move together.
const hash = (x: number, y: number, z: number) => {
  const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453
  return s - Math.floor(s)
}

// The silhouette of the drawn berg (SVG units, clockwise from the peak), so the 3D one matches it face on.
const OUTLINE = [
  [300, 0], [340, 80], [355, 160], [395, 215], [430, 270], [560, 350], [600, 520], [545, 700],
  [410, 880], [220, 900], [80, 770], [0, 560], [45, 390], [170, 270], [215, 205], [250, 95],
]

// Where a horizontal line at height y crosses the outline: the left and right edges of the berg there.
const span = (ring: Vector2[], y: number) => {
  let lo = Infinity
  let hi = -Infinity
  ring.forEach((a, i) => {
    const b = ring[(i + 1) % ring.length]
    if ((a.y - y) * (b.y - y) > 0 || a.y === b.y) return
    const x = a.x + ((y - a.y) / (b.y - a.y)) * (b.x - a.x)
    lo = Math.min(lo, x)
    hi = Math.max(hi, x)
  })
  return lo === Infinity ? null : (lo + hi) / 2
}

function berg() {
  // The outline is the sharp silhouette edge. Inside it sit a front ridge and a back ridge, each drawn in toward
  // the berg's middle and pushed out to an uneven depth, so the faces between them break into big facets.
  const edge = OUTLINE.map(([x, y]) => new Vector2((x - 300) / 100, (270 - y) / 100))
  const ridge = (side: number) =>
    edge.map((p, i) => {
      const mid = span(edge, p.y) ?? p.x
      const thin = 1 - Math.min(1, Math.max(0, (p.y - 0.3) / 2.4)) * 0.75 // the tip is a blade, the mass is bulky
      const z = side * 1.5 * thin * (0.7 + hash(i, side, 3) * 0.6)
      return new Vector3(p.x + (mid - p.x) * (0.4 + hash(i, side, 5) * 0.15), p.y + (-1.8 - p.y) * 0.1, z)
    })
  const front = ridge(1)
  const back = ridge(-0.85)
  const rim = edge.map((p) => new Vector3(p.x, p.y, 0))

  const tris: Vector3[][] = []
  const n = rim.length
  for (const r of [front, back]) {
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n
      tris.push([rim[i], rim[j], r[j]], [rim[i], r[j], r[i]])
    }
    const cap = ShapeUtils.triangulateShape(r.map((v) => new Vector2(v.x, v.y)), [])
    cap.forEach(([a, b, c]) => tris.push([r[a], r[b], r[c]]))
  }

  // Face every triangle outward, away from the berg's middle.
  const core = new Vector3(0, -1.8, 0)
  const ab = new Vector3()
  const ac = new Vector3()
  const pos = new Float32Array(tris.length * 9)
  tris.forEach((t, k) => {
    const centre = t[0].clone().add(t[1]).add(t[2]).divideScalar(3)
    const normal = ab.subVectors(t[1], t[0]).cross(ac.subVectors(t[2], t[0]))
    if (normal.dot(centre.sub(core)) < 0) t = [t[0], t[2], t[1]]
    t.forEach((v, m) => pos.set([v.x, v.y, v.z], k * 9 + m * 3))
  })
  const geo = new BufferGeometry()
  geo.setAttribute('position', new BufferAttribute(pos, 3))
  geo.computeVertexNormals()
  const p = geo.attributes.position
  const colors = new Float32Array(p.count * 3)
  const c = new Color()
  for (let i = 0; i < p.count; i += 3) {
    const y = (p.getY(i) + p.getY(i + 1) + p.getY(i + 2)) / 3
    rampAt(y, c).multiplyScalar(0.9 + hash(i, y, 1) * 0.2)
    for (let v = 0; v < 3; v++) colors.set([c.r, c.g, c.b], (i + v) * 3)
  }
  geo.setAttribute('color', new BufferAttribute(colors, 3))
  return new Mesh(geo, new MeshLambertMaterial({ vertexColors: true, flatShading: true, side: DoubleSide }))
}

function sea() {
  const geo = new PlaneGeometry(160, 160, 120, 120)
  geo.rotateX(-Math.PI / 2)
  const material = new ShaderMaterial({
    side: DoubleSide,
    transparent: true,
    depthWrite: false,
    uniforms: {
      time: { value: 0 },
      above: { value: NIGHT.clone() },
      below: { value: NIGHT_2.clone() },
      glow: { value: new Color('#e56e3f') },
    },
    vertexShader: /* glsl */ `
      uniform float time;
      varying vec3 vWorld;
      varying float vWave;
      void main() {
        vec3 p = position;
        float w = sin(p.x * 0.55 + time * 0.9) * 0.05 + sin(p.z * 0.8 - time * 0.7) * 0.04
          + sin((p.x + p.z) * 1.7 + time * 1.6) * 0.015;
        p.y += w;
        vWave = w;
        vec4 world = modelMatrix * vec4(p, 1.0);
        vWorld = world.xyz;
        gl_Position = projectionMatrix * viewMatrix * world;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 above;
      uniform vec3 below;
      uniform vec3 glow;
      uniform float time;
      varying vec3 vWorld;
      varying float vWave;
      void main() {
        float crest = smoothstep(0.02, 0.09, vWave);
        if (gl_FrontFacing) {
          // From above: dark water with a faint warm sheen on the crests near the berg.
          float near = 1.0 - smoothstep(4.0, 26.0, length(vWorld.xz));
          gl_FragColor = vec4(above + glow * crest * near * 0.18, 0.74);
        } else {
          // From below: the underside catches light, rippling.
          float ripple = 0.5 + 0.5 * sin(vWorld.x * 2.3 + time * 1.3) * sin(vWorld.z * 1.9 - time);
          float fade = 1.0 - smoothstep(10.0, 60.0, length(vWorld.xz));
          gl_FragColor = vec4(below + vec3(0.06, 0.07, 0.1) * ripple + glow * crest * 0.12, 0.8 * fade);
        }
        #include <colorspace_fragment>
      }
    `,
  })
  return new Mesh(geo, material)
}

function dot() {
  const size = 64
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const g = canvas.getContext('2d')!
  const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  grad.addColorStop(0, 'rgba(255,255,255,1)')
  grad.addColorStop(0.4, 'rgba(255,255,255,0.5)')
  grad.addColorStop(1, 'rgba(255,255,255,0)')
  g.fillStyle = grad
  g.fillRect(0, 0, size, size)
  return new CanvasTexture(canvas)
}

// Marine snow: soft specks drifting up through the dark, only below the surface.
function snow(count: number) {
  const geo = new BufferGeometry()
  const pos = new Float32Array(count * 3)
  const speed = new Float32Array(count)
  for (let i = 0; i < count; i++) {
    pos[i * 3] = (Math.random() - 0.5) * 36
    pos[i * 3 + 1] = -0.4 - Math.random() * 14
    pos[i * 3 + 2] = (Math.random() - 0.5) * 36
    speed[i] = 0.08 + Math.random() * 0.22
  }
  geo.setAttribute('position', new BufferAttribute(pos, 3))
  const points = new Points(
    geo,
    new PointsMaterial({
      size: 0.16,
      map: dot(),
      color: new Color('#f2f1ee'),
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
      blending: AdditiveBlending,
    }),
  )
  const drift = (dt: number, t: number) => {
    for (let i = 0; i < count; i++) {
      let y = pos[i * 3 + 1] + speed[i] * dt
      if (y > -0.3) y -= 14
      pos[i * 3 + 1] = y
      pos[i * 3] += Math.sin(t * 0.4 + i) * 0.002
    }
    geo.attributes.position.needsUpdate = true
  }
  return { points, drift }
}

export function mountIceberg(canvas: HTMLCanvasElement, { wide }: { wide: boolean }) {
  const renderer = new WebGLRenderer({ canvas, antialias: true, alpha: false })
  renderer.setPixelRatio(Math.min(devicePixelRatio, wide ? 1.75 : 1.5))

  const scene = new Scene()
  const fog = new FogExp2(NIGHT.getHex(), 0)
  scene.fog = fog
  const camera = new PerspectiveCamera(FOV, 1, 0.1, 1000)

  scene.add(new AmbientLight(0xffffff, 1.3))
  const key = new DirectionalLight(0xfff1e6, 2.1)
  key.position.set(-5, 9, 7)
  scene.add(key)
  const rim = new DirectionalLight(0xffb38a, 0.9)
  rim.position.set(7, 1, -6)
  scene.add(rim)

  const float = new Group()
  const ice = berg()
  float.add(ice)
  scene.add(float)
  const rescue = createRescue(scene, float, ice, wide)
  const water = sea()
  scene.add(water)
  // The body of the sea: everything under the surface that is not the berg reads as deep water.
  // It is open at the top, so it never hides the berg below the waterline; the surface does the tinting.
  const depths = new Mesh(new CylinderGeometry(300, 300, 300, 24, 1, true), new MeshBasicMaterial({ color: NIGHT, side: DoubleSide, fog: false }))
  depths.position.y = -150.12
  const floor = new Mesh(new CircleGeometry(300, 24), depths.material)
  floor.rotation.x = -Math.PI / 2
  floor.position.y = -300
  scene.add(floor)
  scene.add(depths)
  const flakes = snow(wide ? 900 : 450)
  scene.add(flakes.points)

  let w = 1
  let h = 1
  const resize = (width: number, height: number) => {
    w = width
    h = height
    renderer.setSize(w, h, false)
    camera.aspect = w / h
  }

  const target = new Vector3()
  const place = (v: View) => {
    // Distance that gives k pixels per unit at the target, and a shifted lens so the target lands at (x, y).
    const dist = h / (2 * Math.tan((FOV * Math.PI) / 360) * v.k)
    const el = Math.asin(Math.max(-0.9, Math.min(0.9, v.lift / dist)))
    target.set(0, v.ty, 0)
    camera.position.set(
      Math.sin(v.az) * Math.cos(el) * dist,
      v.ty + Math.sin(el) * dist,
      Math.cos(v.az) * Math.cos(el) * dist,
    )
    camera.lookAt(target)
    camera.setViewOffset(w, h, w / 2 - v.x, h / 2 - v.y, w, h)
    camera.updateProjectionMatrix()
    camera.updateMatrixWorld()
  }

  const clear = new Color()
  let last = 0
  const draw = (v: View, now: number) => {
    const dt = last ? Math.min(0.05, (now - last) / 1000) : 0
    last = now
    const t = now / 1000
    float.position.y = Math.sin(t * 0.6) * 0.06
    float.rotation.z = Math.sin(t * 0.45) * 0.012
    ;(water.material as ShaderMaterial).uniforms.time.value = t
    flakes.drift(dt, t)
    place(v)
    rescue.update(v.swim, v.ty, v.finale, v.fix, t, dt)

    // Crossing the surface switches sky for sea, and the haze thickens the deeper the camera goes.
    const y = camera.position.y
    const under = Math.min(1, Math.max(0, (0.02 - y) / 0.04))
    clear.copy(SKY).lerp(NIGHT, under)
    renderer.setClearColor(clear)
    // Haze is set by how much of it lies between camera and berg, so the berg reads the same at any zoom.
    const reach = camera.position.distanceTo(target)
    fog.density = (under * (0.5 + Math.min(0.2, -y * 0.04))) / reach
    flakes.points.visible = under > 0 || camera.position.y < 3
    renderer.render(scene, camera)
  }

  const out = new Vector3()
  const project = (x: number, y: number, z: number) => {
    out.set(x, y, z).project(camera)
    return { x: ((out.x + 1) / 2) * w, y: ((1 - out.y) / 2) * h }
  }

  // Screen positions for the sub's name tag and the bug's label.
  const tags = () => {
    const { sub, bug } = rescue.anchors()
    return { sub: project(sub.x, sub.y, sub.z), bug: project(bug.x, bug.y, bug.z) }
  }

  const dispose = () => {
    renderer.dispose()
    scene.traverse((o) => {
      const mesh = o as Mesh
      mesh.geometry?.dispose()
      const m = mesh.material
      if (Array.isArray(m)) m.forEach((x) => x.dispose())
      else m?.dispose()
    })
  }

  return { resize, draw, project, tags, dispose }
}

export type IcebergGL = ReturnType<typeof mountIceberg>
