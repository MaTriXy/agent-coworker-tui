import { parse as partialParse } from "partial-json";

import type { PiModel } from "./piRuntimeOptions";

type AssistantToolCallBlock = {
  type: "toolCall";
  id: string;
  name: string;
  arguments: Record<string, unknown>;
  thoughtSignature?: string;
};

type AssistantContentBlock =
  | { type: "thinking"; thinking?: string; thinkingSignature?: string }
  | { type: "text"; text: string; textSignature?: string }
  | AssistantToolCallBlock;

type AssistantMessageLike = {
  role: "assistant";
  provider?: string;
  api?: string;
  model?: string;
  stopReason?: string;
  content: AssistantContentBlock[];
};

type ToolResultLike = {
  role: "toolResult";
  toolCallId: string;
  toolName: string;
  content: Array<{ type: "text"; text: string } | { type: "image"; data: string; mimeType: string }>;
  isError?: boolean;
  timestamp?: number;
};

type PiMessageLike =
  | { role: "user"; content: string }
  | AssistantMessageLike
  | ToolResultLike;

type ResponsesMessageContext = {
  systemPrompt?: string;
  messages: PiMessageLike[];
};

function shortHash(str: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < str.length; i += 1) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return `${(h2 >>> 0).toString(36)}${(h1 >>> 0).toString(36)}`;
}

export function sanitizeSurrogates(text: string): string {
  return text.replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, "");
}

export function parseStreamingJson(partialJson: string): Record<string, unknown> {
  if (!partialJson || partialJson.trim() === "") return {};
  try {
    return JSON.parse(partialJson) as Record<string, unknown>;
  } catch {
    try {
      return (partialParse(partialJson) ?? {}) as Record<string, unknown>;
    } catch {
      return {};
    }
  }
}

function calculateCost(model: PiModel, usage: Record<string, any>) {
  usage.cost.input = (model.cost.input / 1_000_000) * usage.input;
  usage.cost.output = (model.cost.output / 1_000_000) * usage.output;
  usage.cost.cacheRead = (model.cost.cacheRead / 1_000_000) * usage.cacheRead;
  usage.cost.cacheWrite = (model.cost.cacheWrite / 1_000_000) * usage.cacheWrite;
  usage.cost.total = usage.cost.input + usage.cost.output + usage.cost.cacheRead + usage.cost.cacheWrite;
  return usage.cost;
}

function transformMessages(
  messages: PiMessageLike[],
  model: PiModel,
  normalizeToolCallId?: (id: string) => string,
): PiMessageLike[] {
  const toolCallIdMap = new Map<string, string>();

  const transformed = messages.map((msg) => {
    if (msg.role === "user") return msg;

    if (msg.role === "toolResult") {
      const normalizedId = toolCallIdMap.get(msg.toolCallId);
      if (normalizedId && normalizedId !== msg.toolCallId) {
        return { ...msg, toolCallId: normalizedId };
      }
      return msg;
    }

    const assistantMsg = msg as AssistantMessageLike;
    const isSameModel =
      assistantMsg.provider === model.provider &&
      assistantMsg.api === model.api &&
      assistantMsg.model === model.id;

    const content = assistantMsg.content.flatMap<AssistantContentBlock>((block) => {
      if (block.type === "thinking") {
        if (isSameModel && block.thinkingSignature) return block;
        if (!block.thinking || block.thinking.trim() === "") return [];
        if (isSameModel) return block;
        return [{ type: "text", text: block.thinking }];
      }

      if (block.type === "text") {
        if (isSameModel) return block;
        return [{ type: "text", text: block.text }];
      }

      const toolCall = block as AssistantToolCallBlock;
      let normalizedToolCall: AssistantToolCallBlock = toolCall;
      if (!isSameModel && toolCall.thoughtSignature) {
        normalizedToolCall = { ...toolCall };
        delete normalizedToolCall.thoughtSignature;
      }
      if (!isSameModel && normalizeToolCallId) {
        const normalizedId = normalizeToolCallId(toolCall.id);
        if (normalizedId !== toolCall.id) {
          toolCallIdMap.set(toolCall.id, normalizedId);
          normalizedToolCall = { ...normalizedToolCall, id: normalizedId };
        }
      }
      return [normalizedToolCall];
    });

    return { ...assistantMsg, content };
  });

  const result: PiMessageLike[] = [];
  let pendingToolCalls: AssistantToolCallBlock[] = [];
  let existingToolResultIds = new Set<string>();

  for (const msg of transformed) {
    if (msg.role === "assistant") {
      if (pendingToolCalls.length > 0) {
        for (const toolCall of pendingToolCalls) {
          if (existingToolResultIds.has(toolCall.id)) continue;
          result.push({
            role: "toolResult",
            toolCallId: toolCall.id,
            toolName: toolCall.name,
            content: [{ type: "text", text: "No result provided" }],
            isError: true,
            timestamp: Date.now(),
          });
        }
        pendingToolCalls = [];
        existingToolResultIds = new Set();
      }

      if (msg.stopReason === "error" || msg.stopReason === "aborted") continue;

      const toolCalls = msg.content.filter((block): block is AssistantToolCallBlock => block.type === "toolCall");
      if (toolCalls.length > 0) {
        pendingToolCalls = toolCalls;
        existingToolResultIds = new Set();
      }
      result.push(msg);
      continue;
    }

    if (msg.role === "toolResult") {
      existingToolResultIds.add(msg.toolCallId);
      result.push(msg);
      continue;
    }

    if (pendingToolCalls.length > 0) {
      for (const toolCall of pendingToolCalls) {
        if (existingToolResultIds.has(toolCall.id)) continue;
        result.push({
          role: "toolResult",
          toolCallId: toolCall.id,
          toolName: toolCall.name,
          content: [{ type: "text", text: "No result provided" }],
          isError: true,
          timestamp: Date.now(),
        });
      }
      pendingToolCalls = [];
      existingToolResultIds = new Set();
    }
    result.push(msg);
  }

  return result;
}

export function convertResponsesMessages(
  model: PiModel,
  context: ResponsesMessageContext,
  allowedToolCallProviders: Set<string>,
  options?: { includeSystemPrompt?: boolean },
): Array<Record<string, unknown>> {
  const messages: Array<Record<string, unknown>> = [];
  const normalizeToolCallId = (id: string) => {
    if (!allowedToolCallProviders.has(model.provider)) return id;
    if (!id.includes("|")) return id;

    const [callId, itemId] = id.split("|");
    const sanitizedCallId = callId.replace(/[^a-zA-Z0-9_-]/g, "_");
    let sanitizedItemId = itemId.replace(/[^a-zA-Z0-9_-]/g, "_");
    if (!sanitizedItemId.startsWith("fc")) {
      sanitizedItemId = `fc_${sanitizedItemId}`;
    }
    let normalizedCallId = sanitizedCallId.length > 64 ? sanitizedCallId.slice(0, 64) : sanitizedCallId;
    let normalizedItemId = sanitizedItemId.length > 64 ? sanitizedItemId.slice(0, 64) : sanitizedItemId;
    normalizedCallId = normalizedCallId.replace(/_+$/, "");
    normalizedItemId = normalizedItemId.replace(/_+$/, "");
    return `${normalizedCallId}|${normalizedItemId}`;
  };

  const transformedMessages = transformMessages(context.messages, model, normalizeToolCallId);
  const includeSystemPrompt = options?.includeSystemPrompt ?? true;
  if (includeSystemPrompt && context.systemPrompt) {
    messages.push({
      role: model.reasoning ? "developer" : "system",
      content: sanitizeSurrogates(context.systemPrompt),
    });
  }

  let msgIndex = 0;
  for (const msg of transformedMessages) {
    if (msg.role === "user") {
      messages.push({
        role: "user",
        content: [{ type: "input_text", text: sanitizeSurrogates(msg.content) }],
      });
      msgIndex += 1;
      continue;
    }

    if (msg.role === "assistant") {
      const output: Array<Record<string, unknown>> = [];
      const isDifferentModel =
        msg.model !== model.id &&
        msg.provider === model.provider &&
        msg.api === model.api;

      for (const block of msg.content) {
        if (block.type === "thinking") {
          if (block.thinkingSignature) {
            output.push(JSON.parse(block.thinkingSignature) as Record<string, unknown>);
          }
          continue;
        }

        if (block.type === "text") {
          let msgId = block.textSignature;
          if (!msgId) {
            msgId = `msg_${msgIndex}`;
          } else if (msgId.length > 64) {
            msgId = `msg_${shortHash(msgId)}`;
          }
          output.push({
            type: "message",
            role: "assistant",
            content: [{ type: "output_text", text: sanitizeSurrogates(block.text), annotations: [] }],
            status: "completed",
            id: msgId,
          });
          continue;
        }

        const [callId, itemIdRaw] = block.id.split("|");
        let itemId: string | undefined = itemIdRaw;
        if (isDifferentModel && itemId?.startsWith("fc_")) {
          itemId = undefined;
        }
        output.push({
          type: "function_call",
          id: itemId,
          call_id: callId,
          name: block.name,
          arguments: JSON.stringify(block.arguments),
        });
      }

      if (output.length > 0) {
        messages.push(...output);
      }
      msgIndex += 1;
      continue;
    }

    const textResult = msg.content
      .filter((content): content is { type: "text"; text: string } => content.type === "text")
      .map((content) => content.text)
      .join("\n");
    const hasImages = msg.content.some((content) => content.type === "image");
    const [callId] = msg.toolCallId.split("|");
    messages.push({
      type: "function_call_output",
      call_id: callId,
      output: sanitizeSurrogates(textResult.length > 0 ? textResult : "(see attached image)"),
    });

    if (hasImages && model.input.includes("image")) {
      const contentParts: Array<Record<string, unknown>> = [{
        type: "input_text",
        text: "Attached image(s) from tool result:",
      }];
      for (const block of msg.content) {
        if (block.type !== "image") continue;
        contentParts.push({
          type: "input_image",
          detail: "auto",
          image_url: `data:${block.mimeType};base64,${block.data}`,
        });
      }
      messages.push({
        role: "user",
        content: contentParts,
      });
    }

    msgIndex += 1;
  }

  return messages;
}

export function convertResponsesTools(
  tools: Array<Record<string, unknown>>,
  options?: { strict?: boolean | null },
): Array<Record<string, unknown>> {
  const strict = options?.strict === undefined ? false : options.strict;
  return tools.map((tool) => ({
    type: "function",
    name: tool.name,
    description: tool.description,
    parameters: tool.parameters,
    strict,
  }));
}

function mapStopReason(status: unknown): string {
  if (typeof status !== "string" || !status) return "stop";
  switch (status) {
    case "completed":
      return "stop";
    case "incomplete":
      return "length";
    case "failed":
    case "cancelled":
      return "error";
    case "in_progress":
    case "queued":
      return "stop";
    default:
      throw new Error(`Unhandled stop reason: ${String(status)}`);
  }
}

export async function processResponsesStream(
  openaiStream: AsyncIterable<any>,
  output: Record<string, any>,
  stream: { push: (event: Record<string, unknown>) => void },
  model: PiModel,
): Promise<void> {
  let currentItem: Record<string, any> | null = null;
  let currentBlock: Record<string, any> | null = null;
  const blocks = output.content as Array<Record<string, unknown>>;
  const blockIndex = () => blocks.length - 1;

  for await (const event of openaiStream) {
    if (event.type === "response.output_item.added") {
      const item = event.item as Record<string, any>;
      if (item.type === "reasoning") {
        currentItem = item;
        currentBlock = { type: "thinking", thinking: "" };
        output.content.push(currentBlock);
        stream.push({ type: "thinking_start", contentIndex: blockIndex(), partial: output });
      } else if (item.type === "message") {
        currentItem = item;
        currentBlock = { type: "text", text: "" };
        output.content.push(currentBlock);
        stream.push({ type: "text_start", contentIndex: blockIndex(), partial: output });
      } else if (item.type === "function_call") {
        currentItem = item;
        currentBlock = {
          type: "toolCall",
          id: `${item.call_id}|${item.id}`,
          name: item.name,
          arguments: {},
          partialJson: item.arguments || "",
        };
        output.content.push(currentBlock);
        stream.push({ type: "toolcall_start", contentIndex: blockIndex(), partial: output });
      }
      continue;
    }

    if (event.type === "response.reasoning_summary_part.added") {
      if (currentItem?.type === "reasoning") {
        currentItem.summary = currentItem.summary || [];
        currentItem.summary.push(event.part);
      }
      continue;
    }

    if (event.type === "response.reasoning_summary_text.delta") {
      if (currentItem?.type === "reasoning" && currentBlock?.type === "thinking") {
        currentItem.summary = currentItem.summary || [];
        const lastPart = currentItem.summary[currentItem.summary.length - 1];
        if (lastPart) {
          currentBlock.thinking += event.delta;
          lastPart.text += event.delta;
          stream.push({
            type: "thinking_delta",
            contentIndex: blockIndex(),
            delta: event.delta,
            partial: output,
          });
        }
      }
      continue;
    }

    if (event.type === "response.reasoning_summary_part.done") {
      if (currentItem?.type === "reasoning" && currentBlock?.type === "thinking") {
        currentItem.summary = currentItem.summary || [];
        const lastPart = currentItem.summary[currentItem.summary.length - 1];
        if (lastPart) {
          currentBlock.thinking += "\n\n";
          lastPart.text += "\n\n";
          stream.push({
            type: "thinking_delta",
            contentIndex: blockIndex(),
            delta: "\n\n",
            partial: output,
          });
        }
      }
      continue;
    }

    if (event.type === "response.content_part.added") {
      if (currentItem?.type === "message") {
        currentItem.content = currentItem.content || [];
        if (event.part.type === "output_text" || event.part.type === "refusal") {
          currentItem.content.push(event.part);
        }
      }
      continue;
    }

    if (event.type === "response.output_text.delta") {
      if (currentItem?.type === "message" && currentBlock?.type === "text") {
        const lastPart = currentItem.content?.[currentItem.content.length - 1];
        if (lastPart?.type === "output_text") {
          currentBlock.text += event.delta;
          lastPart.text += event.delta;
          stream.push({
            type: "text_delta",
            contentIndex: blockIndex(),
            delta: event.delta,
            partial: output,
          });
        }
      }
      continue;
    }

    if (event.type === "response.refusal.delta") {
      if (currentItem?.type === "message" && currentBlock?.type === "text") {
        const lastPart = currentItem.content?.[currentItem.content.length - 1];
        if (lastPart?.type === "refusal") {
          currentBlock.text += event.delta;
          lastPart.refusal += event.delta;
          stream.push({
            type: "text_delta",
            contentIndex: blockIndex(),
            delta: event.delta,
            partial: output,
          });
        }
      }
      continue;
    }

    if (event.type === "response.function_call_arguments.delta") {
      if (currentItem?.type === "function_call" && currentBlock?.type === "toolCall") {
        currentBlock.partialJson += event.delta;
        currentBlock.arguments = parseStreamingJson(currentBlock.partialJson);
        stream.push({
          type: "toolcall_delta",
          contentIndex: blockIndex(),
          delta: event.delta,
          partial: output,
        });
      }
      continue;
    }

    if (event.type === "response.function_call_arguments.done") {
      if (currentItem?.type === "function_call" && currentBlock?.type === "toolCall") {
        currentBlock.partialJson = event.arguments;
        currentBlock.arguments = parseStreamingJson(currentBlock.partialJson);
      }
      continue;
    }

    if (event.type === "response.output_item.done") {
      const item = event.item as Record<string, any>;
      if (item.type === "reasoning" && currentBlock?.type === "thinking") {
        currentBlock.thinking = item.summary?.map((summary: { text: string }) => summary.text).join("\n\n") || "";
        currentBlock.thinkingSignature = JSON.stringify(item);
        stream.push({
          type: "thinking_end",
          contentIndex: blockIndex(),
          content: currentBlock.thinking,
          partial: output,
        });
        currentBlock = null;
      } else if (item.type === "message" && currentBlock?.type === "text") {
        currentBlock.text = item.content
          .map((content: { type: string; text?: string; refusal?: string }) =>
            content.type === "output_text" ? content.text : content.refusal)
          .join("");
        currentBlock.textSignature = item.id;
        stream.push({
          type: "text_end",
          contentIndex: blockIndex(),
          content: currentBlock.text,
          partial: output,
        });
        currentBlock = null;
      } else if (item.type === "function_call") {
        const args = currentBlock?.type === "toolCall" && currentBlock.partialJson
          ? parseStreamingJson(currentBlock.partialJson)
          : parseStreamingJson(item.arguments || "{}");
        const toolCall = {
          type: "toolCall",
          id: `${item.call_id}|${item.id}`,
          name: item.name,
          arguments: args,
        };
        currentBlock = null;
        stream.push({ type: "toolcall_end", contentIndex: blockIndex(), toolCall, partial: output });
      }
      continue;
    }

    if (event.type === "response.completed") {
      const response = event.response as Record<string, any> | undefined;
      if (response?.usage) {
        const cachedTokens = response.usage.input_tokens_details?.cached_tokens || 0;
        output.usage = {
          input: (response.usage.input_tokens || 0) - cachedTokens,
          output: response.usage.output_tokens || 0,
          cacheRead: cachedTokens,
          cacheWrite: 0,
          totalTokens: response.usage.total_tokens || 0,
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
        };
      }
      calculateCost(model, output.usage);
      output.stopReason = mapStopReason(response?.status);
      if (output.content.some((block: { type: string }) => block.type === "toolCall") && output.stopReason === "stop") {
        output.stopReason = "toolUse";
      }
      continue;
    }

    if (event.type === "error") {
      throw new Error(`Error Code ${event.code}: ${event.message}` || "Unknown error");
    }

    if (event.type === "response.failed") {
      throw new Error("Unknown error");
    }
  }
}
