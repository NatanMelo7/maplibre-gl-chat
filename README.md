# MapLibre Chat Tools

A reusable MapLibre GL JS control that connects a chat interface to application-defined LLM function calling and map actions.

## Install

```bash
npm install maplibre-chat-tools maplibre-gl
```

```js
import { MapLibreChatControl } from 'maplibre-chat-tools';
import 'maplibre-chat-tools/style.css';

map.addControl(new MapLibreChatControl({
  endpoint: '/api/llm',
  title: 'Can I help?',
  assistantName: 'Map assistant'
}), 'top-right');
```

## LLM endpoint

The library is provider-agnostic. The host application supplies `endpoint`, a server route that accepts `{ model, systemPrompt, messages, tools }` and returns `{ provider, text, toolCalls }`. Each tool call has `{ id, name, arguments }`. The control executes only registered tools, sends their results back to the endpoint, and continues the model conversation until it receives a text response.

The backend adapter belongs to the host application. It selects the provider and model, holds API credentials server-side, translates the common tool-call contract to the chosen LLM API, and normalizes the response. This lets each application use OpenAI, Anthropic, Gemini, DeepSeek, an OpenAI-compatible service, or another provider without coupling the MapLibre control to that provider. The model field in the chat optionally overrides the backend's default model.

Map coordinates are sent to the LLM only when it requests the `get_map_view` tool and the tool result is returned to the endpoint. API keys and provider URLs are never read or stored by the browser control.

## Built-in map tools

- `get_map_view`: read the current map center and zoom.
- `set_map_view`: move and zoom the map.
- `create_marker`: add a labeled point.
- `create_circle`: draw a circle with a radius in meters.
- `create_polygon`: draw a polygon from `[longitude, latitude]` points.

Generated polygons around named places are approximate. The library does not geocode names or fetch official administrative or venue boundaries; host applications can supply custom tools for those data sources.

## Custom tools

Register app-specific tools with a JSON Schema and an executor. Executors receive the MapLibre map and the current view:

```js
new MapLibreChatControl({
  endpoint: '/api/llm',
  tools: [{
    name: 'show_dataset',
    description: 'Show a dataset layer on the map.',
    parameters: {
      type: 'object',
      properties: { layerId: { type: 'string' } },
      required: ['layerId'],
      additionalProperties: false
    },
    execute: ({ layerId }, { map }) => {
      map.setLayoutProperty(layerId, 'visibility', 'visible');
      return { success: true, layerId };
    }
  }]
});
```

Only tools registered on the control can execute. Validate tool arguments and add confirmation in the host application for actions that need it.

## Develop and package

Requirements: Node.js 20.19+ or 22.12+ and npm.

```bash
npm install
npm run build
npm pack
```

`npm run build` creates the ESM package, CSS, and TypeScript declarations in `lib-dist/`. `npm pack` runs the build before creating the installable tarball.

## Source layout

- `src/plugin/MapLibreChatControl.js`: MapLibre control and chat UI.
- `src/plugin/tools.js`: built-in map tool schemas and executors.
- `src/plugin/style.css`: control styles.
- `src/plugin/index.d.ts`: public TypeScript declarations.
- `vite.lib.config.js`: npm library build.

MapLibre GL JS is a peer dependency so the host application controls its MapLibre version.
