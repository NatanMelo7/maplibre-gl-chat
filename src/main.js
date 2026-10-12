import { Map, setWorkerUrl } from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import 'maplibre-gl/dist/maplibre-gl.css';
import './style.css';
import { MapLibreChatControl } from './plugin/index.js';

setWorkerUrl(workerUrl);

const home = { center: [-46.6333, -23.5505], zoom: 10.5 };
const status = document.querySelector('#map-status');
const map = new Map({
  container: 'map',
  style: {
    version: 8,
    sources: { openstreetmap: { type: 'raster', tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'], tileSize: 256, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>' } },
    layers: [{ id: 'openstreetmap', type: 'raster', source: 'openstreetmap', minzoom: 0, maxzoom: 19 }]
  },
  center: home.center,
  zoom: home.zoom,
  minZoom: 2,
  maxZoom: 18,
  attributionControl: true
});

map.on('load', () => { status.textContent = 'Map ready'; });
map.on('error', (event) => { console.error('Error loading map:', event.error); status.textContent = 'Could not load map'; });
document.querySelector('#home-button').addEventListener('click', () => map.flyTo({ ...home, essential: true }));

map.addControl(new MapLibreChatControl({
  endpoint: '/api/llm',
  model: '',
  title: 'Can I help?',
  assistantName: 'Map assistant',
  welcomeMessage: 'Hi! I can help you explore the map, add markers, draw circles, and create approximate polygons around places.'
}), 'top-right');
