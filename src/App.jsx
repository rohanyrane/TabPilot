// src/App.jsx
import React, { useEffect, useState, useMemo } from "react";
import "./App.css";
import { useAppDispatch, useAppSelector } from "./store/hooks";
import {
  setChromeApiAvailable,
  processTabsWithProgress,
  processTabsWithAIAction,
  fetchTabsData,
  moveTabBetweenCategories,
  removeCategory,
  removeTabFromCategory,
  removeTab,
  summarizeTabContent
} from "./store/slices/appSlice";

import ControlBar from "./components/ControlBar";
import ClusterView from "./components/ClusterView";
import BookmarksPanel from "./components/BookmarksPanel";
import Settings, { getSettings } from "./components/Settings";
import AIStatusIndicator from "./components/AIStatusIndicator";
import TabScanningIndicator from "./components/TabScanningIndicator";
import TabPanel from "./components/TabPanel";
import QueryTab from "./components/QueryTab";
import BookmarkFolderPicker from "./components/BookmarkFolderPicker";
import SimplifierPanel from "./components/SimplifierPanel";
import MediaLab from "./components/MediaLab";

import { detectDuplicates } from "./utils/duplicateUtils";

export default function App() {
  const dispatch = useAppDispatch();
  const {
    chromeApiAvailable,
    tabsData,
    categorizedTabs,
    loading,
    error,
    processing,
    aiProcessing,
    tabSummaries,
    tabSummaryStatus
  } = useAppSelector((state) => state.app);

  // Local UI state
  const [dupThreshold, setDupThreshold] = useState(0.82);
  const [duplicateGroups, setDuplicateGroups] = useState([]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [activeView, setActiveView] = useState("main"); // "main", "query", or "media"
  const [folderPickerOpen, setFolderPickerOpen] = useState(false);
  const [folderPickerFolders, setFolderPickerFolders] = useState([]);
  const [selectedFolderIds, setSelectedFolderIds] = useState(null);

  // Load settings on mount
  useEffect(() => {
    getSettings().then((settings) => {
      setDupThreshold(settings.duplicateThreshold);
    });
  }, []);

  // Check Chrome API availability on mount
  useEffect(() => {
    const checkChromeAPI = async () => {
      try {
        if (typeof chrome !== "undefined" && chrome.runtime && chrome.tabs) {
          dispatch(setChromeApiAvailable(true));
        } else {
          dispatch(setChromeApiAvailable(false));
        }
      } catch (err) {
        dispatch(setChromeApiAvailable(false));
        console.error("Error checking Chrome APIs:", err);
      }
    };
    checkChromeAPI();
  }, [dispatch]);

  // Listen for tab closures and update state
  useEffect(() => {
    if (!chromeApiAvailable) return;

    const handleTabRemoved = (tabId) => {
      dispatch(removeTab(tabId));
    };

    // Add listener for tab removal
    chrome.tabs.onRemoved.addListener(handleTabRemoved);

    // Cleanup listener on unmount
    return () => {
      chrome.tabs.onRemoved.removeListener(handleTabRemoved);
    };
  }, [chromeApiAvailable, dispatch]);

  // Action: Scan tabs (progress) -> then run AI processing
  const handleScanTabs = async () => {
    const res = await dispatch(processTabsWithProgress());
    if (res && res.payload && res.payload.length > 0) {
      // Kick off AI processing (existing action)
      dispatch(processTabsWithAIAction(res.payload));
    }
  };

  // Recompute duplicates whenever tabsData or threshold changes
  useEffect(() => {
    if (!tabsData || tabsData.length === 0) {
      setDuplicateGroups([]);
      return;
    }
    const items = tabsData.map((t) => {
      const text =
        t.pageData?.content?.text ||
        t.pageData?.mainContent ||
        t.pageData?.meta?.description ||
        t.pageData?.meta?.ogDescription ||
        "";
      return {
        tabId: String(t.tabId),
        title: t.tabInfo?.title || t.pageData?.title || "",
        url: t.tabInfo?.url || t.pageData?.url || "",
        text
      };
    });

    // basic throttling: I/O heavy; run detection in next tick
    setTimeout(() => {
      const groups = detectDuplicates(items, dupThreshold);
      setDuplicateGroups(groups);
    }, 50);
  }, [tabsData, dupThreshold]);

  // Only show groups that still have more than 1 tab
  const visibleDupGroups = useMemo(
    () => (duplicateGroups || []).filter((g) => Array.isArray(g.ids) && g.ids.length > 1),
    [duplicateGroups]
  );


  // Close duplicates: given keepId and array of toClose IDs
  const handleCloseDuplicates = async (keepId, toCloseIds) => {
    if (!Array.isArray(toCloseIds) || toCloseIds.length === 0) return;
    const confirmMsg = `Close ${toCloseIds.length} tabs and keep tab ${keepId}?`;
    if (!confirm(confirmMsg)) return;

    try {
      const numeric = toCloseIds.map((id) => (isNaN(Number(id)) ? id : Number(id)));
      await new Promise((resolve) => chrome.tabs.remove(numeric, resolve));
      await dispatch(fetchTabsData());
      // duplicateGroups will recompute automatically via useEffect when tabsData updates
    } catch (err) {
      console.error("Failed to close tabs:", err);
      alert("Failed to close tabs. Check extension permissions (tabs).");
    }
  };

  // Group tabs from bookmark folders (open missing links; group title = folder title)
  const handleGroupTabs = async (selectedIdsParam = null) => {
    try {
      // Fetch full bookmarks tree
      const tree = await new Promise((resolve, reject) => {
        try {
          chrome.bookmarks.getTree((res) => {
            if (chrome.runtime.lastError) reject(chrome.runtime.lastError);
            else resolve(res || []);
          });
        } catch (e) {
          reject(e);
        }
      });

      // Collect folders with direct child links (mirror BookmarksPanel logic)
      const collectFolders = (nodes) => {
        const result = [];
        const walk = (node) => {
          if (!node) return;
          if (node.children && node.children.length >= 0) {
            const links = node.children
              .filter((c) => c.url)
              .map((c) => ({ id: c.id, title: c.title || c.url, url: c.url }));
            if (links.length > 0) {
              result.push({
                id: node.id,
                title: node.title || "",
                links,
              });
            }
            node.children
              .filter((c) => c.children && c.children.length >= 0)
              .forEach((child) => walk(child));
          }
        };
        for (const n of nodes) walk(n);
        return result;
      };

      let folders = collectFolders(Array.isArray(tree) ? tree : [tree]);
      if (!folders || folders.length === 0) {
        alert("No bookmark folders with links found.");
        return;
      }
      // If no selection yet, prompt user to pick folders; otherwise filter to selected
      const selectedIds = Array.isArray(selectedIdsParam) ? selectedIdsParam : selectedFolderIds;
      if (!Array.isArray(selectedIds) || selectedIds.length === 0) {
        setFolderPickerFolders(folders);
        setFolderPickerOpen(true);
        return;
      } else {
        folders = folders.filter((f) => selectedIds.includes(f.id));
        if (folders.length === 0) {
          // Nothing selected that matches bookmarks
          return;
        }
      }

      const normalize = (u) => {
        try {
          const url = new URL(u);
          // Normalize host and path; ignore protocol, query, and hash
          const host = url.hostname.toLowerCase().replace(/^www\./, "");
          let path = url.pathname || "/";
          // collapse trailing slashes (except root)
          path = path.replace(/\/+$/, "");
          if (path === "") path = "/";
          return `${host}${path}`;
        } catch {
          try {
            const s = String(u || "");
            const noHash = s.split("#")[0];
            const noQuery = noHash.split("?")[0];
            return noQuery.replace(/^https?:\/\/(www\.)?/i, "").replace(/\/+$/, "");
          } catch {
            return (u || "").replace(/\/+$/, "");
          }
        }
      };

      // Build from live tabs to ensure idempotency across immediate re-clicks
      const allTabs = await new Promise((resolve) => chrome.tabs.query({}, resolve));
      const tabsById = new Map(allTabs.map((tab) => [Number(tab.id), tab]));
      // Map normalized URL -> array of { id, windowId, groupId }
      const openByUrl = new Map();
      for (const t of allTabs) {
        const u = t.url || "";
        const key = normalize(u);
        if (!key) continue;
        if (!openByUrl.has(key)) openByUrl.set(key, []);
        openByUrl.get(key).push({ id: Number(t.id), windowId: t.windowId, groupId: t.groupId });
      }

      // Pre-compute how many tabs would need to be opened
      let toOpenTotal = 0;
      for (const folder of folders) {
        const seenUrls = new Set();
        for (const link of folder.links) {
          const key = normalize(link.url);
          if (!key || seenUrls.has(key)) continue;
          seenUrls.add(key);
          const existing = openByUrl.get(key);
          if (!existing || existing.length === 0) toOpenTotal += 1;
        }
      }


      const colors = ['blue', 'red', 'yellow', 'green', 'pink', 'purple', 'cyan', 'orange'];
      let colorIndex = await new Promise((resolve) => {
        try {
          chrome.storage.local.get('ts_color_idx', (obj) => {
            const n = Number(obj?.ts_color_idx ?? 0);
            resolve(isNaN(n) ? 0 : n);
          });
        } catch {
          resolve(0);
        }
      });
      let groupedFolders = 0;
      let openedTotal = 0;
      // Prevent reusing the same tab across multiple folder groups
      const usedGlobal = new Set();

      // Helper to get a tab group object (title/color) from groupId
      const getTabGroup = (groupId) =>
        new Promise((resolve) => {
          try {
            chrome.tabGroups.get(groupId, (grp) => resolve(grp || null));
          } catch {
            resolve(null);
          }
        });

      // Helper to open a tab and return { id, windowId }
      const openTab = (url) => new Promise((resolve) => {
        chrome.tabs.create({ url, active: false }, (tab) => {
          // In MV3, callback returns Tab immediately
          resolve({ id: tab.id, windowId: tab.windowId });
        });
      });

      // Single confirmation popup logic:
      // - If some links need to be opened, ask confirmation mentioning how many will be opened and grouped.
      // - Else if links are already open but not grouped (or titled) correctly, ask confirmation to group.
      // - Else if already grouped correctly, do nothing and show no popup.
      if (toOpenTotal === 0) {
        let needsGroupingChange = false;
        outer:
        for (const folder of folders) {
          const title = folder.title || "(Untitled Folder)";
          // Build unique URL list for this folder
          const uniqueUrls = [];
          const seen = new Set();
          for (const link of folder.links) {
            const key = normalize(link.url);
            if (!key || seen.has(key)) continue;
            seen.add(key);
            uniqueUrls.push({ key, url: link.url });
          }
          // Collect existing open tab refs for those URLs
          const tabRefs = [];
          for (const { key } of uniqueUrls) {
            const existing = openByUrl.get(key);
            if (existing && existing.length > 0) {
              for (const ref of existing) {
                tabRefs.push(ref);
              }
            }
          }
          // Group by window
          const byWindow = new Map();
          for (const r of tabRefs) {
            if (r.windowId == null) continue;
            if (!byWindow.has(r.windowId)) byWindow.set(r.windowId, []);
            const nid = Number(r.id);
            if (!isNaN(nid) && !byWindow.get(r.windowId).includes(nid)) {
              byWindow.get(r.windowId).push(nid);
            }
          }
          for (const [winId, ids] of byWindow.entries()) {
            if (!ids || ids.length === 0) continue;
            // Check if already in a single group with the exact folder title
            const groupIds = new Set();
            let allHaveGroup = true;
            for (const nid of ids) {
              const t = tabsById.get(Number(nid));
              const gid = t?.groupId;
              if (gid == null || gid === -1) {
                allHaveGroup = false;
                break;
              }
              groupIds.add(gid);
            }
            if (!allHaveGroup || groupIds.size !== 1) {
              needsGroupingChange = true;
              break outer;
            }
            const existingGroupId = Array.from(groupIds)[0];
            const grp = await getTabGroup(existingGroupId);
            if (!grp || grp.title !== title) {
              needsGroupingChange = true;
              break outer;
            }
          }
        }
        if (needsGroupingChange) {
          const proceed = confirm("Group open tabs by bookmark folder titles?");
          if (!proceed) return;
        } else {
          // Already grouped correctly; no action or popup
          return;
        }
      } else {
        const proceed = confirm(`About to open ${toOpenTotal} bookmark link${toOpenTotal !== 1 ? "s" : ""} and group them by their folder titles. Continue?`);
        if (!proceed) return;
      }

      for (const folder of folders) {
        const title = folder.title || "(Untitled Folder)";
        // Collect unique URLs per folder
        const uniqueUrls = [];
        const seen = new Set();
        for (const link of folder.links) {
          const key = normalize(link.url);
          if (!key || seen.has(key)) continue;
          seen.add(key);
          uniqueUrls.push({ key, url: link.url });
        }

        // Gather tab references for this folder
        const tabRefs = [];
        for (const { key, url } of uniqueUrls) {
          const existing = openByUrl.get(key);
          if (existing && existing.length > 0) {
            // Use all existing matching tabs that haven't been used yet
            for (const ref of existing) {
              const nid = Number(ref.id);
              if (!usedGlobal.has(nid)) {
                tabRefs.push(ref);
              }
            }
          } else {
            // Open missing bookmark link
            try {
              const ref = await openTab(url);
              tabRefs.push(ref);
              openedTotal += 1;
              // Update map so subsequent duplicates reuse
              if (!openByUrl.has(key)) openByUrl.set(key, []);
              openByUrl.get(key).push(ref);
            } catch (e) {
              console.error("Failed to open bookmark tab:", url, e);
            }
          }
        }

        // Deduplicate tab IDs
        const idSet = new Set(tabRefs.map((r) => Number(r.id)).filter((n) => !isNaN(n)));
        if (idSet.size === 0) continue;

        // Group per window
        const byWindow = new Map();
        for (const r of tabRefs) {
          if (r.windowId == null) continue;
          if (!byWindow.has(r.windowId)) byWindow.set(r.windowId, []);
          // push only if in idSet to avoid duplicates
          const arr = byWindow.get(r.windowId);
          const nid = Number(r.id);
          if (!arr.includes(nid)) arr.push(nid);
        }

        let createdAny = false;
        for (const [winId, ids] of byWindow.entries()) {
          if (!ids || ids.length === 0) continue;
          try {
            // Idempotency: if all tabs already in a single group with the same title, skip; or just update title/color.
            const groupIds = new Set();
            let allHaveGroup = true;
            for (const nid of ids) {
              const t = tabsById.get(Number(nid));
              const gid = t?.groupId;
              if (gid == null || gid === -1) {
                allHaveGroup = false;
                break;
              }
              groupIds.add(gid);
            }

            if (allHaveGroup && groupIds.size === 1) {
              const existingGroupId = Array.from(groupIds)[0];
              const grp = await getTabGroup(existingGroupId);
              if (grp && grp.title === title) {
                console.log(`Skipping grouping for "${title}" in window ${winId} (already grouped).`);
                continue;
              } else if (grp) {
                await chrome.tabGroups.update(existingGroupId, {
                  title,
                  collapsed: false
                });
                createdAny = true;
                console.log(`Updated existing group ${existingGroupId} to "${title}" in window ${winId}.`);
                continue;
              }
            }

            const groupId = await chrome.tabs.group({ tabIds: ids });
            await chrome.tabGroups.update(groupId, {
              title,
              color: colors[colorIndex % colors.length],
              collapsed: false
            });
            createdAny = true;
            console.log(`Grouped ${ids.length} tab(s) under folder "${title}" in window ${winId} (group ${groupId})`);
          } catch (e) {
            console.error(`Failed to group folder "${title}" in window ${winId}`, e);
          }
        }

        if (createdAny) {
          // Mark grouped tabs as used globally to avoid moving them into another folder's group
          for (const ids of byWindow.values()) {
            ids.forEach((nid) => usedGlobal.add(Number(nid)));
          }
          colorIndex++;
          groupedFolders++;
        }
      }

      // Persist next color index for future runs
      try {
        await new Promise((r) => chrome.storage.local.set({ ts_color_idx: colorIndex % colors.length }, r));
      } catch (e) {
        // non-fatal
      }
      // Refresh local tabs data after opening/grouping
      try {
        await new Promise((r) => setTimeout(r, 150));
        await dispatch(fetchTabsData());
      } catch (e) {
        // non-fatal
      }

      if (groupedFolders > 0) {
        console.log(`Opened ${openedTotal} new tab${openedTotal !== 1 ? "s" : ""} and grouped ${groupedFolders} folder${groupedFolders !== 1 ? "s" : ""}.`);
      } else {
        console.log("No bookmark folders were grouped.");
      }
      setSelectedFolderIds(null);
    } catch (err) {
      console.error("Failed to group tabs by bookmark folders:", err);
      alert(`Failed to group tabs: ${err.message}`);
    }
  };

  // Memoize counts for header
  const tabCount = tabsData?.length || 0;

  const renderWorkspace = () => {
    if (activeView === "query") {
      return (
        <main className="flex-1 overflow-hidden">
          <div className="glass-panel h-full flex flex-col gap-3 rounded-2xl p-4 ">
            <ControlBar
              onHome={() => setActiveView("main")}
              onAsk={() => setActiveView("query")}
              onMedia={() => setActiveView("media")}
              activeView={activeView}
            />
            <QueryTab
              tabsData={tabsData}
              categorizedTabs={categorizedTabs}
              onOpenTab={(tabId) => chrome.tabs.update(Number(tabId), { active: true })}
            />
          </div>
        </main>
      );
    }

    if (activeView === "media") {
      return (
        <main className="flex-1 overflow-hidden">
          <div className="glass-panel flex flex-col gap-3 overflow-y-auto p-4 rounded-2xl h-full">
            <ControlBar
              onHome={() => setActiveView("main")}
              onAsk={() => setActiveView("query")}
              onMedia={() => setActiveView("media")}
              activeView={activeView}
            />
            <MediaLab />
          </div>
        </main>
      );
    }

    return (
      <main className="flex-1 overflow-hidden">
        <div className="glass-panel flex flex-col gap-3 overflow-y-auto p-4 rounded-2xl h-full">
          <ControlBar
            onHome={() => setActiveView("main")}
            onAsk={() => setActiveView("query")}
            onMedia={() => setActiveView("media")}
            activeView={activeView}
          />
          <TabPanel
            tabs={[
              {
                icon: "📑",
                label: "All Tabs",
                badge: tabCount || null,
                content: (
                  <div className="h-full overflow-y-auto">
                    {tabsData.length === 0 ? (
                      <div className="text-center py-12 text-slate-400">
                        <div className="text-6xl mb-4 opacity-50">🗂️</div>
                        <div className="font-semibold text-lg">No tabs found</div>
                      </div>
                    ) : (
                      <>
                        {visibleDupGroups.length > 0 && (
                          <div className="mb-4 p-3 bg-gradient-to-br from-red-50/70 to-red-100/40 border border-red-200 rounded-lg">
                            <div className="flex items-center justify-between mb-2">
                              <strong className="text-red-600 text-sm flex items-center gap-2">
                                <span>🔄</span>
                                Similar Tabs
                              </strong>
                              <span className="text-xs text-slate-500">
                                {visibleDupGroups.length} group{visibleDupGroups.length !== 1 ? 's' : ''}
                              </span>
                            </div>

                            <div className="space-y-2">
                              {visibleDupGroups.slice(0, 3).map((g, idx) => {
                                const keep = g.ids[0];
                                const groupTabs = g.ids.map((id) =>
                                  tabsData.find((t) => String(t.tabId) === String(id))
                                ).filter(Boolean);

                                return (
                                  <div key={idx} className="bg-white/70 border border-red-200 rounded-md p-2">
                                    <div className="flex items-center justify-between">
                                      <div className="text-xs text-slate-600">
                                        {(g.avgScore * 100).toFixed(0)}% similar • {g.ids.length} tabs
                                      </div>
                                      <button
                                        onClick={() => {
                                          const toClose = g.ids.filter((id) => String(id) !== String(keep));
                                          if (toClose.length === 0) {
                                            alert('No other tabs to close in this group.');
                                            return;
                                          }
                                          handleCloseDuplicates(keep, toClose);
                                        }}
                                        className="px-2 py-1 text-xs bg-red-500 text-white rounded hover:bg-red-600"
                                      >
                                        Close {g.ids.length - 1}
                                      </button>
                                    </div>
                                    <div className="mt-1 text-[11px] text-slate-700 space-y-1">
                                      {groupTabs.slice(0, 3).map((tab) => (
                                        <div key={tab.tabId} className="flex items-center gap-2 truncate">
                                          <span>📄</span>
                                          <span className="truncate">{tab.tabInfo?.title || tab.tabInfo?.url}</span>
                                        </div>
                                      ))}
                                      {groupTabs.length > 3 && (
                                        <div className="text-[10px] text-slate-500">+{groupTabs.length - 3} more…</div>
                                      )}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}
                        <div className="space-y-2 pr-2">
                          {tabsData.map((t) => {
                            const tabId = String(t.tabId);
                            const summaryState = tabSummaryStatus?.[tabId];
                            const summary = tabSummaries?.[tabId];
                            return (
                              <div key={t.tabId} className="space-y-3 p-3 bg-gradient-to-r from-emerald-50/40 to-cyan-50/40 border border-slate-200 rounded-xl hover:border-emerald-300 transition-colors">
                                <div className="flex items-center justify-between gap-3">
                                  <div className="flex items-center gap-2 flex-1 min-w-0">
                                    {t.tabInfo?.favIconUrl ? (
                                      <img
                                        src={t.tabInfo.favIconUrl}
                                        alt=""
                                        className="w-4 h-4 flex-shrink-0"
                                        onError={(e) => e.target.style.display = 'none'}
                                      />
                                    ) : (
                                      <span className="text-sm">🔗</span>
                                    )}
                                    <div className="flex-1 min-w-0">
                                      <div className="font-semibold text-sm text-slate-900 truncate">{t.tabInfo?.title || "Untitled"}</div>
                                      <div className="text-xs text-slate-500 truncate">{t.tabInfo?.url || "No url"}</div>
                                    </div>
                                  </div>
                                  <div className="flex gap-2 ml-3">
                                    <button
                                      onClick={() => chrome.tabs.update(Number(t.tabId), { active: true })}
                                      className="px-3 py-1.5 text-xs bg-emerald-500 text-white rounded-lg shadow-sm hover:bg-emerald-600 transition-colors"
                                    >
                                      Open
                                    </button>
                                    <button
                                      onClick={() => {
                                        chrome.tabs.remove(Number(t.tabId));
                                        setTimeout(() => dispatch(fetchTabsData()), 300);
                                      }}
                                      title="Close tab"
                                      className="px-3 py-1.5 text-xs bg-red-500 text-white rounded-lg shadow-sm hover:bg-red-600 transition-colors"
                                    >
                                      ✕
                                    </button>
                                    <button
                                      onClick={() => dispatch(summarizeTabContent(t.tabId))}
                                      disabled={summaryState === "loading"}
                                      className="px-3 py-1.5 text-xs bg-slate-800 text-white rounded-lg shadow-sm hover:bg-slate-900 transition-colors disabled:opacity-60"
                                    >
                                      {summaryState === "loading" ? "Summarizing…" : "Summarize"}
                                    </button>
                                  </div>
                                </div>
                                {summary && (
                                  <div className="tab-summary-card">
                                    <p className="tab-summary-card__label">Gemini Summary</p>
                                    <div className="tab-summary-card__body">
                                      {summary.split("\n").map((line, idx) => (
                                        <p key={`${tabId}-line-${idx}`} className="tab-summary-card__text">
                                          {line}
                                        </p>
                                      ))}
                                    </div>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </>
                    )}
                  </div>
                )
              },
              {
                icon: "✨",
                label: "AI Categorized",
                badge: categorizedTabs ? Object.keys(categorizedTabs).length : null,
                content: (
                  <div className="h-full overflow-y-auto">
                    {aiProcessing.isProcessing && (
                      <div className="mb-3 p-3 bg-gradient-to-r from-emerald-100/80 to-teal-100/80 rounded-lg text-emerald-700 font-semibold text-sm">
                        ⏳ AI is processing — results will update shortly...
                      </div>
                    )}
                    {categorizedTabs ? (
                      <ClusterView
                        categorizedTabs={categorizedTabs}
                        tabsData={tabsData}
                        onRefresh={() => dispatch(fetchTabsData())}
                        onMoveTab={(tabId, fromCategory, toCategory) => {
                          dispatch(moveTabBetweenCategories({ tabId, fromCategory, toCategory }));
                        }}
                        onRemoveFromCategory={(tabId, category) => {
                          dispatch(removeTabFromCategory({ tabId, category }));
                        }}
                        onRemoveCategory={(category) => {
                          dispatch(removeCategory(category));
                        }}
                      />
                    ) : (
                      <div className="text-center py-12 text-slate-400">
                        <div className="text-6xl mb-4 opacity-50">📊</div>
                        <div className="font-semibold mb-2 text-lg">No categories yet</div>
                        <div className="text-sm">Click "💬 ASK" to query your tabs or scan them first</div>
                      </div>
                    )}
                  </div>
                )
              },
              {
                icon: "🔖",
                label: "Bookmarks",
                content: (
                  <BookmarksPanel />
                )
              }
            ]}
          />
        </div>
      </main>
    );
  };

  return (
    <div className="app-shell overflow-y-auto">
      <div className="app-scroll-body">
        {/* <div className="glass-panel flex flex-col  overflow-y-auto p-4 rounded-2xl h-full"> */}
        <header className="app-header flex-shrink-0">
          {processing?.isProcessing && (
            <div className="app-progress-track">
              <div
                className="app-progress-fill"
                style={{ width: `${Math.round(processing.progress || 0)}%` }}
              />
            </div>
          )}
          <div className="app-header-row">
            <div className="app-logo-wrapper">
              <div className="app-logo">
                <img src="/src/assets/logo.png" alt="TabPilot Logo" className="app-logo-img" />
              </div>
              <div className="app-title-block">
                <h1 className="app-title">TabPilot</h1>
                <p className="app-subtitle">Curate • Cluster • Clean</p>
              </div>
            </div>
            <div className="app-header-actions">
              <button
                onClick={() => setSettingsOpen(true)}
                className="app-icon-button"
                title="Settings"
                aria-label="Open settings"
              >
                <span className="text-lg leading-none">⚙️</span>
              </button>
              <div
                role="status"
                title={chromeApiAvailable ? "Chrome API available" : "Chrome API unavailable"}
                className={`app-status ${chromeApiAvailable ? "app-status--ok" : "app-status--error"}`}
              >
                <span>API</span>
                <span className="text-sm">{chromeApiAvailable ? "✓" : "✗"}</span>
              </div>
            </div>
          </div>
        </header>

        {/* Quick Actions Bar */}
        <div className="quick-actions-panel flex-shrink-0">
          <div className="quick-actions-row">
            <button
              onClick={() => dispatch(processTabsWithProgress())}
              className="quick-button quick-button--scan"
            >
              <span>🔄</span>
              <span>Scan</span>
            </button>
            <button
              onClick={handleScanTabs}
              disabled={aiProcessing.isProcessing || !tabsData || tabsData.length === 0}
              className="quick-button quick-button--categorize"
              title={!tabsData || tabsData.length === 0 ? "Please scan tabs first" : "Categorize tabs with AI"}
            >
              <span>🔍</span>
              <span>Categorize</span>
            </button>
            <button
              onClick={handleGroupTabs}
              className="quick-button quick-button--group"
              title="Open missing bookmark links and group by bookmark folder title"
            >
              <span>📂</span>
              <span>Group</span>
            </button>
          </div>
        </div>

        <div className="min-h-[350px] max-h-[350px]">
          <SimplifierPanel />
        </div>

        <div className="min-h-[350px] max-h-[350px]">
          {renderWorkspace()}
        </div>

        {/* <footer className="mt-auto pt-4 text-center text-emerald-700 text-xs font-medium">
          <small>TabPilot — Built with Chrome AI • Hybrid mode available</small>
        </footer> */}

        {/* Settings Modal */}
        <Settings
          isOpen={settingsOpen}
          onClose={() => {
            setSettingsOpen(false);
            // Reload settings after closing
            getSettings().then((settings) => {
              setDupThreshold(settings.duplicateThreshold);
            });
          }}
        />

        {/* Bookmark folder selection */}
        <BookmarkFolderPicker
          isOpen={folderPickerOpen}
          folders={folderPickerFolders}
          onCancel={() => setFolderPickerOpen(false)}
          onConfirm={async (ids) => {
            setFolderPickerOpen(false);
            await handleGroupTabs(ids);
          }}
        />

        {/* AI Status Indicator */}
        <AIStatusIndicator isProcessing={aiProcessing.isProcessing || processing.isProcessing} />

        {/* Tab Scanning Indicator */}
        <TabScanningIndicator
          isScanning={processing.isProcessing}
          progress={processing.progress || 0}
          totalTabs={tabsData?.length || 0}
          aiProcessing={aiProcessing.isProcessing}
        />
      </div>
    </div>
  );
}
