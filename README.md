# API Compatible MCP Server

这是一个把多家模型 API 统一成同一套消息结构的 MCP 服务。当前内置支持：

- OpenAI 兼容接口，包括 GPT 类模型
- Grok
- GLM
- Gemini 原生接口
- Anthropic
- DeepSeek
- Qwen

## 能做什么

- `list_providers` 查看当前已配置的 provider
- `prepare_request` 查看某个请求会被转换成什么上游格式
- `chat` 直接调用上游并返回标准化结果
- `normalize_messages` 清洗消息文本，方便重复复用

另外提供一个 CLI：

- `npm run cli -- providers` 查看 provider
- `npm run cli -- prepare --request-file request.json` 查看上游请求
- `npm run cli -- chat --request-file request.json` 直接调用模型
- `npm run cli -- serve --env-file .env` 启动 MCP 服务并先加载 env 文件

## 安装

```bash
npm install
```

## 配置

复制 [.env.example](.env.example) 为 `.env`，然后填写你的 API Key。

如果你想从自定义文件加载环境变量，可以在 CLI 命令后附加 `--env-file path/to/file`。

稳定性相关环境变量（可选）：

- `MCP_REQUEST_TIMEOUT_MS`：单次请求超时（默认 `60000`）
- `MCP_RETRY_COUNT`：失败重试次数（默认 `1`）
- `MCP_RETRY_DELAY_MS`：重试基础间隔毫秒（默认 `300`）
- `MCP_STREAM_MAX_EVENTS`：流式事件最大数量（默认 `2000`）
- `MCP_STREAM_MAX_TEXT_CHARS`：流式文本最大字符数（默认 `300000`）
- `MCP_ERROR_DETAIL_MAX_CHARS`：错误详情最大长度（默认 `2000`）

## 运行

开发模式：

```bash
npm run dev
```

构建后运行：

```bash
npm run build
npm start
```

## 请求格式

统一输入示例：

```json
{
  "provider": "gemini",
  "model": "gemini-2.5-flash",
  "messages": [
    { "role": "system", "content": "你是一个严谨的助手。" },
    { "role": "user", "content": "用一句话解释 MCP。" }
  ],
  "temperature": 0.2,
  "maxTokens": 256
}
```

## 说明

OpenAI、Grok、GLM 走的是 OpenAI 兼容请求格式；Gemini 会自动转换为 `generateContent` 请求格式。

Anthropic 会走原生 `messages` 接口，DeepSeek 和 Qwen 走 OpenAI 兼容接口。

如果你想继续扩展到 Anthropic、Claude、Qwen、DeepSeek 或本地 OpenAI 兼容网关，可以直接在 [src/providers.ts](src/providers.ts) 里加一个 provider 配置和映射逻辑。