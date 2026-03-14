import { useState, useEffect } from "react";

const PERIODS = [
  { id: 0, label: "P1", time: "0–10" },
  { id: 1, label: "P2", time: "10–20" },
  { id: 2, label: "P3", time: "20–30" },
  { id: 3, label: "P4", time: "30–40" },
  { id: 4, label: "P5", time: "40–50" },
  { id: 5, label: "P6", time: "50–60" },
];

const CL = {
  A: { bg: "#fef3c7", border: "#f59e0b", text: "#92400e" },
  B: { bg: "#dbeafe", border: "#3b82f6", text: "#1e3a8a" },
  C: { bg: "#dcfce7", border: "#86efac", text: "#14532d" },
};

function uid() { return Math.random().toString(36).slice(2, 8); }

function generateRotation(players, availSet, startingIds) {
  const avail = players.filter(p => availSet.has(p.id));
  if (avail.length < 9) return null;

  const gks = avail.filter(p => p.isGK);
  const gkH1 = gks.find(p => p.class === "A") || gks[0] || null;
  const gkH2 = gks.find(p => p.id !== gkH1?.id) || null;

  const mins = {};
  avail.forEach(p => (mins[p.id] = 0));

  let gkH1OFCount = 0;
  let gkH2OFCount = 0;
  const rotation = [];

  for (let pi = 0; pi < 6; pi++) {
    const isH2 = pi >= 3;
    const gkId = isH2 ? (gkH2?.id ?? gkH1?.id) : gkH1?.id;

    if (pi === 0) {
      const onField = [...startingIds];
      const bench = avail.map(x => x.id).filter(id => !onField.includes(id));
      rotation.push({ gkId, onField, bench });
      onField.forEach(id => { mins[id] += 10; });
      if (gkH2 && onField.includes(gkH2.id)) gkH2OFCount++;
      continue;
    }

    const mustInclude = [];
    if (!isH2 && gkH2) {
      const rem = 3 - pi;
      const need = 2 - gkH2OFCount;
      if (need > 0 && need >= rem) mustInclude.push(gkH2.id);
    }
    if (isH2 && gkH1 && gkH2) {
      const rem = 6 - pi;
      const need = 2 - gkH1OFCount;
      if (need > 0 && need >= rem) mustInclude.push(gkH1.id);
    }

    const eligible = avail.filter(p => p.id !== gkId);
    const sorted = [...eligible].sort((a, b) => mins[a.id] - mins[b.id]);
    const picked = new Set(mustInclude.filter(id => eligible.find(p => p.id === id)));

    const aCount = [...picked].filter(id => avail.find(p => p.id === id)?.class === "A").length;
    if (aCount < 2) {
      sorted.filter(p => p.class === "A" && !picked.has(p.id))
        .slice(0, 2 - aCount).forEach(p => picked.add(p.id));
    }

    for (const p of sorted) {
      if (picked.size >= 8) break;
      picked.add(p.id);
    }

    const onField = [gkId, ...[...picked]].filter(Boolean);
    const bench = avail.map(x => x.id).filter(id => !onField.includes(id));
    rotation.push({ gkId, onField, bench });
    onField.forEach(id => { mins[id] += 10; });
    if (!isH2 && gkH2 && picked.has(gkH2.id)) gkH2OFCount++;
    if (isH2 && gkH1 && gkH2 && picked.has(gkH1.id)) gkH1OFCount++;
  }
  return rotation;
}

export default function App() {
  const [players, setPlayers] = useState([]);
  const [screen, setScreen] = useState("roster");
  const [availSet, setAvailSet] = useState(new Set());
  const [gameStep, setGameStep] = useState("avail");
  const [starting, setStarting] = useState([]);
  const [rotation, setRotation] = useState(null);
  const [planPeriod, setPlanPeriod] = useState(0);
  const [planView, setPlanView] = useState("subs");
  const [newName, setNewName] = useState("");
  const [newClass, setNewClass] = useState("A");
  const [newIsGK, setNewIsGK] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    try {
      const stored = localStorage.getItem("cf-players-v2");
      if (stored) {
        const data = JSON.parse(stored);
        setPlayers(data);
        setAvailSet(new Set(data.map(p => p.id)));
      }
    } catch (e) { /* ignore */ }
    setLoaded(true);
  }, []);

  function savePlayers(list) {
    setPlayers(list);
    try { localStorage.setItem("cf-players-v2", JSON.stringify(list)); } catch (e) { /* ignore */ }
  }

  function addPlayer() {
    if (!newName.trim()) return;
    const p = { id: uid(), name: newName.trim(), class: newClass, isGK: newIsGK };
    const next = [...players, p];
    savePlayers(next);
    setAvailSet(prev => new Set([...prev, p.id]));
    setNewName(""); setNewIsGK(false);
  }

  function removePlayer(id) {
    savePlayers(players.filter(p => p.id !== id));
    setAvailSet(prev => { const s = new Set(prev); s.delete(id); return s; });
    setStarting(prev => prev.filter(x => x !== id));
  }

  function updatePlayer(id, changes) {
    savePlayers(players.map(p => p.id === id ? { ...p, ...changes } : p));
  }

  function toggleAvail(id) {
    setAvailSet(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });
  }

  function toggleStarting(id) {
    setStarting(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : prev.length < 9 ? [...prev, id] : prev
    );
  }

  const availPlayers = players.filter(p => availSet.has(p.id));
  const gkH1 = availPlayers.find(p => p.isGK && p.class === "A") || availPlayers.find(p => p.isGK);

  function handleGenerate() {
    setError("");
    if (!gkH1) { setError("No goalkeeper found in available players."); return; }
    if (!starting.includes(gkH1.id)) { setError(`Starting 9 must include your H1 goalkeeper: ${gkH1.name}`); return; }
    if (starting.length !== 9) { setError("Select exactly 9 starting players."); return; }
    const rot = generateRotation(players, availSet, starting);
    if (rot) { setRotation(rot); setPlanPeriod(0); setPlanView("subs"); setScreen("plan"); }
  }

  const minsSummary = rotation ? (() => {
    const m = {};
    players.forEach(p => (m[p.id] = 0));
    rotation.forEach(per => per.onField.forEach(id => { if (id in m) m[id] += 10; }));
    return m;
  })() : null;

  function getSubs(pi) {
    if (!rotation || pi < 1) return { out: [], in: [] };
    const prev = new Set(rotation[pi - 1].onField);
    const curr = new Set(rotation[pi].onField);
    return { out: rotation[pi - 1].onField.filter(id => !curr.has(id)), in: rotation[pi].onField.filter(id => !prev.has(id)) };
  }

  const gp = id => players.find(p => p.id === id);

  if (!loaded) return <div style={{ background: "#0a0f1e", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", color: "#4ade80", fontFamily: "monospace" }}>Loading...</div>;

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@500;600;700;800;900&family=Outfit:wght@300;400;500;600;700&display=swap');
        *{box-sizing:border-box;margin:0;padding:0;}
        body{background:#0a0f1e;}
        input,button,select{font-family:'Outfit',system-ui,sans-serif;}
        button{transition:all 0.15s;cursor:pointer;}
        button:hover{filter:brightness(1.1);}
        button:active{transform:scale(0.97);}
        input:focus{outline:none;border-color:#22c55e !important;}
        ::-webkit-scrollbar{width:3px;height:3px;}
        ::-webkit-scrollbar-track{background:#0a0f1e;}
        ::-webkit-scrollbar-thumb{background:#1e293b;border-radius:3px;}
      `}</style>

      <div style={{ maxWidth: 480, margin: "0 auto", padding: "14px 14px 40px", background: "#0a0f1e", minHeight: "100vh", fontFamily: "'Outfit',system-ui,sans-serif" }}>

        {/* HEADER */}
        <div style={{ background: "linear-gradient(135deg, #052e16 0%, #14532d 50%, #166534 100%)", borderRadius: 18, padding: "16px 20px 14px", marginBottom: 14, position: "relative", overflow: "hidden" }}>
          <div style={{ position: "absolute", top: -40, right: -30, width: 140, height: 140, borderRadius: "50%", background: "rgba(34,197,94,0.08)" }} />
          <div style={{ position: "absolute", bottom: -30, right: 60, width: 90, height: 90, borderRadius: "50%", background: "rgba(34,197,94,0.05)" }} />
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", position: "relative" }}>
            <div>
              <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontSize: 26, fontWeight: 900, color: "white", letterSpacing: 1, lineHeight: 1 }}>⚽ CARY FURY</div>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.55)", marginTop: 4, letterSpacing: 0.3 }}>9v9 · 60 min · 6 sub windows · fair playtime</div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontSize: 28, fontWeight: 900, color: "#4ade80", lineHeight: 1 }}>{players.length}</div>
              <div style={{ fontSize: 9, color: "rgba(255,255,255,0.4)", letterSpacing: 0.5, textTransform: "uppercase" }}>players</div>
            </div>
          </div>
        </div>

        {/* NAV */}
        <div style={{ display: "flex", gap: 6, marginBottom: 14, background: "#111827", borderRadius: 12, padding: 4, border: "1px solid #1e293b" }}>
          {[["roster", "👥 Roster"], ["game", "🎮 Game Day"], ["plan", "📋 Plan"]].map(([k, l]) => (
            <button key={k} onClick={() => setScreen(k)}
              style={{ flex: 1, padding: "8px 4px", borderRadius: 9, fontSize: 12, fontWeight: 600, border: "none", background: screen === k ? "#22c55e" : "transparent", color: screen === k ? "#0a0f1e" : "#475569" }}>
              {l}
            </button>
          ))}
        </div>

        {/* ROSTER */}
        {screen === "roster" && (
          <div>
            <div style={{ background: "#111827", border: "1px solid #1e293b", borderRadius: 16, padding: 14, marginBottom: 10 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: "#4ade80", letterSpacing: 1.5, marginBottom: 10, fontFamily: "'Barlow Condensed',sans-serif" }}>ADD PLAYER</div>
              <input value={newName} onChange={e => setNewName(e.target.value)} onKeyDown={e => e.key === "Enter" && addPlayer()}
                placeholder="Player name..."
                style={{ width: "100%", background: "#0a0f1e", border: "1px solid #1e293b", borderRadius: 9, padding: "9px 12px", color: "#e2e8f0", fontSize: 14 }} />
              <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap", alignItems: "center" }}>
                {["A", "B", "C"].map(c => (
                  <button key={c} onClick={() => setNewClass(c)}
                    style={{ padding: "5px 11px", borderRadius: 8, fontSize: 12, fontWeight: 700, transition: "all 0.15s",
                      background: newClass === c ? CL[c].bg : "#0a0f1e",
                      border: `${newClass === c ? 2 : 1}px solid ${newClass === c ? CL[c].border : "#1e293b"}`,
                      color: newClass === c ? CL[c].text : "#475569" }}>
                    Class {c}
                  </button>
                ))}
                <button onClick={() => setNewIsGK(!newIsGK)}
                  style={{ padding: "5px 11px", borderRadius: 8, fontSize: 12, fontWeight: 700,
                    background: newIsGK ? "#fef3c7" : "#0a0f1e",
                    border: `${newIsGK ? 2 : 1}px solid ${newIsGK ? "#f59e0b" : "#1e293b"}`,
                    color: newIsGK ? "#92400e" : "#475569" }}>🥅 GK</button>
                <button onClick={addPlayer}
                  style={{ padding: "6px 14px", borderRadius: 8, background: "#22c55e", color: "#0a0f1e", border: "none", fontSize: 13, fontWeight: 700, marginLeft: "auto" }}>
                  + Add
                </button>
              </div>
            </div>

            {players.length === 0 && (
              <div style={{ textAlign: "center", color: "#334155", padding: "40px 16px", fontSize: 13 }}>
                <div style={{ fontSize: 32, marginBottom: 8 }}>👥</div>
                Add your squad above to get started
              </div>
            )}

            {["A", "B", "C"].map(cls => {
              const list = players.filter(p => p.class === cls);
              if (!list.length) return null;
              return (
                <div key={cls} style={{ background: "#111827", border: `1px solid ${CL[cls].border}22`, borderRadius: 16, padding: 14, marginBottom: 10 }}>
                  <div style={{ fontSize: 10, fontWeight: 800, color: CL[cls].border, letterSpacing: 1.5, marginBottom: 10, fontFamily: "'Barlow Condensed',sans-serif" }}>
                    CLASS {cls} — {list.length} PLAYER{list.length > 1 ? "S" : ""}
                  </div>
                  {list.map((p, idx) => (
                    <div key={p.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "7px 0", borderBottom: idx < list.length - 1 ? "1px solid #0a0f1e" : "none" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, flex: 1 }}>
                        <div style={{ display: "flex", gap: 3 }}>
                          {["A", "B", "C"].map(c => (
                            <button key={c} onClick={() => updatePlayer(p.id, { class: c })}
                              style={{ width: 22, height: 22, borderRadius: 5, fontSize: 10, fontWeight: 800, border: `1px solid ${p.class === c ? CL[c].border : "#1e293b"}`, background: p.class === c ? CL[c].bg : "#0a0f1e", color: p.class === c ? CL[c].text : "#334155", display: "flex", alignItems: "center", justifyContent: "center" }}>{c}</button>
                          ))}
                        </div>
                        <button onClick={() => updatePlayer(p.id, { isGK: !p.isGK })}
                          style={{ width: 22, height: 22, borderRadius: 5, fontSize: 11, border: `1px solid ${p.isGK ? "#f59e0b" : "#1e293b"}`, background: p.isGK ? "#fef3c7" : "#0a0f1e", display: "flex", alignItems: "center", justifyContent: "center" }}>🥅</button>
                        <span style={{ color: "#e2e8f0", fontSize: 14, fontWeight: 500 }}>{p.name}</span>
                      </div>
                      <button onClick={() => removePlayer(p.id)} style={{ background: "none", border: "none", color: "#334155", fontSize: 13, padding: "4px 8px", borderRadius: 6 }}>✕</button>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        )}

        {/* GAME DAY */}
        {screen === "game" && (
          <div>
            {gameStep === "avail" && (
              <>
                <div style={{ background: "#111827", border: "1px solid #1e293b", borderRadius: 16, padding: 14, marginBottom: 10 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: "#4ade80", letterSpacing: 1.5, fontFamily: "'Barlow Condensed',sans-serif" }}>WHO'S AVAILABLE TODAY?</div>
                    <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontSize: 16, fontWeight: 800, color: availPlayers.length >= 9 ? "#4ade80" : "#f59e0b" }}>
                      {availPlayers.length}/{players.length}
                    </div>
                  </div>
                  {players.length === 0 && <div style={{ color: "#475569", fontSize: 13 }}>Add players in Roster first.</div>}
                  {players.map((p, idx) => (
                    <div key={p.id} onClick={() => toggleAvail(p.id)}
                      style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: idx < players.length - 1 ? "1px solid #0a0f1e" : "none", cursor: "pointer" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ fontSize: 10, fontWeight: 800, padding: "2px 7px", borderRadius: 5, background: CL[p.class].bg, color: CL[p.class].text, border: `1px solid ${CL[p.class].border}`, fontFamily: "'Barlow Condensed',sans-serif" }}>{p.class}</span>
                        {p.isGK && <span style={{ fontSize: 10, background: "#fef3c7", padding: "1px 5px", borderRadius: 4, color: "#92400e", fontWeight: 700 }}>GK</span>}
                        <span style={{ fontSize: 14, color: availSet.has(p.id) ? "#e2e8f0" : "#334155" }}>{p.name}</span>
                      </div>
                      <div style={{ width: 28, height: 28, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", background: availSet.has(p.id) ? "#22c55e" : "#0a0f1e", border: availSet.has(p.id) ? "none" : "1px solid #1e293b", color: availSet.has(p.id) ? "#0a0f1e" : "#334155", fontSize: 13, fontWeight: 800 }}>
                        {availSet.has(p.id) ? "✓" : "–"}
                      </div>
                    </div>
                  ))}
                </div>
                <button onClick={() => { setStarting([]); setGameStep("lineup"); }} disabled={availPlayers.length < 9}
                  style={{ width: "100%", padding: 13, background: availPlayers.length >= 9 ? "linear-gradient(135deg,#22c55e,#16a34a)" : "#111827", color: availPlayers.length >= 9 ? "#0a0f1e" : "#334155", border: availPlayers.length >= 9 ? "none" : "1px solid #1e293b", borderRadius: 12, fontSize: 15, fontWeight: 700, marginBottom: 6, opacity: availPlayers.length >= 9 ? 1 : 0.6 }}>
                  Set Starting 9 →
                </button>
                {availPlayers.length < 9 && <div style={{ fontSize: 12, color: "#f87171", textAlign: "center" }}>Need at least 9 available players</div>}
              </>
            )}

            {gameStep === "lineup" && (
              <>
                <div style={{ background: "#111827", border: "1px solid #1e293b", borderRadius: 16, padding: 14, marginBottom: 10 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: "#4ade80", letterSpacing: 1.5, fontFamily: "'Barlow Condensed',sans-serif" }}>PICK STARTING 9</div>
                    <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontSize: 20, fontWeight: 900, color: starting.length === 9 ? "#4ade80" : "#f59e0b" }}>{starting.length}/9</div>
                  </div>
                  {gkH1 && (
                    <div style={{ fontSize: 12, color: "#94a3b8", marginBottom: 12, padding: "7px 10px", background: "#0a0f1e", borderRadius: 8, border: "1px solid #fef3c733" }}>
                      ⚠️ <strong style={{ color: "#fbbf24" }}>{gkH1.name}</strong> (H1 GK) must start.
                    </div>
                  )}
                  {["A", "B", "C"].map(cls => {
                    const list = availPlayers.filter(p => p.class === cls);
                    if (!list.length) return null;
                    return (
                      <div key={cls} style={{ marginBottom: 6 }}>
                        <div style={{ fontSize: 10, color: CL[cls].border, fontWeight: 700, letterSpacing: 1, padding: "6px 0 4px", fontFamily: "'Barlow Condensed',sans-serif" }}>CLASS {cls}</div>
                        {list.map(p => {
                          const sel = starting.includes(p.id);
                          return (
                            <div key={p.id} onClick={() => toggleStarting(p.id)}
                              style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "9px 10px", marginBottom: 3, borderRadius: 10, cursor: "pointer", background: sel ? "#0c1a3a" : "#0a0f1e", border: `1px solid ${sel ? "#1d4ed8" : "#1e293b"}`, opacity: !sel && starting.length >= 9 ? 0.35 : 1 }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                                {p.isGK && <span style={{ fontSize: 10, background: "#fef3c7", padding: "1px 5px", borderRadius: 4, color: "#92400e", fontWeight: 700 }}>GK</span>}
                                <span style={{ color: sel ? "white" : "#64748b", fontWeight: sel ? 600 : 400, fontSize: 14 }}>{p.name}</span>
                              </div>
                              <div style={{ width: 20, height: 20, borderRadius: "50%", background: sel ? "#1d4ed8" : "transparent", border: `2px solid ${sel ? "#3b82f6" : "#334155"}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                                {sel && <div style={{ width: 8, height: 8, borderRadius: "50%", background: "white" }} />}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
                {error && <div style={{ background: "#111827", border: "1px solid #dc2626", borderRadius: 8, padding: "8px 12px", fontSize: 12, color: "#f87171", marginBottom: 8 }}>{error}</div>}
                <div style={{ display: "flex", gap: 8 }}>
                  <button onClick={() => { setGameStep("avail"); setError(""); }}
                    style={{ padding: "13px 18px", background: "#111827", color: "#94a3b8", border: "1px solid #1e293b", borderRadius: 12, fontSize: 13, fontWeight: 600 }}>← Back</button>
                  <button onClick={handleGenerate} disabled={starting.length !== 9}
                    style={{ flex: 1, padding: 13, background: starting.length === 9 ? "linear-gradient(135deg,#22c55e,#16a34a)" : "#111827", color: starting.length === 9 ? "#0a0f1e" : "#334155", border: starting.length === 9 ? "none" : "1px solid #1e293b", borderRadius: 12, fontSize: 15, fontWeight: 700, opacity: starting.length === 9 ? 1 : 0.6 }}>
                    ⚡ Generate Plan
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {/* PLAN */}
        {screen === "plan" && (
          <div>
            {!rotation ? (
              <div style={{ textAlign: "center", color: "#334155", padding: "40px 16px", fontSize: 13 }}>
                <div style={{ fontSize: 32, marginBottom: 8 }}>📋</div>
                No plan yet. Go to Game Day to generate one.
              </div>
            ) : (
              <>
                <div style={{ display: "flex", gap: 6, marginBottom: 14, background: "#111827", borderRadius: 12, padding: 4, border: "1px solid #1e293b" }}>
                  {[["subs", "🔄 Sub Plan"], ["minutes", "📊 Minutes"]].map(([k, l]) => (
                    <button key={k} onClick={() => setPlanView(k)}
                      style={{ flex: 1, padding: "8px 4px", borderRadius: 9, fontSize: 12, fontWeight: 600, border: "none", background: planView === k ? "#22c55e" : "transparent", color: planView === k ? "#0a0f1e" : "#475569" }}>
                      {l}
                    </button>
                  ))}
                </div>

                {/* SUB PLAN */}
                {planView === "subs" && (
                  <>
                    <div style={{ display: "flex", gap: 4, marginBottom: 12, overflowX: "auto", paddingBottom: 4 }}>
                      {PERIODS.map((per, i) => {
                        const isHT = i === 3;
                        return (
                          <button key={i} onClick={() => setPlanPeriod(i)}
                            style={{ flexShrink: 0, padding: "8px 12px", borderRadius: 10, textAlign: "center", border: "none",
                              background: planPeriod === i ? (isHT ? "#78350f" : "#172554") : "#111827",
                              borderBottom: `3px solid ${planPeriod === i ? (isHT ? "#f59e0b" : "#3b82f6") : "transparent"}` }}>
                            <span style={{ display: "block", fontFamily: "'Barlow Condensed',sans-serif", fontSize: 16, fontWeight: 900, color: planPeriod === i ? "white" : "#475569" }}>{per.label}</span>
                            <span style={{ display: "block", fontSize: 9, color: planPeriod === i ? (isHT ? "#fbbf24" : "#93c5fd") : "#334155", marginTop: 1 }}>{per.time}</span>
                          </button>
                        );
                      })}
                    </div>

                    {planPeriod === 0 && (
                      <div style={{ background: "#052e16", border: "1px solid #166534", borderRadius: 12, padding: "10px 14px", marginBottom: 10, fontSize: 12, color: "#86efac" }}>
                        🟢 <strong>Kick-off</strong> — this is your starting lineup
                      </div>
                    )}

                    {planPeriod > 0 && (() => {
                      const s = getSubs(planPeriod);
                      const ht = planPeriod === 3;
                      return (
                        <div style={{ background: "#111827", border: `1px solid ${ht ? "#f59e0b" : "#1d4ed8"}`, borderRadius: 14, padding: 14, marginBottom: 10 }}>
                          <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 900, fontSize: 15, color: ht ? "#fbbf24" : "#60a5fa", marginBottom: 12, letterSpacing: 0.5 }}>
                            {ht ? "🔁 HALFTIME CHANGES" : `🔄 SUBS AT MIN ${planPeriod * 10}`}
                            <span style={{ float: "right", fontSize: 12, color: "#475569", fontWeight: 600, fontFamily: "'Outfit',sans-serif" }}>{s.in.length} change{s.in.length !== 1 ? "s" : ""}</span>
                          </div>
                          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                            <div>
                              <div style={{ fontSize: 10, color: "#ef4444", fontWeight: 700, letterSpacing: 1, marginBottom: 8 }}>OFF ▼</div>
                              {s.out.map(id => {
                                const p = gp(id); if (!p) return null;
                                return (
                                  <div key={id} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                                    <span style={{ fontSize: 10, fontWeight: 800, padding: "2px 6px", borderRadius: 4, background: CL[p.class].bg, color: CL[p.class].text, border: `1px solid ${CL[p.class].border}`, fontFamily: "'Barlow Condensed',sans-serif" }}>{p.class}</span>
                                    <span style={{ fontSize: 13, color: "#fca5a5", fontWeight: 500 }}>{p.name}</span>
                                  </div>
                                );
                              })}
                            </div>
                            <div>
                              <div style={{ fontSize: 10, color: "#22c55e", fontWeight: 700, letterSpacing: 1, marginBottom: 8 }}>ON ▲</div>
                              {s.in.map(id => {
                                const p = gp(id); if (!p) return null;
                                return (
                                  <div key={id} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                                    <span style={{ fontSize: 10, fontWeight: 800, padding: "2px 6px", borderRadius: 4, background: CL[p.class].bg, color: CL[p.class].text, border: `1px solid ${CL[p.class].border}`, fontFamily: "'Barlow Condensed',sans-serif" }}>{p.class}</span>
                                    <span style={{ fontSize: 13, color: "#86efac", fontWeight: 500 }}>{p.name}</span>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        </div>
                      );
                    })()}

                    <div style={{ background: "#111827", border: "1px solid #1e293b", borderRadius: 14, padding: 14, marginBottom: 10 }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: "#475569", letterSpacing: 1.5, marginBottom: 10, fontFamily: "'Barlow Condensed',sans-serif" }}>ON FIELD — {rotation[planPeriod].onField.length}</div>
                      {rotation[planPeriod].onField.map((id) => {
                        const p = gp(id); if (!p) return null;
                        const isGK = id === rotation[planPeriod].gkId;
                        const m = minsSummary?.[id] ?? 0;
                        return (
                          <div key={id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "7px 10px", marginBottom: 3, borderRadius: 9, background: isGK ? "#161a0e" : "#0a0f1e", border: `1px solid ${isGK ? "#f59e0b22" : "#1e293b"}` }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                              <span style={{ fontSize: 10, fontWeight: 800, padding: "2px 6px", borderRadius: 4, background: CL[p.class].bg, color: CL[p.class].text, border: `1px solid ${CL[p.class].border}`, fontFamily: "'Barlow Condensed',sans-serif" }}>{p.class}</span>
                              {isGK && <span style={{ fontSize: 9, background: "#fef3c7", padding: "1px 5px", borderRadius: 4, color: "#92400e", fontWeight: 700 }}>GK</span>}
                              <span style={{ color: "#e2e8f0", fontSize: 14, fontWeight: isGK ? 600 : 400 }}>{p.name}</span>
                            </div>
                            <span style={{ fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 700, fontSize: 16, color: m >= 50 ? "#4ade80" : m >= 40 ? "#fbbf24" : "#94a3b8" }}>{m}m</span>
                          </div>
                        );
                      })}
                    </div>

                    {rotation[planPeriod].bench.length > 0 && (
                      <div style={{ background: "#111827", border: "1px solid #1e293b", borderRadius: 14, padding: 14 }}>
                        <div style={{ fontSize: 10, fontWeight: 700, color: "#475569", letterSpacing: 1.5, marginBottom: 10, fontFamily: "'Barlow Condensed',sans-serif" }}>BENCH — {rotation[planPeriod].bench.length}</div>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                          {rotation[planPeriod].bench.map(id => {
                            const p = gp(id); if (!p) return null;
                            return (
                              <span key={id} style={{ fontSize: 12, fontWeight: 600, padding: "4px 10px", borderRadius: 20, background: CL[p.class].bg, color: CL[p.class].text, border: `1px solid ${CL[p.class].border}` }}>
                                {p.isGK && "🥅 "}{p.name}
                              </span>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </>
                )}

                {/* MINUTES VIEW */}
                {planView === "minutes" && (
                  <div style={{ background: "#111827", border: "1px solid #1e293b", borderRadius: 16, padding: 14 }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: "#4ade80", letterSpacing: 1.5, marginBottom: 14, fontFamily: "'Barlow Condensed',sans-serif" }}>PLAYTIME SUMMARY</div>
                    {players
                      .filter(p => availSet.has(p.id))
                      .sort((a, b) => (minsSummary?.[b.id] ?? 0) - (minsSummary?.[a.id] ?? 0))
                      .map(p => {
                        const m = minsSummary?.[p.id] ?? 0;
                        return (
                          <div key={p.id} style={{ marginBottom: 14 }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 5 }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                                <span style={{ fontSize: 10, fontWeight: 800, padding: "2px 6px", borderRadius: 4, background: CL[p.class].bg, color: CL[p.class].text, border: `1px solid ${CL[p.class].border}`, fontFamily: "'Barlow Condensed',sans-serif" }}>{p.class}</span>
                                {p.isGK && <span style={{ fontSize: 11 }}>🥅</span>}
                                <span style={{ fontSize: 14, color: "#e2e8f0", fontWeight: 500 }}>{p.name}</span>
                              </div>
                              <span style={{ fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 900, fontSize: 20, color: m >= 50 ? "#4ade80" : m >= 40 ? "#fbbf24" : "#f97316" }}>
                                {m}<span style={{ fontSize: 11, fontWeight: 400 }}> min</span>
                              </span>
                            </div>
                            <div style={{ background: "#0a0f1e", borderRadius: 4, height: 5, marginBottom: 5, overflow: "hidden" }}>
                              <div style={{ width: `${(m / 60) * 100}%`, height: "100%", borderRadius: 4, background: m >= 50 ? "#22c55e" : m >= 40 ? "#f59e0b" : "#f97316" }} />
                            </div>
                            <div style={{ display: "flex", gap: 3 }}>
                              {PERIODS.map((_, pi) => {
                                const on = rotation[pi].onField.includes(p.id);
                                const isGK = rotation[pi].gkId === p.id;
                                return (
                                  <div key={pi} style={{ flex: 1, height: 18, borderRadius: 4, background: on ? (isGK ? "#f59e0b" : "#166534") : "#0a0f1e", display: "flex", alignItems: "center", justifyContent: "center", border: `1px solid ${on ? (isGK ? "#f59e0b66" : "#22c55e44") : "#1e293b"}` }}>
                                    {on && <span style={{ fontSize: 7, fontWeight: 900, color: isGK ? "#78350f" : "#4ade80" }}>{isGK ? "G" : "▶"}</span>}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                    <div style={{ fontSize: 10, color: "#334155", marginTop: 8, paddingTop: 10, borderTop: "1px solid #0a0f1e", display: "flex", gap: 12, flexWrap: "wrap" }}>
                      <span>🟢 ≥50 min</span><span>🟡 40–49 min</span><span>🟠 &lt;40 min</span><span>🟨 G = in goal</span>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </>
  );
}
