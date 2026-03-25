import { useState, useRef, useEffect } from "react";

// ── Replace with your Anthropic API key ──────────────────────────────────────
const ANTHROPIC_KEY = "YOUR_ANTHROPIC_API_KEY_HERE";

// ── Optional: Azure Blob Storage URL for auto-loading fresh data ─────────────
// After uploading coach-data.json to your golf-app-data container, paste the URL here
// e.g. "https://golfdatastorage.blob.core.windows.net/golf-app-data/coach-data.json"
const BLOB_DATA_URL = "https://golfdatastorage.blob.core.windows.net/golf-app-data/coach-data.json";

const SYSTEM_PROMPT = `You are an expert PGA-level golf coach with access to LJ's complete Garmin R10 launch monitor data including every individual shot.

Key benchmarks:
- Driver: smash factor 1.45+, attack angle +2 to +5°, spin 2000-2800rpm, club speed 95mph target
- Irons: smash factor 1.38+, attack angle -2 to -5°
- Face to path: within ±2° for straight shots
- Swing tempo: 3:1 backswing to downswing ratio ideal
- Spin axis: 0 = straight, positive = fade, negative = draw
- Carry deviation: within ±10 yards is accurate

When analyzing:
1. ALWAYS reference actual numbers from the data
2. Compare individual shots to find patterns (best vs worst, beginning vs end of session, etc.)
3. Prioritize the 2-3 most impactful improvements
4. Give concrete drills, not vague advice
5. Be encouraging but brutally honest about numbers
6. For shot comparison questions, analyze the specific metrics that differ between the best and worst shots
7. Keep responses mobile-friendly with bullet points`;

const TABS = [
  { id: "coach", label: "Overview", icon: "⬡" },
  { id: "session", label: "Session", icon: "◑" },
  { id: "clubs", label: "Clubs", icon: "◈" },
  { id: "warmup", label: "Warm Up", icon: "◎" },
  { id: "chat", label: "Ask", icon: "◇" },
  { id: "data", label: "Data", icon: "≡" },
];

export default function GolfCoach() {
  const [activeTab, setActiveTab] = useState("coach");
  const [allTime, setAllTime] = useState("");
  const [lastSession, setLastSession] = useState("");
  const [shots, setShots] = useState("");
  const [responses, setResponses] = useState({});
  const [loading, setLoading] = useState(false);
  const [loadingKey, setLoadingKey] = useState(null);
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState("");
  const [selectedClub, setSelectedClub] = useState(null);
  const [dataStatus, setDataStatus] = useState("idle");
  const chatEndRef = useRef(null);
  const isDark = window.matchMedia?.("(prefers-color-scheme: dark)").matches;

  const C = {
    green: "#1B6B3A", greenMid: "#2E8B57",
    greenSoft: isDark ? "rgba(46,139,87,0.18)" : "rgba(46,139,87,0.10)",
    greenText: isDark ? "#4ade80" : "#1B6B3A",
    bg: isDark ? "#0C0C0E" : "#F2F2F7",
    card: isDark ? "#1C1C1E" : "#FFFFFF",
    card2: isDark ? "#2C2C2E" : "#F2F2F7",
    border: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)",
    text: isDark ? "#FFFFFF" : "#000000",
    textSec: isDark ? "rgba(255,255,255,0.55)" : "rgba(0,0,0,0.45)",
    textTer: isDark ? "rgba(255,255,255,0.25)" : "rgba(0,0,0,0.25)",
    red: isDark ? "#FF453A" : "#FF3B30",
    amber: isDark ? "#FFD60A" : "#FF9500",
    sep: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)",
  };

  useEffect(() => {
    if (BLOB_DATA_URL) loadFromBlob();
  }, []);

  const loadFromBlob = async () => {
    setDataStatus("loading");
    try {
      const res = await fetch(BLOB_DATA_URL);
      const json = await res.json();
      if (json.allTime) setAllTime(json.allTime);
      if (json.lastSession) setLastSession(json.lastSession);
      if (json.shots) setShots(json.shots);
      setDataStatus("loaded");
    } catch {
      setDataStatus("error");
    }
  };

  const parseClubs = () => {
    if (!allTime.trim()) return [];
    const lines = allTime.trim().split("\n").filter(l => l.trim());
    if (lines.length < 2) return [];
    const header = lines[0].split("\t").map(h => h.trim());
    return lines.slice(1).map(line => {
      const vals = line.split("\t");
      const obj = {};
      header.forEach((h, i) => { obj[h] = vals[i]?.trim() || ""; });
      return obj;
    }).filter(c => c.club_name);
  };

  const clubs = parseClubs();
  const hasData = clubs.length > 0;
  const totalShots = clubs.reduce((a, c) => a + (parseInt(c.total_shots) || 0), 0);
  const driver = clubs.find(c => c.club_name === "Driver");

  const ctx = () => `
ALL-TIME AVERAGES (${totalShots} total shots):
${allTime}

LAST SESSION BREAKDOWN:
${lastSession}

INDIVIDUAL SHOT DATA (every shot on record):
${shots}`.trim();

  const callClaude = async (prompt, key) => {
    setLoading(true);
    setLoadingKey(key);
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": "https://golf-coach-kv.vault.azure.net/secrets/ClaudeApiKeyGolfCoach/66bde5e0b0db4c83879ef0d6f9690f5a",
          "anthropic-version": "2023-06-01",
          "anthropic-dangerous-direct-browser-access": "true"
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 1024,
          system: SYSTEM_PROMPT,
          messages: [{ role: "user", content: prompt }]
        })
      });
      const data = await res.json();
      const reply = data.content?.[0]?.text || "No response.";
      setResponses(p => ({ ...p, [key]: reply }));
      return reply;
    } catch {
      const msg = "Connection error. Please try again.";
      setResponses(p => ({ ...p, [key]: msg }));
    } finally {
      setLoading(false);
      setLoadingKey(null);
    }
  };

  const getAnalysis = () => callClaude(
    `Give me a comprehensive analysis of my golf game using ALL available data including individual shots.\n\n${ctx()}\n\nCover: overall assessment, top 3 priority fixes with specific drills, what I'm doing well, distance gaps vs ideal benchmarks, consistency patterns across sessions.`,
    "analysis"
  );

  const getSession = () => callClaude(
    `Detailed breakdown of my last session. Use the individual shot data to find patterns within the session.\n\n${ctx()}\n\nAnalyze: how each club performed vs all-time average, did I improve or decline within the session, best and worst shots and what made them different, key metrics like spin axis, face to path, tempo.`,
    "session"
  );

  const getWarmup = () => callClaude(
    `Create a personalized 15-20 min pre-round warm up routine based on my specific weaknesses from the data.\n\n${ctx()}\n\nStructure: 1) Physical 5min 2) Short game 5min 3) Irons 5min 4) Driver 5min. Be specific to my tendencies.`,
    "warmup"
  );

  const getClubAdvice = (club) => {
    setSelectedClub(club.club_name);
    const clubShots = shots.split("\n").filter(l => l.includes(club.club_name));
    callClaude(
      `Deep dive analysis for my ${club.club_name} (${club.brand_model || ""}).\n\nALL-TIME STATS:\n${JSON.stringify(club)}\n\nINDIVIDUAL SHOTS WITH THIS CLUB:\n${clubShots.join("\n")}\n\nAnalyze: smash factor trend, spin rate vs ideal, attack angle, face to path, spin axis (draw/fade tendency), tempo, best vs worst shots and what differed. Give 3 specific drills.`,
      `club_${club.club_name}`
    );
  };

  const sendChat = async () => {
    if (!chatInput.trim() || loading) return;
    const msg = chatInput.trim();
    setChatInput("");
    const msgs = [...chatMessages, { role: "user", content: msg }];
    setChatMessages(msgs);
    setLoading(true);
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": ANTHROPIC_KEY,
          "anthropic-version": "2023-06-01",
          "anthropic-dangerous-direct-browser-access": "true"
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 1024,
          system: SYSTEM_PROMPT,
          messages: [
            ...msgs.slice(0, -1),
            { role: "user", content: `${msg}\n\nMy complete data:\n${ctx()}` }
          ]
        })
      });
      const data = await res.json();
      const reply = data.content?.[0]?.text || "No response.";
      setChatMessages([...msgs, { role: "assistant", content: reply }]);
      setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
    } catch {
      setChatMessages([...msgs, { role: "assistant", content: "Error. Try again." }]);
    }
    setLoading(false);
  };

  const smashColor = (v) => {
    const n = parseFloat(v);
    if (isNaN(n)) return C.textTer;
    if (n >= 1.42) return C.greenText;
    if (n >= 1.30) return C.amber;
    return C.red;
  };

  const pct = (v, ideal) => Math.min(100, Math.round((parseFloat(v) / parseFloat(ideal)) * 100)) || 0;

  const Card = ({ children, style = {} }) => (
    <div style={{ background: C.card, borderRadius: 16, overflow: "hidden", marginBottom: 12, ...style }}>
      {children}
    </div>
  );

  const PrimaryBtn = ({ onClick, disabled, label, isLoading }) => (
    <button onClick={onClick} disabled={disabled || isLoading}
      style={{ width: "100%", padding: 16, fontSize: 17, fontWeight: 600, cursor: (disabled || isLoading) ? "not-allowed" : "pointer", borderRadius: 14, border: "none", background: (disabled || isLoading) ? C.card2 : C.greenMid, color: (disabled || isLoading) ? C.textTer : "#fff", fontFamily: "inherit", opacity: isLoading ? 0.7 : 1 }}>
      {isLoading ? "Analyzing..." : label}
    </button>
  );

  const ResponseBubble = ({ text }) => (
    <div style={{ background: C.card, borderRadius: 16, padding: 16, fontSize: 15, lineHeight: 1.75, whiteSpace: "pre-wrap", color: C.text, marginTop: 12 }}>
      {text}
    </div>
  );

  const NoData = () => (
    <div style={{ textAlign: "center", padding: "48px 24px" }}>
      <div style={{ fontSize: 48, marginBottom: 16 }}>⛳</div>
      <div style={{ fontSize: 17, fontWeight: 600, color: C.text, marginBottom: 8 }}>No data loaded</div>
      <div style={{ fontSize: 15, color: C.textSec, marginBottom: 24 }}>Paste your SQL data in the Data tab</div>
      <button onClick={() => setActiveTab("data")} style={{ padding: "12px 24px", fontSize: 15, fontWeight: 600, borderRadius: 12, border: "none", background: C.greenMid, color: "#fff", cursor: "pointer", fontFamily: "inherit" }}>Load Data</button>
    </div>
  );

  const quickQs = [
    "What was my best drive vs worst drive in my last session — what made them different?",
    "Which session was my best overall and why?",
    "What does my spin axis tell you about my ball flight tendencies?",
    "Do I hit better at the start or end of a session?",
    "Which club has improved the most over time?",
    "What's causing my driver distance to vary so much?",
    "Compare my 7 iron to my 5 iron — which is more consistent?",
    "What should I focus on in my next practice session?",
  ];

  return (
    <div style={{ fontFamily: "-apple-system, 'SF Pro Display', 'Helvetica Neue', sans-serif", maxWidth: 430, margin: "0 auto", minHeight: "100vh", background: C.bg, color: C.text, paddingBottom: 90 }}>

      {/* Header */}
      <div style={{ padding: "16px 20px 12px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 8 }}>
          <div>
            <div style={{ fontSize: 28, fontWeight: 700, letterSpacing: "-0.8px" }}>Golf Coach</div>
            <div style={{ fontSize: 13, color: C.textSec, marginTop: 1 }}>Garmin R10 · LJ</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 32, fontWeight: 700, letterSpacing: "-1px" }}>{hasData ? totalShots.toLocaleString() : "—"}</div>
            <div style={{ fontSize: 12, color: C.textSec }}>total shots</div>
          </div>
        </div>

        {hasData && (
          <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 4 }}>
            {[
              { label: "Driver carry", value: driver?.avg_carry ? `${driver.avg_carry}y` : "—", sub: "avg" },
              { label: "Best smash", value: clubs.length ? Math.max(...clubs.map(c => parseFloat(c.avg_smash_factor) || 0)).toFixed(3) : "—", sub: "factor" },
              { label: "Clubs", value: clubs.length, sub: "tracked" },
              { label: "Shot data", value: shots.trim() ? `${shots.split("\n").filter(l => l.trim()).length - 1}` : "—", sub: "rows" },
            ].map((m, i) => (
              <div key={i} style={{ flexShrink: 0, background: C.card, borderRadius: 14, padding: "10px 14px", minWidth: 80, textAlign: "center" }}>
                <div style={{ fontSize: 11, color: C.textSec, marginBottom: 2, fontWeight: 500 }}>{m.label}</div>
                <div style={{ fontSize: 17, fontWeight: 700, letterSpacing: "-0.5px" }}>{m.value}</div>
                <div style={{ fontSize: 10, color: C.textTer, marginTop: 1 }}>{m.sub}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={{ padding: "4px 16px 0" }}>

        {/* OVERVIEW TAB */}
        {activeTab === "coach" && (
          <div>
            {!hasData ? <NoData /> : (
              <>
                <div style={{ fontSize: 13, fontWeight: 600, color: C.textSec, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10, paddingLeft: 4 }}>Carry vs ideal</div>
                <Card>
                  {clubs.map((c, i) => {
                    const p = pct(c.avg_carry, c.ideal_carry_distance);
                    const color = p >= 88 ? C.greenMid : p >= 72 ? C.amber : C.red;
                    return (
                      <div key={i} style={{ padding: "14px 16px", borderBottom: i < clubs.length - 1 ? `0.5px solid ${C.sep}` : "none" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 7 }}>
                          <div>
                            <span style={{ fontSize: 15, fontWeight: 500 }}>{c.club_name}</span>
                            <span style={{ fontSize: 13, color: C.textSec, marginLeft: 8 }}>{c.avg_carry}y</span>
                          </div>
                          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                            <span style={{ fontSize: 12, color: C.textSec }}>/{c.ideal_carry_distance}y</span>
                            <span style={{ fontSize: 13, fontWeight: 700, color: smashColor(c.avg_smash_factor) }}>{c.avg_smash_factor}</span>
                          </div>
                        </div>
                        <div style={{ height: 4, background: C.card2, borderRadius: 2, overflow: "hidden" }}>
                          <div style={{ height: "100%", width: `${p}%`, background: color, borderRadius: 2 }} />
                        </div>
                      </div>
                    );
                  })}
                </Card>
                <PrimaryBtn onClick={getAnalysis} isLoading={loadingKey === "analysis"} disabled={loading && loadingKey !== "analysis"} label="Full game analysis ↗" />
                {responses.analysis && <ResponseBubble text={responses.analysis} />}
              </>
            )}
          </div>
        )}

        {/* SESSION TAB */}
        {activeTab === "session" && (
          <div>
            {!hasData ? <NoData /> : (
              <>
                {lastSession && (() => {
                  const lines = lastSession.trim().split("\n");
                  const header = lines[0]?.split("\t").map(h => h.trim()) || [];
                  const rows = lines.slice(1).filter(l => l.trim()).map(l => {
                    const vals = l.split("\t");
                    const obj = {};
                    header.forEach((h, i) => { obj[h] = vals[i]?.trim() || ""; });
                    return obj;
                  }).filter(r => r.club_name);
                  const date = rows[0]?.session_date;
                  const temp = rows[0]?.temperature_f ? `${parseFloat(rows[0].temperature_f).toFixed(0)}°F` : "";
                  return (
                    <>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10, paddingLeft: 4 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: C.textSec, textTransform: "uppercase", letterSpacing: "0.06em" }}>Last session</div>
                        <div style={{ fontSize: 13, color: C.textSec }}>{date} {temp}</div>
                      </div>
                      <Card>
                        {rows.map((row, i) => {
                          const diff = parseFloat(row.carry_vs_alltime);
                          const diffColor = diff > 0 ? C.greenText : diff < 0 ? C.red : C.textSec;
                          const diffStr = isNaN(diff) ? "" : diff > 0 ? `+${diff}y` : `${diff}y`;
                          return (
                            <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "13px 16px", borderBottom: i < rows.length - 1 ? `0.5px solid ${C.sep}` : "none" }}>
                              <div>
                                <div style={{ fontSize: 15, fontWeight: 500 }}>{row.club_name}</div>
                                <div style={{ fontSize: 12, color: C.textSec, marginTop: 1 }}>{row.total_shots} shots · {row.avg_smash_factor} smash</div>
                              </div>
                              <div style={{ textAlign: "right" }}>
                                <div style={{ fontSize: 17, fontWeight: 600, letterSpacing: "-0.3px" }}>{row.avg_carry}y</div>
                                <div style={{ fontSize: 12, fontWeight: 500, color: diffColor }}>{diffStr} vs avg</div>
                              </div>
                            </div>
                          );
                        })}
                      </Card>
                    </>
                  );
                })()}
                <PrimaryBtn onClick={getSession} isLoading={loadingKey === "session"} disabled={loading && loadingKey !== "session"} label="Full session breakdown ↗" />
                {responses.session && <ResponseBubble text={responses.session} />}
              </>
            )}
          </div>
        )}

        {/* CLUBS TAB */}
        {activeTab === "clubs" && (
          <div>
            {!hasData ? <NoData /> : (
              <>
                <div style={{ fontSize: 13, fontWeight: 600, color: C.textSec, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10, paddingLeft: 4 }}>Your bag</div>
                <Card>
                  {clubs.map((club, i) => (
                    <button key={i} onClick={() => getClubAdvice(club)}
                      style={{ width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 16px", borderBottom: i < clubs.length - 1 ? `0.5px solid ${C.sep}` : "none", background: selectedClub === club.club_name ? C.greenSoft : "transparent", border: "none", cursor: "pointer", textAlign: "left", fontFamily: "inherit" }}>
                      <div>
                        <div style={{ fontSize: 15, fontWeight: 500, color: C.text }}>{club.club_name}</div>
                        <div style={{ fontSize: 12, color: C.textSec, marginTop: 2 }}>{club.brand_model} · {club.total_shots} shots</div>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                        <div style={{ textAlign: "right" }}>
                          <div style={{ fontSize: 16, fontWeight: 700, color: smashColor(club.avg_smash_factor) }}>{club.avg_smash_factor}</div>
                          <div style={{ fontSize: 11, color: C.textTer }}>smash</div>
                        </div>
                        <span style={{ fontSize: 18, color: C.textTer }}>›</span>
                      </div>
                    </button>
                  ))}
                </Card>
                {selectedClub && loadingKey === `club_${selectedClub}` && (
                  <div style={{ textAlign: "center", padding: 20, color: C.textSec, fontSize: 14 }}>Analyzing {selectedClub}...</div>
                )}
                {selectedClub && responses[`club_${selectedClub}`] && <ResponseBubble text={responses[`club_${selectedClub}`]} />}
              </>
            )}
          </div>
        )}

        {/* WARMUP TAB */}
        {activeTab === "warmup" && (
          <div>
            {!hasData ? <NoData /> : (
              <>
                <Card style={{ marginBottom: 16 }}>
                  <div style={{ padding: 16 }}>
                    <div style={{ fontSize: 17, fontWeight: 600, marginBottom: 6 }}>Pre-round routine</div>
                    <div style={{ fontSize: 15, color: C.textSec, lineHeight: 1.6 }}>A personalized 15–20 min warm up built around your specific swing tendencies.</div>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1, background: C.sep }}>
                    {[["Physical", "5 min"], ["Short game", "5 min"], ["Irons", "5 min"], ["Driver", "5 min"]].map(([l, t], i) => (
                      <div key={i} style={{ background: C.card, padding: "12px 14px", textAlign: "center" }}>
                        <div style={{ fontSize: 13, fontWeight: 500 }}>{l}</div>
                        <div style={{ fontSize: 12, color: C.textSec }}>{t}</div>
                      </div>
                    ))}
                  </div>
                </Card>
                <PrimaryBtn onClick={getWarmup} isLoading={loadingKey === "warmup"} disabled={loading && loadingKey !== "warmup"} label="Generate my routine ↗" />
                {responses.warmup && <ResponseBubble text={responses.warmup} />}
              </>
            )}
          </div>
        )}

        {/* CHAT TAB */}
        {activeTab === "chat" && (
          <div>
            {!hasData ? <NoData /> : (
              <>
                {chatMessages.length === 0 && (
                  <>
                    <div style={{ fontSize: 13, fontWeight: 600, color: C.textSec, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10, paddingLeft: 4 }}>Ask anything</div>
                    <Card style={{ marginBottom: 16 }}>
                      {quickQs.map((q, i) => (
                        <button key={i} onClick={() => setChatInput(q)}
                          style={{ width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center", padding: "13px 16px", borderBottom: i < quickQs.length - 1 ? `0.5px solid ${C.sep}` : "none", background: "transparent", border: "none", cursor: "pointer", textAlign: "left", fontFamily: "inherit" }}>
                          <span style={{ fontSize: 14, color: C.text, lineHeight: 1.4 }}>{q}</span>
                          <span style={{ fontSize: 18, color: C.textTer, marginLeft: 8, flexShrink: 0 }}>›</span>
                        </button>
                      ))}
                    </Card>
                  </>
                )}
                <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 12 }}>
                  {chatMessages.map((msg, i) => (
                    <div key={i} style={{ display: "flex", justifyContent: msg.role === "user" ? "flex-end" : "flex-start" }}>
                      <div style={{ padding: "12px 16px", borderRadius: msg.role === "user" ? "20px 20px 6px 20px" : "20px 20px 20px 6px", background: msg.role === "user" ? C.greenMid : C.card, color: msg.role === "user" ? "#fff" : C.text, fontSize: 15, lineHeight: 1.65, maxWidth: "88%", whiteSpace: "pre-wrap" }}>
                        {msg.content}
                      </div>
                    </div>
                  ))}
                  {loading && chatMessages.length > 0 && (
                    <div style={{ display: "flex" }}>
                      <div style={{ padding: "12px 16px", borderRadius: "20px 20px 20px 6px", background: C.card, color: C.textSec, fontSize: 15 }}>...</div>
                    </div>
                  )}
                  <div ref={chatEndRef} />
                </div>
                <div style={{ display: "flex", gap: 10, alignItems: "flex-end" }}>
                  <input value={chatInput} onChange={e => setChatInput(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && !e.shiftKey && sendChat()}
                    placeholder="Ask your coach..."
                    style={{ flex: 1, padding: "14px 16px", fontSize: 15, borderRadius: 24, border: `0.5px solid ${C.border}`, background: C.card, color: C.text, fontFamily: "inherit", outline: "none" }} />
                  <button onClick={sendChat} disabled={loading || !chatInput.trim()}
                    style={{ width: 44, height: 44, borderRadius: 22, border: "none", background: chatInput.trim() ? C.greenMid : C.card2, color: chatInput.trim() ? "#fff" : C.textTer, fontSize: 18, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>↑</button>
                </div>
              </>
            )}
          </div>
        )}

        {/* DATA TAB */}
        {activeTab === "data" && (
          <div>
            {BLOB_DATA_URL && (
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: C.card, borderRadius: 12, padding: "12px 16px", marginBottom: 12 }}>
                <div style={{ fontSize: 14, color: C.text }}>Auto-sync from Azure</div>
                <button onClick={loadFromBlob} style={{ fontSize: 13, padding: "6px 14px", borderRadius: 8, border: `0.5px solid ${C.border}`, background: "none", color: C.greenText, cursor: "pointer", fontFamily: "inherit" }}>
                  {dataStatus === "loading" ? "Loading..." : "Refresh ↺"}
                </button>
              </div>
            )}

            <Card>
              <div style={{ padding: "14px 16px 8px" }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: C.greenText, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>How to update your data</div>
                <div style={{ fontSize: 13, color: C.textSec, lineHeight: 1.7 }}>Run these queries in Azure Portal → Query Editor and paste results below:</div>
              </div>
              {[
                { label: "All-time summary", q: "SELECT * FROM golf.vw_AllTimeSummary ORDER BY ideal_carry_distance DESC" },
                { label: "Last session", q: "SELECT * FROM golf.vw_LastSessionSummary ORDER BY avg_carry DESC" },
                { label: "Shot-level data", q: "SELECT s.shot_id, s.session_id, se.session_date, c.club_name, c.brand_model, s.recorded_at, s.carry_distance_yds, s.ball_speed_mph, s.club_speed_mph, s.smash_factor, s.launch_angle_deg, s.attack_angle_deg, s.club_path_deg, s.club_face_deg, s.face_to_path_deg, s.spin_rate_rpm, s.spin_axis_deg, s.carry_deviation_distance_yds, s.swing_tempo FROM golf.Shots s JOIN golf.Clubs c ON s.club_id = c.club_id JOIN golf.Sessions se ON s.session_id = se.session_id ORDER BY s.session_id DESC, s.recorded_at ASC" },
              ].map((item, idx) => (
                <div key={idx} style={{ padding: "10px 16px", borderTop: `0.5px solid ${C.sep}` }}>
                  <div style={{ fontSize: 11, color: C.textTer, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>{item.label}</div>
                  <code style={{ fontSize: 10, color: C.greenText, lineHeight: 1.5, display: "block", wordBreak: "break-all" }}>{item.q}</code>
                </div>
              ))}
            </Card>

            {[
              { label: "All-time summary", val: allTime, set: setAllTime, rows: 3 },
              { label: "Last session", val: lastSession, set: setLastSession, rows: 2 },
              { label: "Shot-level data", val: shots, set: setShots, rows: 2, hint: "Paste full shot data here for best vs worst analysis" },
            ].map((field, i) => (
              <div key={i} style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: C.textSec, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8, paddingLeft: 4 }}>
                  {field.label} {field.val.trim() ? "✓" : ""}
                </div>
                {field.hint && <div style={{ fontSize: 12, color: C.textSec, marginBottom: 6, paddingLeft: 4 }}>{field.hint}</div>}
                <textarea value={field.val} onChange={e => field.set(e.target.value)}
                  placeholder={`Paste ${field.label.toLowerCase()} results here...`}
                  style={{ width: "100%", height: field.rows === 3 ? 120 : 80, padding: "12px 14px", fontSize: 11, fontFamily: "SF Mono, Menlo, monospace", resize: "vertical", boxSizing: "border-box", borderRadius: 14, border: `0.5px solid ${C.border}`, background: C.card, color: C.text, outline: "none" }} />
              </div>
            ))}

            {hasData && (
              <button onClick={() => setActiveTab("coach")}
                style={{ width: "100%", padding: 14, fontSize: 15, fontWeight: 600, cursor: "pointer", borderRadius: 12, border: "none", background: C.greenMid, color: "#fff", fontFamily: "inherit" }}>
                Start coaching ↗
              </button>
            )}
          </div>
        )}
      </div>

      {/* Tab Bar */}
      <div style={{ position: "fixed", bottom: 0, left: "50%", transform: "translateX(-50%)", width: "100%", maxWidth: 430, background: isDark ? "rgba(12,12,14,0.9)" : "rgba(242,242,247,0.9)", backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)", borderTop: `0.5px solid ${C.sep}`, display: "flex", padding: "10px 0 18px", zIndex: 100 }}>
        {TABS.map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4, cursor: "pointer", padding: "4px 0", border: "none", background: "none", color: activeTab === tab.id ? C.greenMid : C.textTer, fontFamily: "inherit" }}>
            <span style={{ fontSize: 17, lineHeight: 1 }}>{tab.icon}</span>
            <span style={{ fontSize: 10, fontWeight: activeTab === tab.id ? 600 : 400, letterSpacing: "0.02em" }}>{tab.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
