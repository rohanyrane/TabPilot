import { GEMINI_API_KEY, DEFAULT_GEMINI_MODEL, DEFAULT_GENERATION_CONFIG } from "../config/ai.js";
import { getSettings } from "../components/Settings";

const GEMINI_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";

const SUMMARY_PROMPT = `You are TabPilot's multimodal summarizer. Combine page text, video metadata, PDF notes, and diagrams to produce:
- A two-sentence overview
- Bullet text highlights
- Bullet media highlights

Reference media titles when possible and clearly state if some assets can't be interpreted.`;

const sanitize = (text = "", limit = 4000) => {
  const cleaned = text.replace(/\s+/g, " ").trim();
  return cleaned.length > limit ? `${cleaned.slice(0, limit)}…` : cleaned;
};

const mediaToMarkdown = (media = {}) => {
  const blocks = [];
  if (Array.isArray(media.videos) && media.videos.length) {
    blocks.push(
      "Videos:\n" +
        media.videos
          .map((video) => `• ${video.title || video.description || video.src || "Embedded video"}`)
          .join("\n")
    );
  }
  if (Array.isArray(media.documents) && media.documents.length) {
    blocks.push(
      "Documents:\n" +
        media.documents
          .map((doc) => `• ${doc.title || doc.src || `Document (${doc.type})`}`)
          .join("\n")
    );
  }
  if (Array.isArray(media.diagrams) && media.diagrams.length) {
    blocks.push(
      "Diagrams:\n" +
        media.diagrams
          .map((diag) => `• ${diag.description || diag.type || "Diagram"}`)
          .join("\n")
    );
  }
  return blocks.join("\n\n");
};

const diagramInlineParts = (diagrams = []) =>
  diagrams
    .filter((d) => d.data)
    .slice(0, 3)
    .map((diag) => ({
      inlineData: {
        mimeType: diag.mimeType || "image/png",
        data: diag.data
      }
    }));

export async function summarizeTabMultimodal(tabData) {
  if (!GEMINI_API_KEY) {
    throw new Error("Missing Gemini API key. Set VITE_GEMINI_API_KEY.");
  }

  const settings = await getSettings();
  const model = settings.cloudModel || DEFAULT_GEMINI_MODEL;

  const textParts = [
    {
      text: `${SUMMARY_PROMPT}\n\nTab title: ${tabData.tabInfo?.title || tabData.pageData?.title || "Untitled"}\nURL: ${tabData.tabInfo?.url || tabData.pageData?.url || "Unknown"}`
    }
  ];

  if (tabData.pageData?.content?.text) {
    textParts.push({
      text: `Page text sample:\n${sanitize(tabData.pageData.content.text, 8000)}`
    });
  }

  const mediaSummary = mediaToMarkdown(tabData.pageData?.media);
  if (mediaSummary) {
    textParts.push({ text: `Media references:\n${mediaSummary}` });
  }

  const diagramParts = diagramInlineParts(tabData.pageData?.media?.diagrams);

  const contents = [
    {
      role: "user",
      parts: [...textParts, ...diagramParts]
    }
  ];

  const generationConfig = {
    temperature: settings.temperature ?? DEFAULT_GENERATION_CONFIG.temperature,
    topK: settings.topK ?? DEFAULT_GENERATION_CONFIG.topK,
    maxOutputTokens: Math.min(settings.maxOutputTokens ?? DEFAULT_GENERATION_CONFIG.maxOutputTokens, 1024)
  };

  const response = await fetch(
    `${GEMINI_ENDPOINT}/${model}:generateContent?key=${encodeURIComponent(GEMINI_API_KEY)}`,
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
    throw new Error(data?.error?.message || "Gemini multimodal summary failed");
  }
  const summary =
    data?.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("\n").trim() ||
    "No summary available.";
  return summary;
}
