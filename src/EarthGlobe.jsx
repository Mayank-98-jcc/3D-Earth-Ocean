import { useCallback, useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { createLabelManager } from './labels.js'

const R = 2, MIN = 2.2, MAX = 9, DEFAULT = 5.4
const textures = {
  map: 'https://unpkg.com/three-globe/example/img/earth-blue-marble.jpg',
  bump: 'https://unpkg.com/three-globe/example/img/earth-topology.png',
  specular: 'https://unpkg.com/three-globe/example/img/earth-water.png'
}
const borderUrls = ['https://cdn.jsdelivr.net/gh/johan/world.geo.json@master/countries.geo.json', 'https://raw.githubusercontent.com/johan/world.geo.json/master/countries.geo.json']
const toPoint = (lat, lon, radius) => { const p = (90 - lat) * Math.PI / 180, t = (lon + 180) * Math.PI / 180; return new THREE.Vector3(-radius * Math.sin(p) * Math.cos(t), radius * Math.cos(p), radius * Math.sin(p) * Math.sin(t)) }

function borders(data) {
  const group = new THREE.Group(), material = new THREE.LineBasicMaterial({ color: 0x8fe3d4, transparent: true, opacity: .55 })
  const ring = (coordinates) => { const points = coordinates.map(([lon, lat]) => toPoint(lat, lon, R * 1.003)); if (points.length > 2) group.add(new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(points), material)) }
  data.features.forEach(({ geometry }) => { if (!geometry) return; if (geometry.type === 'Polygon') geometry.coordinates.forEach(ring); if (geometry.type === 'MultiPolygon') geometry.coordinates.forEach((polygon) => polygon.forEach(ring)) })
  return group
}
function stars() { const n = 4000, points = new Float32Array(n * 3); for (let i = 0; i < n; i++) { const r = 60 + Math.random() * 140, t = Math.random() * Math.PI * 2, p = Math.acos(2 * Math.random() - 1); points.set([r * Math.sin(p) * Math.cos(t), r * Math.sin(p) * Math.sin(t), r * Math.cos(p)], i * 3) } const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(points, 3)); return new THREE.Points(g, new THREE.PointsMaterial({ color: 0xffffff, size: .35, sizeAttenuation: true, transparent: true, opacity: .8 })) }
function atmosphere() { return new THREE.Mesh(new THREE.SphereGeometry(R * 1.045, 64, 64), new THREE.ShaderMaterial({ vertexShader: 'varying vec3 n;void main(){n=normalize(normalMatrix*normal);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}', fragmentShader: 'varying vec3 n;void main(){float i=pow(.62-dot(n,vec3(0.,0.,1.)),3.);gl_FragColor=vec4(.35,.75,.92,1.)*i;}', blending: THREE.AdditiveBlending, side: THREE.BackSide, transparent: true })) }

export default function EarthGlobe() {
  const mount = useRef(null), state = useRef({}), [loading, setLoading] = useState(true), [note, setNote] = useState('Loading planet textures…'), [spinning, setSpinning] = useState(true), [borderError, setBorderError] = useState(false), [coordinates, setCoordinates] = useState(null)
  const reset = useCallback(() => { const s = state.current; s.target = { x: .15, y: 0 }; s.distance = DEFAULT }, [])
  useEffect(() => {
    const node = mount.current, scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(45, node.clientWidth / node.clientHeight, .1, 1000), renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    camera.position.z = DEFAULT; renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); renderer.setSize(node.clientWidth, node.clientHeight); node.appendChild(renderer.domElement)
    scene.add(new THREE.AmbientLight(0x445566, 1.1), stars()); const sun = new THREE.DirectionalLight(0xffffff, 1.4); sun.position.set(5, 3, 5); scene.add(sun)
    const globe = new THREE.Group(); globe.rotation.x = .15; scene.add(globe)
    const earth = new THREE.Mesh(new THREE.SphereGeometry(R, 256, 128), new THREE.MeshPhongMaterial({ color: 0x1b3a52, emissive: 0x0a1622, shininess: 5 })); globe.add(earth, atmosphere()); const lineGroup = new THREE.Group(); globe.add(lineGroup)
    // A DOM pin deliberately has a fixed pixel size, unlike a mesh which grows as
    // the camera approaches the Earth.
    const marker = document.createElement('i'); marker.className = 'location-pin'; marker.hidden = true; node.appendChild(marker)
    let selectedPoint = null
    const labelManager = createLabelManager(toPoint, R, globe)
    const raycaster = new THREE.Raycaster(), pointerNdc = new THREE.Vector2()
    state.current = { target: { x: .15, y: 0 }, current: { x: .15, y: 0 }, velocity: { x: 0, y: 0 }, distance: DEFAULT, dragging: false, moved: false, last: {}, auto: true }
    const pointer = (e) => e.touches ? e.touches[0] : e
    const down = (e) => { const s = state.current, p = pointer(e); s.dragging = true; s.moved = false; s.velocity = { x: 0, y: 0 }; s.last = { x: p.clientX, y: p.clientY } }
    const move = (e) => { const s = state.current; if (!s.dragging) return; const p = pointer(e), dx = p.clientX - s.last.x, dy = p.clientY - s.last.y; if (Math.abs(dx) + Math.abs(dy) > 2) s.moved = true; s.last = { x: p.clientX, y: p.clientY }; s.target.y += dx * .005; s.target.x = Math.max(-Math.PI / 2.1, Math.min(Math.PI / 2.1, s.target.x + dy * .005)); s.velocity = { x: dy * .005, y: dx * .005 } }
    const up = () => { state.current.dragging = false }, wheel = (e) => { e.preventDefault(); const s = state.current; s.distance = Math.max(MIN, Math.min(MAX, s.distance + e.deltaY * .0025)) }
    const dist = (touches) => Math.hypot(touches[0].clientX - touches[1].clientX, touches[0].clientY - touches[1].clientY)
    const touchStart = (e) => { const s = state.current; if (e.touches.length === 2) { s.pinch = dist(e.touches); s.pinchCamera = s.distance; s.dragging = false } else down(e) }, touchMove = (e) => { const s = state.current; if (e.touches.length === 2 && s.pinch) { e.preventDefault(); s.distance = Math.max(MIN, Math.min(MAX, s.pinchCamera * s.pinch / dist(e.touches))) } else move(e) }, touchEnd = () => { state.current.pinch = null; up() }
    const selectCoordinates = (event) => { if (state.current.moved) return; const bounds = dom.getBoundingClientRect(); pointerNdc.set(((event.clientX - bounds.left) / bounds.width) * 2 - 1, -((event.clientY - bounds.top) / bounds.height) * 2 + 1); raycaster.setFromCamera(pointerNdc, camera); const hit = raycaster.intersectObject(earth, false)[0]; if (!hit) return; const point = globe.worldToLocal(hit.point.clone()).normalize(); const latitude = THREE.MathUtils.radToDeg(Math.asin(point.y)), longitude = THREE.MathUtils.radToDeg(Math.atan2(-point.z, point.x)); selectedPoint = point.multiplyScalar(R * 1.018); setCoordinates({ latitude, longitude }) }
    const dom = renderer.domElement; dom.addEventListener('pointerdown', down); window.addEventListener('pointermove', move); window.addEventListener('pointerup', up); dom.addEventListener('click', selectCoordinates); dom.addEventListener('wheel', wheel, { passive: false }); dom.addEventListener('touchstart', touchStart, { passive: true }); dom.addEventListener('touchmove', touchMove, { passive: false }); dom.addEventListener('touchend', touchEnd)
    const loader = new THREE.TextureLoader(); loader.crossOrigin = 'anonymous'; let done = 0; const loaded = () => { done++; if (done === 3) setLoading(false) }
    loader.load(textures.map, (map) => { earth.material = new THREE.MeshPhongMaterial({ map, shininess: 8 }); loaded() }, undefined, loaded); loader.load(textures.bump, (map) => { earth.material.bumpMap = map; earth.material.bumpScale = .04; earth.material.needsUpdate = true; loaded() }, undefined, loaded); loader.load(textures.specular, (map) => { earth.material.specularMap = map; earth.material.specular = new THREE.Color(0x333333); earth.material.needsUpdate = true; loaded() }, undefined, loaded)
    setNote('Drawing country borders…'); (async () => { for (const url of borderUrls) { try { const response = await fetch(url); if (response.ok) { lineGroup.add(borders(await response.json())); return } } catch {} } setBorderError(true) })()
    let frame; const animate = () => { frame = requestAnimationFrame(animate); const s = state.current; if (!s.dragging) { s.target.y += s.velocity.y; s.target.x = Math.max(-Math.PI / 2.1, Math.min(Math.PI / 2.1, s.target.x + s.velocity.x)); s.velocity.x *= .94; s.velocity.y *= .94; if (s.auto && Math.abs(s.velocity.y) < .0005) s.target.y += .0018 } s.current.x += (s.target.x - s.current.x) * .12; s.current.y += (s.target.y - s.current.y) * .12; globe.rotation.set(s.current.x, s.current.y, 0); camera.position.z += (s.distance - camera.position.z) * .08; camera.lookAt(0, 0, 0); labelManager.update(camera, camera.position.z); if (selectedPoint) { scene.updateMatrixWorld(); const worldPoint = globe.localToWorld(selectedPoint.clone()), projected = worldPoint.clone().project(camera), frontFacing = worldPoint.normalize().dot(camera.position.clone().normalize()) > 0; marker.hidden = !frontFacing || projected.z < -1 || projected.z > 1; if (!marker.hidden) { marker.style.left = `${(projected.x + 1) * .5 * node.clientWidth}px`; marker.style.top = `${(-projected.y + 1) * .5 * node.clientHeight}px` } } renderer.render(scene, camera) }; animate()
    const resize = () => { camera.aspect = node.clientWidth / node.clientHeight; camera.updateProjectionMatrix(); renderer.setSize(node.clientWidth, node.clientHeight) }; const observer = new ResizeObserver(resize); observer.observe(node)
    return () => { cancelAnimationFrame(frame); observer.disconnect(); labelManager.dispose(); dom.removeEventListener('pointerdown', down); window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); dom.removeEventListener('click', selectCoordinates); dom.removeEventListener('wheel', wheel); dom.removeEventListener('touchstart', touchStart); dom.removeEventListener('touchmove', touchMove); dom.removeEventListener('touchend', touchEnd); node.removeChild(marker); node.removeChild(dom); renderer.dispose() }
  }, [])
  useEffect(() => { state.current.auto = spinning }, [spinning])
  const format = (value, positive, negative) => `${Math.abs(value).toFixed(5)}° ${value >= 0 ? positive : negative}`
  return <main className="earth"><div ref={mount} className="canvas"/><header><strong>EARTH // LIVE VIEW</strong><small>click Earth for coordinates · drag to rotate · scroll to zoom</small></header>{coordinates && <aside className="coordinates" aria-live="polite"><b>SELECTED LOCATION</b><span>LAT&nbsp; {format(coordinates.latitude, 'N', 'S')}</span><span>LON&nbsp; {format(coordinates.longitude, 'E', 'W')}</span></aside>}<div className="controls"><button onClick={() => setSpinning((v) => !v)}>{spinning ? 'PAUSE SPIN' : 'RESUME SPIN'}</button><button onClick={reset}>RESET VIEW</button></div>{loading && <div className="loading"><i/><span>{note}</span></div>}{borderError && !loading && <p className="border-error">country border data unavailable — showing terrain only</p>}</main>
}
