import React, { useCallback, useMemo, useRef, useState } from "react";
import { runMediaChat } from "../utils/mediaAssistant";

const ACCEPTED_TYPES = [
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/svg+xml",
  "video/mp4",
  "video/webm",
  "video/quicktime"
];

const generateId = () =>
  (typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`);

function formatSize(bytes = 0) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export default function MediaLab() {
  const fileInputRef = useRef(null);
  const [mediaItems, setMediaItems] = useState([]);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [messages, setMessages] = useState([
    { role: "assistant", content: "Upload media and ask me anything about it." }
  ]);
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState(null);

  const selectedAttachments = useMemo(
    () => mediaItems.filter((item) => selectedIds.has(item.id)),
    [mediaItems, selectedIds]
  );

  const revokePreview = (url) => {
    if (url) {
      try {
        URL.revokeObjectURL(url);
      } catch {
        // ignore
      }
    }
  };

  const removeMedia = useCallback((id) => {
    setMediaItems((prev) => {
      const next = prev.filter((item) => item.id !== id);
      const removed = prev.find((item) => item.id === id);
      revokePreview(removed?.previewUrl);
      return next;
    });
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }, []);

  const handleFiles = useCallback(async (fileList) => {
    const files = Array.from(fileList || []);
    for (const file of files) {
      if (file.size > 8 * 1024 * 1024) {
        setError("Files larger than 8MB are skipped.");
        continue;
      }
      if (ACCEPTED_TYPES.length && !ACCEPTED_TYPES.some((type) => file.type.startsWith(type.split("/")[0]))) {
        // still allow unknown types but warn
      }
      const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const base64 = dataUrl.split(",")[1];
      const item = {
        id: generateId(),
        name: file.name,
        size: file.size,
        type: file.type || "application/octet-stream",
        previewUrl: URL.createObjectURL(file),
        data: base64
      };
      setMediaItems((prev) => [...prev, item]);
      setSelectedIds((prev) => new Set(prev).add(item.id));
    }
  }, []);

  const handleDrop = (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (event.dataTransfer?.files?.length) {
      handleFiles(event.dataTransfer.files);
    }
  };

  const handleSend = async () => {
    const trimmed = input.trim();
    if (!trimmed && selectedAttachments.length === 0) {
      setError("Type a question or select at least one attachment.");
      return;
    }
    setError(null);
    setIsSending(true);
    const userMessage = {
      role: "user",
      content: trimmed || "(No question, summarize attachments)",
      attachments: selectedAttachments
    };
    const history = [...messages, userMessage];
    setMessages([...history, { role: "assistant", content: "Thinking…", status: "loading" }]);
    setInput("");

    try {
      const reply = await runMediaChat(history);
      setMessages([...history, { role: "assistant", content: reply }]);
    } catch (err) {
      console.error(err);
      setMessages([...history, { role: "assistant", content: "Sorry, I hit an error processing that." }]);
      setError(err.message || "Failed to contact Gemini.");
    } finally {
      setIsSending(false);
    }
  };

  return (
    <section className="flex flex-col gap-4">
      <div
        className="w-full rounded-2xl border-2 border-dashed border-emerald-200 bg-white/80 p-6 text-center cursor-pointer hover:border-emerald-300 transition"
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
      >
        <p className="text-lg font-semibold text-emerald-700">Drop media files here</p>
        <p className="text-sm text-slate-500">PDFs, diagrams, screenshots, videos (≤ 8MB)</p>
        <input
          ref={fileInputRef}
          type="file"
          accept={ACCEPTED_TYPES.join(",")}
          multiple
          className="hidden"
          onChange={(e) => {
            handleFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </div>

      {mediaItems.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-700">Attached Media</h3>
            <button
              className="text-xs text-slate-500 hover:text-rose-600"
              onClick={() => {
                mediaItems.forEach((item) => revokePreview(item.previewUrl));
                setMediaItems([]);
                setSelectedIds(new Set());
              }}
            >
              Clear all
            </button>
          </div>
          <div className="space-y-2 max-h-48 overflow-y-auto pr-2">
            {mediaItems.map((item) => (
              <div
                key={item.id}
                className={`flex items-center gap-3 rounded-xl border px-3 py-2 ${selectedIds.has(item.id)
                  ? "border-emerald-300 bg-emerald-50/60"
                  : "border-slate-200 bg-slate-50/70"
                }`}
              >
                <input
                  type="checkbox"
                  checked={selectedIds.has(item.id)}
                  onChange={(e) => {
                    setSelectedIds((prev) => {
                      const next = new Set(prev);
                      if (e.target.checked) next.add(item.id);
                      else next.delete(item.id);
                      return next;
                    });
                  }}
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-800 truncate">{item.name}</p>
                  <p className="text-xs text-slate-500">
                    {item.type || "unknown"} • {formatSize(item.size)}
                  </p>
                </div>
                <button
                  className="text-xs text-rose-500 hover:text-rose-600"
                  onClick={() => removeMedia(item.id)}
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="bg-white rounded-2xl border border-slate-200 flex flex-col h-[28rem]">
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {messages.map((msg, idx) => (
            <div key={idx} className={`rounded-2xl px-4 py-2 ${msg.role === "assistant" ? "bg-emerald-50 text-slate-800" : "bg-slate-900 text-white"}`}>
              <p className="text-xs uppercase font-semibold tracking-wide mb-1">
                {msg.role === "assistant" ? "TabPilot" : "You"}
              </p>
              <div className="text-sm whitespace-pre-wrap">{msg.content}</div>
            </div>
          ))}
        </div>
        <div className="border-t border-slate-200 p-4 space-y-2">
          {error && <p className="text-xs text-rose-500">{error}</p>}
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            rows={3}
            className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400"
            placeholder="Ask about these media files..."
          />
          <div className="flex justify-between items-center">
            <p className="text-xs text-slate-500">
              Attachments selected: {selectedAttachments.length}
            </p>
            <button
              onClick={handleSend}
              disabled={isSending}
              className="px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 text-white text-sm font-semibold shadow hover:shadow-lg disabled:opacity-50"
            >
              {isSending ? "Thinking…" : "Send"}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
