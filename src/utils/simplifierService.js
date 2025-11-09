import { GEMINI_API_KEY, DEFAULT_GEMINI_MODEL, DEFAULT_GENERATION_CONFIG } from "../config/ai.js";
import { systemPrompts } from "../background/systemPrompts.js";

const GEMINI_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";

const FALLBACK_SETTINGS = {
  temperature: DEFAULT_GENERATION_CONFIG.temperature,
  topK: DEFAULT_GENERATION_CONFIG.topK,
  maxOutputTokens: DEFAULT_GENERATION_CONFIG.maxOutputTokens,
  cloudModel: DEFAULT_GEMINI_MODEL
};

function loadAISettings() {
  return new Promise((resolve) => {
    const defaultSettings = { ...FALLBACK_SETTINGS };

    if (typeof chrome === "undefined" || !chrome.storage?.sync) {
      resolve(defaultSettings);
      return;
    }

    chrome.storage.sync.get("TabPilotSettings", (result = {}) => {
      const stored = result?.TabPilotSettings || {};
      resolve({
        ...defaultSettings,
        ...stored
      });
    });
  });
}

function resolveSystemPrompt(optimizeMode, readingLevel) {
  const modeKey = optimizeMode && systemPrompts[optimizeMode] ? optimizeMode : "textClarity";
  const levelKey = readingLevel && systemPrompts[modeKey][readingLevel] ? readingLevel : "3";
  return "You should only give me the main output is asked. Dont want any unnecessary text." +  systemPrompts[modeKey][levelKey];
}

export async function simplifyTextWithGemini({ text, optimizeMode, readingLevel }) {
  if (!GEMINI_API_KEY) {
    throw new Error("Gemini API key missing");
  }

  const settings = await loadAISettings();
  const systemPrompt = resolveSystemPrompt(optimizeMode, readingLevel);
  const generationConfig = {
    temperature: settings.temperature,
    topK: settings.topK,
    maxOutputTokens: Math.min(settings.maxOutputTokens || DEFAULT_GENERATION_CONFIG.maxOutputTokens, 8192)
  };

  const payload = {
    systemInstruction: {
      role: "system",
      parts: [{ text: systemPrompt }]
    },
    contents: [
      {
        role: "user",
        parts: [{ text }]
      }
    ],
    generationConfig
  };

  const modelName = settings.cloudModel || DEFAULT_GEMINI_MODEL;
  const response = await fetch(
    `${GEMINI_ENDPOINT}/${modelName}:generateContent?key=${encodeURIComponent(GEMINI_API_KEY)}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    }
  );

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data?.error?.message || "Gemini request failed");
  }

  const textParts = data?.candidates?.[0]?.content?.parts || [];
  const combined = textParts.map((part) => part?.text || "").join("\n").trim();

  if (!combined) {
    throw new Error("Empty response from Gemini");
  }

  return combined;
}
