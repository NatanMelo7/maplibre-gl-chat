import type { IControl, Map } from 'maplibre-gl';

export interface MapChatTool {
  name: string;
  description?: string;
  parameters?: Record<string, unknown>;
  execute: (args: Record<string, unknown>, context: { map: Map; mapView: { longitude: number; latitude: number; zoom: number } }) => unknown | Promise<unknown>;
}
export interface MapLibreChatControlOptions {
  endpoint: string;
  model?: string;
  title?: string;
  buttonLabel?: string;
  assistantName?: string;
  welcomeMessage?: string;
  systemPrompt?: string;
  maxToolCalls?: number;
  maxHistoryMessages?: number;
  headers?: Record<string, string>;
  fetch?: typeof fetch;
  tools?: MapChatTool[];
  onToolCall?: (event: { name: string; arguments: unknown; result: unknown }) => void;
}
export declare class MapLibreChatControl implements IControl {
  constructor(options: MapLibreChatControlOptions);
  onAdd(map: Map): HTMLElement;
  onRemove(): void;
  send(message: string): Promise<void>;
}
export declare function createMapTools(map: Map): {
  definitions: Array<{ name: string; description: string; parameters: Record<string, unknown> }>;
  executors: Record<string, (args?: Record<string, unknown>) => unknown>;
};
