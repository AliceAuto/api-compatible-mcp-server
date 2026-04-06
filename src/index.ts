import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { callProvider, getProviderSummary, prepareRequest, providerIds, type UnifiedMessage, type UnifiedChatRequest } from "./providers.js";

const messageSchema = z.object({
  role: z.enum(["system", "user", "assistant"]),
  content: z.string(),
});

const toolSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  parameters: z.record(z.any()).optional(),
});

const toolChoiceSchema = z.union([
  z.enum(["auto", "none"]),
  z.object({
    name: z.string().min(1),
  }),
]);

const requestSchema = z.object({
  provider: z.enum(providerIds),
  model: z.string().optional(),
  messages: z.array(messageSchema).min(1),
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().int().positive().optional(),
  topP: z.number().min(0).max(1).optional(),
  stop: z.array(z.string()).optional(),
  stream: z.boolean().optional(),
  tools: z.array(toolSchema).optional(),
  toolChoice: toolChoiceSchema.optional(),
});

const server = new McpServer({
  name: "api-compatible-mcp-server",
  version: "0.1.0",
});

server.tool(
  "list_providers",
  "List the configured model providers and their defaults.",
  {},
  async () => {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(getProviderSummary(), null, 2),
        },
      ],
    };
  },
);

server.tool(
  "prepare_request",
  "Convert a unified chat request into the provider-specific HTTP request payload.",
  {
    provider: z.enum(providerIds),
    model: z.string().optional(),
    messages: z.array(messageSchema).min(1),
    temperature: z.number().min(0).max(2).optional(),
    maxTokens: z.number().int().positive().optional(),
    topP: z.number().min(0).max(1).optional(),
    stop: z.array(z.string()).optional(),
    stream: z.boolean().optional(),
    tools: z.array(toolSchema).optional(),
    toolChoice: toolChoiceSchema.optional(),
  },
  async (args) => {
    const request = requestSchema.parse(args) satisfies UnifiedChatRequest;
    const prepared = prepareRequest(request);

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              provider: request.provider,
              model: request.model,
              request: prepared,
            },
            null,
            2,
          ),
        },
      ],
    };
  },
);

server.tool(
  "chat",
  "Send a unified chat completion request to a configured provider and normalize the response.",
  {
    provider: z.enum(providerIds),
    model: z.string().optional(),
    messages: z.array(messageSchema).min(1),
    temperature: z.number().min(0).max(2).optional(),
    maxTokens: z.number().int().positive().optional(),
    topP: z.number().min(0).max(1).optional(),
    stop: z.array(z.string()).optional(),
    stream: z.boolean().optional(),
    tools: z.array(toolSchema).optional(),
    toolChoice: toolChoiceSchema.optional(),
  },
  async (args) => {
    const request = requestSchema.parse(args) satisfies UnifiedChatRequest;
    const result = await callProvider(request);

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              provider: result.provider,
              model: result.model,
              text: result.text,
              usage: result.usage,
              raw: result.raw,
            },
            null,
            2,
          ),
        },
      ],
    };
  },
);

server.tool(
  "normalize_messages",
  "Return a cleaned version of the input messages so they can be reused across providers.",
  {
    messages: z.array(messageSchema).min(1),
  },
  async ({ messages }) => {
    const normalized: UnifiedMessage[] = messages.map((message) => ({
      role: message.role,
      content: message.content.trim(),
    }));

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(normalized, null, 2),
        },
      ],
    };
  },
);

const main = async () => {
  const transport = new StdioServerTransport();
  await server.connect(transport);
};

main().catch((error) => {
  console.error("Failed to start api-compatible-mcp-server:", error);
  process.exit(1);
});