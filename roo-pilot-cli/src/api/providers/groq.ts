import { BaseProvider } from "./base-provider";
import { ModelInfo } from "../../shared/api";
import { OpenAI } from "openai";
import { ApiStream } from "../transform/stream";
import { ANTHROPIC_DEFAULT_MAX_TOKENS } from "./constants";
import { getModelParams } from "..";

export class GroqHandler extends BaseProvider {
  modelInfo: ModelInfo = {
    id: "llama3-70b-8192",
    name: "llama3-70b-8192",
    displayName: "Llama 3 70B",
    maxTokens: 8192,
    provider: "groq",
    supportsVision: false,
    thinking: false,
  };

  constructor(options: any) {
    super(options);
    if (this.options.model) {
      this.modelInfo.id = this.options.model;
      this.modelInfo.name = this.options.model;
    }
  }

  private async getClient() {
    const client = new OpenAI({
      apiKey: this.options.apiKey,
      baseURL: "https://api.groq.com/openai/v1"
    });
    return client;
  }

  private formatSystem(systemPrompt: string) {
    return { role: "system", content: systemPrompt };
  }

  private formatMessages(messages: any[]) {
    return messages.map(msg => {
      const role = msg.role === "user" ? "user" : "assistant";
      if (msg.content && typeof msg.content === "string") {
        return {
          role,
          content: msg.content
        };
      } else if (Array.isArray(msg.content)) {
        // Handle multi-part content
        const formattedContent = msg.content
          .filter((part: any) => part.type === "text")
          .map((part: any) => part.text)
          .join("\n");
        return {
          role,
          content: formattedContent
        };
      }
      return { role, content: "" };
    });
  }

  async createMessage(systemPrompt: string, messages: any[]) {
    const stream = new ApiStream();

    const client = await this.getClient();
    const formattedMessages = this.formatMessages(messages);
    
    if (systemPrompt) {
      formattedMessages.unshift(this.formatSystem(systemPrompt));
    }

    const { temperature, maxTokens } = getModelParams({
      options: this.options,
      model: this.modelInfo,
      defaultMaxTokens: ANTHROPIC_DEFAULT_MAX_TOKENS,
    });

    try {
      const response = await client.chat.completions.create({
        model: this.modelInfo.id,
        messages: formattedMessages,
        temperature: temperature,
        max_tokens: maxTokens,
        stream: true,
      });

      // Process streaming response
      for await (const chunk of response) {
        if (chunk.choices[0]?.delta?.content) {
          stream.write({
            type: "content_block_delta",
            delta: {
              type: "text",
              text: chunk.choices[0].delta.content
            }
          });
        }
      }

      stream.write({ type: "message_stop" });
      stream.end();
    } catch (error: any) {
      stream.write({
        type: "error",
        error: {
          message: error.message || "Unknown error",
          code: error.code || "unknown"
        }
      });
      stream.end();
    }

    return stream;
  }

  getModel() {
    return {
      id: this.modelInfo.id,
      info: this.modelInfo
    };
  }
}