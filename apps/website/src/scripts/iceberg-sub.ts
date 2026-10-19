// The BoromTech sub in the iceberg dive: it swims in as the camera goes under, dives alongside every step with
// its spotlight on the part being read, and at the last step reaches out with a robot arm to weld shut a glowing
// crack (the bug). Everything is driven from the scroll; see update() for the inputs.
import {
  AdditiveBlending,
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  Object3D,
  Points,
  PointsMaterial,
  Quaternion,
  Raycaster,
  RingGeometry,
  Scene,
  ShaderMaterial,
  SphereGeometry,
  SRGBColorSpace,
  SpotLight,
  Vector3,
} from 'three'

const HULL = new Color('#3b74f2')
const DECK = new Color('#2a56c4')
const ORANGE = new Color('#e56e3f')
const STEEL = new Color('#c9ccd6')
const LAMP = new Color('#fff1d6')
const BUG = new Color('#ff3b2f')

const smooth = (t: number) => {
  const c = Math.min(1, Math.max(0, t))
  return c * c * (3 - 2 * c)
}

// The B roundel, drawn once the brand font has loaded so the letter is in the site's display face.
function badge() {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 256
  const texture = new CanvasTexture(canvas)
  texture.colorSpace = SRGBColorSpace
  const draw = () => {
    const g = canvas.getContext('2d')!
    g.clearRect(0, 0, 256, 256)
    g.fillStyle = '#ffffff'
    g.beginPath()
    g.arc(128, 128, 118, 0, Math.PI * 2)
    g.fill()
    g.lineWidth = 14
    g.strokeStyle = '#e56e3f'
    g.stroke()
    const face = getComputedStyle(document.documentElement).getPropertyValue('--font-display').trim() || 'sans-serif'
    g.fillStyle = '#1e2235'
    g.font = `800 172px ${face}`
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    g.fillText('B', 132, 140)
    texture.needsUpdate = true
  }
  draw()
  document.fonts.ready.then(draw)
  return texture
}

function hull() {
  const sub = new Group()
  const paint = (color: Color) => new MeshLambertMaterial({ color, flatShading: true })
  const body = new Mesh(new SphereGeometry(1, 12, 8), paint(HULL))
  body.scale.set(1.35, 0.55, 0.55)
  sub.add(body)
  // A B on each flank: a patch of the hull's own ellipsoid, a hair larger, so the roundel hugs the curve.
  // The patch is narrower in angle than it is tall because the hull is stretched 1.35 : 0.55.
  const mark = new MeshBasicMaterial({ map: badge(), transparent: true, depthWrite: false })
  for (const centre of [Math.PI / 2, (Math.PI * 3) / 2]) {
    const patch = new Mesh(new SphereGeometry(1.012, 24, 16, centre - 0.245, 0.49, Math.PI / 2 - 0.6, 1.2), mark)
    patch.scale.copy(body.scale)
    patch.position.x = -0.15
    sub.add(patch)
  }
  const band = new Mesh(new CylinderGeometry(0.57, 0.57, 0.16, 12, 1, true), paint(ORANGE))
  band.rotation.z = Math.PI / 2
  band.position.x = 0.62
  sub.add(band)
  const tower = new Mesh(new BoxGeometry(0.7, 0.42, 0.3), paint(DECK))
  tower.position.set(-0.1, 0.6, 0)
  sub.add(tower)
  const scope = new Mesh(new CylinderGeometry(0.03, 0.03, 0.4, 6), paint(STEEL))
  scope.position.set(0.05, 0.95, 0)
  sub.add(scope)
  const fin = new Mesh(new BoxGeometry(0.35, 0.5, 0.06), paint(DECK))
  fin.position.set(-1.25, 0.25, 0)
  sub.add(fin)
  const window = new MeshBasicMaterial({ color: new Color('#ffd9a0') })
  // Portholes up by the nose, clear of the B.
  for (const z of [1, -1]) {
    for (const [x, r] of [[0.98, 0.37], [0.76, 0.43]]) {
      const port = new Mesh(new SphereGeometry(0.075, 8, 6), window)
      port.position.set(x, 0.1, z * r)
      sub.add(port)
    }
  }
  const lamp = new Mesh(new CylinderGeometry(0.14, 0.2, 0.16, 10), new MeshBasicMaterial({ color: LAMP }))
  lamp.rotation.z = -Math.PI / 2
  lamp.position.set(1.36, 0, 0)
  sub.add(lamp)
  const prop = new Group()
  prop.position.x = -1.42
  for (let i = 0; i < 3; i++) {
    const blade = new Mesh(new BoxGeometry(0.04, 0.42, 0.1), paint(STEEL))
    blade.rotation.x = (i * Math.PI * 2) / 3
    blade.position.y = 0
    prop.add(blade)
  }
  sub.add(prop)
  return { sub, prop, lamp }
}

// A soft light cone from the lamp to the berg. Unit length along +z; scaled to the distance each frame.
function beam() {
  const geo = new ConeGeometry(0.34, 1, 28, 1, true)
  geo.translate(0, -0.5, 0)
  geo.rotateX(-Math.PI / 2)
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
    blending: AdditiveBlending,
    uniforms: { power: { value: 0 }, tint: { value: LAMP.clone() } },
    vertexShader: /* glsl */ `
      varying float vAlong;
      varying vec3 vNormal;
      varying vec3 vView;
      void main() {
        vAlong = position.z;
        vec4 view = modelViewMatrix * vec4(position, 1.0);
        vView = -view.xyz;
        vNormal = normalMatrix * normal;
        gl_Position = projectionMatrix * view;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float power;
      uniform vec3 tint;
      varying float vAlong;
      varying vec3 vNormal;
      varying vec3 vView;
      void main() {
        float core = pow(abs(dot(normalize(vNormal), normalize(vView))), 1.6);
        float fade = pow(1.0 - clamp(vAlong, 0.0, 1.0), 1.3);
        gl_FragColor = vec4(tint, power * 0.3 * core * fade);
        #include <colorspace_fragment>
      }
    `,
  })
  return new Mesh(geo, material)
}

// One arm segment: a unit cylinder stretched between two points.
const UP = new Vector3(0, 1, 0)
const span = (mesh: Mesh, a: Vector3, b: Vector3) => {
  const dir = new Vector3().subVectors(b, a)
  const len = dir.length()
  mesh.position.copy(a).addScaledVector(dir, 0.5)
  mesh.quaternion.copy(new Quaternion().setFromUnitVectors(UP, dir.normalize()))
  mesh.scale.set(1, len, 1)
}

export function createRescue(scene: Scene, float: Group, berg: Mesh, wide: boolean) {
  // The crack sits on the face of the berg turned toward the sub, low on the mass.
  const side = wide ? -1 : 1
  const ray = new Raycaster(new Vector3(side * 0.9, -4.6, 20), new Vector3(0, 0, -1))
  const hit = ray.intersectObject(berg)[0]
  const crackAt = hit ? hit.point.clone() : new Vector3(side * 0.9, -4.6, 1.2)
  const crackNormal = hit?.face ? hit.face.normal.clone() : new Vector3(0, 0, 1)

  const crack = new Group()
  crack.position.copy(crackAt).addScaledVector(crackNormal, 0.02)
  crack.lookAt(crack.position.clone().add(crackNormal))
  const glow = new MeshBasicMaterial({ color: BUG.clone(), transparent: true, side: DoubleSide })
  const shard = new BufferGeometry()
  // A jagged zigzag of thin triangles: the crack.
  const zig = [
    [-0.42, 0.18], [-0.2, 0.02], [-0.05, 0.2], [0.12, -0.04], [0.3, 0.12], [0.45, -0.1],
  ]
  const verts: number[] = []
  for (let i = 0; i < zig.length - 1; i++) {
    const [ax, ay] = zig[i]
    const [bx, by] = zig[i + 1]
    verts.push(ax, ay - 0.035, 0, bx, by - 0.035, 0, bx, by + 0.035, 0, ax, ay - 0.035, 0, bx, by + 0.035, 0, ax, ay + 0.035, 0)
  }
  shard.setAttribute('position', new BufferAttribute(new Float32Array(verts), 3))
  crack.add(new Mesh(shard, glow))
  const ring = new Mesh(new RingGeometry(0.5, 0.56, 40), new MeshBasicMaterial({ color: BUG.clone(), transparent: true, side: DoubleSide, blending: AdditiveBlending, depthWrite: false }))
  crack.add(ring)
  float.add(crack)

  // The sub keeps a lane beside the berg and rides a little below whatever depth is being read, so it dives
  // with every step; at the last step that puts it level with the crack.
  const { sub, prop, lamp } = hull()
  sub.scale.setScalar(0.85)
  const lane = wide ? new Vector3(-3.9, 0, 2.6) : new Vector3(3.2, 0, 2.2)
  const drop = wide ? 1.9 : 1.7
  const beside = new Vector3()
  const start = new Vector3()
  scene.add(sub)

  const spot = new SpotLight(LAMP, 0, 0, 0.32, 0.7, 1.2)
  const aim = new Object3D()
  scene.add(spot, aim)
  spot.target = aim
  const cone = beam()
  scene.add(cone)

  // The arm: shoulder on the sub's belly, an elbow, a forearm and a two-finger claw.
  const steel = new MeshLambertMaterial({ color: STEEL, flatShading: true })
  const upper = new Mesh(new CylinderGeometry(0.07, 0.08, 1, 8), steel)
  const fore = new Mesh(new CylinderGeometry(0.055, 0.07, 1, 8), steel)
  const joint = new SphereGeometry(0.11, 10, 8)
  const shoulder = new Mesh(joint, new MeshLambertMaterial({ color: ORANGE, flatShading: true }))
  const elbow = new Mesh(joint, shoulder.material)
  const claw = new Group()
  const finger = new BoxGeometry(0.05, 0.05, 0.28)
  const fingers = [new Mesh(finger, steel), new Mesh(finger, steel)]
  fingers.forEach((f) => claw.add(f))
  const arm = new Group()
  arm.add(upper, fore, shoulder, elbow, claw)
  scene.add(arm)

  // Weld sparks: short-lived specks thrown off the crack while the claw works.
  const SPARKS = 90
  const sparkPos = new Float32Array(SPARKS * 3)
  const sparkVel = new Float32Array(SPARKS * 3)
  const sparkAge = new Float32Array(SPARKS).fill(9)
  const sparkGeo = new BufferGeometry()
  sparkGeo.setAttribute('position', new BufferAttribute(sparkPos, 3))
  const sparks = new Points(
    sparkGeo,
    new PointsMaterial({ color: new Color('#ffcf8a'), size: 0.07, transparent: true, blending: AdditiveBlending, depthWrite: false }),
  )
  scene.add(sparks)

  const crackWorld = new Vector3()
  const normalWorld = new Vector3()
  const shoulderAt = new Vector3()
  const lampAt = new Vector3()
  const reachTo = new Vector3()
  const rest = new Vector3()
  const elbowAt = new Vector3()
  const toward = new Vector3()
  const bend = new Vector3()
  const A = 1.75
  const B = 1.75
  const look = new Raycaster()
  const lit = new Vector3()
  const ahead = new Vector3()

  // swim: the sub coming in as the camera goes under (0..1). depth: the world height being read.
  // finale: the move to the last step (0..1). fix: the repair (0..1).
  const update = (swim: number, depth: number, finale: number, fix: number, t: number, dt: number) => {
    const shown = swim > 0.001
    sub.visible = cone.visible = sparks.visible = shown
    arm.visible = shown && fix > 0.01 // the arm stays stowed until the repair starts
    crack.visible = finale > 0.001

    float.updateMatrixWorld(true)
    crackWorld.copy(crack.position)
    float.localToWorld(crackWorld)
    normalWorld.copy(crackNormal).transformDirection(float.matrixWorld)

    // Swim in, slow down, then follow the dive with a gentle bob.
    const glide = smooth(swim)
    beside.copy(lane).setY(depth - drop)
    start.copy(beside).add(new Vector3(side * -10, 1.2, -1.5))
    sub.position.lerpVectors(start, beside, glide)
    sub.position.y += Math.sin(t * 1.1) * 0.06

    // The light falls on the berg at the depth being read, and swings onto the crack for the finale.
    ahead.set(0, depth, 0.4).sub(sub.position).normalize()
    look.set(sub.position, ahead)
    lit.copy(look.intersectObject(berg)[0]?.point ?? ahead.set(0, depth, 0))
    float.localToWorld(lit.sub(float.position).add(float.position))
    lit.lerp(crackWorld, smooth(finale))
    sub.lookAt(lit)
    sub.rotateY(-Math.PI / 2)
    sub.rotation.z += Math.sin(t * 0.9) * 0.02
    sub.updateMatrixWorld(true)
    prop.rotation.x += dt * (4 + (1 - glide) * 14)

    // The lamp flickers on as the sub arrives, and burns brightest on the repair.
    const on = (swim < 0.6 ? 0 : swim < 0.7 ? (Math.sin(t * 60) > 0 ? 0.6 : 0) : smooth((swim - 0.6) / 0.4)) * (0.65 + 0.35 * smooth(finale))
    lamp.getWorldPosition(lampAt)
    spot.position.copy(lampAt)
    aim.position.copy(lit)
    spot.intensity = on * 90
    cone.position.copy(lampAt)
    cone.lookAt(lit)
    cone.scale.setScalar(lampAt.distanceTo(lit) * 1.15)
    ;(cone.material as ShaderMaterial).uniforms.power.value = on

    // Reach: from tucked under the hull out to the crack, the elbow bending downward.
    const reach = smooth(fix / 0.35)
    shoulderAt.set(0.75, -0.45, 0.15)
    sub.localToWorld(shoulderAt)
    rest.set(1.25, -0.75, 0.15)
    sub.localToWorld(rest)
    reachTo.copy(crackWorld).addScaledVector(normalWorld, 0.12)
    reachTo.lerpVectors(rest, reachTo, reach)
    toward.subVectors(reachTo, shoulderAt)
    const d = Math.min(A + B - 0.01, toward.length())
    toward.normalize()
    bend.set(0, -1, 0).addScaledVector(toward, -toward.y).normalize()
    const cos = (A * A + d * d - B * B) / (2 * A * d)
    const sin = Math.sqrt(Math.max(0, 1 - cos * cos))
    elbowAt.copy(shoulderAt).addScaledVector(toward, A * cos).addScaledVector(bend, A * sin)
    const tip = elbowAt.clone().add(reachTo.clone().sub(elbowAt).normalize().multiplyScalar(B))
    span(upper, shoulderAt, elbowAt)
    span(fore, elbowAt, tip)
    shoulder.position.copy(shoulderAt)
    elbow.position.copy(elbowAt)
    claw.position.copy(tip)
    claw.lookAt(crackWorld)
    const welding = fix > 0.35 && fix < 0.85
    const grip = welding ? 0.06 + Math.abs(Math.sin(t * 9)) * 0.05 : 0.12
    fingers[0].position.set(grip, 0, 0.1)
    fingers[1].position.set(-grip, 0, 0.1)

    // The crack pulses red until the weld takes, then cools and closes.
    const heal = smooth((fix - 0.55) / 0.3)
    const pulse = 0.65 + Math.sin(t * 5) * 0.35
    glow.color.copy(BUG).lerp(ORANGE, heal)
    glow.opacity = (1 - heal) * pulse
    const ringMat = ring.material as MeshBasicMaterial
    const wave = (t * 0.9) % 1
    ring.scale.setScalar(heal > 0 ? 1 + heal * 2.5 : 0.7 + wave * 0.9)
    ringMat.opacity = heal > 0 ? (1 - heal) * 0.9 : (1 - wave) * 0.8
    ringMat.color.copy(heal > 0 ? LAMP : BUG)

    // Sparks spray while welding.
    for (let i = 0; i < SPARKS; i++) {
      sparkAge[i] += dt
      if (sparkAge[i] > 0.6 && welding && Math.random() < 0.18) {
        sparkAge[i] = 0
        sparkPos.set([reachTo.x, reachTo.y, reachTo.z], i * 3)
        sparkVel.set(
          [
            normalWorld.x * 1.2 + (Math.random() - 0.5) * 2.2,
            normalWorld.y * 1.2 + Math.random() * 1.6,
            normalWorld.z * 1.2 + (Math.random() - 0.5) * 2.2,
          ],
          i * 3,
        )
      }
      if (sparkAge[i] < 0.6) {
        sparkVel[i * 3 + 1] -= dt * 4
        sparkPos[i * 3] += sparkVel[i * 3] * dt
        sparkPos[i * 3 + 1] += sparkVel[i * 3 + 1] * dt
        sparkPos[i * 3 + 2] += sparkVel[i * 3 + 2] * dt
      } else {
        sparkPos[i * 3 + 1] = -999
      }
    }
    sparkGeo.attributes.position.needsUpdate = true
  }

  // Where the two labels go: above the sub, and just off the crack.
  const subTag = new Vector3()
  const bugTag = new Vector3()
  const anchors = () => {
    subTag.copy(sub.position).add(new Vector3(0, 0.95, 0))
    bugTag.copy(crackWorld).addScaledVector(normalWorld, 0.3).add(new Vector3(0, 0.55, 0))
    return { sub: subTag, bug: bugTag }
  }

  return { update, anchors }
}
