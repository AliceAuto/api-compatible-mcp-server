export const providerIds = ["openai", "grok", "glm", "gemini", "anthropic", "deepseek", "qwen"] as const;

export type ProviderId = (typeof providerIds)[number];

export type MessageRole = "system" | "user" | "assistant";

export interface UnifiedMessage {
  role: MessageRole;
  content: string;
}

export interface UnifiedChatRequest {
  provider: ProviderId;
  model?: string;
  messages: UnifiedMessage[];
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  stop?: string[];
  stream?: boolean;
  tools?: UnifiedToolDefinition[];
  toolChoice?: UnifiedToolChoice;
}

export interface UnifiedToolDefinition {
  name: string;
  description?: string;
  parameters?: Record<string, unknown>;
}

export type UnifiedToolChoice = "auto" | "none" | { name: string };

export interface UnifiedToolCall {
  id?: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface UnifiedChatResponse {
  provider: ProviderId;
  model: string;
  text: string;
  raw: unknown;
  streamed?: boolean;
  chunks?: string[];
  toolCalls?: UnifiedToolCall[];
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
  };
}

interface ProviderConfig {
  id: ProviderId;
  label: string;
  kind: "openai-compatible" | "gemini" | "anthropic";
  baseUrl: string;
  apiKey?: string;
  defaultModel: string;
}

export type PreparedRequest = {
  url: string;
  method: "POST";
  headers: Record<string, string>;
  body: Record<string, unknown>;
};

const trimTrailingSlash = (value: string) => value.replace(/\/+$/, "");

const readEnv = (name: string) => process.env[name]?.trim() || "";

const readPositiveIntEnv = (name: string, fallback: number) => {
  const raw = readEnv(name);
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
};

const REQUEST_TIMEOUT_MS = readPositiveIntEnv("MCP_REQUEST_TIMEOUT_MS", 60_000);
const RETRY_COUNT = readPositiveIntEnv("MCP_RETRY_COUNT", 1);
const RETRY_DELAY_MS = readPositiveIntEnv("MCP_RETRY_DELAY_MS", 300);
const STREAM_MAX_EVENTS = readPositiveIntEnv("MCP_STREAM_MAX_EVENTS", 2_000);
const STREAM_MAX_TEXT_CHARS = readPositiveIntEnv("MCP_STREAM_MAX_TEXT_CHARS", 300_000);
const ERROR_DETAIL_MAX_CHARS = readPositiveIntEnv("MCP_ERROR_DETAIL_MAX_CHARS", 2_000);

const buildProviderConfig = (id: ProviderId): ProviderConfig => {
  switch (id) {
    case "openai":
      return {
        id,
        label: "OpenAI",
        kind: "openai-compatible",
        baseUrl: trimTrailingSlash(readEnv("OPENAI_BASE_URL") || "https://api.openai.com/v1"),
        apiKey: readEnv("OPENAI_API_KEY"),
        defaultModel: readEnv("OPENAI_DEFAULT_MODEL") || "gpt-4o-mini",
      };
    case "grok":
      return {
        id,
        label: "Grok",
        kind: "openai-compatible",
        baseUrl: trimTrailingSlash(readEnv("GROK_BASE_URL") || "https://api.x.ai/v1"),
        apiKey: readEnv("GROK_API_KEY"),
        defaultModel: readEnv("GROK_DEFAULT_MODEL") || "grok-2-latest",
      };
    case "glm":
      return {
        id,
        label: "GLM",
        kind: "openai-compatible",
        baseUrl: trimTrailingSlash(readEnv("GLM_BASE_URL") || "https://open.bigmodel.cn/api/paas/v4"),
        apiKey: readEnv("GLM_API_KEY"),
        defaultModel: readEnv("GLM_DEFAULT_MODEL") || "glm-4-flash",
      };
    case "gemini":
      return {
        id,
        label: "Gemini",
        kind: "gemini",
        baseUrl: trimTrailingSlash(readEnv("GEMINI_BASE_URL") || "https://generativelanguage.googleapis.com/v1beta"),
        apiKey: readEnv("GEMINI_API_KEY"),
        defaultModel: readEnv("GEMINI_DEFAULT_MODEL") || "gemini-2.0-flash",
      };
    case "anthropic":
      return {
        id,
        label: "Anthropic",
        kind: "anthropic",
        baseUrl: trimTrailingSlash(readEnv("ANTHROPIC_BASE_URL") || "https://api.anthropic.com/v1"),
        apiKey: readEnv("ANTHROPIC_API_KEY"),
        defaultModel: readEnv("ANTHROPIC_DEFAULT_MODEL") || "claude-3-5-sonnet-latest",
      };
    case "deepseek":
      return {
        id,
        label: "DeepSeek",
        kind: "openai-compatible",
        baseUrl: trimTrailingSlash(readEnv("DEEPSEEK_BASE_URL") || "https://api.deepseek.com/v1"),
        apiKey: readEnv("DEEPSEEK_API_KEY"),
        defaultModel: readEnv("DEEPSEEK_DEFAULT_MODEL") || "deepseek-chat",
      };
    case "qwen":
      return {
        id,
        label: "Qwen",
        kind: "openai-compatible",
        baseUrl: trimTrailingSlash(readEnv("QWEN_BASE_URL") || "https://dashscope.aliyuncs.com/compatible-mode/v1"),
        apiKey: readEnv("QWEN_API_KEY"),
        defaultModel: readEnv("QWEN_DEFAULT_MODEL") || "qwen-plus",
      };
  }
};

export const providerCatalog: Record<ProviderId, ProviderConfig> = {
  openai: buildProviderConfig("openai"),
  grok: buildProviderConfig("grok"),
  glm: buildProviderConfig("glm"),
  gemini: buildProviderConfig("gemini"),
  anthropic: buildProviderConfig("anthropic"),
  deepseek: buildProviderConfig("deepseek"),
  qwen: buildProviderConfig("qwen"),
};

const normalizeText = (value: unknown) => {
  if (typeof value === "string") {
    return value;
  }

  if (value == null) {
    return "";
  }

  return String(value);
};

const buildUrl = (baseUrl: string, path: string, query: Record<string, string | undefined>) => {
  const normalizedPath = path.replace(/^\/+/, "");
  const url = new URL(normalizedPath, `${trimTrailingSlash(baseUrl)}/`);

  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) {
      url.searchParams.set(key, value);
    }
  }

  return url.toString();
};

const normalizeOpenAIToolChoice = (value?: UnifiedToolChoice): Record<string, unknown> | string | undefined => {
  if (!value) {
    return undefined;
  }

  if (typeof value === "string") {
    return value;
  }

  return { type: "function", function: { name: value.name } };
};

const normalizeAnthropicToolChoice = (value?: UnifiedToolChoice): Record<string, unknown> | string | undefined => {
  if (!value) {
    return undefined;
  }

  if (typeof value === "string") {
    return value;
  }

  return { type: "tool", name: value.name };
};

const normalizeGeminiToolChoice = (value?: UnifiedToolChoice) => {
  if (!value) {
    return undefined;
  }

  if (typeof value === "string") {
    return {
      functionCallingConfig: {
        mode: value === "none" ? "NONE" : value === "auto" ? "AUTO" : "ANY",
      },
    };
  }

  return {
    functionCallingConfig: {
      mode: "ANY",
      allowedFunctionNames: [value.name],
    },
  };
};

const normalizeToolsForOpenAI = (tools?: UnifiedToolDefinition[]) => {
  if (!tools?.length) {
    return undefined;
  }

  return tools.map((tool) => ({
    type: "function",
    function: {
      name: tool.name.trim(),
      description: tool.description,
      parameters: tool.parameters || { type: "object", properties: {} },
    },
  }));
};

const normalizeToolsForAnthropic = (tools?: UnifiedToolDefinition[]) => {
  if (!tools?.length) {
    return undefined;
  }

  return tools.map((tool) => ({
    name: tool.name.trim(),
    description: tool.description,
    input_schema: tool.parameters || { type: "object", properties: {} },
  }));
};

const normalizeToolsForGemini = (tools?: UnifiedToolDefinition[]) => {
  if (!tools?.length) {
    return undefined;
  }

  return [
    {
      functionDeclarations: tools.map((tool) => ({
        name: tool.name.trim(),
        description: tool.description,
        parameters: tool.parameters || { type: "object", properties: {} },
      })),
    },
  ];
};

const ensureValidRequest = (request: UnifiedChatRequest) => {
  if (!request.messages.length) {
    throw new Error("At least one message is required.");
  }

  for (const [index, message] of request.messages.entries()) {
    if (!message.content.trim()) {
      throw new Error(`Message at index ${index} cannot be empty.`);
    }
  }

  if (request.tools) {
    for (const [index, tool] of request.tools.entries()) {
      if (!tool.name.trim()) {
        throw new Error(`Tool at index ${index} requires a non-empty name.`);
      }
    }
  }
};

export const prepareRequest = (request: UnifiedChatRequest): PreparedRequest => {
  ensureValidRequest(request);
  const provider = providerCatalog[request.provider];
  const model = request.model || provider.defaultModel;
  const apiKey = provider.apiKey || "YOUR_API_KEY";

  const hasSystemMessage = request.messages.some((message) => message.role === "system");
  const systemText = request.messages
    .filter((message) => message.role === "system")
    .map((message) => normalizeText(message.content))
    .join("\n")
    .trim();

  const conversationalMessages = request.messages.filter((message) => message.role !== "system");

  if (provider.kind === "gemini") {
    const contents = conversationalMessages.map((message) => ({
      role: message.role === "assistant" ? "model" : "user",
      parts: [{ text: normalizeText(message.content) }],
    }));
    const body: Record<string, unknown> = {
      contents,
    };

    if (hasSystemMessage) {
      body.systemInstruction = {
        parts: [{ text: systemText }],
      };
    }

    if (typeof request.temperature === "number") {
      body.generationConfig = {
        ...(body.generationConfig as Record<string, unknown> | undefined),
        temperature: request.temperature,
      };
    }

    if (typeof request.maxTokens === "number") {
      body.generationConfig = {
        ...(body.generationConfig as Record<string, unknown> | undefined),
        maxOutputTokens: request.maxTokens,
      };
    }

    if (typeof request.topP === "number") {
      body.generationConfig = {
        ...(body.generationConfig as Record<string, unknown> | undefined),
        topP: request.topP,
      };
    }

    if (request.stop?.length) {
      body.generationConfig = {
        ...(body.generationConfig as Record<string, unknown> | undefined),
        stopSequences: request.stop,
      };
    }

    const geminiTools = normalizeToolsForGemini(request.tools);
    if (geminiTools) {
      body.tools = geminiTools;
    }

    const geminiToolChoice = normalizeGeminiToolChoice(request.toolChoice);
    if (geminiToolChoice) {
      body.toolConfig = geminiToolChoice;
    }

    return {
      url: buildUrl(
        provider.baseUrl,
        `/models/${encodeURIComponent(model)}:${request.stream ? "streamGenerateContent" : "generateContent"}`,
        {
          key: apiKey,
          alt: request.stream ? "sse" : undefined,
        },
      ),
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body,
    };
  }

  if (provider.kind === "anthropic") {
    const messages = conversationalMessages.map((message) => ({
      role: message.role === "assistant" ? "assistant" : "user",
      content: normalizeText(message.content),
    }));

    const body: Record<string, unknown> = {
      model,
      max_tokens: request.maxTokens || 1024,
      messages,
    };

    if (hasSystemMessage) {
      body.system = systemText;
    }

    if (typeof request.temperature === "number") {
      body.temperature = request.temperature;
    }

    if (typeof request.topP === "number") {
      body.top_p = request.topP;
    }

    if (request.stop?.length) {
      body.stop_sequences = request.stop;
    }

    if (typeof request.stream === "boolean") {
      body.stream = request.stream;
    }

    const anthropicTools = normalizeToolsForAnthropic(request.tools);
    if (anthropicTools) {
      body.tools = anthropicTools;
    }

    const toolChoice = normalizeAnthropicToolChoice(request.toolChoice);
    if (toolChoice) {
      body.tool_choice = toolChoice;
    }

    return {
      url: buildUrl(provider.baseUrl, "/messages", {}),
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "anthropic-version": "2023-06-01",
      },
      body,
    };
  }

  const body: Record<string, unknown> = {
    model,
    messages: request.messages.map((message) => ({
      role: message.role,
      content: normalizeText(message.content),
    })),
  };

  if (typeof request.temperature === "number") {
    body.temperature = request.temperature;
  }

  if (typeof request.maxTokens === "number") {
    body.max_tokens = request.maxTokens;
  }

  if (typeof request.topP === "number") {
    body.top_p = request.topP;
  }

  if (request.stop?.length) {
    body.stop = request.stop;
  }

  if (typeof request.stream === "boolean") {
    body.stream = request.stream;
  }

  const openAiTools = normalizeToolsForOpenAI(request.tools);
  if (openAiTools) {
    body.tools = openAiTools;
  }

  const toolChoice = normalizeOpenAIToolChoice(request.toolChoice);
  if (toolChoice) {
    body.tool_choice = toolChoice;
  }

  return {
    url: buildUrl(provider.baseUrl, "/chat/completions", {}),
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body,
  };
};

const extractOpenAIText = (payload: any) => {
  const choice = payload?.choices?.[0];
  const message = choice?.message;

  if (typeof message?.content === "string") {
    return message.content;
  }

  if (Array.isArray(message?.content)) {
    return message.content
      .map((part: any) => (typeof part?.text === "string" ? part.text : ""))
      .filter(Boolean)
      .join("");
  }

  if (typeof choice?.text === "string") {
    return choice.text;
  }

  return "";
};

const extractGeminiText = (payload: any) => {
  const candidate = payload?.candidates?.[0];
  const parts = candidate?.content?.parts;

  if (!Array.isArray(parts)) {
    return "";
  }

  return parts
    .map((part: any) => (typeof part?.text === "string" ? part.text : ""))
    .filter(Boolean)
    .join("");
};

const extractAnthropicText = (payload: any) => {
  const content = payload?.content;

  if (!Array.isArray(content)) {
    return "";
  }

  return content
    .map((part: any) => (typeof part?.text === "string" ? part.text : ""))
    .filter(Boolean)
    .join("");
};

const extractToolCalls = (payload: any, providerId: ProviderId): UnifiedToolCall[] => {
  if (providerId === "anthropic") {
    const content = payload?.content;

    if (!Array.isArray(content)) {
      return [];
    }

    return content
      .filter((part: any) => part?.type === "tool_use")
      .map((part: any) => ({
        id: typeof part?.id === "string" ? part.id : undefined,
        name: typeof part?.name === "string" ? part.name : "",
        arguments: typeof part?.input === "object" && part?.input !== null ? part.input : {},
      }))
      .filter((call: UnifiedToolCall) => Boolean(call.name));
  }

  if (providerId === "gemini") {
    const parts = payload?.candidates?.[0]?.content?.parts;

    if (!Array.isArray(parts)) {
      return [];
    }

    return parts
      .filter((part: any) => part?.functionCall)
      .map((part: any) => ({
        id: undefined,
        name: typeof part?.functionCall?.name === "string" ? part.functionCall.name : "",
        arguments: typeof part?.functionCall?.args === "object" && part?.functionCall?.args !== null ? part.functionCall.args : {},
      }))
      .filter((call: UnifiedToolCall) => Boolean(call.name));
  }

  const toolCalls = payload?.choices?.[0]?.message?.tool_calls;

  if (!Array.isArray(toolCalls)) {
    return [];
  }

  return toolCalls
    .map((toolCall: any) => ({
      id: typeof toolCall?.id === "string" ? toolCall.id : undefined,
      name: typeof toolCall?.function?.name === "string" ? toolCall.function.name : "",
      arguments: parseToolArguments(toolCall?.function?.arguments),
    }))
    .filter((call: UnifiedToolCall) => Boolean(call.name));
};

const parseToolArguments = (value: unknown): Record<string, unknown> => {
  if (typeof value !== "string") {
    return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
  }

  try {
    const parsed = JSON.parse(value);
    return typeof parsed === "object" && parsed !== null ? parsed : {};
  } catch {
    return { raw: value };
  }
};

type StreamParseResult = {
  text: string;
  chunks: string[];
  toolCalls: UnifiedToolCall[];
  rawEvents: Array<Record<string, unknown>>;
};

const consumeStream = async (response: Response, providerId: ProviderId): Promise<StreamParseResult> => {
  if (!response.body) {
    return { text: "", chunks: [], toolCalls: [], rawEvents: [] };
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let text = "";
  const chunks: string[] = [];
  const toolCalls: UnifiedToolCall[] = [];
  const rawEvents: Array<Record<string, unknown>> = [];

  const flushSseFrame = (frame: string) => {
    const lines = frame.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    const dataLines = lines.filter((line) => line.startsWith("data:"));
    const eventLine = lines.find((line) => line.startsWith("event:"));
    const dataText = dataLines.map((line) => line.replace(/^data:\s*/, "")).join("\n");

    if (!dataText || dataText === "[DONE]") {
      return;
    }

    if (rawEvents.length >= STREAM_MAX_EVENTS) {
      throw new Error(`Stream exceeded max events limit (${STREAM_MAX_EVENTS}).`);
    }

    try {
      const payload = JSON.parse(dataText);
      rawEvents.push({ event: eventLine?.replace(/^event:\s*/, ""), payload });

      if (providerId === "anthropic") {
        const delta = payload?.delta;
        if (typeof delta?.text === "string") {
          text += delta.text;
          chunks.push(delta.text);
        }

        if (payload?.type === "content_block_start" && payload?.content_block?.type === "tool_use") {
          toolCalls.push({
            id: typeof payload?.content_block?.id === "string" ? payload.content_block.id : undefined,
            name: typeof payload?.content_block?.name === "string" ? payload.content_block.name : "",
            arguments: typeof payload?.content_block?.input === "object" && payload?.content_block?.input !== null
              ? payload.content_block.input
              : {},
          });
        }
      } else if (providerId === "gemini") {
        const parts = payload?.candidates?.[0]?.content?.parts;
        if (Array.isArray(parts)) {
          for (const part of parts) {
            if (typeof part?.text === "string") {
              text += part.text;
              chunks.push(part.text);
            }

            if (part?.functionCall) {
              toolCalls.push({
                name: typeof part.functionCall.name === "string" ? part.functionCall.name : "",
                arguments: typeof part.functionCall.args === "object" && part.functionCall.args !== null ? part.functionCall.args : {},
              });
            }
          }
        }
      } else {
        const deltaText = payload?.choices?.[0]?.delta?.content;
        if (typeof deltaText === "string") {
          text += deltaText;
          chunks.push(deltaText);
        }

        const deltaToolCalls = payload?.choices?.[0]?.delta?.tool_calls;
        if (Array.isArray(deltaToolCalls)) {
          for (const toolCall of deltaToolCalls) {
            toolCalls.push({
              id: typeof toolCall?.id === "string" ? toolCall.id : undefined,
              name: typeof toolCall?.function?.name === "string" ? toolCall.function.name : "",
              arguments: parseToolArguments(toolCall?.function?.arguments),
            });
          }
        }
      }
    } catch {
      rawEvents.push({ data: dataText });
    }

    if (text.length > STREAM_MAX_TEXT_CHARS) {
      throw new Error(`Stream exceeded max text size (${STREAM_MAX_TEXT_CHARS} chars).`);
    }
  };

  while (true) {
    const { value, done } = await reader.read();
    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });

    let separatorMatch = /\r?\n\r?\n/.exec(buffer);
    while (separatorMatch) {
      const separatorIndex = separatorMatch.index;
      const separatorLength = separatorMatch[0].length;
      const frame = buffer.slice(0, separatorIndex).trim();
      buffer = buffer.slice(separatorIndex + separatorLength);
      if (frame) {
        flushSseFrame(frame);
      }
      separatorMatch = /\r?\n\r?\n/.exec(buffer);
    }
  }

  const remaining = buffer.trim();
  if (remaining) {
    flushSseFrame(remaining);
  }

  return { text, chunks, toolCalls, rawEvents };
};

const extractUsage = (payload: any, providerId: ProviderId) => {
  if (providerId === "gemini") {
    const usageMetadata = payload?.usageMetadata;

    if (!usageMetadata) {
      return undefined;
    }

    return {
      inputTokens: usageMetadata.promptTokenCount,
      outputTokens: usageMetadata.candidatesTokenCount,
      totalTokens: usageMetadata.totalTokenCount,
    };
  }

  if (providerId === "anthropic") {
    const usage = payload?.usage;

    if (!usage) {
      return undefined;
    }

    return {
      inputTokens: usage.input_tokens,
      outputTokens: usage.output_tokens,
      totalTokens: typeof usage.input_tokens === "number" && typeof usage.output_tokens === "number"
        ? usage.input_tokens + usage.output_tokens
        : undefined,
    };
  }

  const usage = payload?.usage;

  if (!usage) {
    return undefined;
  }

  return {
    inputTokens: usage.prompt_tokens,
    outputTokens: usage.completion_tokens,
    totalTokens: usage.total_tokens,
  };
};

export const callProvider = async (request: UnifiedChatRequest): Promise<UnifiedChatResponse> => {
  ensureValidRequest(request);
  const provider = providerCatalog[request.provider];
  if (!provider.apiKey) {
    throw new Error(`Missing API key for provider: ${provider.id}`);
  }

  const prepared = prepareRequest(request);
  const response = await fetchWithTimeoutAndRetry(request, prepared);

  if (request.stream && response.body) {
    if (!response.ok) {
      const errorText = truncate(await response.text(), ERROR_DETAIL_MAX_CHARS);
      throw new Error(`Upstream stream failed for ${provider.id}: ${response.status} ${response.statusText} - ${errorText}`);
    }

    const streamResult = await consumeStream(response, provider.id);

    return {
      provider: provider.id,
      model: request.model || provider.defaultModel,
      text: streamResult.text,
      raw: { events: streamResult.rawEvents },
      streamed: true,
      chunks: streamResult.chunks,
      toolCalls: streamResult.toolCalls.length > 0 ? streamResult.toolCalls : undefined,
    };
  }

  const text = await response.text();
  let payload: any;

  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    payload = { rawText: text };
  }

  if (!response.ok) {
    const detail = typeof payload?.error?.message === "string" ? payload.error.message : text;
    const safeDetail = truncate(detail, ERROR_DETAIL_MAX_CHARS);
    throw new Error(`Upstream request failed for ${provider.id}: ${response.status} ${response.statusText} - ${safeDetail}`);
  }

  const normalizedText = provider.kind === "gemini"
    ? extractGeminiText(payload)
    : provider.kind === "anthropic"
      ? extractAnthropicText(payload)
      : extractOpenAIText(payload);
  const toolCalls = extractToolCalls(payload, provider.id);

  return {
    provider: provider.id,
    model: request.model || provider.defaultModel,
    text: normalizedText,
    raw: payload,
    toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
    usage: extractUsage(payload, provider.id),
  };
};

export const getProviderSummary = () => {
  return Object.values(providerCatalog).map((provider) => ({
    id: provider.id,
    label: provider.label,
    kind: provider.kind,
    baseUrl: provider.baseUrl,
    defaultModel: provider.defaultModel,
    configured: Boolean(provider.apiKey),
  }));
};

const truncate = (value: string, maxChars: number) => {
  if (value.length <= maxChars) {
    return value;
  }

  return `${value.slice(0, maxChars)}...<truncated>`;
};

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

const isRetryableStatus = (status: number) => status === 429 || status >= 500;

const fetchWithTimeoutAndRetry = async (
  request: UnifiedChatRequest,
  prepared: PreparedRequest,
): Promise<Response> => {
  let lastError: unknown;

  for (let attempt = 0; attempt <= RETRY_COUNT; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(prepared.url, {
        method: prepared.method,
        headers: prepared.headers,
        body: JSON.stringify(prepared.body),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (attempt < RETRY_COUNT && isRetryableStatus(response.status)) {
        await sleep(RETRY_DELAY_MS * (attempt + 1));
        continue;
      }

      return response;
    } catch (error) {
      clearTimeout(timeout);
      lastError = error;

      if (attempt < RETRY_COUNT) {
        await sleep(RETRY_DELAY_MS * (attempt + 1));
        continue;
      }
    }
  }

  const detail = lastError instanceof Error ? lastError.message : String(lastError);
  throw new Error(`Request failed after retries for ${request.provider}: ${truncate(detail, ERROR_DETAIL_MAX_CHARS)}`);
};