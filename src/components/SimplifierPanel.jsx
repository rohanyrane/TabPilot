// src/components/SimplifierPanel.jsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

const simplifyButtons = [
  { label: "Low", value: "1" },
  { label: "Mid", value: "3" },
  { label: "High", value: "5" }
];

const optimizeModes = [
  { value: "textClarity", label: "Simplify Complex Ideas" },
  { value: "focusStructure", label: "Better Visual Organization" },
  { value: "wordPattern", label: "Easier Reading Flow" }
];

const themeOptions = [
  { value: "default", label: "Default" },
  { value: "creamPaper", label: "Cream Paper" },
  { value: "darkMode", label: "Dark Mode" },
  { value: "sepia", label: "Sepia" }
];

const chromeSync = () =>
  typeof chrome !== "undefined" && chrome?.storage?.sync ? chrome.storage.sync : null;

const queryActiveTab = (cb) => {
  if (typeof chrome === "undefined" || !chrome.tabs) {
    cb(null);
    return;
  }
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    cb(tabs && tabs.length ? tabs[0] : null);
  });
};

export default function SimplifierPanel() {
  const [simplificationLevel, setSimplificationLevel] = useState("3");
  const [optimizeMode, setOptimizeMode] = useState("textClarity");
  const [isSimplifying, setIsSimplifying] = useState(false);
  const [buttonLabel, setButtonLabel] = useState("Simplify Text");
  const [showSimplifyGuide, setShowSimplifyGuide] = useState(false);
  const [showOptimizeGuide, setShowOptimizeGuide] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  const [fontEnabled, setFontEnabled] = useState(false);
  const [theme, setTheme] = useState("default");
  const [lineSpacing, setLineSpacing] = useState(2);
  const [letterSpacing, setLetterSpacing] = useState(1.5);
  const [wordSpacing, setWordSpacing] = useState(4);

  const spacingTimer = useRef(null);

  // Load stored settings on mount
  useEffect(() => {
    const sync = chromeSync();
    if (!sync) return;

    sync.get(
      {
        simplificationLevel: "3",
        optimizeFor: "textClarity",
        fontEnabled: false,
        selectedTheme: "default",
        lineSpacing: 2,
        letterSpacing: 1.5,
        wordSpacing: 4
      },
      (result) => {
        setSimplificationLevel(String(result.simplificationLevel || "3"));
        setOptimizeMode(result.optimizeFor || "textClarity");
        setFontEnabled(Boolean(result.fontEnabled));
        setTheme(result.selectedTheme || "default");
        setLineSpacing(Number(result.lineSpacing ?? 2));
        setLetterSpacing(Number(result.letterSpacing ?? 1.5));
        setWordSpacing(Number(result.wordSpacing ?? 4));
      }
    );
  }, []);

  const persist = useCallback((data) => {
    const sync = chromeSync();
    if (!sync) return;
    sync.set(data);
  }, []);

  const sendToActiveTab = useCallback((message, cb) => {
    const injectReader = (tabId) =>
      new Promise((resolve) => {
        if (!chrome?.scripting?.executeScript) return resolve(false);
        chrome.scripting.executeScript(
          {
            target: { tabId },
            files: ["reader.js"]
          },
          () => {
            if (chrome.runtime?.lastError) {
              console.error("Failed to inject reader:", chrome.runtime.lastError.message);
              resolve(false);
            } else {
              resolve(true);
            }
          }
        );
      });

    const sendMessage = (tab, retries = 1) => {
      if (!tab || !/^https?:/.test(tab.url)) {
        cb && cb(new Error("Please open a standard webpage tab."));
        return;
      }
      if (typeof chrome === "undefined" || !chrome.tabs?.sendMessage) {
        cb && cb(new Error("chrome.tabs unavailable"));
        return;
      }
      chrome.tabs.sendMessage(tab.id, message, async (response) => {
        const err = chrome.runtime?.lastError;
        if (err && /Receiving end does not exist/i.test(err.message) && retries > 0) {
          await injectReader(tab.id);
          sendMessage(tab, retries - 1);
          return;
        }
        if (err) {
          cb && cb(new Error(err.message));
        } else {
          cb && cb(null, response);
        }
      });
    };

    queryActiveTab((tab) => sendMessage(tab, 1));
  }, []);

  // Ask content script for actual font state
  useEffect(() => {
    sendToActiveTab(
      { action: "getFontState" },
      (err, response) => {
        if (!err && response && typeof response.fontEnabled === "boolean") {
          setFontEnabled(response.fontEnabled);
        }
      }
    );
  }, [sendToActiveTab]);

  const handleSimplify = useCallback(() => {
    if (isSimplifying) return;
    setIsSimplifying(true);
    setButtonLabel("Simplifying...");
    sendToActiveTab(
      {
        action: "simplify",
        level: simplificationLevel,
        optimizeMode
      },
      (err, response) => {
        if (err || !response?.success) {
          console.log("error : ", response)
          setButtonLabel("Error!");
        } else {
          setButtonLabel("Done!");
        }
        setTimeout(() => {
          setIsSimplifying(false);
          setButtonLabel("Simplify Text");
        }, 1800);
      }
    );
  }, [isSimplifying, sendToActiveTab, simplificationLevel, optimizeMode]);

  const applyTheme = useCallback(
    (nextTheme) => {
      sendToActiveTab(
        {
          action: "applyTheme",
          theme: nextTheme
        },
        () => { }
      );
    },
    [sendToActiveTab]
  );

  const applySpacing = useCallback(() => {
    sendToActiveTab(
      {
        action: "adjustSpacing",
        lineSpacing,
        letterSpacing,
        wordSpacing
      },
      () => { }
    );
  }, [sendToActiveTab, lineSpacing, letterSpacing, wordSpacing]);

  // Debounce spacing updates
  useEffect(() => {
    if (spacingTimer.current) clearTimeout(spacingTimer.current);
    spacingTimer.current = setTimeout(() => {
      persist({
        lineSpacing,
        letterSpacing,
        wordSpacing
      });
      applySpacing();
    }, 200);
    return () => clearTimeout(spacingTimer.current);
  }, [lineSpacing, letterSpacing, wordSpacing, persist, applySpacing]);

  const simplificationGuideItems = useMemo(
    () => [
      { title: "Low", body: "Light touch for dense paragraphs." },
      { title: "Mid", body: "Balanced simplification (default)." },
      { title: "High", body: "Aggressively clarifies the text." }
    ],
    []
  );

  const optimizeGuideItems = useMemo(
    () => [
      {
        icon: "💡",
        title: "Simplify Complex Ideas",
        body: "Breaks down dense concepts into plain language."
      },
      {
        icon: "🧭",
        title: "Better Visual Organization",
        body: "Adds structure, headings, and highlights."
      },
      {
        icon: "📖",
        title: "Easier Reading Flow",
        body: "Stabilizes cadence and word choice."
      }
    ],
    []
  );

  return (

      <section className="glass-panel rounded-3xl p-5 flex flex-col gap-4 max-h-[26rem] overflow-y-auto min-h-[350px] max-h-[350px]">
        <header className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase font-semibold tracking-[0.3em] text-emerald-500">
              Reading assistant
            </p>
            <h2 className="text-xl font-bold text-slate-900">Simplify the active tab</h2>
          </div>
          <button
            onClick={() => setShowSettings((prev) => !prev)}
            className="px-3 py-1.5 text-xs font-semibold rounded-full border border-emerald-200 text-emerald-600 hover:bg-emerald-50 transition"
          >
            {showSettings ? "Hide Settings" : "Reading Settings"}
          </button>
        </header>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
              <span>✨ Simplification Level</span>
              <button
                type="button"
                className="text-emerald-600 text-xs underline"
                onClick={() => setShowSimplifyGuide((prev) => !prev)}
              >
                {showSimplifyGuide ? "Hide guide" : "Guide"}
              </button>
            </h3>
          </div>
          <div className="flex flex-wrap gap-2">
            {simplifyButtons.map((btn) => (
              <button
                key={btn.value}
                onClick={() => {
                  setSimplificationLevel(btn.value);
                  persist({ simplificationLevel: btn.value });
                }}
                className={`px-4 py-2 rounded-2xl text-sm font-semibold transition shadow-sm ${simplificationLevel === btn.value
                    ? "bg-gradient-to-r from-emerald-500 to-teal-500 text-white shadow-emerald-300/40"
                    : "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                  }`}
              >
                {btn.label}
              </button>
            ))}
          </div>
          {showSimplifyGuide && (
            <ul className="text-xs text-slate-600 bg-emerald-50/70 rounded-2xl p-3 border border-emerald-100 space-y-1">
              {simplificationGuideItems.map((item) => (
                <li key={item.title}>
                  <strong className="text-emerald-700">{item.title}</strong> — {item.body}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
              <span>🎛️ Optimization Mode</span>
              <button
                type="button"
                className="text-emerald-600 text-xs underline"
                onClick={() => setShowOptimizeGuide((prev) => !prev)}
              >
                {showOptimizeGuide ? "Hide tips" : "Show tips"}
              </button>
            </h3>
          </div>
          <select
            value={optimizeMode}
            onChange={(e) => {
              setOptimizeMode(e.target.value);
              persist({ optimizeFor: e.target.value });
            }}
            className="w-full rounded-2xl border border-emerald-100 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-400"
          >
            {optimizeModes.map((mode) => (
              <option key={mode.value} value={mode.value}>
                {mode.label}
              </option>
            ))}
          </select>
          {showOptimizeGuide && (
            <ul className="text-xs text-slate-600 bg-white rounded-2xl p-3 border border-emerald-100 space-y-2">
              {optimizeGuideItems.map((item) => (
                <li key={item.title} className="flex items-start gap-2">
                  <span>{item.icon}</span>
                  <div>
                    <strong className="text-emerald-700">{item.title}</strong>
                    <div>{item.body}</div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <button
          onClick={handleSimplify}
          disabled={isSimplifying}
          className="w-full flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-500 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-emerald-300/40 transition hover:-translate-y-0.5 disabled:opacity-60 disabled:translate-y-0"
        >
          {isSimplifying && <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
          {buttonLabel}
        </button>

        {showSettings && (
          <div className="space-y-4 border-t border-slate-200 pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-slate-800">OpenDyslexic Font</p>
                <p className="text-xs text-slate-500">Apply accessible type to the current tab</p>
              </div>
              <label className="inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  className="sr-only"
                  checked={fontEnabled}
                  onChange={(e) => {
                    const enabled = e.target.checked;
                    setFontEnabled(enabled);
                    persist({ fontEnabled: enabled });
                    sendToActiveTab({ action: "toggleFont", enabled }, () => { });
                  }}
                />
                <span
                  className={`w-11 h-6 flex items-center rounded-full px-1 transition ${fontEnabled ? "bg-emerald-500" : "bg-slate-300"
                    }`}
                >
                  <span
                    className={`w-4 h-4 bg-white rounded-full shadow transform transition ${fontEnabled ? "translate-x-5" : ""
                      }`}
                  />
                </span>
              </label>
            </div>

            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Reading Theme</label>
                <select
                  value={theme}
                  onChange={(e) => {
                    const nextTheme = e.target.value;
                    setTheme(nextTheme);
                    persist({ selectedTheme: nextTheme });
                    applyTheme(nextTheme);
                  }}
                  className="w-full rounded-xl border border-emerald-100 bg-white px-3 py-2 text-sm font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-300"
                >
                  {themeOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="space-y-3">
              <label className="text-xs font-semibold text-slate-600 flex justify-between">
                <span>Line spacing</span>
                <span className="text-emerald-600 font-semibold">{lineSpacing.toFixed(1)}x</span>
              </label>
              <input
                type="range"
                min="1"
                max="3"
                step="0.1"
                value={lineSpacing}
                onChange={(e) => setLineSpacing(Number(e.target.value))}
                className="w-full accent-emerald-500"
              />

              <label className="text-xs font-semibold text-slate-600 flex justify-between">
                <span>Letter spacing</span>
                <span className="text-emerald-600 font-semibold">{letterSpacing.toFixed(1)}px</span>
              </label>
              <input
                type="range"
                min="0"
                max="5"
                step="0.1"
                value={letterSpacing}
                onChange={(e) => setLetterSpacing(Number(e.target.value))}
                className="w-full accent-emerald-500"
              />

              <label className="text-xs font-semibold text-slate-600 flex justify-between">
                <span>Word spacing</span>
                <span className="text-emerald-600 font-semibold">{wordSpacing.toFixed(1)}px</span>
              </label>
              <input
                type="range"
                min="0"
                max="10"
                step="0.5"
                value={wordSpacing}
                onChange={(e) => setWordSpacing(Number(e.target.value))}
                className="w-full accent-emerald-500"
              />
            </div>

            <div className="flex justify-end">
              <button
                onClick={() => {
                  setSimplificationLevel("3");
                  setOptimizeMode("textClarity");
                  setFontEnabled(false);
                  setTheme("default");
                  setLineSpacing(2);
                  setLetterSpacing(1.5);
                  setWordSpacing(4);
                  persist({
                    simplificationLevel: "3",
                    optimizeFor: "textClarity",
                    fontEnabled: false,
                    selectedTheme: "default",
                    lineSpacing: 2,
                    letterSpacing: 1.5,
                    wordSpacing: 4
                  });
                  sendToActiveTab({ action: "toggleFont", enabled: false }, () => { });
                  applyTheme("default");
                }}
                className="px-4 py-2 text-xs font-semibold rounded-xl border border-emerald-200 text-emerald-700 hover:bg-emerald-50 transition"
              >
                Reset to defaults
              </button>
            </div>
          </div>
        )}
      </section>

  );
}
