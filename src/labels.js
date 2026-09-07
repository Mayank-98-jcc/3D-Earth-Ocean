import * as THREE from 'three'

const DATASETS = {
  // This is the same published country-boundary data used by the globe. It
  // includes every country name and lets us place one label inside each country.
  country: 'https://cdn.jsdelivr.net/gh/johan/world.geo.json@master/countries.geo.json',
  region: 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_admin_1_label_points.geojson',
  city: 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_populated_places.geojson'
}
const OCEANS = [
  { name: 'North Atlantic Ocean', lon: -35, lat: 28 },
  { name: 'South Atlantic Ocean', lon: -18, lat: -30 },
  { name: 'Indian Ocean', lon: 76, lat: -20 },
  { name: 'Pacific Ocean', lon: -155, lat: 5 },
  { name: 'Arctic Ocean', lon: 0, lat: 78 },
  { name: 'Southern Ocean', lon: 15, lat: -57 }
].map((ocean) => ({ ...ocean, rank: 1, type: 'ocean' }))
const nameFor = (p) => p.NAME_EN || p.NAMEASCII || p.NAME || p.name || p.name_en || null
const rankFor = (p) => Number(p.SCALERANK ?? p.scalerank ?? p.LABELRANK ?? p.labelrank ?? p.RANK_MAX ?? 99)

function polygonLabelPoint(geometry) {
  const rings = geometry.type === 'Polygon' ? [geometry.coordinates[0]] : geometry.coordinates.map((polygon) => polygon[0])
  const ring = rings.filter(Boolean).sort((a, b) => b.length - a.length)[0]
  if (!ring?.length) return null
  // A spherical mean avoids incorrect labels around the international date line.
  const sum = ring.reduce((result, [lon, lat]) => { const latitude = lat * Math.PI / 180, longitude = lon * Math.PI / 180; result.x += Math.cos(latitude) * Math.cos(longitude); result.y += Math.sin(latitude); result.z += Math.cos(latitude) * Math.sin(longitude); return result }, { x: 0, y: 0, z: 0 })
  return [Math.atan2(sum.z, sum.x) * 180 / Math.PI, Math.atan2(sum.y, Math.hypot(sum.x, sum.z)) * 180 / Math.PI]
}
function asLabels(data, type) {
  return data.features.map(({ geometry, properties = {} }) => {
    if (!geometry) return null
    const coordinates = geometry.type === 'Point' ? geometry.coordinates : (geometry.type === 'Polygon' || geometry.type === 'MultiPolygon' ? polygonLabelPoint(geometry) : null)
    if (!coordinates || !Number.isFinite(coordinates[0]) || !Number.isFinite(coordinates[1])) return null
    return { name: nameFor(properties), lon: coordinates[0], lat: coordinates[1], rank: type === 'country' ? Number(properties.SCALERANK ?? properties.scalerank ?? 1) : rankFor(properties), type }
  }).filter((label) => label?.name)
}
function textSprite(label) {
  const fontSize = label.type === 'country' ? 42 : label.type === 'ocean' ? 36 : label.type === 'region' ? 34 : 29, weight = label.type === 'ocean' ? 'italic 500' : '600', padding = 14, canvas = document.createElement('canvas'), context = canvas.getContext('2d')
  context.font = `${weight} ${fontSize}px ui-monospace, SFMono-Regular, Menlo, monospace`
  const width = Math.ceil(context.measureText(label.name).width) + padding * 2
  canvas.width = width; canvas.height = fontSize + padding * 2
  context.font = `${weight} ${fontSize}px ui-monospace, SFMono-Regular, Menlo, monospace`; context.textAlign = 'center'; context.textBaseline = 'middle'; context.shadowColor = '#000'; context.shadowBlur = 8; context.lineWidth = 5; context.strokeStyle = '#000'; context.strokeText(label.name, width / 2, canvas.height / 2); context.fillStyle = label.type === 'country' ? '#e3f8ff' : label.type === 'ocean' ? '#b9dfef' : label.type === 'region' ? '#b4e1ec' : '#f5f7f8'; context.fillText(label.name, width / 2, canvas.height / 2)
  // Small map-label scale: the text should remain readable at close zoom without
  // covering an entire state or city.
  const texture = new THREE.CanvasTexture(canvas), sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: true, depthWrite: false })), height = label.type === 'country' ? .075 : label.type === 'ocean' ? .07 : label.type === 'region' ? .042 : .032
  sprite.scale.set(height * width / canvas.height, height, 1)
  return sprite
}

export function createLabelManager(toPoint, radius, globe) {
  const group = new THREE.Group(); globe.add(group)
  const data = { country: [], region: [], city: [] }, sprites = new Map(); let previous = new Set(), frame = 0
  for (const [type, url] of Object.entries(DATASETS)) fetch(url).then((response) => { if (!response.ok) throw new Error(`Could not load ${type} labels`); return response.json() }).then((result) => { data[type] = asLabels(result, type) }).catch((error) => console.warn(`Natural Earth ${type} labels unavailable`, error))
  const sourceAt = (distance) => distance > 4.55 ? [...data.country.filter((label) => label.rank <= 5), ...OCEANS] : distance > 3.3 ? data.region.filter((label) => label.rank <= 4) : data.city.filter((label) => label.rank <= (distance > 2.65 ? 4 : 8))
  function update(camera, distance) {
    // Actual 3D sprites stay attached to their latitude/longitude while the globe turns.
    if (++frame % 8) return
    const selected = [], usedNames = new Set(), direction = camera.position.clone().normalize(); globe.updateMatrixWorld(true)
    for (const label of sourceAt(distance).slice().sort((a, b) => a.rank - b.rank)) {
      const surface = toPoint(label.lat, label.lon, radius * 1.018), world = globe.localToWorld(surface.clone())
      if (world.clone().normalize().dot(direction) <= 0) continue
      const screen = world.project(camera)
      const nameKey = `${label.type}:${label.name.toLocaleLowerCase()}`
      if (usedNames.has(nameKey) || screen.z < -1 || screen.z > 1 || Math.abs(screen.x) > 1 || Math.abs(screen.y) > 1 || selected.some((item) => Math.abs(item.screen.x - screen.x) < .18 && Math.abs(item.screen.y - screen.y) < .085)) continue
      usedNames.add(nameKey); selected.push({ label, surface, screen }); if (selected.length === 16) break
    }
    const next = new Set()
    for (const { label, surface } of selected) { const id = `${label.type}:${label.name}:${label.lon}:${label.lat}`; next.add(id); let sprite = sprites.get(id); if (!sprite) { sprite = textSprite(label); sprites.set(id, sprite); group.add(sprite) } sprite.position.copy(surface); sprite.visible = true }
    previous.forEach((id) => { if (!next.has(id)) sprites.get(id).visible = false }); previous = next
  }
  return { update, dispose: () => { sprites.forEach((sprite) => { sprite.material.map.dispose(); sprite.material.dispose() }); group.removeFromParent() } }
}
