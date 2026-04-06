import assert from "node:assert/strict";
import { test } from "node:test";

process.env.OPENAI_API_KEY = "openai-key";
process.env.OPENAI_BASE_URL = "https://api.openai.com/v1";
process.env.OPENAI_DEFAULT_MODEL = "gpt-4o-mini";
process.env.GEMINI_API_KEY = "gemini-key";
process.env.GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta";
process.env.GEMINI_DEFAULT_MODEL = "gemini-2.0-flash";
process.env.ANTHROPIC_API_KEY = "anthropic-key";
process.env.ANTHROPIC_BASE_URL = "https://api.anthropic.com/v1";
process.env.ANTHROPIC_DEFAULT_MODEL = "claude-3-5-sonnet-latest";
process.env.DEEPSEEK_API_KEY = "deepseek-key";
process.env.DEEPSEEK_BASE_URL = "https://api.deepseek.com/v1";
process.env.DEEPSEEK_DEFAULT_MODEL = "deepseek-chat";

const providers = await import("./providers.js");

test("prepareRequest builds OpenAI-compatible payloads", () => {
  const prepared = providers.prepareRequest({
    provider: "openai",
    messages: [
      { role: "system", content: "You are concise." },
      { role: "user", content: "Hello" },
    ],
    tools: [
      {
        name: "lookup_weather",
        description: "Lookup weather",
        parameters: {
          type: "object",
          properties: {
            city: { type: "string" },
          },
        },
      },
    ],
    toolChoice: { name: "lookup_weather" },
  });

  assert.equal(prepared.url, "https://api.openai.com/v1/chat/completions");
  assert.deepEqual(prepared.body, {
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: "You are concise." },
      { role: "user", content: "Hello" },
    ],
    tools: [
      {
        type: "function",
        function: {
          name: "lookup_weather",
          description: "Lookup weather",
          parameters: {
            type: "object",
            properties: {
              city: { type: "string" },
            },
          },
        },
      },
    ],
    tool_choice: {
      type: "function",
      function: { name: "lookup_weather" },
    },
  });
});

test("prepareRequest builds Gemini stream URLs safely", () => {
  const prepared = providers.prepareRequest({
    provider: "gemini",
    model: "gemini-2.0-flash",
    stream: true,
    messages: [{ role: "user", content: "Ping" }],
  });

  assert.equal(
    prepared.url,
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:streamGenerateContent?key=gemini-key&alt=sse",
  );
});

test("prepareRequest rejects empty messages", () => {
  assert.throws(() => {
    providers.prepareRequest({
      provider: "openai",
      messages: [{ role: "user", content: "   " }],
    });
  }, /cannot be empty/i);
});

test("prepareRequest rejects empty tool names", () => {
  assert.throws(() => {
    providers.prepareRequest({
      provider: "openai",
      messages: [{ role: "user", content: "Run tool" }],
      tools: [
        {
          name: "   ",
        },
      ],
    });
  }, /non-empty name/i);
});

test("prepareRequest preserves provider base path", () => {
  const prepared = providers.prepareRequest({
    provider: "deepseek",
    messages: [{ role: "user", content: "Ping" }],
  });

  assert.equal(prepared.url, "https://api.deepseek.com/v1/chat/completions");
});