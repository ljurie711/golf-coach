import { useState, useRef, useEffect } from "react";

const SYSTEM_PROMPT = `You are an expert PGA-level golf coach analyzing Garmin R10 launch monitor data for a golfer named LJ. You have access to their complete swing history.

Key benchmarks:
- Driver smash factor: 1.45+ ideal, attack angle +2 to +5 degrees, spin 2000-2800rpm
- Iron smash factor: 1.38+ ideal, attack angle -2 to -5 degrees
- Face to path: within ±2 degrees for straight shots
- Carry deviation: within ±10 yards is accurate
- Swing tempo: 3:1 ratio backswing to downswing is ideal
- Spin axis: close to 0 = straight, positive = fade, negative = draw

When analyzing:
1. Reference actual numbers from the data
2. Prioritize the 2-3 most impactful improvements
3. Give concrete drills not vague advice
4. Be encouraging but honest
5. Use ALL available metrics
6. Format with clear sections using bullet points for mobile readability`;

const TABS = [
  { id: "coach", label: "Overview", sf: "⬡" },
  { id: "session", label: "Session", sf: "◑" },
  { id: "clubs", label: "Clubs", sf: "◈" },
  { id: "warmup", label: "Warm Up", sf: "◎" },
  { id: "chat", label: "Ask", sf: "◇" },
  { id: "data", label: "Data", sf: "≡" },
];

export default function GolfCoach() {
  const [activeTab, setActiveTab] = useState("data");
  const [allTimeData, setAllTimeData] = useState("");
  const [lastSessionData, setLastSessionData] = useState("");
  const [responses, setResponses] = useState({});
  const [loading, setLoading] = useState(false);
  const [loadingKey, setLoadingKey] = useState(null);
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState("");
  const [selectedClub, setSelectedClub] = useState(null);
  const chatEndRef = useRef(null);
  const isDark = window.matchMedia?.("(prefers-color-scheme: dark)").matches;

  const C = {
    green: "#1B6B3A",
    greenMid: "#2E8B57",
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
    blue: isDark ? "#0A84FF" : "#007AFF",
    sep: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)",
  };

  const parseClubs = () => {
    if (!allTimeData.trim()) return [];
    const lines = allTimeData.trim().split("\n").filter(l => l.trim());
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
          max_tokens: 1000,
          system: SYSTEM_PROMPT,
          messages: [{ role: "user", content: prompt }]
        })
      });
      const data = await res.json();
      const reply = data.content?.[0]?.text || "No response.";
      setResponses(p => ({ ...p, [key]: reply }));
      return reply;
    } catch {
      setResponses(p => ({ ...p, [key]: "Connection error. Please try again." }));
    } finally {
      setLoading(false);
      setLoadingKey(null);
    }
  };

  const ctx = () => `ALL-TIME:\n${allTimeData}\n\nLAST SESSION:\n${lastSessionData}`;
  const getAnalysis = () => callClaude(`Full game analysis using ALL metrics.\n\n${ctx()}\n\nTop 3 fixes with drills, strengths, distance gaps.`, "analysis");
  const getSession = () => callClaude(`Detailed last session breakdown.\n\n${ctx()}\n\nCompare to all-time, patterns, spin axis, tempo.`, "session");
  const getWarmup = () => callClaude(`Personalized 15-20 min pre-round routine.\n\n${ctx()}\n\n1) Physical 5min 2) Short game 5min 3) Irons 5min 4) Driver 5min`, "warmup");
  const getClubAdvice = (club) => {
    setSelectedClub(club.club_name);
    callClaude(`Detailed coaching for ${club.club_name} (${club.brand_model || ""}).\n\nSTATS: ${JSON.stringify(club)}\n\nContext:\n${allTimeData}\n\n3 specific drills.`, `club_${club.club_name}`);
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
          "x-api-key": "YOUR_ANTHROPIC_API_KEY_HERE",
          "anthropic-version": "2023-06-01",
          "anthropic-dangerous-direct-browser-access": "true"
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 1000,
          system: SYSTEM_PROMPT,
          messages: [...msgs.slice(0, -1), { role: "user", content: `${msg}\n\n${ctx()}` }]
        })
      });
      const data = await res.json();
      setChatMessages([...msgs, { role: "assistant", content: data.content?.[0]?.text || "No response." }]);
      setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
    } catch {
      setChatMessages([...msgs, { role: "assistant", content: "Error. Try again." }]);
    }
    setLoading(false);
  };

  const smashStatus = (v) => {
    const n = parseFloat(v);
    if (isNaN(n)) return C.textTer;
    if (n >= 1.42) return C.greenText;
    if (n >= 1.30) return C.amber;
    return C.red;
  };

  const pct = (v, ideal) => Math.min(100, Math.round((parseFloat(v) / parseFloat(ideal)) * 100)) || 0;

  // Reusable components
  const Card = ({ children, style = {} }) => (
    <div style={{ background: C.card, borderRadius: 16, overflow: "hidden", marginBottom: 12, ...style }}>
      {children}
    </div>
  );

  const Row = ({ label, value, valueColor, last }) => (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 16px", borderBottom: last ? "none" : `0.5px solid ${C.sep}` }}>
      <span style={{ fontSize: 15, color: C.text }}>{label}</span>
      <span style={{ fontSize: 15, fontWeight: 500, color: valueColor || C.text }}>{value}</span>
    </div>
  );

  const PrimaryBtn = ({ onClick, disabled, label, isLoading }) => (
    <button onClick={onClick} disabled={disabled || isLoading}
      style={{ width: "100%", padding: "16px", fontSize: 17, fontWeight: 600, cursor: (disabled || isLoading) ? "not-allowed" : "pointer", borderRadius: 14, border: "none", background: (disabled || isLoading) ? C.card2 : C.greenMid, color: (disabled || isLoading) ? C.textTer : "#fff", fontFamily: "inherit", letterSpacing: "-0.2px", transition: "opacity 0.15s", opacity: isLoading ? 0.7 : 1 }}>
      {isLoading ? "Analyzing..." : label}
    </button>
  );

  const ResponseBubble = ({ text }) => (
    <div style={{ background: C.card, borderRadius: 16, padding: "16px", fontSize: 15, lineHeight: 1.75, whiteSpace: "pre-wrap", color: C.text, marginTop: 12 }}>
      {text}
    </div>
  );

  const NoData = () => (
    <div style={{ textAlign: "center", padding: "48px 24px" }}>
      <div style={{ fontSize: 48, marginBottom: 16 }}>⛳</div>
      <div style={{ fontSize: 17, fontWeight: 600, color: C.text, marginBottom: 8 }}>No data loaded</div>
      <div style={{ fontSize: 15, color: C.textSec, marginBottom: 24 }}>Add your swing data to get started</div>
      <button onClick={() => setActiveTab("data")} style={{ padding: "12px 24px", fontSize: 15, fontWeight: 600, borderRadius: 12, border: "none", background: C.greenMid, color: "#fff", cursor: "pointer", fontFamily: "inherit" }}>Load Data</button>
    </div>
  );

  const quickQs = [
    "What's my biggest swing flaw?",
    "How's my driver smash factor?",
    "What does my spin axis mean?",
    "Which club needs most work?",
    "How's my swing tempo?",
    "Am I hitting up on driver?",
    "Compare my irons to hybrids",
    "What improved last session?"
  ];

  return (
    <div style={{ fontFamily: "-apple-system, 'SF Pro Display', 'Helvetica Neue', sans-serif", maxWidth: 430, margin: "0 auto", minHeight: "100vh", background: C.bg, color: C.text, paddingBottom: 90 }}>

      {/* STATUS BAR AREA */}
      <div style={{ padding: "12px 20px 0" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 8 }}>
          <div>
            <div style={{ fontSize: 28, fontWeight: 700, letterSpacing: "-0.8px", color: C.text }}>Golf Coach</div>
            <div style={{ fontSize: 13, color: C.textSec, fontWeight: 400, marginTop: 1 }}>Garmin R10 · LJ</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 32, fontWeight: 700, letterSpacing: "-1px", color: C.text }}>{hasData ? totalShots.toLocaleString() : "—"}</div>
            <div style={{ fontSize: 12, color: C.textSec }}>total shots</div>
          </div>
        </div>

        {/* Hero metric pills */}
        {hasData && (
          <div style={{ display: "flex", gap: 8, marginBottom: 4, overflowX: "auto", paddingBottom: 4 }}>
            {[
              { label: "Driver", value: driver?.avg_carry ? `${driver.avg_carry}y` : "—", sub: "avg carry" },
              { label: "Best smash", value: clubs.length ? Math.max(...clubs.map(c => parseFloat(c.avg_smash_factor) || 0)).toFixed(3) : "—", sub: "factor" },
              { label: "Clubs", value: clubs.length, sub: "tracked" },
            ].map((m, i) => (
              <div key={i} style={{ flexShrink: 0, background: C.card, borderRadius: 14, padding: "10px 14px", minWidth: 90, textAlign: "center" }}>
                <div style={{ fontSize: 11, color: C.textSec, marginBottom: 3, fontWeight: 500 }}>{m.label}</div>
                <div style={{ fontSize: 19, fontWeight: 700, letterSpacing: "-0.5px", color: C.text }}>{m.value}</div>
                <div style={{ fontSize: 10, color: C.textTer, marginTop: 1 }}>{m.sub}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={{ padding: "12px 16px 0" }}>

        {/* DATA TAB */}
        {activeTab === "data" && (
          <div>
            <Card>
              <div style={{ padding: "16px 16px 4px" }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: C.greenText, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>How to load your data</div>
                <div style={{ fontSize: 14, color: C.textSec, lineHeight: 1.7, marginBottom: 12 }}>
                  Open Azure Portal → Query Editor and run:
                </div>
                <div style={{ background: C.card2, borderRadius: 10, padding: "10px 12px", marginBottom: 10 }}>
                  <div style={{ fontSize: 11, color: C.textTer, marginBottom: 4, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em" }}>All-time</div>
                  <code style={{ fontSize: 11, color: C.greenText, lineHeight: 1.5, display: "block" }}>SELECT * FROM golf.vw_AllTimeSummary ORDER BY ideal_carry_distance DESC</code>
                </div>
                <div style={{ background: C.card2, borderRadius: 10, padding: "10px 12px", marginBottom: 16 }}>
                  <div style={{ fontSize: 11, color: C.textTer, marginBottom: 4, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em" }}>Last session</div>
                  <code style={{ fontSize: 11, color: C.greenText, lineHeight: 1.5, display: "block" }}>SELECT * FROM golf.vw_LastSessionSummary ORDER BY avg_carry DESC</code>
                </div>
              </div>
            </Card>

            <div style={{ fontSize: 13, fontWeight: 600, color: C.textSec, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8, paddingLeft: 4 }}>All-time summary</div>
            <textarea value={allTimeData} onChange={e => setAllTimeData(e.target.value)}
              placeholder="Paste results here..."
              style={{ width: "100%", height: 130, padding: "12px 14px", fontSize: 12, fontFamily: "SF Mono, Menlo, monospace", resize: "vertical", boxSizing: "border-box", borderRadius: 14, border: `0.5px solid ${C.border}`, background: C.card, color: C.text, marginBottom: 16, outline: "none" }} />

            <div style={{ fontSize: 13, fontWeight: 600, color: C.textSec, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8, paddingLeft: 4 }}>Last session</div>
            <textarea value={lastSessionData} onChange={e => setLastSessionData(e.target.value)}
              placeholder="Paste results here..."
              style={{ width: "100%", height: 110, padding: "12px 14px", fontSize: 12, fontFamily: "SF Mono, Menlo, monospace", resize: "vertical", boxSizing: "border-box", borderRadius: 14, border: `0.5px solid ${C.border}`, background: C.card, color: C.text, marginBottom: 16, outline: "none" }} />

            <div style={{ display: "flex", gap: 10, marginBottom: 20 }}>
              {[
                { ok: hasData, label: hasData ? `${clubs.length} clubs ready` : "No all-time data" },
                { ok: lastSessionData.trim().length > 0, label: lastSessionData.trim().length > 0 ? "Session ready" : "No session data" }
              ].map((s, i) => (
                <div key={i} style={{ flex: 1, padding: "10px 12px", borderRadius: 12, background: s.ok ? C.greenSoft : C.card, border: `0.5px solid ${s.ok ? C.greenMid : C.border}`, fontSize: 13, fontWeight: 500, color: s.ok ? C.greenText : C.textSec, textAlign: "center" }}>
                  {s.ok ? "✓ " : ""}{s.label}
                </div>
              ))}
            </div>

            {hasData && (
              <PrimaryBtn onClick={() => setActiveTab("coach")} label="Start coaching ↗" />
            )}
          </div>
        )}

        {/* COACH TAB */}
        {activeTab === "coach" && (
          <div>
            {!hasData ? <NoData /> : (
              <>
                {/* Club performance rings */}
                <div style={{ fontSize: 13, fontWeight: 600, color: C.textSec, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10, paddingLeft: 4 }}>Carry vs ideal</div>
                <Card>
                  {clubs.map((c, i) => {
                    const p = pct(c.avg_carry, c.ideal_carry_distance);
                    const color = p >= 88 ? C.greenMid : p >= 72 ? C.amber : C.red;
                    return (
                      <div key={i} style={{ padding: "14px 16px", borderBottom: i < clubs.length - 1 ? `0.5px solid ${C.sep}` : "none" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                          <div>
                            <span style={{ fontSize: 15, fontWeight: 500 }}>{c.club_name}</span>
                            <span style={{ fontSize: 13, color: C.textSec, marginLeft: 8 }}>{c.avg_carry}y</span>
                          </div>
                          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                            <span style={{ fontSize: 13, color: C.textSec }}>/{c.ideal_carry_distance}y ideal</span>
                            <span style={{ fontSize: 14, fontWeight: 700, color: smashStatus(c.avg_smash_factor) }}>{c.avg_smash_factor}</span>
                          </div>
                        </div>
                        <div style={{ height: 4, background: C.card2, borderRadius: 2, overflow: "hidden" }}>
                          <div style={{ height: "100%", width: `${p}%`, background: color, borderRadius: 2 }} />
                        </div>
                      </div>
                    );
                  })}
                </Card>

                <div style={{ marginTop: 4 }}>
                  <PrimaryBtn onClick={getAnalysis} isLoading={loadingKey === "analysis"} disabled={loading && loadingKey !== "analysis"} label="Full game analysis" />
                </div>
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
                {lastSessionData && (() => {
                  const lines = lastSessionData.trim().split("\n");
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
                                <div style={{ fontSize: 12, color: C.textSec, marginTop: 1 }}>{row.total_shots} shots · smash {row.avg_smash_factor}</div>
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
                <PrimaryBtn onClick={getSession} isLoading={loadingKey === "session"} disabled={loading && loadingKey !== "session"} label="Full session breakdown" />
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
                          <div style={{ fontSize: 16, fontWeight: 700, color: smashStatus(club.avg_smash_factor) }}>{club.avg_smash_factor}</div>
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
                    <div style={{ fontSize: 15, color: C.textSec, lineHeight: 1.6 }}>Get a personalized 15–20 minute warm up routine built around your specific tendencies and weaknesses.</div>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1, background: C.sep }}>
                    {[["Physical", "5 min"], ["Short game", "5 min"], ["Irons", "5 min"], ["Driver", "5 min"]].map(([label, time], i) => (
                      <div key={i} style={{ background: C.card, padding: "12px 14px", textAlign: "center" }}>
                        <div style={{ fontSize: 13, fontWeight: 500, color: C.text }}>{label}</div>
                        <div style={{ fontSize: 12, color: C.textSec }}>{time}</div>
                      </div>
                    ))}
                  </div>
                </Card>
                <PrimaryBtn onClick={getWarmup} isLoading={loadingKey === "warmup"} disabled={loading && loadingKey !== "warmup"} label="Generate my routine" />
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
                    <div style={{ fontSize: 13, fontWeight: 600, color: C.textSec, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10, paddingLeft: 4 }}>Suggested questions</div>
                    <Card style={{ marginBottom: 16 }}>
                      {quickQs.map((q, i) => (
                        <button key={i} onClick={() => setChatInput(q)}
                          style={{ width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center", padding: "13px 16px", borderBottom: i < quickQs.length - 1 ? `0.5px solid ${C.sep}` : "none", background: "transparent", border: "none", cursor: "pointer", textAlign: "left", fontFamily: "inherit" }}>
                          <span style={{ fontSize: 15, color: C.text }}>{q}</span>
                          <span style={{ fontSize: 18, color: C.textTer }}>›</span>
                        </button>
                      ))}
                    </Card>
                  </>
                )}
                <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 12 }}>
                  {chatMessages.map((msg, i) => (
                    <div key={i} style={{ display: "flex", justifyContent: msg.role === "user" ? "flex-end" : "flex-start" }}>
                      <div style={{ padding: "12px 16px", borderRadius: msg.role === "user" ? "20px 20px 6px 20px" : "20px 20px 20px 6px", background: msg.role === "user" ? C.greenMid : C.card, color: msg.role === "user" ? "#fff" : C.text, fontSize: 15, lineHeight: 1.65, maxWidth: "86%", whiteSpace: "pre-wrap" }}>
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
      </div>

      {/* Tab Bar */}
      <div style={{ position: "fixed", bottom: 0, left: "50%", transform: "translateX(-50%)", width: "100%", maxWidth: 430, background: isDark ? "rgba(12,12,14,0.85)" : "rgba(242,242,247,0.85)", backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)", borderTop: `0.5px solid ${C.sep}`, display: "flex", padding: "10px 0 18px", zIndex: 100 }}>
        {TABS.map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4, cursor: "pointer", padding: "4px 0", border: "none", background: "none", color: activeTab === tab.id ? C.greenMid : C.textTer, fontFamily: "inherit", transition: "color 0.15s" }}>
            <span style={{ fontSize: 18, lineHeight: 1 }}>{tab.sf}</span>
            <span style={{ fontSize: 10, fontWeight: activeTab === tab.id ? 600 : 400, letterSpacing: "0.02em" }}>{tab.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
