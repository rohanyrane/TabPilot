// src/components/ControlBar.jsx
import React from "react";

export default function ControlBar({
  onHome,
  onAsk,
  onMedia,
  activeView
}) {
  const isHomeActive = activeView === "main";
  const isAskActive = activeView === "query";
  const isMediaActive = activeView === "media";

  return (
    <div className="rounded-[24px] bg-gradient-to-r from-emerald-50 to-cyan-50 p-1 flex gap-1">
      <button
        onClick={onHome}
        className={`flex-1 rounded-[20px] px-4 py-2 text-sm font-semibold transition ${isHomeActive
          ? "bg-gradient-to-r from-emerald-500 to-teal-500 text-white shadow-lg shadow-emerald-400/30"
          : "bg-white text-slate-500 hover:text-slate-700"}`}
      >
        🏠 Home
      </button>
      <button
        onClick={onAsk}
        className={`flex-1 rounded-[20px] px-4 py-2 text-sm font-semibold transition ${isAskActive
          ? "bg-gradient-to-r from-teal-500 to-cyan-500 text-white shadow-lg shadow-teal-400/30"
          : "bg-white text-slate-500 hover:text-slate-700"}`}
      >
        💬 ASK
      </button>
      <button
        onClick={onMedia}
        className={`flex-1 rounded-[20px] px-4 py-2 text-sm font-semibold transition ${isMediaActive
          ? "bg-gradient-to-r from-indigo-500 to-purple-500 text-white shadow-lg shadow-indigo-400/30"
          : "bg-white text-slate-500 hover:text-slate-700"}`}
      >
        🎞 Media
      </button>
    </div>
  );
}
