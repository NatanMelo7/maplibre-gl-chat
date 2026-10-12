# MapLibre Chat Tools

A MapLibre GL JS control with a chat interface, provider adapters, and function calling for map actions. This repository includes both the reusable npm package and a Vite demo app.

## Install the package

```bash
npm install maplibre-chat-tools maplibre-gl
```

```js
import { MapLibreChatControl } from 'maplibre-chat-tools';
import 'maplibre-chat-tools/style.css';

map.addControl(new MapLibreChatControl({
  endpoint: '/api/llm',
  model: '', // Optional per-control override; defaults to LLM_MODEL on the server.
  title: 'Can I help?',
  assistantName: 'Map assistant'
}), 'top-right');
```

`endpoint` is an application-owned server endpoint. It accepts `{ model, systemPrompt, messages, tools }` and returns `{ provider, text, toolCalls }`. A `toolCall` has `{ id, name, arguments }`; the control runs only registered tools, appends their results, and continues the model conversation. Map coordinates are sent to the provider only when it requests and receives the `get_map_view` tool result. Provider API keys stay on the server. The included `server.js` implements `/api/llm` and chooses its provider from `LLM_PROVIDER`; applications can replace it with their own endpoint or add an adapter for another provider.

### Providers and models

The server uses one provider per deployment and a single generic set of environment variables. Set `LLM_PROVIDER` to `openai`, `anthropic`, `gemini`, `deepseek`, or `openai-compatible`; enter that provider's API key in `LLM_API_KEY`. The chat lets the user override the model name, while `LLM_MODEL` supplies the server default. For an OpenAI-compatible service such as OpenRouter, set `LLM_BASE_URL` to its API base URL (for example, `https://openrouter.ai/api/v1`). Model availability depends on the selected provider account.

Configure the selected provider on the server, using `.env.example` as a template:

```env
LLM_PROVIDER=deepseek
LLM_API_KEY=your-provider-api-key
LLM_MODEL=
LLM_BASE_URL=
```

`LLM_BASE_URL` is used only for `openai-compatible` and remains server-side; the API does not accept provider URLs from the browser. This prevents clients from using the proxy to request arbitrary URLs. Switching providers means changing `LLM_PROVIDER` and `LLM_API_KEY` in the server environment.

## Configure custom tools

Tools are declared and executed in the browser by the application. The model only proposes a call; the control looks up the name in the registered tool list and invokes its executor.

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

Built-in tools inspect or move the map and create markers, circles, and polygons. The polygon tool creates approximate geometry from coordinates; it does not retrieve official administrative or venue boundaries. Applications can add geocoding or authoritative boundary tools as custom tools.

## Development

Requirements: Node.js 20.19+ or 22.12+ and npm.

```bash
npm install
cp -n .env.example .env
# Set LLM_PROVIDER and LLM_API_KEY in .env
npm run dev
```

If `.env` already exists, edit it instead of replacing it. To migrate an earlier setup, move the selected provider's key and model into `LLM_API_KEY` and `LLM_MODEL`, and set `LLM_PROVIDER` to that provider.

Open `http://localhost:5173`. The chosen model appears in the chat panel; the server's configured provider is shown in the status line.

- `npm run build`: builds the demo app into `dist/` and the npm package into `lib-dist/`.
- `npm run preview` / `npm start`: serves the built demo and API locally.
- `npm pack`: creates an installable package archive.

## Package layout

- `src/plugin/`: MapLibre control, map tools, styles, and public TypeScript declarations.
- `src/server/provider-adapters.js`: server-side adapters that normalize provider tool calls.
- `server.js`: demo API proxy and static server.
- `src/`: demo application.

MapLibre compatibility is a peer dependency. OpenStreetMap tiles are used by the demo only; choose a tile provider that meets your application’s availability and usage requirements.
