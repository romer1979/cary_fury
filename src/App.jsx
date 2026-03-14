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

const CLASS_BONUS = { A: 30, B: 15, C: 0 };
const CLASS_RANK = { A: 0, B: 1, C: 2 };

function uid() { return Math.random().toString(36).slice(2, 8); }

function generateRotation(players, availSet, startingIds, gkH1Id, gkH2Id, removals) {
  const allAvail = players.filter(p => availSet.has(p.id));
  if (allAvail.length < 9) return null;

  const removalMap = {};
  removals.forEach(r => { removalMap[r.id] = r.afterPeriod; });

  const isAvail = (id, pi) => {
    if (!allAvail.find(p => p.id === id)) return false;
    if (id in removalMap && pi > removalMap[id]) return false;
    return true;
  };
  const getAvail = (pi) => allAvail.filter(p => isAvail(p.id, pi));

  const outfieldPlayed = {};
  const totalPlayed = {};
  const totalBenched = {};
  const h1Played = {};
  const h2Played = {};
  allAvail.forEach(p => {
    outfieldPlayed[p.id] = 0; totalPlayed[p.id] = 0;
    totalBenched[p.id] = 0; h1Played[p.id] = 0; h2Played[p.id] = 0;
  });
  const rotation = [];

  for (let pi = 0; pi < 6; pi++) {
    const avail = getAvail(pi);
    const isH1 = pi < 3;
    const isHT = pi === 3;
    const maxSubs = isHT ? 999 : 4;
    const remainingInHalf = isH1 ? (2 - pi) : (5 - pi);

    let gkId = (pi >= 3) ? gkH2Id : gkH1Id;
    if (!avail.find(p => p.id === gkId)) {
      gkId = (pi >= 3) ? gkH1Id : gkH2Id;
      if (!avail.find(p => p.id === gkId)) {
        const fb = avail.find(p => p.isGK) || avail[0];
        gkId = fb?.id;
      }
    }

    if (pi === 0) {
      let onField = startingIds.filter(id => isAvail(id, 0));
      while (onField.length < Math.min(9, avail.length)) {
        const fill = avail.find(p => !onField.includes(p.id));
        if (fill) onField.push(fill.id); else break;
      }
      const bench = avail.map(p => p.id).filter(id => !onField.includes(id));
      rotation.push({ gkId, onField, bench });
      onField.forEach(id => {
        totalPlayed[id]++; h1Played[id]++;
        if (id !== gkId) outfieldPlayed[id]++;
      });
      bench.forEach(id => { totalBenched[id]++; });
      continue;
    }

    // === SCORE EACH OUTFIELD CANDIDATE ===
    // Higher score = more deserving to play
    const score = (id) => {
      const p = allAvail.find(x => x.id === id);
      // Class priority: A=30, B=15, C=0 — dominant factor
      let s = (CLASS_BONUS[p?.class] || 0);
      // Balance within class: fewer outfield periods = higher priority
      s -= (outfieldPlayed[id] || 0) * 10;

      // HARD: must play if benched 2 periods total (max bench = 2)
      if (totalBenched[id] >= 2) s += 10000;

      // HARD: must play at least 1 period in each half
      const hPlayed = isH1 ? h1Played[id] : h2Played[id];
      if (hPlayed === 0 && remainingInHalf === 0) s += 10000;
      else if (hPlayed === 0 && remainingInHalf === 1) s += 5000;

      // GK rest: play 4-5 total, rest 1-2
      const isGKPlayer = (id === gkH1Id || id === gkH2Id) && id !== gkId;
      if (isGKPlayer) {
        const total = totalPlayed[id] || 0;
        if (total >= 5) s -= 20000;
        const remaining = 5 - pi;
        const needed = 4 - total;
        if (needed > 0 && needed >= remaining) s += 10000;
        // GK must also play each half
        const gkH = isH1 ? h1Played[id] : h2Played[id];
        if (gkH === 0 && remainingInHalf === 0) s += 10000;
      }

      return s;
    };

    // Select top 8 outfield by score
    const outfield = avail.filter(p => p.id !== gkId);
    const idealOutfield = [...outfield].sort((a, b) => score(b.id) - score(a.id)).slice(0, 8);
    const idealOnField = [gkId, ...idealOutfield.map(p => p.id)];
    const idealSet = new Set(idealOnField);

    // Identify forced players (score >= 5000, hard constraints)
    const forcedIds = new Set();
    outfield.forEach(p => { if (score(p.id) >= 5000) forcedIds.add(p.id); });

    // === ENFORCE MAX SUBS ===
    const prevOnAvail = rotation[pi - 1].onField.filter(id => isAvail(id, pi));
    const prevSet = new Set(prevOnAvail);
    const incoming = idealOnField.filter(id => !prevSet.has(id));

    let finalOnField;
    if (incoming.length <= maxSubs) {
      finalOnField = [...idealOnField];
    } else {
      const mustIn = incoming.filter(id => id === gkId || forcedIds.has(id));
      const optionalIn = incoming.filter(id => id !== gkId && !forcedIds.has(id));
      const subsLeft = Math.max(0, maxSubs - mustIn.length);
      const optSorted = optionalIn.sort((a, b) => score(b) - score(a));
      const actualOptIn = optSorted.slice(0, subsLeft);
      const actualIn = new Set([...mustIn, ...actualOptIn]);

      const outgoing = prevOnAvail.filter(id => !idealSet.has(id));
      const outSorted = outgoing.sort((a, b) => score(a) - score(b));
      const actualOut = new Set(outSorted.slice(0, actualIn.size));

      finalOnField = [gkId];
      prevOnAvail.forEach(id => {
        if (id !== gkId && !actualOut.has(id)) finalOnField.push(id);
      });
      actualIn.forEach(id => {
        if (!finalOnField.includes(id)) finalOnField.push(id);
      });
    }

    const targetSize = Math.min(9, avail.length);
    while (finalOnField.length < targetSize) {
      const fill = avail.find(p => !finalOnField.includes(p.id));
      if (fill) finalOnField.push(fill.id); else break;
    }
    finalOnField = finalOnField.slice(0, targetSize);

    const bench = avail.map(p => p.id).filter(id => !finalOnField.includes(id));
    rotation.push({ gkId, onField: finalOnField, bench });
    finalOnField.forEach(id => {
      totalPlayed[id]++;
      if (isH1) h1Played[id]++; else h2Played[id]++;
      if (id !== gkId) outfieldPlayed[id]++;
    });
    bench.forEach(id => { totalBenched[id]++; });
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
  const [gkH1Id, setGkH1Id] = useState(null);
  const [gkH2Id, setGkH2Id] = useState(null);
  const [removals, setRemovals] = useState([]);
  const [gameConfig, setGameConfig] = useState(null);
  const [removingPlayerId, setRemovingPlayerId] = useState(null);

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
    savePlayers([...players, p]);
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

  function regenRotation(cfg, rems) {
    const rot = generateRotation(players, availSet, cfg.startingIds, cfg.gkH1Id, cfg.gkH2Id, rems);
    setRotation(rot);
  }

  function handleGenerate() {
    setError("");
    if (!gkH1Id) { setError("Select a goalkeeper for the 1st half."); return; }
    if (!gkH2Id) { setError("Select a goalkeeper for the 2nd half."); return; }
    if (!starting.includes(gkH1Id)) { setError("Starting 9 must include your H1 goalkeeper."); return; }
    if (starting.length !== 9) { setError("Select exactly 9 starting players."); return; }
    const cfg = { startingIds: [...starting], gkH1Id, gkH2Id };
    setGameConfig(cfg);
    setRemovals([]);
    const rot = generateRotation(players, availSet, cfg.startingIds, cfg.gkH1Id, cfg.gkH2Id, []);
    if (rot) { setRotation(rot); setPlanPeriod(0); setPlanView("subs"); setScreen("plan"); }
  }

  function addRemoval(playerId, fromPeriodIndex) {
    if (removals.find(r => r.id === playerId)) return;
    // afterPeriod = last period they play = fromPeriodIndex - 1
    const afterPeriod = fromPeriodIndex - 1;
    const next = [...removals, { id: playerId, afterPeriod, fromPeriod: fromPeriodIndex }];
    setRemovals(next);
    setRemovingPlayerId(null);
    if (gameConfig) regenRotation(gameConfig, next);
  }

  function undoRemoval(playerId) {
    const next = removals.filter(r => r.id !== playerId);
    setRemovals(next);
    if (gameConfig) regenRotation(gameConfig, next);
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
  const isRemoved = (id) => removals.find(r => r.id === id);

  // 150% check — EXCLUDES goalkeepers, only field players
  const fairnessWarning = (minsSummary && gameConfig) ? (() => {
    const gkIds = new Set([gameConfig.gkH1Id, gameConfig.gkH2Id].filter(Boolean));
    const vals = Object.entries(minsSummary)
      .filter(([id]) => availSet.has(id) && !isRemoved(id) && !gkIds.has(id))
      .map(([, v]) => v)
      .filter(v => v > 0);
    if (vals.length < 2) return null;
    const mn = Math.min(...vals), mx = Math.max(...vals);
    if (mn > 0 && mx > 1.5 * mn) return `${mx}m vs ${mn}m (${Math.round(mx/mn*100)}%)`;
    return null;
  })() : null;

  if (!loaded) return <div style={{ background: "#0a0f1e", minHeight: "100dvh", display: "flex", alignItems: "center", justifyContent: "center", color: "#4ade80", fontFamily: "monospace" }}>Loading...</div>;

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@500;600;700;800;900&family=Outfit:wght@300;400;500;600;700&display=swap');
        *{box-sizing:border-box;margin:0;padding:0;}
        html{-webkit-text-size-adjust:100%;text-size-adjust:100%;}
        body{background:#0a0f1e;-webkit-tap-highlight-color:transparent;overscroll-behavior:none;}
        input,button,select{font-family:'Outfit',system-ui,-apple-system,sans-serif;-webkit-appearance:none;appearance:none;}
        input[type="text"],input:not([type]){font-size:16px;}
        button{transition:all 0.15s;cursor:pointer;-webkit-user-select:none;user-select:none;touch-action:manipulation;}
        button:active{transform:scale(0.97);}
        input:focus{outline:none;border-color:#22c55e !important;}
        ::-webkit-scrollbar{width:3px;height:3px;}
        ::-webkit-scrollbar-track{background:#0a0f1e;}
        ::-webkit-scrollbar-thumb{background:#1e293b;border-radius:3px;}
        @supports(padding:env(safe-area-inset-bottom)){
          .app-container{padding-bottom:calc(40px + env(safe-area-inset-bottom))!important;}
        }
      `}</style>

      <div className="app-container" style={{ maxWidth: 480, margin: "0 auto", padding: "14px 14px 40px", background: "#0a0f1e", minHeight: "100dvh", fontFamily: "'Outfit',system-ui,-apple-system,sans-serif" }}>

        {/* HEADER */}
        <div style={{ background: "linear-gradient(135deg, #052e16 0%, #14532d 50%, #166534 100%)", borderRadius: 18, padding: "16px 20px 14px", marginBottom: 14, position: "relative", overflow: "hidden" }}>
          <div style={{ position: "absolute", top: -40, right: -30, width: 140, height: 140, borderRadius: "50%", background: "rgba(34,197,94,0.08)" }} />
          <div style={{ position: "absolute", bottom: -30, right: 60, width: 90, height: 90, borderRadius: "50%", background: "rgba(34,197,94,0.05)" }} />
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", position: "relative" }}>
            <div>
              <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontSize: 26, fontWeight: 900, color: "white", letterSpacing: 1, lineHeight: 1 }}>⚽ CARY FURY</div>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.55)", marginTop: 4, letterSpacing: 0.3 }}>9v9 · 60 min · A&gt;B&gt;C priority · max 4 subs</div>
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
              style={{ flex: 1, padding: "10px 4px", borderRadius: 9, fontSize: 13, fontWeight: 600, border: "none", background: screen === k ? "#22c55e" : "transparent", color: screen === k ? "#0a0f1e" : "#475569" }}>
              {l}
            </button>
          ))}
        </div>

        {/* ══════════ ROSTER ══════════ */}
        {screen === "roster" && (
          <div>
            <div style={{ background: "#111827", border: "1px solid #1e293b", borderRadius: 16, padding: 14, marginBottom: 10 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: "#4ade80", letterSpacing: 1.5, marginBottom: 10, fontFamily: "'Barlow Condensed',sans-serif" }}>ADD PLAYER</div>
              <input value={newName} onChange={e => setNewName(e.target.value)} onKeyDown={e => e.key === "Enter" && addPlayer()}
                placeholder="Player name..."
                style={{ width: "100%", background: "#0a0f1e", border: "1px solid #1e293b", borderRadius: 9, padding: "10px 12px", color: "#e2e8f0", fontSize: 16 }} />
              <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap", alignItems: "center" }}>
                {["A", "B", "C"].map(c => (
                  <button key={c} onClick={() => setNewClass(c)}
                    style={{ padding: "7px 13px", borderRadius: 8, fontSize: 13, fontWeight: 700,
                      background: newClass === c ? CL[c].bg : "#0a0f1e",
                      border: `${newClass === c ? 2 : 1}px solid ${newClass === c ? CL[c].border : "#1e293b"}`,
                      color: newClass === c ? CL[c].text : "#475569" }}>
                    Class {c}
                  </button>
                ))}
                <button onClick={() => setNewIsGK(!newIsGK)}
                  style={{ padding: "7px 13px", borderRadius: 8, fontSize: 13, fontWeight: 700,
                    background: newIsGK ? "#fef3c7" : "#0a0f1e",
                    border: `${newIsGK ? 2 : 1}px solid ${newIsGK ? "#f59e0b" : "#1e293b"}`,
                    color: newIsGK ? "#92400e" : "#475569" }}>🥅 GK</button>
                <button onClick={addPlayer}
                  style={{ padding: "8px 16px", borderRadius: 8, background: "#22c55e", color: "#0a0f1e", border: "none", fontSize: 14, fontWeight: 700, marginLeft: "auto" }}>
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
                    <div key={p.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: idx < list.length - 1 ? "1px solid #0a0f1e" : "none" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, flex: 1 }}>
                        <div style={{ display: "flex", gap: 3 }}>
                          {["A", "B", "C"].map(c => (
                            <button key={c} onClick={() => updatePlayer(p.id, { class: c })}
                              style={{ width: 26, height: 26, borderRadius: 6, fontSize: 11, fontWeight: 800, border: `1px solid ${p.class === c ? CL[c].border : "#1e293b"}`, background: p.class === c ? CL[c].bg : "#0a0f1e", color: p.class === c ? CL[c].text : "#334155", display: "flex", alignItems: "center", justifyContent: "center" }}>{c}</button>
                          ))}
                        </div>
                        <button onClick={() => updatePlayer(p.id, { isGK: !p.isGK })}
                          style={{ width: 26, height: 26, borderRadius: 6, fontSize: 12, border: `1px solid ${p.isGK ? "#f59e0b" : "#1e293b"}`, background: p.isGK ? "#fef3c7" : "#0a0f1e", display: "flex", alignItems: "center", justifyContent: "center" }}>🥅</button>
                        <span style={{ color: "#e2e8f0", fontSize: 14, fontWeight: 500 }}>{p.name}</span>
                      </div>
                      <button onClick={() => removePlayer(p.id)} style={{ background: "none", border: "none", color: "#334155", fontSize: 16, padding: "6px 10px", borderRadius: 6, minWidth: 36, minHeight: 36, display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        )}

        {/* ══════════ GAME DAY ══════════ */}
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
                      style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: idx < players.length - 1 ? "1px solid #0a0f1e" : "none", cursor: "pointer" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ fontSize: 10, fontWeight: 800, padding: "2px 7px", borderRadius: 5, background: CL[p.class].bg, color: CL[p.class].text, border: `1px solid ${CL[p.class].border}`, fontFamily: "'Barlow Condensed',sans-serif" }}>{p.class}</span>
                        {p.isGK && <span style={{ fontSize: 10, background: "#fef3c7", padding: "1px 5px", borderRadius: 4, color: "#92400e", fontWeight: 700 }}>GK</span>}
                        <span style={{ fontSize: 14, color: availSet.has(p.id) ? "#e2e8f0" : "#334155" }}>{p.name}</span>
                      </div>
                      <div style={{ width: 32, height: 32, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", background: availSet.has(p.id) ? "#22c55e" : "#0a0f1e", border: availSet.has(p.id) ? "none" : "1px solid #1e293b", color: availSet.has(p.id) ? "#0a0f1e" : "#334155", fontSize: 14, fontWeight: 800 }}>
                        {availSet.has(p.id) ? "✓" : "–"}
                      </div>
                    </div>
                  ))}
                </div>
                <button onClick={() => { setGkH1Id(null); setGkH2Id(null); setGameStep("goalkeepers"); }} disabled={availPlayers.length < 9}
                  style={{ width: "100%", padding: 14, background: availPlayers.length >= 9 ? "linear-gradient(135deg,#22c55e,#16a34a)" : "#111827", color: availPlayers.length >= 9 ? "#0a0f1e" : "#334155", border: availPlayers.length >= 9 ? "none" : "1px solid #1e293b", borderRadius: 12, fontSize: 15, fontWeight: 700, marginBottom: 6, opacity: availPlayers.length >= 9 ? 1 : 0.6 }}>
                  Pick Goalkeepers →
                </button>
                {availPlayers.length < 9 && <div style={{ fontSize: 12, color: "#f87171", textAlign: "center" }}>Need at least 9 available players</div>}
              </>
            )}

            {gameStep === "goalkeepers" && (
              <>
                <div style={{ background: "#111827", border: "1px solid #1e293b", borderRadius: 16, padding: 14, marginBottom: 10 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: "#fbbf24", letterSpacing: 1.5, marginBottom: 14, fontFamily: "'Barlow Condensed',sans-serif" }}>🥅 CHOOSE GOALKEEPERS</div>

                  <div style={{ marginBottom: 16 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: "#60a5fa", marginBottom: 8 }}>1st Half Goalkeeper</div>
                    {availPlayers.map(p => {
                      const sel = gkH1Id === p.id;
                      return (
                        <div key={p.id} onClick={() => setGkH1Id(p.id)}
                          style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 10px", marginBottom: 3, borderRadius: 10, cursor: "pointer", background: sel ? "#0c1a3a" : "#0a0f1e", border: `1px solid ${sel ? "#3b82f6" : "#1e293b"}` }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                            <span style={{ fontSize: 10, fontWeight: 800, padding: "2px 6px", borderRadius: 4, background: CL[p.class].bg, color: CL[p.class].text, border: `1px solid ${CL[p.class].border}`, fontFamily: "'Barlow Condensed',sans-serif" }}>{p.class}</span>
                            {p.isGK && <span style={{ fontSize: 10, background: "#fef3c7", padding: "1px 5px", borderRadius: 4, color: "#92400e", fontWeight: 700 }}>GK</span>}
                            <span style={{ color: sel ? "white" : "#64748b", fontWeight: sel ? 600 : 400, fontSize: 14 }}>{p.name}</span>
                          </div>
                          <div style={{ width: 22, height: 22, borderRadius: "50%", background: sel ? "#3b82f6" : "transparent", border: `2px solid ${sel ? "#60a5fa" : "#334155"}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                            {sel && <div style={{ width: 8, height: 8, borderRadius: "50%", background: "white" }} />}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: "#f59e0b", marginBottom: 8 }}>2nd Half Goalkeeper</div>
                    {availPlayers.map(p => {
                      const sel = gkH2Id === p.id;
                      return (
                        <div key={p.id} onClick={() => setGkH2Id(p.id)}
                          style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 10px", marginBottom: 3, borderRadius: 10, cursor: "pointer", background: sel ? "#1a1400" : "#0a0f1e", border: `1px solid ${sel ? "#f59e0b" : "#1e293b"}` }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                            <span style={{ fontSize: 10, fontWeight: 800, padding: "2px 6px", borderRadius: 4, background: CL[p.class].bg, color: CL[p.class].text, border: `1px solid ${CL[p.class].border}`, fontFamily: "'Barlow Condensed',sans-serif" }}>{p.class}</span>
                            {p.isGK && <span style={{ fontSize: 10, background: "#fef3c7", padding: "1px 5px", borderRadius: 4, color: "#92400e", fontWeight: 700 }}>GK</span>}
                            <span style={{ color: sel ? "white" : "#64748b", fontWeight: sel ? 600 : 400, fontSize: 14 }}>{p.name}</span>
                          </div>
                          <div style={{ width: 22, height: 22, borderRadius: "50%", background: sel ? "#f59e0b" : "transparent", border: `2px solid ${sel ? "#fbbf24" : "#334155"}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                            {sel && <div style={{ width: 8, height: 8, borderRadius: "50%", background: "white" }} />}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button onClick={() => setGameStep("avail")}
                    style={{ padding: "14px 18px", background: "#111827", color: "#94a3b8", border: "1px solid #1e293b", borderRadius: 12, fontSize: 13, fontWeight: 600 }}>← Back</button>
                  <button onClick={() => { setStarting(gkH1Id ? [gkH1Id] : []); setGameStep("lineup"); }} disabled={!gkH1Id || !gkH2Id}
                    style={{ flex: 1, padding: 14, background: (gkH1Id && gkH2Id) ? "linear-gradient(135deg,#22c55e,#16a34a)" : "#111827", color: (gkH1Id && gkH2Id) ? "#0a0f1e" : "#334155", border: (gkH1Id && gkH2Id) ? "none" : "1px solid #1e293b", borderRadius: 12, fontSize: 15, fontWeight: 700, opacity: (gkH1Id && gkH2Id) ? 1 : 0.6 }}>
                    Set Starting 9 →
                  </button>
                </div>
              </>
            )}

            {gameStep === "lineup" && (
              <>
                <div style={{ background: "#111827", border: "1px solid #1e293b", borderRadius: 16, padding: 14, marginBottom: 10 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: "#4ade80", letterSpacing: 1.5, fontFamily: "'Barlow Condensed',sans-serif" }}>PICK STARTING 9</div>
                    <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontSize: 20, fontWeight: 900, color: starting.length === 9 ? "#4ade80" : "#f59e0b" }}>{starting.length}/9</div>
                  </div>
                  {gkH1Id && (
                    <div style={{ fontSize: 12, color: "#94a3b8", marginBottom: 12, padding: "8px 10px", background: "#0a0f1e", borderRadius: 8, border: "1px solid #fef3c733" }}>
                      🥅 <strong style={{ color: "#fbbf24" }}>{gp(gkH1Id)?.name}</strong> is locked in as H1 GK
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
                          const isLockedGK = p.id === gkH1Id;
                          return (
                            <div key={p.id} onClick={() => { if (!isLockedGK) toggleStarting(p.id); }}
                              style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 10px", marginBottom: 3, borderRadius: 10, cursor: isLockedGK ? "default" : "pointer", background: sel ? "#0c1a3a" : "#0a0f1e", border: `1px solid ${sel ? "#1d4ed8" : "#1e293b"}`, opacity: isLockedGK ? 0.7 : (!sel && starting.length >= 9 ? 0.35 : 1) }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                                {p.isGK && <span style={{ fontSize: 10, background: "#fef3c7", padding: "1px 5px", borderRadius: 4, color: "#92400e", fontWeight: 700 }}>GK</span>}
                                <span style={{ color: sel ? "white" : "#64748b", fontWeight: sel ? 600 : 400, fontSize: 14 }}>{p.name}</span>
                                {isLockedGK && <span style={{ fontSize: 9, color: "#fbbf24", fontWeight: 700 }}>(H1 GK)</span>}
                              </div>
                              <div style={{ width: 22, height: 22, borderRadius: "50%", background: sel ? "#1d4ed8" : "transparent", border: `2px solid ${sel ? "#3b82f6" : "#334155"}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
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
                  <button onClick={() => { setGameStep("goalkeepers"); setError(""); }}
                    style={{ padding: "14px 18px", background: "#111827", color: "#94a3b8", border: "1px solid #1e293b", borderRadius: 12, fontSize: 13, fontWeight: 600 }}>← Back</button>
                  <button onClick={handleGenerate} disabled={starting.length !== 9}
                    style={{ flex: 1, padding: 14, background: starting.length === 9 ? "linear-gradient(135deg,#22c55e,#16a34a)" : "#111827", color: starting.length === 9 ? "#0a0f1e" : "#334155", border: starting.length === 9 ? "none" : "1px solid #1e293b", borderRadius: 12, fontSize: 15, fontWeight: 700, opacity: starting.length === 9 ? 1 : 0.6 }}>
                    ⚡ Generate Plan
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {/* ══════════ PLAN ══════════ */}
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
                      style={{ flex: 1, padding: "10px 4px", borderRadius: 9, fontSize: 13, fontWeight: 600, border: "none", background: planView === k ? "#22c55e" : "transparent", color: planView === k ? "#0a0f1e" : "#475569" }}>
                      {l}
                    </button>
                  ))}
                </div>

                {fairnessWarning && (
                  <div style={{ background: "#111827", border: "1px solid #f59e0b", borderRadius: 10, padding: "8px 12px", marginBottom: 10, fontSize: 11, color: "#fbbf24" }}>
                    ⚠️ Field player fairness: {fairnessWarning} — exceeds 150% cap (GKs excluded)
                  </div>
                )}

                {/* SUB PLAN */}
                {planView === "subs" && (
                  <>
                    <div style={{ display: "flex", gap: 4, marginBottom: 12, overflowX: "auto", WebkitOverflowScrolling: "touch", paddingBottom: 4 }}>
                      {PERIODS.map((per, i) => {
                        const isHT = i === 3;
                        return (
                          <button key={i} onClick={() => { setPlanPeriod(i); setRemovingPlayerId(null); }}
                            style={{ flexShrink: 0, padding: "9px 13px", borderRadius: 10, textAlign: "center", border: "none",
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
                        🟢 <strong>Kick-off</strong> — starting lineup
                      </div>
                    )}

                    {planPeriod > 0 && (() => {
                      const s = getSubs(planPeriod);
                      const ht = planPeriod === 3;
                      return s.in.length > 0 ? (
                        <div style={{ background: "#111827", border: `1px solid ${ht ? "#f59e0b" : "#1d4ed8"}`, borderRadius: 14, padding: 14, marginBottom: 10 }}>
                          <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 900, fontSize: 15, color: ht ? "#fbbf24" : "#60a5fa", marginBottom: 12, letterSpacing: 0.5, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <span>{ht ? "🔁 HALFTIME CHANGES" : `🔄 SUBS AT MIN ${planPeriod * 10}`}</span>
                            <span style={{ fontSize: 12, color: "#475569", fontWeight: 600, fontFamily: "'Outfit',sans-serif" }}>{s.in.length} change{s.in.length !== 1 ? "s" : ""}{!ht && " (max 4)"}</span>
                          </div>
                          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                            <div>
                              <div style={{ fontSize: 10, color: "#ef4444", fontWeight: 700, letterSpacing: 1, marginBottom: 8 }}>OFF ▼</div>
                              {s.out.map(id => { const p = gp(id); if (!p) return null; return (
                                <div key={id} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                                  <span style={{ fontSize: 10, fontWeight: 800, padding: "2px 6px", borderRadius: 4, background: CL[p.class].bg, color: CL[p.class].text, border: `1px solid ${CL[p.class].border}`, fontFamily: "'Barlow Condensed',sans-serif" }}>{p.class}</span>
                                  <span style={{ fontSize: 13, color: "#fca5a5", fontWeight: 500 }}>{p.name}</span>
                                </div>
                              ); })}
                            </div>
                            <div>
                              <div style={{ fontSize: 10, color: "#22c55e", fontWeight: 700, letterSpacing: 1, marginBottom: 8 }}>ON ▲</div>
                              {s.in.map(id => { const p = gp(id); if (!p) return null; return (
                                <div key={id} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                                  <span style={{ fontSize: 10, fontWeight: 800, padding: "2px 6px", borderRadius: 4, background: CL[p.class].bg, color: CL[p.class].text, border: `1px solid ${CL[p.class].border}`, fontFamily: "'Barlow Condensed',sans-serif" }}>{p.class}</span>
                                  <span style={{ fontSize: 13, color: "#86efac", fontWeight: 500 }}>{p.name}</span>
                                </div>
                              ); })}
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div style={{ background: "#111827", border: "1px solid #1e293b", borderRadius: 12, padding: "10px 14px", marginBottom: 10, fontSize: 12, color: "#475569" }}>
                          No subs this period
                        </div>
                      );
                    })()}

                    {/* ON FIELD */}
                    <div style={{ background: "#111827", border: "1px solid #1e293b", borderRadius: 14, padding: 14, marginBottom: 10 }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: "#475569", letterSpacing: 1.5, marginBottom: 10, fontFamily: "'Barlow Condensed',sans-serif" }}>ON FIELD — {rotation[planPeriod].onField.length}</div>
                      {rotation[planPeriod].onField.map(id => {
                        const p = gp(id); if (!p) return null;
                        const isGK = id === rotation[planPeriod].gkId;
                        const m = minsSummary?.[id] ?? 0;
                        const removed = isRemoved(id);
                        const showPicker = removingPlayerId === id;
                        return (
                          <div key={id}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 10px", marginBottom: showPicker ? 0 : 3, borderRadius: showPicker ? "9px 9px 0 0" : 9, background: isGK ? "#161a0e" : "#0a0f1e", border: `1px solid ${isGK ? "#f59e0b22" : "#1e293b"}` }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 7, flex: 1 }}>
                                <span style={{ fontSize: 10, fontWeight: 800, padding: "2px 6px", borderRadius: 4, background: CL[p.class].bg, color: CL[p.class].text, border: `1px solid ${CL[p.class].border}`, fontFamily: "'Barlow Condensed',sans-serif" }}>{p.class}</span>
                                {isGK && <span style={{ fontSize: 9, background: "#fef3c7", padding: "1px 5px", borderRadius: 4, color: "#92400e", fontWeight: 700 }}>GK</span>}
                                <span style={{ color: "#e2e8f0", fontSize: 14, fontWeight: isGK ? 600 : 400 }}>{p.name}</span>
                              </div>
                              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                <span style={{ fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 700, fontSize: 16, color: m >= 50 ? "#4ade80" : m >= 40 ? "#fbbf24" : "#94a3b8" }}>{m}m</span>
                                {!removed && (
                                  <button onClick={(e) => { e.stopPropagation(); setRemovingPlayerId(showPicker ? null : id); }}
                                    style={{ background: showPicker ? "#7f1d1d" : "#1c1017", border: "1px solid #7f1d1d", borderRadius: 6, color: "#f87171", fontSize: 10, fontWeight: 700, padding: "4px 8px", minWidth: 32, minHeight: 32, display: "flex", alignItems: "center", justifyContent: "center" }}>
                                    {showPicker ? "✕" : "OUT"}
                                  </button>
                                )}
                              </div>
                            </div>
                            {showPicker && (
                              <div style={{ background: "#1c1017", border: "1px solid #7f1d1d", borderTop: "none", borderRadius: "0 0 9px 9px", padding: "8px 10px", marginBottom: 3 }}>
                                <div style={{ fontSize: 10, color: "#f87171", fontWeight: 700, marginBottom: 6 }}>Out from which period?</div>
                                <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                                  {PERIODS.map((per, i) => (
                                    <button key={i} onClick={() => addRemoval(id, i)}
                                      style={{ padding: "6px 12px", borderRadius: 6, fontSize: 12, fontWeight: 700, border: "1px solid #7f1d1d", background: "#0a0f1e", color: "#fca5a5" }}>
                                      {per.label}
                                    </button>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>

                    {/* BENCH */}
                    {rotation[planPeriod].bench.length > 0 && (
                      <div style={{ background: "#111827", border: "1px solid #1e293b", borderRadius: 14, padding: 14, marginBottom: 10 }}>
                        <div style={{ fontSize: 10, fontWeight: 700, color: "#475569", letterSpacing: 1.5, marginBottom: 10, fontFamily: "'Barlow Condensed',sans-serif" }}>BENCH — {rotation[planPeriod].bench.length}</div>
                        {rotation[planPeriod].bench.map(id => {
                          const p = gp(id); if (!p) return null;
                          const removed = isRemoved(id);
                          const showPicker = removingPlayerId === id;
                          return (
                            <div key={id} style={{ marginBottom: 4 }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                                <span style={{ fontSize: 12, fontWeight: 600, padding: "5px 11px", borderRadius: 20, background: CL[p.class].bg, color: CL[p.class].text, border: `1px solid ${CL[p.class].border}` }}>
                                  {p.isGK && "🥅 "}{p.name}
                                </span>
                                {!removed && (
                                  <button onClick={() => setRemovingPlayerId(showPicker ? null : id)}
                                    style={{ background: showPicker ? "#7f1d1d" : "#1c1017", border: "1px solid #7f1d1d", borderRadius: 6, color: "#f87171", fontSize: 9, fontWeight: 700, padding: "3px 6px", minWidth: 28, minHeight: 28, display: "flex", alignItems: "center", justifyContent: "center" }}>
                                    {showPicker ? "✕" : "OUT"}
                                  </button>
                                )}
                              </div>
                              {showPicker && (
                                <div style={{ background: "#1c1017", border: "1px solid #7f1d1d", borderRadius: 8, padding: "8px 10px", marginTop: 4 }}>
                                  <div style={{ fontSize: 10, color: "#f87171", fontWeight: 700, marginBottom: 6 }}>Out from which period?</div>
                                  <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                                    {PERIODS.map((per, i) => (
                                      <button key={i} onClick={() => addRemoval(id, i)}
                                        style={{ padding: "6px 12px", borderRadius: 6, fontSize: 12, fontWeight: 700, border: "1px solid #7f1d1d", background: "#0a0f1e", color: "#fca5a5" }}>
                                        {per.label}
                                      </button>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* REMOVED PLAYERS */}
                    {removals.length > 0 && (
                      <div style={{ background: "#111827", border: "1px solid #7f1d1d", borderRadius: 14, padding: 14 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                          <div style={{ fontSize: 10, fontWeight: 700, color: "#f87171", letterSpacing: 1.5, fontFamily: "'Barlow Condensed',sans-serif" }}>REMOVED — {removals.length}</div>
                          <button onClick={() => { setRemovals([]); if (gameConfig) regenRotation(gameConfig, []); }}
                            style={{ background: "none", border: "1px solid #334155", borderRadius: 6, color: "#94a3b8", fontSize: 10, fontWeight: 600, padding: "4px 10px" }}>
                            Reset All
                          </button>
                        </div>
                        {removals.map(r => {
                          const p = gp(r.id);
                          if (!p) return null;
                          return (
                            <div key={r.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0", borderBottom: "1px solid #0a0f1e" }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                <span style={{ fontSize: 10, fontWeight: 800, padding: "2px 6px", borderRadius: 4, background: CL[p.class].bg, color: CL[p.class].text, border: `1px solid ${CL[p.class].border}`, fontFamily: "'Barlow Condensed',sans-serif" }}>{p.class}</span>
                                <span style={{ fontSize: 13, color: "#f87171", fontWeight: 500, textDecoration: "line-through" }}>{p.name}</span>
                                <span style={{ fontSize: 10, color: "#475569" }}>out from P{r.fromPeriod + 1}</span>
                              </div>
                              <button onClick={() => undoRemoval(r.id)}
                                style={{ background: "none", border: "1px solid #334155", borderRadius: 6, color: "#94a3b8", fontSize: 10, fontWeight: 600, padding: "4px 10px", minHeight: 32, display: "flex", alignItems: "center" }}>
                                Undo
                              </button>
                            </div>
                          );
                        })}
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
                      .sort((a, b) => {
                        const ma = minsSummary?.[a.id] ?? 0, mb = minsSummary?.[b.id] ?? 0;
                        if (mb !== ma) return mb - ma;
                        return CLASS_RANK[a.class] - CLASS_RANK[b.class];
                      })
                      .map(p => {
                        const m = minsSummary?.[p.id] ?? 0;
                        const removed = isRemoved(p.id);
                        const isDesignatedGK = gameConfig && (p.id === gameConfig.gkH1Id || p.id === gameConfig.gkH2Id);
                        return (
                          <div key={p.id} style={{ marginBottom: 14, opacity: removed ? 0.5 : 1 }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 5 }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                                <span style={{ fontSize: 10, fontWeight: 800, padding: "2px 6px", borderRadius: 4, background: CL[p.class].bg, color: CL[p.class].text, border: `1px solid ${CL[p.class].border}`, fontFamily: "'Barlow Condensed',sans-serif" }}>{p.class}</span>
                                {isDesignatedGK && <span style={{ fontSize: 9, background: "#fef3c7", padding: "1px 4px", borderRadius: 3, color: "#92400e", fontWeight: 700 }}>GK</span>}
                                <span style={{ fontSize: 14, color: "#e2e8f0", fontWeight: 500, textDecoration: removed ? "line-through" : "none" }}>{p.name}</span>
                                {removed && <span style={{ fontSize: 9, color: "#f87171" }}>removed</span>}
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
                                  <div key={pi} style={{ flex: 1, height: 20, borderRadius: 4, background: on ? (isGK ? "#f59e0b" : "#166534") : "#0a0f1e", display: "flex", alignItems: "center", justifyContent: "center", border: `1px solid ${on ? (isGK ? "#f59e0b66" : "#22c55e44") : "#1e293b"}` }}>
                                    {on && <span style={{ fontSize: 8, fontWeight: 900, color: isGK ? "#78350f" : "#4ade80" }}>{isGK ? "G" : "▶"}</span>}
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
