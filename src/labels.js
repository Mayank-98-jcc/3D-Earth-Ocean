import * as THREE from 'three'

const GLOBE_RADIUS = 2
const DATASETS = {
  // This is the same published country-boundary data used by the globe. It
  // includes every country name and lets us place one label inside each country.
  country: 'https://cdn.jsdelivr.net/gh/johan/world.geo.json@master/countries.geo.json'
}
const OCEANS = [
  { name: 'North Atlantic Ocean', lon: -35, lat: 28 },
  { name: 'South Atlantic Ocean', lon: -18, lat: -30 },
  { name: 'Indian Ocean', lon: 76, lat: -20 },
  { name: 'Pacific Ocean', lon: -155, lat: 5 },
  { name: 'Arctic Ocean', lon: 0, lat: 78 },
  { name: 'Southern Ocean', lon: 15, lat: -57 }
// Oceans use one shared scale so each basin name remains legible in a wide,
// top-of-globe view without becoming larger than the continent label.
].map((ocean) => ({ ...ocean, rank: 1, type: 'ocean', height: .105 }))
// Continental names are intentionally separate from the country data: their
// placement and scale should remain stable as the country labels are culled.
// This keeps Asia centered over the landmass in its close globe view.
const CONTINENTS = [
  { name: 'North\nAmerica', lon: -102, lat: 45, rank: 0, type: 'continent', height: .13 },
  { name: 'South\nAmerica', lon: -60, lat: -16, rank: 0, type: 'continent', height: .13 },
  { name: 'Europe', lon: 18, lat: 51, rank: 0, type: 'continent', height: .13 },
  { name: 'Africa', lon: 20, lat: 7, rank: 0, type: 'continent', height: .13 },
  { name: 'Asia', lon: 86, lat: 42, rank: 0, type: 'continent', height: .13 },
  { name: 'Australia', lon: 134, lat: -25, rank: 0, type: 'continent', height: .13 }
]
// A visual centre is preferable to a geometric centroid for countries with a
// distinctive shape. This position sits over central India, as on the map
// reference, instead of drifting toward its outer border or islands.
const COUNTRY_LABEL_POSITIONS = {
  india: [78.8, 22.7]
}
const INDIA_STATES_API = 'https://api.countrystatecity.in/v1/countries/IN/states'
const INDIA_CITIES_API = 'https://indian-cities-api-nocbegfhqg.now.sh/'
const INDIA_STATES = [
  ['Rajasthan', 74.4, 26.8], ['Gujarat', 71.3, 22.5], ['Madhya Pradesh', 78.2, 23.5], ['Maharashtra', 76.2, 19.3], ['Uttar Pradesh', 80.9, 26.9], ['Bihar', 85.6, 25.8], ['West Bengal', 88.3, 23.2], ['Odisha', 85.2, 20.4], ['Telangana', 79.2, 17.9], ['Karnataka', 75.7, 15.2], ['Tamil Nadu', 78.4, 10.8], ['Kerala', 76.4, 10.3], ['Andhra Pradesh', 80.3, 15.8]
].map(([name, lon, lat]) => ({ name, lon, lat, rank: 0, type: 'state', height: .04 }))
const INDIA_CITIES = [
  ['New Delhi', 77.21, 28.61], ['Mumbai', 72.88, 19.08], ['Ahmedabad', 72.57, 23.02], ['Jaipur', 75.79, 26.91], ['Agra', 78.01, 27.18], ['Lucknow', 80.95, 26.85], ['Bhopal', 77.41, 23.26], ['Indore', 75.86, 22.72], ['Nagpur', 79.09, 21.15], ['Hyderabad', 78.49, 17.39], ['Bengaluru', 77.59, 12.97], ['Chennai', 80.27, 13.08], ['Kolkata', 88.36, 22.57], ['Patna', 85.14, 25.61], ['Ranchi', 85.31, 23.34], ['Bhubaneswar', 85.82, 20.30], ['Surat', 72.83, 21.17], ['Pune', 73.86, 18.52], ['Kochi', 76.27, 9.93], ['Amaravati', 80.65, 16.51]
].map(([name, lon, lat]) => ({ name, lon, lat, rank: 0, type: 'city', height: .032 }))
const nameFor = (p) => p.NAME_EN || p.NAMEASCII || p.NAME || p.name || p.name_en || p.STATE_NAME || p.State_Name || p.ST_NM || p.st_nm || p.NAME_1 || null
const rankFor = (p) => Number(p.SCALERANK ?? p.scalerank ?? p.LABELRANK ?? p.labelrank ?? p.RANK_MAX ?? 99)

function countryLabelHeight(geometry, [longitude, latitude], name) {
  const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates
  const points = polygons.flatMap((polygon) => polygon.flatMap((ring) => ring))
  if (!points.length) return 0
  const longitudes = points.map(([lon]) => lon), latitudes = points.map(([, lat]) => lat)
  const longitudeSpan = Math.max(...longitudes) - Math.min(...longitudes), latitudeSpan = Math.max(...latitudes) - Math.min(...latitudes)
  // Convert geographic bounds to the globe's world units. The limits leave a
  // comfortable land margin, so a name does not cross into a neighbour or sea.
  const landWidth = longitudeSpan * Math.PI / 180 * GLOBE_RADIUS * Math.max(.16, Math.cos(latitude * Math.PI / 180))
  const landHeight = latitudeSpan * Math.PI / 180 * GLOBE_RADIUS
  const longestLine = Math.max(...name.toUpperCase().replace('UNITED STATES OF AMERICA', 'UNITED\nSTATES').replace('UNITED STATES', 'UNITED\nSTATES').split('\n').map((line) => line.length))
  const textAspect = Math.max(1, longestLine * .58)
  return Math.min(.055, landWidth * .46 / textAspect, landHeight * .18)
}

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
    const geometryCoordinates = geometry.type === 'Point' ? geometry.coordinates : (geometry.type === 'Polygon' || geometry.type === 'MultiPolygon' ? polygonLabelPoint(geometry) : null)
    const name = nameFor(properties)
    const coordinates = type === 'country' && name ? COUNTRY_LABEL_POSITIONS[name.toLowerCase()] ?? geometryCoordinates : geometryCoordinates
    if (!coordinates || !Number.isFinite(coordinates[0]) || !Number.isFinite(coordinates[1])) return null
    return { name, lon: coordinates[0], lat: coordinates[1], rank: type === 'country' ? Number(properties.SCALERANK ?? properties.scalerank ?? 1) : rankFor(properties), height: type === 'country' ? countryLabelHeight(geometry, coordinates, name ?? '') : type === 'state' ? .04 : null, type }
  }).filter((label) => label?.name)
}
function surfaceText(label, toPoint, radius) {
  if (label.type === 'ocean') return curvedOceanText(label, toPoint, radius)
  const fontSize = label.type === 'continent' ? 64 : label.type === 'city' ? 42 : label.type === 'state' ? 38 : 56, padding = 15, lines = label.name.toUpperCase().replace('UNITED STATES OF AMERICA', 'UNITED\nSTATES').replace('UNITED STATES', 'UNITED\nSTATES').split('\n'), canvas = document.createElement('canvas'), context = canvas.getContext('2d')
  context.font = `700 ${fontSize}px Arial, Helvetica, sans-serif`
  const cityMarker = label.type === 'city' ? fontSize * .5 : 0, width = Math.ceil(Math.max(...lines.map((line) => context.measureText(line).width))) + padding * 2 + cityMarker, lineHeight = fontSize * .92
  canvas.width = width; canvas.height = Math.ceil(lines.length * lineHeight + padding * 2)
  context.font = `700 ${fontSize}px Arial, Helvetica, sans-serif`; context.textAlign = 'center'; context.textBaseline = 'middle'; context.lineWidth = 5; context.strokeStyle = '#e6e8e6'; context.fillStyle = '#1b2b42'
  lines.forEach((line, index) => { const y = padding + lineHeight * (index + .5); context.strokeText(line, width / 2 + cityMarker / 2, y); context.fillText(line, width / 2 + cityMarker / 2, y) })
  if (cityMarker) { context.beginPath(); context.arc(padding + cityMarker * .32, canvas.height / 2, fontSize * .16, 0, Math.PI * 2); context.fillStyle = '#f7f7f5'; context.fill(); context.lineWidth = 3; context.strokeStyle = '#1b2b42'; context.stroke() }
  const height = label.type === 'country' ? label.height : label.height ?? .05, mesh = new THREE.Mesh(new THREE.PlaneGeometry(height * width / canvas.height, height), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(canvas), transparent: true, depthTest: true, depthWrite: false, side: THREE.FrontSide })), normal = toPoint(label.lat, label.lon, 1).normalize(), east = new THREE.Vector3(Math.sin((label.lon + 180) * Math.PI / 180), 0, Math.cos((label.lon + 180) * Math.PI / 180)), north = new THREE.Vector3().crossVectors(normal, east).normalize()
  // The compact label sits tangent to the spherical surface, retaining the
  // globe's curvature and horizon clipping without spreading its letters.
  mesh.position.copy(normal).multiplyScalar(radius * 1.009)
  mesh.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(east, north, normal))
  mesh.userData.labelType = label.type
  return mesh
}

function curvedOceanText(label, toPoint, radius) {
  const fontSize = 56, padding = 12, text = label.name.toUpperCase(), measure = document.createElement('canvas').getContext('2d')
  measure.font = `700 ${fontSize}px Arial, Helvetica, sans-serif`
  const advances = [...text].map((character) => measure.measureText(character).width), totalAdvance = advances.reduce((sum, advance) => sum + advance, 0)
  const group = new THREE.Group(), latitudeRadians = label.lat * Math.PI / 180, worldHeight = label.height
  let offset = -totalAdvance / 2
  for (let index = 0; index < text.length; index++) {
    const character = text[index], advance = advances[index], center = offset + advance / 2
    offset += advance
    if (character === ' ') continue
    const canvas = document.createElement('canvas'), context = canvas.getContext('2d')
    canvas.width = Math.ceil(advance + padding * 2); canvas.height = Math.ceil(fontSize + padding * 2)
    context.font = `700 ${fontSize}px Arial, Helvetica, sans-serif`; context.textAlign = 'center'; context.textBaseline = 'middle'; context.lineWidth = 5; context.strokeStyle = '#e6e8e6'; context.fillStyle = '#1b2b42'
    context.strokeText(character, canvas.width / 2, canvas.height / 2); context.fillText(character, canvas.width / 2, canvas.height / 2)
    // Distribute characters around the latitude circle. Each receives its own
    // tangent plane, making the complete ocean name follow the globe's curve.
    const longitude = label.lon + THREE.MathUtils.radToDeg((center / totalAdvance) * (worldHeight * totalAdvance / canvas.height) / (radius * Math.max(.16, Math.cos(latitudeRadians))))
    const normal = toPoint(label.lat, longitude, 1).normalize(), east = new THREE.Vector3(Math.sin((longitude + 180) * Math.PI / 180), 0, Math.cos((longitude + 180) * Math.PI / 180)), north = new THREE.Vector3().crossVectors(normal, east).normalize()
    const characterHeight = worldHeight, characterWidth = characterHeight * canvas.width / canvas.height
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(characterWidth, characterHeight), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(canvas), transparent: true, depthTest: true, depthWrite: false, side: THREE.FrontSide }))
    mesh.position.copy(normal).multiplyScalar(radius * 1.009)
    mesh.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(east, north, normal))
    group.add(mesh)
  }
  group.userData.labelType = label.type
  return group
}

export function createLabelManager(toPoint, radius, globe) {
  const group = new THREE.Group(); globe.add(group)
  const data = { country: [] }, sprites = new Map(); let indiaStates = INDIA_STATES, indiaCities = INDIA_CITIES, hasStateGeometry = false, previous = new Set(), frame = 0
  for (const [type, url] of Object.entries(DATASETS)) fetch(url).then((response) => { if (!response.ok) throw new Error(`Could not load ${type} labels`); return response.json() }).then((result) => { data[type] = asLabels(result, type) }).catch((error) => console.warn(`Natural Earth ${type} labels unavailable`, error))
  const cscApiKey = import.meta.env.VITE_CSC_API_KEY
  if (cscApiKey) fetch(INDIA_STATES_API, { headers: { 'X-CSCAPI-KEY': cscApiKey } }).then((response) => { if (!response.ok) throw new Error(`Could not load Indian states (${response.status})`); return response.json() }).then((states) => {
    const apiStates = states.map(({ name, latitude, longitude }) => ({ name, lat: Number(latitude), lon: Number(longitude), rank: 0, type: 'state', height: .04 })).filter(({ name, lat, lon }) => name && Number.isFinite(lat) && Number.isFinite(lon))
    if (!hasStateGeometry && apiStates.length) indiaStates = apiStates
  }).catch((error) => console.warn('CountryStateCity state labels unavailable; using bundled labels', error))
  fetch(INDIA_CITIES_API, { method: 'GET', headers: { 'Content-Type': 'application/json' } }).then((response) => { if (!response.ok) throw new Error(`Could not load Indian cities (${response.status})`); return response.json() }).then((result) => {
    const cities = Array.isArray(result) ? result : result.data ?? result.cities ?? []
    const apiCities = cities.map((city) => {
      const name = city.name ?? city.city ?? city.City
      const lat = Number(city.latitude ?? city.lat ?? city.Latitude)
      const lon = Number(city.longitude ?? city.lng ?? city.lon ?? city.Longitude)
      return { name, lat, lon, rank: 0, type: 'city', height: .032 }
    }).filter(({ name, lat, lon }) => name && Number.isFinite(lat) && Number.isFinite(lon))
    if (apiCities.length) indiaCities = apiCities
  }).catch((error) => console.warn('Indian cities API unavailable; using bundled city labels', error))
  const sourceAt = (distance) => {
    const countryLabels = data.country.filter((label) => (label.rank <= 5 && label.height >= .022 && distance >= 3.6) || label.name === 'India')
    return [...(distance >= 4.1 ? CONTINENTS : []), ...countryLabels, ...(distance < 4.4 && distance >= 3.35 ? indiaStates : []), ...(distance < 3.35 ? indiaCities : []), ...(distance >= 3.6 ? OCEANS : [])]
  }
  function update(camera, distance) {
    // Actual 3D sprites stay attached to their latitude/longitude while the globe turns.
    if (++frame % 8) return
    const selected = [], usedNames = new Set(), direction = camera.position.clone().normalize(); globe.updateMatrixWorld(true)
    for (const label of sourceAt(distance).slice().sort((a, b) => (a.type === 'continent' ? -1 : b.type === 'continent' ? 1 : a.name === 'India' ? -1 : b.name === 'India' ? 1 : a.type === 'state' ? -1 : b.type === 'state' ? 1 : a.type === 'ocean' ? -1 : b.type === 'ocean' ? 1 : a.rank - b.rank))) {
      const surface = toPoint(label.lat, label.lon, radius * 1.018), world = globe.localToWorld(surface.clone())
      if (world.clone().normalize().dot(direction) <= 0) continue
      const screen = world.project(camera)
      const nameKey = `${label.type}:${label.name.toLocaleLowerCase()}`
      const minHorizontalGap = label.type === 'continent' ? .36 : label.type === 'ocean' ? .3 : label.type === 'city' ? .1 : .18
      const minVerticalGap = label.type === 'continent' ? .16 : label.type === 'ocean' ? .13 : label.type === 'city' ? .055 : .09
      if (usedNames.has(nameKey) || screen.z < -1 || screen.z > 1 || Math.abs(screen.x) > 1 || Math.abs(screen.y) > 1 || selected.some((item) => Math.abs(item.screen.x - screen.x) < minHorizontalGap && Math.abs(item.screen.y - screen.y) < minVerticalGap)) continue
      usedNames.add(nameKey); selected.push({ label, surface, screen }); if (selected.length === 28) break
    }
    const next = new Set()
    for (const { label } of selected) {
      const id = `${label.type}:${label.name}:${label.lon}:${label.lat}`; next.add(id); let sprite = sprites.get(id)
      if (!sprite) { sprite = surfaceText(label, toPoint, radius); sprites.set(id, sprite); group.add(sprite) }
      // Map labels should not balloon as the camera approaches the surface.
      // This retains the compact country/city hierarchy from the reference.
      const isIndiaDetail = ['country', 'state', 'city'].includes(label.type)
      const scale = isIndiaDetail ? THREE.MathUtils.clamp((distance - 2) / 1.6, .38, 1) : 1
      sprite.scale.setScalar(scale); sprite.visible = true
    }
    previous.forEach((id) => { if (!next.has(id)) sprites.get(id).visible = false }); previous = next
  }
  function setStateBoundaries(geoJson) {
    const geographicalStates = asLabels(geoJson, 'state')
    if (geographicalStates.length) { indiaStates = geographicalStates; hasStateGeometry = true }
  }
  return { update, setStateBoundaries, dispose: () => { sprites.forEach((sprite) => sprite.traverse((part) => { part.geometry?.dispose(); part.material?.map?.dispose(); part.material?.dispose() })); group.removeFromParent() } }
}
