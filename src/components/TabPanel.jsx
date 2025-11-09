// src/components/TabPanel.jsx
import React, { useState } from "react";

export default function TabPanel({ tabs, defaultTab = 0 }) {
  const [activeTab, setActiveTab] = useState(defaultTab);

  return (
    <div className="glass-panel rounded-2xl p-5 transition-all hover:shadow-xl flex flex-col flex-1 min-h-0">
      {/* Tab Headers */}
      <div
        className="grid gap-2 mb-4 border-b border-slate-200 pb-2"
        style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}
      >
        {tabs.map((tab, index) => (
          <button
            key={index}
            onClick={() => setActiveTab(index)}
            className={`
              w-full px-3 py-2 rounded-lg font-semibold text-xs transition-all duration-200 flex items-center justify-center gap-1.5
              ${activeTab === index
                ? 'bg-gradient-to-r from-emerald-500 to-teal-500 text-white shadow-md shadow-emerald-400/30'
                : 'bg-slate-50 text-slate-600 hover:bg-slate-100'
              }
            `}
          >
            <span className="text-xs">{tab.icon}</span>
            <span>{tab.label}</span>
            {tab.badge && (
              <span className={`
                px-1.5 py-0.5 rounded-full text-[10px] font-bold
                ${activeTab === index
                  ? 'bg-white/20 text-white'
                  : 'bg-emerald-100 text-emerald-600'
                }
              `}>
                {tab.badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-hidden min-h-0">
        <div className="h-full overflow-y-auto pr-1">
          {tabs[activeTab]?.content}
        </div>
      </div>
    </div>
  );
}
