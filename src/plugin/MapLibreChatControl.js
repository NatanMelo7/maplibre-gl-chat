import { createMapTools } from './tools.js';

const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);

/** A provider-agnostic chat control. The configured endpoint must keep provider API keys server-side. */
export class MapLibreChatControl {
  constructor(options = {}) {
    this.options = { endpoint: '/api/llm', model: '', title: 'Can I help?', assistantName: 'Map assistant', systemPrompt: 'You are a helpful assistant in a MapLibre application. Answer in the user’s language. Use map tools when asked to inspect or modify the map. When asked to draw a named place, create a best-effort approximate polygon and clearly say it is approximate, not an official boundary. Never claim a tool succeeded unless its result confirms success.', maxToolCalls: 6, maxHistoryMessages: 20, ...options };
    if (typeof this.options.endpoint !== 'string' || !this.options.endpoint) throw new TypeError('MapLibreChatControl requires an endpoint.');
    this._messages = [];
    this._abort = null;
  }

  onAdd(map) {
    this._map = map;
    this._mapTools = createMapTools(map);
    this._root = document.createElement('div');
    this._root.className = 'mlct-control maplibregl-ctrl';
    this._root.innerHTML = `<button class="mlct-toggle" type="button" aria-expanded="false" aria-label="Open chat">${this.options.buttonLabel || 'Can I help?'}</button><section class="mlct-panel" hidden aria-label="Map assistant"><header><strong>${escapeHtml(this.options.title)}</strong><button class="mlct-close" type="button" aria-label="Close chat">×</button></header><div class="mlct-settings"><label>Model<input class="mlct-model" type="text" value="${escapeHtml(this.options.model)}" placeholder="Server default model"></label></div><div class="mlct-log" role="log" aria-live="polite"><div class="mlct-message mlct-assistant"><b>${escapeHtml(this.options.assistantName)}</b><p>${escapeHtml(this.options.welcomeMessage || 'Ask a question or tell me what to show on the map.')}</p></div></div><form class="mlct-form"><textarea rows="2" aria-label="Your message" placeholder="Ask about the map…" required></textarea><button type="submit">Send ↑</button></form><div class="mlct-status" aria-live="polite">Ready</div></section>`;
    this._panel = this._root.querySelector('.mlct-panel');
    this._log = this._root.querySelector('.mlct-log');
    this._input = this._root.querySelector('textarea');
    this._status = this._root.querySelector('.mlct-status');
    this._toggle = this._root.querySelector('.mlct-toggle');
    this._onToggle = () => this._setOpen(this._panel.hidden);
    this._onClose = () => this._setOpen(false);
    this._onSubmit = (event) => { event.preventDefault(); this.send(this._input.value); };
    this._toggle.addEventListener('click', this._onToggle);
    this._root.querySelector('.mlct-close').addEventListener('click', this._onClose);
    this._root.querySelector('.mlct-form').addEventListener('submit', this._onSubmit);
    return this._root;
  }

  onRemove() {
    this._abort?.abort();
    this._toggle?.removeEventListener('click', this._onToggle);
    this._root?.querySelector('.mlct-close')?.removeEventListener('click', this._onClose);
    this._root?.querySelector('.mlct-form')?.removeEventListener('submit', this._onSubmit);
    this._root?.remove();
    this._map = null;
  }

  _setOpen(open) {
    this._panel.hidden = !open;
    this._toggle.setAttribute('aria-expanded', String(open));
    if (open) this._input.focus();
  }

  _addMessage(role, text) {
    const row = document.createElement('div');
    row.className = `mlct-message mlct-${role}`;
    const name = document.createElement('b');
    name.textContent = role === 'user' ? 'You' : this.options.assistantName;
    const body = document.createElement('p');
    body.textContent = text;
    row.append(name, body);
    this._log.append(row);
    this._log.scrollTop = this._log.scrollHeight;
  }

  async send(input) {
    const text = String(input || '').trim();
    if (!text || this._busy) return;
    this._busy = true;
    this._addMessage('user', text);
    this._messages.push({ role: 'user', content: text });
    this._input.value = '';
    this._input.disabled = true;
    const send = this._root.querySelector('.mlct-form button');
    send.disabled = true;
    this._status.textContent = 'Thinking…';
    this._abort = new AbortController();
    try {
      let reply = '';
      let used = 0;
      for (let round = 0; round <= this.options.maxToolCalls; round += 1) {
        const model = this._root.querySelector('.mlct-model').value.trim() || undefined;
        const result = await this._request({ model, messages: this._messages.slice(-this.options.maxHistoryMessages), systemPrompt: this.options.systemPrompt, tools: this._allTools().map(({ definition }) => definition) }, this._abort.signal);
        this._provider = result.provider || this._provider;
        if (result.text) reply = result.text;
        const calls = Array.isArray(result.toolCalls) ? result.toolCalls : [];
        if (!calls.length) break;
        if (used + calls.length > this.options.maxToolCalls) throw new Error('The model requested too many tool calls.');
        used += calls.length;
        this._messages.push({ role: 'assistant', content: result.text || '', toolCalls: calls });
        for (const call of calls) {
          const tool = this._allTools().find(({ definition }) => definition.name === call.name);
          let toolResult;
          try {
            if (!tool) throw new Error(`Tool is not registered: ${call.name}`);
            const args = typeof call.arguments === 'string' ? JSON.parse(call.arguments || '{}') : call.arguments;
            toolResult = await tool.execute(args, { map: this._map, mapView: this._mapTools.executors.get_map_view() });
          } catch (error) { toolResult = { error: error.message || 'Tool execution failed.' }; }
          this._messages.push({ role: 'tool', name: call.name, toolCallId: call.id, content: JSON.stringify(toolResult ?? null) });
          this.options.onToolCall?.({ name: call.name, arguments: call.arguments, result: toolResult });
        }
      }
      reply ||= 'I could not generate a response. Please try again.';
      this._messages.push({ role: 'assistant', content: reply });
      this._messages = this._messages.slice(-this.options.maxHistoryMessages);
      this._addMessage('assistant', reply);
      this._status.textContent = `${this._provider || 'LLM'} · Map tools enabled`;
    } catch (error) {
      if (error.name !== 'AbortError') {
        this._addMessage('assistant', error.message || 'Could not reach the model. Please try again.');
        this._status.textContent = 'Connection issue · Try again';
      }
    } finally {
      this._busy = false;
      this._input.disabled = false;
      send.disabled = false;
      this._input.focus();
      this._abort = null;
    }
  }

  _allTools() {
    return [
      ...this._mapTools.definitions.map((definition) => ({ definition, execute: (args) => this._mapTools.executors[definition.name](args || {}) })),
      ...(this.options.tools || []).map((tool) => ({ definition: { name: tool.name, description: tool.description || '', parameters: tool.parameters || { type: 'object', properties: {} } }, execute: tool.execute }))
    ];
  }

  async _request(body, signal) {
    const response = await (this.options.fetch || fetch)(this.options.endpoint, { method: 'POST', headers: { 'content-type': 'application/json', ...this.options.headers }, body: JSON.stringify(body), signal });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `Model endpoint returned HTTP ${response.status}.`);
    return data;
  }
}
