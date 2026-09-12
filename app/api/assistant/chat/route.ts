import { openai } from "@ai-sdk/openai";
import {
  convertToModelMessages,
  createUIMessageStreamResponse,
  streamText,
  toUIMessageStream,
  type UIMessage,
} from "ai";
import { buildAssistantStudentContext } from "@/lib/assistant/context";
import {
  assistantEnabled,
  assistantModelId,
  ASSISTANT_MAX_MESSAGES,
} from "@/lib/assistant/config";
import { buildAssistantSystemPrompt } from "@/lib/assistant/prompt";
import { validateAssistantMessages } from "@/lib/assistant/validate";
import { publicActionMessage } from "@/lib/safe-action-message";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(req: Request) {
  if (!assistantEnabled()) {
    return Response.json(
      {
        error: "The assistant is temporarily unavailable. Please try again later.",
      },
      { status: 503 },
    );
  }

  let body: { messages?: UIMessage[] };
  try {
    body = await req.json();
  } catch {
    return Response.json(
      { error: "Something went wrong. Please try again." },
      { status: 400 },
    );
  }

  const messages = body.messages ?? [];
  const validationError = validateAssistantMessages(messages);
  if (validationError) {
    return Response.json({ error: validationError }, { status: 400 });
  }

  const trimmed = messages.slice(-ASSISTANT_MAX_MESSAGES);
  const studentContext = await buildAssistantStudentContext();
  const system = buildAssistantSystemPrompt(studentContext);

  try {
    const result = streamText({
      model: openai(assistantModelId()),
      system,
      messages: await convertToModelMessages(trimmed),
      onError({ error }) {
        console.error("[assistant/chat] stream error", error);
      },
    });

    return createUIMessageStreamResponse({
      stream: toUIMessageStream({ stream: result.stream }),
    });
  } catch (error) {
    console.error("[assistant/chat] request failed", error);
    return Response.json(
      {
        error: publicActionMessage(
          error,
          "The assistant is temporarily unavailable. Please try again.",
        ),
      },
      { status: 500 },
    );
  }
}
