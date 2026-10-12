const configs = {
  openai: { model: 'gpt-5-mini', url: 'https://api.openai.com/v1/chat/completions' },
  deepseek: { model: 'deepseek-flash', url: 'https://api.deepseek.com/chat/completions' },
  'openai-compatible': { model: 'gpt-5-mini', url: 'https://api.openai.com/v1/chat/completions' },
  anthropic: { model: 'claude-sonnet-4-6', url: 'https://api.anthropic.com/v1/messages' },
  gemini: { model: 'gemini-3.6-flash', url: 'https://generativelanguage.googleapis.com/v1beta/models' }
};

function openAiMessages(systemPrompt, messages) {
  return [{ role: 'system', content: systemPrompt }, ...messages.map((message) => {
    if (message.role === 'tool') return { role: 'tool', tool_call_id: message.toolCallId, content: message.content };
    if (message.role === 'assistant' && message.toolCalls?.length) return { role: 'assistant', content: message.content || null, tool_calls: message.toolCalls.map((call) => ({ id: call.id, type: 'function', function: { name: call.name, arguments: typeof call.arguments === 'string' ? call.arguments : JSON.stringify(call.arguments) } })) };
    return { role: message.role, content: message.content };
  })];
}
function openAiTools(tools) { return tools.map((tool) => ({ type: 'function', function: { name: tool.name, description: tool.description, parameters: tool.parameters } })); }
function normalizeOpenAi(payload) {
  const message = payload.choices?.[0]?.message;
  if (!message) throw new Error('The model returned an empty response.');
  return { text: message.content || '', toolCalls: (message.tool_calls || []).map((call) => ({ id: call.id, name: call.function?.name, arguments: call.function?.arguments })) };
}
function anthropicMessages(messages) {
  const output = [];
  for (let index = 0; index < messages.length; index += 1) {
    const message = messages[index];
    if (message.role === 'assistant') {
      const content = [];
      if (message.content) content.push({ type: 'text', text: message.content });
      for (const call of message.toolCalls || []) content.push({ type: 'tool_use', id: call.id, name: call.name, input: typeof call.arguments === 'string' ? JSON.parse(call.arguments || '{}') : call.arguments });
      output.push({ role: 'assistant', content });
    } else if (message.role === 'tool') {
      const results = [];
      while (index < messages.length && messages[index].role === 'tool') {
        const result = messages[index++];
        results.push({ type: 'tool_result', tool_use_id: result.toolCallId, content: result.content });
      }
      index -= 1;
      output.push({ role: 'user', content: results });
    }
    else output.push({ role: message.role, content: message.content });
  }
  return output;
}
function normalizeAnthropic(payload) {
  const content = payload.content || [];
  return { text: content.filter((part) => part.type === 'text').map((part) => part.text).join(''), toolCalls: content.filter((part) => part.type === 'tool_use').map((part) => ({ id: part.id, name: part.name, arguments: part.input })) };
}
function safeJson(value) { try { return JSON.parse(value); } catch { return { result: value }; } }
function geminiContents(messages) {
  const output = [];
  for (let index = 0; index < messages.length; index += 1) {
    const message = messages[index];
    if (message.role === 'tool') {
      const parts = [];
      while (index < messages.length && messages[index].role === 'tool') {
        const result = messages[index++];
        parts.push({ functionResponse: { name: result.name, id: result.toolCallId, response: safeJson(result.content) } });
      }
      index -= 1;
      output.push({ role: 'user', parts });
    } else if (message.role === 'assistant') {
      const parts = [];
      if (message.content) parts.push({ text: message.content });
      for (const call of message.toolCalls || []) {
        parts.push({ functionCall: { name: call.name, args: typeof call.arguments === 'string' ? JSON.parse(call.arguments || '{}') : call.arguments }, ...(call.providerData?.thoughtSignature ? { thoughtSignature: call.providerData.thoughtSignature } : {}) });
      }
      output.push({ role: 'model', parts: parts.length ? parts : [{ text: '' }] });
    } else output.push({ role: 'user', parts: [{ text: message.content }] });
  }
  return output;
}
function normalizeGemini(payload) {
  const parts = payload.candidates?.[0]?.content?.parts || [];
  return { text: parts.filter((part) => part.text).map((part) => part.text).join(''), toolCalls: parts.filter((part) => part.functionCall).map((part, index) => ({ id: part.functionCall.id || `gemini-${Date.now()}-${index}`, name: part.functionCall.name, arguments: part.functionCall.args, providerData: part.thoughtSignature ? { thoughtSignature: part.thoughtSignature } : undefined })) };
}
function geminiSchema(schema) {
  if (Array.isArray(schema)) return schema.map(geminiSchema);
  if (!schema || typeof schema !== 'object') return schema;
  const output = {};
  for (const [key, value] of Object.entries(schema)) {
    if (['additionalProperties', 'minItems', 'maxItems'].includes(key)) continue;
    if (key === 'type' && typeof value === 'string') output.type = value.toUpperCase();
    else output[key] = geminiSchema(value);
  }
  return output;
}

export async function completeWithProvider({ model, messages, systemPrompt, tools }) {
  const provider = process.env.LLM_PROVIDER;
  const config = configs[provider];
  if (!config) throw Object.assign(new Error('Set LLM_PROVIDER to openai, anthropic, gemini, deepseek, or openai-compatible.'), { status: 503 });
  const apiKey = process.env.LLM_API_KEY;
  if (!apiKey) throw Object.assign(new Error('LLM_API_KEY is not configured on this server.'), { status: 503 });
  const selectedModel = model || process.env.LLM_MODEL || config.model;
  const customBaseUrl = process.env.LLM_BASE_URL?.replace(/\/+$/, '');
  let url = provider === 'openai-compatible' && customBaseUrl
    ? customBaseUrl.endsWith('/chat/completions') ? customBaseUrl : `${customBaseUrl}/chat/completions`
    : config.url;
  let headers;
  let body;
  if (provider === 'anthropic') {
    headers = { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' };
    body = { model: selectedModel, max_tokens: 1200, system: systemPrompt, messages: anthropicMessages(messages), tools: tools.map((tool) => ({ name: tool.name, description: tool.description, input_schema: tool.parameters })) };
  } else if (provider === 'gemini') {
    url = `${config.url}/${encodeURIComponent(selectedModel)}:generateContent?key=${encodeURIComponent(apiKey)}`;
    headers = { 'content-type': 'application/json' };
    body = { systemInstruction: { parts: [{ text: systemPrompt }] }, contents: geminiContents(messages), tools: [{ functionDeclarations: tools.map((tool) => ({ name: tool.name, description: tool.description, parameters: geminiSchema(tool.parameters) })) }] };
  } else {
    headers = { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' };
    body = { model: selectedModel, messages: openAiMessages(systemPrompt, messages), tools: openAiTools(tools), tool_choice: 'auto', ...(provider === 'openai' && selectedModel.startsWith('gpt-5') ? { max_completion_tokens: 1200 } : { max_tokens: 1200 }), stream: false };
  }
  let response;
  try { response = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body), signal: AbortSignal.timeout(45000) }); }
  catch (error) { throw Object.assign(new Error(error.name === 'TimeoutError' ? `${provider} took too long to respond.` : `Could not connect to ${provider}.`), { status: 502 }); }
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    console.error(`${provider} returned HTTP ${response.status}.`);
    throw Object.assign(new Error(response.status === 401 || response.status === 403 ? `${provider} rejected its API key.` : `${provider} could not complete the request.`), { status: 502 });
  }
  let result;
  if (provider === 'anthropic') result = normalizeAnthropic(payload);
  else if (provider === 'gemini') result = normalizeGemini(payload);
  else result = normalizeOpenAi(payload);
  return { provider, ...result };
}
