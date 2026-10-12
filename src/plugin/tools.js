import { LngLatBounds, Marker, Popup } from 'maplibre-gl';

export function createMapTools(map) {
  const definitions = [
    { name: 'get_map_view', description: 'Return the current map center and zoom.', parameters: { type: 'object', properties: {}, required: [] } },
    { name: 'set_map_view', description: 'Move and zoom the map to a location.', parameters: { type: 'object', properties: { longitude: { type: 'number' }, latitude: { type: 'number' }, zoom: { type: 'number' }, location: { type: 'string' } }, required: ['longitude', 'latitude', 'zoom', 'location'], additionalProperties: false } },
    { name: 'create_marker', description: 'Add a labeled marker at geographic coordinates.', parameters: { type: 'object', properties: { longitude: { type: 'number' }, latitude: { type: 'number' }, label: { type: 'string' } }, required: ['longitude', 'latitude', 'label'], additionalProperties: false } },
    { name: 'create_circle', description: 'Draw a circle of the specified radius in meters.', parameters: { type: 'object', properties: { longitude: { type: 'number' }, latitude: { type: 'number' }, radius_meters: { type: 'number', minimum: 1, maximum: 500000 }, label: { type: 'string' } }, required: ['longitude', 'latitude', 'radius_meters', 'label'], additionalProperties: false } },
    { name: 'create_polygon', description: 'Draw an approximate polygon around an area from [longitude, latitude] points. Do not claim approximate geometry is an official boundary.', parameters: { type: 'object', properties: { coordinates: { type: 'array', minItems: 3, maxItems: 100, items: { type: 'array', minItems: 2, maxItems: 2, items: { type: 'number' } } }, label: { type: 'string' } }, required: ['coordinates', 'label'], additionalProperties: false } }
  ];

  function circleRing(longitude, latitude, radius, steps = 64) {
    const angular = radius / 6371008.8;
    const lat1 = latitude * Math.PI / 180;
    const lon1 = longitude * Math.PI / 180;
    const ring = [];
    for (let i = 0; i < steps; i += 1) {
      const bearing = i * 2 * Math.PI / steps;
      const lat2 = Math.asin(Math.sin(lat1) * Math.cos(angular) + Math.cos(lat1) * Math.sin(angular) * Math.cos(bearing));
      const lon2 = lon1 + Math.atan2(Math.sin(bearing) * Math.sin(angular) * Math.cos(lat1), Math.cos(angular) - Math.sin(lat1) * Math.sin(lat2));
      ring.push([lon2 * 180 / Math.PI, lat2 * 180 / Math.PI]);
    }
    ring.push([...ring[0]]);
    return ring;
  }

  function drawPolygon(coordinates, label, color) {
    const points = coordinates.map((point) => [...point]);
    if (points[0][0] !== points.at(-1)[0] || points[0][1] !== points.at(-1)[1]) points.push([...points[0]]);
    const id = `map-chat-${crypto.randomUUID().replaceAll('-', '')}`;
    map.addSource(id, { type: 'geojson', data: { type: 'Feature', properties: { label }, geometry: { type: 'Polygon', coordinates: [points] } } });
    map.addLayer({ id: `${id}-fill`, type: 'fill', source: id, paint: { 'fill-color': color, 'fill-opacity': 0.2 } });
    map.addLayer({ id: `${id}-line`, type: 'line', source: id, paint: { 'line-color': color, 'line-width': 2.5 } });
    map.on('click', `${id}-fill`, (event) => new Popup().setLngLat(event.lngLat).setText(label).addTo(map));
    map.on('mouseenter', `${id}-fill`, () => { map.getCanvas().style.cursor = 'pointer'; });
    map.on('mouseleave', `${id}-fill`, () => { map.getCanvas().style.cursor = ''; });
    const bounds = points.reduce((result, point) => result.extend(point), new LngLatBounds(points[0], points[0]));
    map.fitBounds(bounds, { padding: 70, maxZoom: 14, duration: 800 });
  }

  function validatePoint(longitude, latitude) {
    if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180 || !Number.isFinite(latitude) || latitude < -85 || latitude > 85) throw new Error('Coordinates are outside the supported range.');
  }

  const executors = {
    get_map_view: () => { const center = map.getCenter(); return { longitude: center.lng, latitude: center.lat, zoom: map.getZoom() }; },
    set_map_view: ({ longitude, latitude, zoom, location }) => { validatePoint(longitude, latitude); if (!Number.isFinite(zoom) || zoom < 0 || zoom > 24) throw new Error('Zoom must be between 0 and 24.'); map.flyTo({ center: [longitude, latitude], zoom, essential: true }); return { success: true, location }; },
    create_marker: ({ longitude, latitude, label }) => { validatePoint(longitude, latitude); if (typeof label !== 'string' || !label.trim()) throw new Error('Marker label is required.'); new Marker().setLngLat([longitude, latitude]).setPopup(new Popup().setText(label)).addTo(map); map.flyTo({ center: [longitude, latitude], zoom: Math.max(map.getZoom(), 13), essential: true }); return { success: true, label }; },
    create_circle: ({ longitude, latitude, radius_meters, label }) => { validatePoint(longitude, latitude); if (!Number.isFinite(radius_meters) || radius_meters <= 0 || radius_meters > 500000) throw new Error('Circle radius must be between 1 and 500000 meters.'); drawPolygon(circleRing(longitude, latitude, radius_meters), label, '#df9140'); return { success: true, label, radius_meters }; },
    create_polygon: ({ coordinates, label }) => {
      if (!Array.isArray(coordinates) || coordinates.length < 3 || coordinates.length > 100) throw new Error('A polygon requires 3 to 100 points.');
      coordinates.forEach((point) => { if (!Array.isArray(point) || point.length !== 2) throw new Error('Polygon points must be [longitude, latitude].'); validatePoint(point[0], point[1]); });
      if (new Set(coordinates.map((point) => `${point[0]},${point[1]}`)).size < 3) throw new Error('A polygon requires three distinct points.');
      drawPolygon(coordinates, label, '#31836a'); return { success: true, label, approximate: true };
    }
  };

  return { definitions, executors };
}
