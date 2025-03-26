import { Anthropic, ModelParams } from "@anthropic-ai/sdk";
import { ApiConfiguration, ModelInfo, ApiHandlerOptions } from "../shared/api";
import { ANTHROPIC_DEFAULT_MAX_TOKENS } from "./providers/constants";
import { AnthropicHandler } from "./providers/anthropic";
import { OpenAiHandler } from "./providers/openai";
import { ApiStream } from "./transform/stream";

export interface SingleCompletionHandler {
  completePrompt(prompt: string): Promise<string>;
}

export interface ApiHandler {
  createMessage(systemPrompt: string, messages: Anthropic.Messages.MessageParam[]): ApiStream;
  getModel(): { id: string; info: ModelInfo };
  countTokens(content: Array<Anthropic.Messages.ContentBlockParam>): Promise<number>;
}

export function buildApiHandler(configuration: ApiConfiguration): ApiHandler {
  const { apiProvider, ...options } = configuration;
  switch (apiProvider) {
    case "anthropic":
      return new AnthropicHandler(options);
    case "openai":
      return new OpenAiHandler(options);
    default:
      return new AnthropicHandler(options);
  }
}

export function getModelParams({
  options,
  model,
  defaultMaxTokens,
  defaultTemperature = 0,
}: {
  options: ApiHandlerOptions;
  model: ModelInfo;
  defaultMaxTokens?: number;
  defaultTemperature?: number;
}) {
  const {
    modelMaxTokens: customMaxTokens,
    modelMaxThinkingTokens: customMaxThinkingTokens,
    modelTemperature: customTemperature,
  } = options;

  let maxTokens = model.maxTokens ?? defaultMaxTokens;
  let thinking = undefined;
  let temperature = customTemperature ?? defaultTemperature;

  return { maxTokens, thinking, temperature };
}