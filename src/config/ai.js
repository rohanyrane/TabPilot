
export const GEMINI_API_KEY =
  import.meta?.env?.VITE_GEMINI_API_KEY ||
  (typeof process !== "undefined" ? process.env?.VITE_GEMINI_API_KEY : null) ||
  FALLBACK_KEY;

export const DEFAULT_GEMINI_MODEL = "gemini-2.5-flash";

export const DEFAULT_GENERATION_CONFIG = {
  temperature: 0.6,
  topK: 3,
  maxOutputTokens: 2048
};
