import { GEMINI_API_KEY, DEFAULT_GEMINI_MODEL, DEFAULT_GENERATION_CONFIG } from "../config/ai.js";

const GEMINI_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";

const SYSTEM_PROMPT = `You are TabPilot's media co-pilot. Help the user understand any PDFs, images, diagrams, or videos they share.
- Combine insights from the attachments with the conversation.
- If an attachment can't be read, explain why and use any provided description/metadata instead.
- Always respond in short paragraphs and bullet points.`;

function attachmentToPart(attachment) {
  if (!attachment) return null;
  if (attachment.data) {
    return {
      inlineData: {
        mimeType: attachment.type || "application/octet-stream",
        data: attachment.data
      }
    };
  }

  return {
    text: `Attachment reference: ${attachment.name || "Untitled"} (${attachment.type || "unknown"})`
  };
}

function buildContents(history) {
  const seed = [
    {
      role: "user",
      parts: [{ text: SYSTEM_PROMPT }]
    },
    {
      role: "model",
      parts: [{ text: "Understood. Please share your media or questions." }]
    }
  ];

  const conversation = (history || []).map((message) => {
    const role = message.role === "assistant" ? "model" : "user";
    const parts = [];
    if (message.content) {
      parts.push({ text: message.content });
    }
    if (Array.isArray(message.attachments)) {
      message.attachments.forEach((att) => {
        const part = attachmentToPart(att);
        if (part) parts.push(part);
      });
    }
    return { role, parts };
  });

  return [...seed, ...conversation];
}

export async function runMediaChat(history) {
  if (!GEMINI_API_KEY) {
    throw new Error("Gemini API key missing. Set VITE_GEMINI_API_KEY.");
  }

  const contents = buildContents(history);
  const generationConfig = {
    temperature: DEFAULT_GENERATION_CONFIG.temperature,
    topK: DEFAULT_GENERATION_CONFIG.topK,
    maxOutputTokens: 1024
  };

  const response = await fetch(
    `${GEMINI_ENDPOINT}/${DEFAULT_GEMINI_MODEL}:generateContent?key=${encodeURIComponent(GEMINI_API_KEY)}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        contents,
        generationConfig
      })
    }
  );

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data?.error?.message || "Gemini media assistant request failed");
  }

  const text =
    data?.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("\n").trim() ||
    "I wasn't able to generate a response.";

  return text;
}
