import { useState, useEffect, useCallback, useRef } from "react";

const ROUNDS = ["Round of 64", "Round of 32", "Sweet 16", "Elite 8", "Final Four", "Championship"];

const DEFAULT_BETS = [
  { id: 1, round: "Round of 64", pick: "TCU ML",                           betType: "Moneyline", odds:  125, stake: 150, status: "pending" },
  { id: 2, round: "Round of 64", pick: "Troy +13",                         betType: "Spread",    odds: -110, stake: 150, status: "pending" },
  { id: 3, round: "Round of 64", pick: "Louisville -4.5",                  betType: "Spread",    odds: -110, stake: 150, status: "pending" },
  { id: 4, round: "Round of 64", pick: "Wisconsin / High Point Under 162", betType: "Total",     odds: -110, stake: 150, status: "pending" },
  { id: 5, round: "Round of 64", pick: "North Dakota State +16",           betType: "Spread",    odds: -110, stake: 150, status: "pending" },
  { id: 6, round: "Round of 64", pick: "Vanderbilt -12",                   betType: "Spread",    odds: -110, stake: 150, status: "pending" },
  { id: 7, round: "Round of 64", pick: "Siena Over 138.5",                 betType: "Total",     odds: -110, stake: 150, status: "pending" },
  { id: 8, round: "Round of 64", pick: "Hawaii / Arkansas Over 158.5",     betType: "Total",     odds: -110, stake: 150, status: "pending" },
];

const STORAGE_KEY = "gfa-bets-v4";

function loadBets() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : DEFAULT_BETS;
  } catch { return DEFAULT_BETS; }
}
function saveBets(bets) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(bets)); } catch (_) {}
}

function getScoreboardUrl() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `/api/scoreboard?dates=${y}${m}${d}`;
}

function calcWin(odds, stake) {
  if (odds >= 0) return parseFloat(((odds / 100) * stake).toFixed(2));
  return parseFloat(((100 / Math.abs(odds)) * stake).toFixed(2));
}
function fmtOdds(odds) { return odds >= 0 ? `+${odds}` : `${odds}`; }
function fmtTime(isoStr) {
  if (!isoStr) return "";
  try { return new Date(isoStr).toLocaleTimeString([], { hour: "numeric", minute: "2-digit", timeZoneName: "short" }); }
  catch { return ""; }
}

function extractTeamPhrases(pick) {
  return pick.split("/").map(p =>
    p
      .replace(/[+-][\d.]+/g, "")
      .replace(/\b(ML|moneyline|over|under|spread|total)\b/gi, "")
      .replace(/\b\d+(\.\d+)?\b/g, "")
      .trim()
      .toLowerCase()
  ).filter(p => p.replace(/\s/g, "").length >= 3);
}

function gameMatchesBets(event, bets) {
  const comps = event.competitions?.[0]?.competitors || [];
  const espnNames = comps.flatMap(c => [
    c.team?.name, c.team?.shortDisplayName,
    c.team?.abbreviation, c.team?.displayName, c.team?.nickname,
  ]).filter(Boolean).map(n => n.toLowerCase().trim());
  return bets.some(bet => {
    const phrases = extractTeamPhrases(bet.pick);
    return phrases.some(phrase =>
      phrase.length >= 4 &&
      espnNames.some(name => name.includes(phrase) || phrase.includes(name))
    );
  });
}

function getBetsForGame(event, bets) {
  const comps = event.competitions?.[0]?.competitors || [];
  const espnNames = comps.flatMap(c => [
    c.team?.name, c.team?.shortDisplayName,
    c.team?.abbreviation, c.team?.displayName, c.team?.nickname,
  ]).filter(Boolean).map(n => n.toLowerCase().trim());
  return bets.filter(bet => {
    const phrases = extractTeamPhrases(bet.pick);
    return phrases.some(phrase =>
      phrase.length >= 4 &&
      espnNames.some(name => name.includes(phrase) || phrase.includes(name))
    );
  });
}

function betLabel(bet) {
  const p = bet.pick;
  if (bet.betType === "Total") {
    const m = p.match(/\b(over|under)\s*([\d.]+)/i);
    if (m) return `Betting ${m[1].toUpperCase()} ${m[2]}`;
    return p;
  }
  if (bet.betType === "Moneyline") {
    const phrases = extractTeamPhrases(p);
    const team = phrases[0] ? phrases[0].split(" ").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ") : p;
    return `${team} ML ${fmtOdds(bet.odds)}`;
  }
  if (bet.betType === "Spread") {
    const m = p.match(/([+-][\d.]+)/);
    const phrases = extractTeamPhrases(p);
    const team = phrases[0] ? phrases[0].split(" ").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ") : p;
    return `${team} ${m ? m[1] : ""}`;
  }
  return p;
}

function gradeBet(bet, event) {
  if (event.status?.type?.state !== "post") return null;
  if (bet.status !== "pending") return null;
  const comps = event.competitions?.[0]?.competitors || [];
  const home  = comps.find(c => c.homeAway === "home");
  const away  = comps.find(c => c.homeAway === "away");
  if (!home || !away) return null;
  const hScore = parseInt(home.score ?? 0);
  const aScore = parseInt(away.score ?? 0);
  const combined = hScore + aScore;
  const homeNames = [home.team?.name, home.team?.shortDisplayName, home.team?.abbreviation].filter(Boolean).map(n => n.toLowerCase());
  const awayNames = [away.team?.name, away.team?.shortDisplayName, away.team?.abbreviation].filter(Boolean).map(n => n.toLowerCase());

  if (bet.betType === "Total") {
    const m = bet.pick.match(/\b(over|under)\s*([\d.]+)/i);
    if (!m) return null;
    const isOver = m[1].toLowerCase() === "over";
    const line   = parseFloat(m[2]);
    if (combined === line) return "push";
    return (isOver ? combined > line : combined < line) ? "won" : "lost";
  }
  if (bet.betType === "Spread") {
    const spreadM = bet.pick.match(/([+-][\d.]+)/);
    if (!spreadM) return null;
    const spread  = parseFloat(spreadM[1]);
    const phrases = extractTeamPhrases(bet.pick);
    const phrase  = phrases[0];
    if (!phrase || phrase.length < 4) return null;
    let betScore, oppScore;
    if (homeNames.some(n => n.includes(phrase) || phrase.includes(n))) { betScore = hScore; oppScore = aScore; }
    else if (awayNames.some(n => n.includes(phrase) || phrase.includes(n))) { betScore = aScore; oppScore = hScore; }
    else return null;
    const margin = betScore + spread - oppScore;
    if (margin === 0) return "push";
    return margin > 0 ? "won" : "lost";
  }
  if (bet.betType === "Moneyline") {
    const phrases = extractTeamPhrases(bet.pick);
    const phrase  = phrases[0];
    if (!phrase || phrase.length < 4) return null;
    if (homeNames.some(n => n.includes(phrase) || phrase.includes(n))) {
      if (hScore === aScore) return "push";
      return hScore > aScore ? "won" : "lost";
    }
    if (awayNames.some(n => n.includes(phrase) || phrase.includes(n))) {
      if (hScore === aScore) return "push";
      return aScore > hScore ? "won" : "lost";
    }
    return null;
  }
  return null;
}

// ── Parse bet slip image via Claude API ───────────────────────────────────
async function parseBetSlip(base64Image, mediaType) {
  const systemPrompt = `You are a sports betting slip parser. The user will show you a photo of a betting slip or screenshot from a sportsbook app.
Extract ALL individual bets from the slip and return ONLY a JSON array — no markdown, no explanation, just the raw JSON array.

Each bet object must have exactly these fields:
{
  "pick": "human readable pick description e.g. 'Duke -3.5' or 'Kentucky ML' or 'Duke / Kentucky Over 145.5'",
  "betType": one of exactly: "Spread" | "Moneyline" | "Total" | "Parlay" | "Prop" | "Futures",
  "odds": integer e.g. -110 or 125,
  "stake": number (the amount wagered in dollars, default 150 if not visible),
  "round": "Round of 64"
}

Rules:
- For spread bets include the team name and spread in pick e.g. "Duke -3.5"
- For totals include both teams and over/under e.g. "Duke / Kentucky Over 145.5"  
- For moneyline include team name and ML e.g. "Kentucky ML"
- odds must be a signed integer like -110 or +125, never a decimal
- If you cannot read the odds clearly use -110 as default
- stake should be the dollar amount wagered — if not visible use 150
- Return ONLY the JSON array, nothing else`;

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-5",
      max_tokens: 1000,
      system: systemPrompt,
      messages: [{
        role: "user",
        content: [
          {
            type: "image",
            source: { type: "base64", media_type: mediaType, data: base64Image }
          },
          { type: "text", text: "Parse all bets from this betting slip and return the JSON array only." }
        ]
      }]
    })
  });

  if (!response.ok) throw new Error(`API error ${response.status}`);
  const data = await response.json();
  const text = data.content?.[0]?.text || "";
  const clean = text.replace(/```json|```/g, "").trim();
  const parsed = JSON.parse(clean);
  if (!Array.isArray(parsed)) throw new Error("Expected array from API");
  return parsed;
}

// ── Convert file to base64 ────────────────────────────────────────────────
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = () => resolve(reader.result.split(",")[1]);
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// CSS
// ═══════════════════════════════════════════════════════════════════════════
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Mono:wght@400;500&family=Barlow+Condensed:wght@400;600;700&display=swap');

:root {
  --blue:        #003087;
  --blue-dark:   #00204a;
  --blue-mid:    #003580;
  --blue-light:  #2060c0;
  --accent:      #7ab3ff;
  --accent2:     #99c8ff;
  --bg:          #06101e;
  --bg2:         #0d1f3c;
  --bg3:         #0a1830;
  --border:      #1a3260;
  --border2:     #2a4a88;
  --white:       #f0f4ff;
  --text:        #d8e4ff;
  --dim:         #7a9acc;
  --dimmer:      #4a6a99;
  --win:         #2ecc71;
  --lose:        #e74c3c;
  --push:        #f39c12;
  --live-col:    #e74c3c;
  --focus:       #ffd700;
  --focus-glow:  rgba(255,215,0,0.2);
  --focus-bg:    rgba(255,215,0,0.07);
}

*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

.app { min-height: 100vh; background: var(--bg); color: var(--text); font-family: 'Barlow Condensed', sans-serif; font-weight: 400; }

/* HEADER */
.hdr { background: linear-gradient(160deg, #001233 0%, #002080 45%, #001233 100%); border-bottom: 3px solid var(--blue-light); padding: 22px 16px 18px; text-align: center; position: relative; overflow: hidden; }
.hdr-glow { position: absolute; inset: 0; pointer-events: none; background: radial-gradient(ellipse 70% 90% at 50% 130%, rgba(26,79,168,.5) 0%, transparent 70%), radial-gradient(ellipse 50% 30% at 15% 60%, rgba(91,141,239,.08) 0%, transparent 60%), radial-gradient(ellipse 50% 30% at 85% 60%, rgba(91,141,239,.08) 0%, transparent 60%); }
.hdr-dots { position: absolute; top: 0; left: 0; right: 0; display: flex; justify-content: space-between; padding: 9px 16px; font-size: 8px; color: rgba(91,141,239,.25); letter-spacing: 9px; font-family: 'DM Mono', monospace; }
.crown { font-size: 28px; line-height: 1; margin-bottom: 5px; filter: drop-shadow(0 0 14px rgba(91,141,239,.6)); }
.title { font-family: 'Bebas Neue', sans-serif; font-size: 54px; letter-spacing: 6px; color: var(--white); line-height: 1; text-shadow: 0 0 40px rgba(91,141,239,.35), 0 2px 0 rgba(0,0,0,.6); }
.title-badge { display: inline-block; margin-top: 6px; font-family: 'DM Mono', monospace; font-size: 8px; letter-spacing: 5px; color: var(--accent); text-transform: uppercase; }
.title-sub { font-family: 'DM Mono', monospace; font-size: 8px; letter-spacing: 3px; color: var(--dim); margin-top: 3px; text-transform: uppercase; }

/* TABS */
.tabs { display: flex; background: var(--blue-dark); border-bottom: 2px solid var(--border2); }
.tab { flex: 1; padding: 14px 10px; background: none; border: none; color: var(--dim); font-family: 'Bebas Neue', sans-serif; font-size: 18px; letter-spacing: 2px; cursor: pointer; transition: all .2s; border-bottom: 3px solid transparent; margin-bottom: -2px; }
.tab.active { color: var(--white); border-bottom-color: var(--white); background: rgba(255,255,255,.05); }
.tab:hover:not(.active) { color: var(--accent); background: rgba(91,141,239,.06); }

.content { padding: 16px 14px; max-width: 780px; margin: 0 auto; }

/* REFRESH BAR */
.rbar { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; padding: 8px 12px; background: var(--bg2); border: 1px solid var(--border2); border-radius: 7px; gap: 8px; }
.rbar-left { display: flex; flex-direction: column; gap: 2px; }
.rbar-info { font-family: 'DM Mono', monospace; font-size: 9px; color: var(--dim); letter-spacing: 1px; }
.rbar-url  { font-family: 'DM Mono', monospace; font-size: 8px; color: var(--dimmer); letter-spacing: .5px; opacity: .7; word-break: break-all; }
.rbar-right { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }
.rbar-cd  { font-family: 'DM Mono', monospace; font-size: 9px; color: var(--accent); letter-spacing: 1px; white-space: nowrap; }
.rbar-btn { background: none; border: 1px solid var(--border2); color: var(--accent); cursor: pointer; font-family: 'DM Mono', monospace; font-size: 9px; padding: 4px 12px; border-radius: 4px; letter-spacing: 1px; transition: all .15s; white-space: nowrap; }
.rbar-btn:hover { background: var(--blue); color: var(--white); }

/* BANNERS */
.auto-banner { display: flex; align-items: center; gap: 8px; margin-bottom: 12px; padding: 8px 14px; background: rgba(46,204,113,0.08); border: 1px solid rgba(46,204,113,0.3); border-radius: 7px; font-family: 'DM Mono', monospace; font-size: 10px; color: #2ecc71; letter-spacing: 1px; }
.focus-legend { display: flex; align-items: center; gap: 8px; margin-bottom: 12px; padding: 7px 12px; background: var(--focus-bg); border: 1px solid rgba(255,215,0,.22); border-radius: 7px; }
.focus-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--focus); flex-shrink: 0; box-shadow: 0 0 6px var(--focus); }
.focus-txt { font-family: 'DM Mono', monospace; font-size: 9px; color: rgba(255,215,0,.8); letter-spacing: 1.5px; text-transform: uppercase; }
.api-warn { margin-bottom: 12px; padding: 10px 14px; background: rgba(231,76,60,.07); border: 1px solid rgba(231,76,60,.3); border-radius: 7px; font-family: 'DM Mono', monospace; font-size: 10px; color: rgba(231,76,60,.9); letter-spacing: .5px; line-height: 1.5; }

/* SECTION LABELS */
.sec-lbl { font-family: 'DM Mono', monospace; font-size: 8px; color: var(--accent); letter-spacing: 4px; text-transform: uppercase; margin: 16px 0 8px; padding-bottom: 5px; border-bottom: 1px solid var(--border2); }

/* SCORE CARDS */
.sc { background: #0d1f3c; border: 1px solid var(--border2); border-radius: 10px; padding: 12px 15px; margin-bottom: 8px; position: relative; overflow: hidden; transition: border-color .2s, box-shadow .2s; }
.sc:hover { border-color: var(--accent); }
.sc.live  { border-color: var(--live-col); box-shadow: 0 0 18px rgba(231,76,60,.14); }
.sc.live::before { content: ''; position: absolute; left: 0; top: 0; bottom: 0; width: 3px; background: var(--live-col); }
.sc.focus { border-color: var(--focus) !important; box-shadow: 0 0 24px var(--focus-glow) !important; background: var(--focus-bg) !important; }
.sc.focus::before { background: var(--focus) !important; }
.live-badge { position: absolute; top: 0; right: 0; background: var(--live-col); color: #fff; font-family: 'DM Mono', monospace; font-size: 8px; font-weight: 500; padding: 3px 10px; border-bottom-left-radius: 8px; letter-spacing: 2px; animation: lpulse 1.5s ease-in-out infinite; }
@keyframes lpulse { 0%,100%{opacity:1} 50%{opacity:.6} }
.focus-badge { position: absolute; top: 0; right: 0; background: var(--focus); color: #000; font-family: 'DM Mono', monospace; font-size: 8px; font-weight: 700; padding: 3px 10px; border-bottom-left-radius: 8px; letter-spacing: 1.5px; }
.dual-badge { position: absolute; top: 0; right: 0; display: flex; }
.dual-badge .live-badge  { position: static; border-radius: 0; }
.dual-badge .focus-badge { position: static; border-bottom-left-radius: 8px; border-radius: 0 0 0 8px; }
.sc-row { display: flex; align-items: center; padding: 4px 0; }
.seed { font-family: 'DM Mono', monospace; font-size: 9px; color: var(--dim); min-width: 20px; margin-right: 6px; font-weight: 500; }
.sc-team { font-size: 15px; font-weight: 700; flex: 1; letter-spacing: .3px; color: var(--white); }
.sc-rec  { font-size: 10px; color: var(--dim); font-family: 'DM Mono', monospace; margin-left: 6px; font-weight: 400; }
.sc-score { font-family: 'Bebas Neue', sans-serif; font-size: 30px; min-width: 44px; text-align: right; line-height: 1; }
.sc-score.hi   { color: var(--white); }
.sc-score.lo   { color: var(--dimmer); }
.sc-score.tied { color: var(--accent); }
.sc-time { font-family: 'Bebas Neue', sans-serif; font-size: 18px; color: var(--accent); min-width: 80px; text-align: right; line-height: 1; white-space: nowrap; }
.sc-time.ft { color: var(--focus); }
.sc-div { border: none; border-top: 1px solid var(--border2); margin: 5px 0; }
.sc-foot { display: flex; justify-content: space-between; align-items: flex-start; margin-top: 6px; gap: 8px; flex-wrap: wrap; }
.sc-badge { font-family: 'DM Mono', monospace; font-size: 9px; color: var(--dim); letter-spacing: 1px; }
.sc-badge.live { color: var(--live-col); }
.sc-badge.focus-c { color: var(--focus); }
.sc-net { font-family: 'DM Mono', monospace; font-size: 9px; color: var(--dimmer); }
.sc-bet-labels { display: flex; flex-direction: column; gap: 3px; align-items: flex-end; flex-shrink: 0; }
.sc-bet-label { font-family: 'DM Mono', monospace; font-size: 9px; font-weight: 500; padding: 2px 8px; border-radius: 4px; letter-spacing: .5px; background: rgba(255,215,0,0.12); color: var(--focus); border: 1px solid rgba(255,215,0,0.25); white-space: nowrap; }
.sc-bet-label.won  { background: rgba(46,204,113,0.12);  color: var(--win);  border-color: rgba(46,204,113,0.3); }
.sc-bet-label.lost { background: rgba(231,76,60,0.12);   color: var(--lose); border-color: rgba(231,76,60,0.3); }
.sc-bet-label.push { background: rgba(243,156,18,0.12);  color: var(--push); border-color: rgba(243,156,18,0.3); }
.sc-total-line { font-family: 'DM Mono', monospace; font-size: 9px; color: var(--dim); margin-top: 2px; text-align: center; }
.no-games { text-align: center; padding: 50px 20px; font-family: 'DM Mono', monospace; font-size: 11px; color: var(--dimmer); letter-spacing: 2px; line-height: 2; }

/* STATS */
.stats { display: grid; grid-template-columns: repeat(4,1fr); gap: 8px; margin-bottom: 20px; }
.s-card { background: #0d1f3c; border: 1px solid var(--border2); border-radius: 9px; padding: 12px 10px; text-align: center; position: relative; overflow: hidden; }
.s-card::after { content: ''; position: absolute; bottom: 0; left: 0; right: 0; height: 2px; background: var(--blue-light); opacity: .5; }
.s-lbl { font-family: 'DM Mono', monospace; font-size: 7px; color: var(--dim); letter-spacing: 2px; text-transform: uppercase; margin-bottom: 4px; }
.s-val { font-family: 'Bebas Neue', sans-serif; font-size: 32px; line-height: 1; color: var(--white); }
.s-val.g  { color: var(--win); }
.s-val.r  { color: var(--lose); }
.s-val.bl { color: var(--accent); }

/* BET CARDS */
.bc-auto { font-family: 'DM Mono', monospace; font-size: 7px; color: var(--accent); letter-spacing: 1px; margin-top: 2px; }
.rnd-hdr { font-family: 'Bebas Neue', sans-serif; font-size: 20px; letter-spacing: 3px; color: var(--accent2); padding: 6px 0 5px; margin: 20px 0 5px; border-bottom: 2px solid var(--blue-mid); display: flex; align-items: center; justify-content: space-between; }
.rnd-pnl { font-family: 'DM Mono', monospace; font-size: 11px; font-weight: 500; }
.rnd-pnl.g { color: var(--win); }
.rnd-pnl.r { color: var(--lose); }
.rnd-pnl.n { color: var(--dim); }
.rnd-rec { font-family: 'DM Mono', monospace; font-size: 8px; color: var(--dim); letter-spacing: 1px; margin-bottom: 10px; }
.bc { background: #0d1f3c; border: 1px solid var(--border2); border-radius: 9px; padding: 11px 13px; margin-bottom: 7px; display: flex; align-items: center; gap: 10px; transition: border-color .15s, background .15s; }
.bc.won  { border-color: rgba(46,204,113,.5);  background: rgba(46,204,113,.05); }
.bc.lost { border-color: rgba(231,76,60,.5);   background: rgba(231,76,60,.05); }
.bc.push { border-color: rgba(243,156,18,.5);  background: rgba(243,156,18,.05); }
.bc-stripe { width: 3px; align-self: stretch; border-radius: 2px; flex-shrink: 0; background: var(--border2); }
.bc.won  .bc-stripe { background: var(--win); }
.bc.lost .bc-stripe { background: var(--lose); }
.bc.push .bc-stripe { background: var(--push); }
.bc-info { flex: 1; min-width: 0; }
.bc-pick { font-weight: 700; font-size: 14px; letter-spacing: .3px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: var(--white); }
.bc-meta { font-family: 'DM Mono', monospace; font-size: 10px; color: var(--dim); margin-top: 2px; }
.bc-payout { font-family: 'DM Mono', monospace; font-size: 11px; white-space: nowrap; min-width: 82px; text-align: right; font-weight: 500; }
.bc-payout.won     { color: var(--win); }
.bc-payout.lost    { color: var(--lose); }
.bc-payout.push    { color: var(--push); }
.bc-payout.pending { color: var(--dimmer); }
.sbts { display: flex; gap: 3px; flex-shrink: 0; }
.sbt { padding: 4px 9px; border-radius: 5px; border: 1px solid; font-family: 'DM Mono', monospace; font-size: 9px; font-weight: 500; cursor: pointer; transition: all .13s; background: transparent; }
.sbt.w { border-color: var(--win);  color: var(--win); }  .sbt.w.on, .sbt.w:hover { background: var(--win);  color: #000; }
.sbt.l { border-color: var(--lose); color: var(--lose); } .sbt.l.on, .sbt.l:hover { background: var(--lose); color: #fff; }
.sbt.p { border-color: var(--push); color: var(--push); } .sbt.p.on, .sbt.p:hover { background: var(--push); color: #000; }
.del { background: none; border: none; color: var(--dimmer); cursor: pointer; font-size: 14px; padding: 2px 4px; transition: color .13s; flex-shrink: 0; }
.del:hover { color: var(--lose); }

/* ADD BET BUTTONS ROW */
.add-row { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 12px; }
.add-btn {
  padding: 13px; background: transparent; border: 1px dashed var(--border2); border-radius: 9px;
  color: var(--accent); font-family: 'Bebas Neue', sans-serif; font-size: 15px;
  letter-spacing: 2px; cursor: pointer; transition: all .2s; display: flex;
  align-items: center; justify-content: center; gap: 6px;
}
.add-btn:hover { border-color: var(--white); color: var(--white); background: rgba(255,255,255,.04); }
.add-btn.scan { border-color: rgba(255,215,0,.35); color: var(--focus); }
.add-btn.scan:hover { border-color: var(--focus); background: rgba(255,215,0,.05); }

/* ── BET SLIP SCAN MODAL ── */
.slip-modal { background: var(--bg2); border: 1px solid var(--focus); border-radius: 14px; padding: 24px; width: 100%; max-width: 440px; box-shadow: 0 20px 60px rgba(0,0,0,.7), 0 0 40px rgba(255,215,0,.1); }
.slip-title { font-family: 'Bebas Neue', sans-serif; font-size: 22px; letter-spacing: 3px; color: var(--focus); margin-bottom: 4px; }
.slip-sub { font-family: 'DM Mono', monospace; font-size: 9px; color: var(--dim); letter-spacing: 1px; margin-bottom: 18px; }

/* Upload zone */
.upload-zone {
  border: 2px dashed rgba(255,215,0,.3); border-radius: 10px; padding: 28px 16px;
  text-align: center; cursor: pointer; transition: all .2s;
  background: rgba(255,215,0,.03); position: relative;
}
.upload-zone:hover, .upload-zone.drag { border-color: var(--focus); background: rgba(255,215,0,.07); }
.upload-zone input { position: absolute; inset: 0; opacity: 0; cursor: pointer; font-size: 0; }
.upload-icon { font-size: 36px; margin-bottom: 8px; }
.upload-title { font-family: 'Bebas Neue', sans-serif; font-size: 18px; letter-spacing: 2px; color: var(--focus); }
.upload-sub { font-family: 'DM Mono', monospace; font-size: 9px; color: var(--dim); margin-top: 4px; letter-spacing: 1px; }

/* Preview */
.slip-preview { border-radius: 8px; overflow: hidden; margin-bottom: 14px; border: 1px solid rgba(255,215,0,.2); }
.slip-preview img { width: 100%; max-height: 220px; object-fit: contain; background: #000; display: block; }
.slip-preview-actions { display: flex; justify-content: center; padding: 8px; background: rgba(0,0,0,.3); gap: 8px; }
.preview-retake { background: none; border: 1px solid var(--border2); color: var(--dim); font-family: 'DM Mono', monospace; font-size: 9px; padding: 4px 12px; border-radius: 4px; cursor: pointer; letter-spacing: 1px; }
.preview-retake:hover { border-color: var(--accent); color: var(--accent); }

/* Scanning state */
.scanning { text-align: center; padding: 24px 0; }
.scanning-icon { font-size: 32px; animation: spin 1.2s linear infinite; display: inline-block; }
@keyframes spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
.scanning-txt { font-family: 'Bebas Neue', sans-serif; font-size: 18px; letter-spacing: 3px; color: var(--focus); margin-top: 10px; }
.scanning-sub { font-family: 'DM Mono', monospace; font-size: 9px; color: var(--dim); margin-top: 4px; letter-spacing: 1px; }

/* Parsed results */
.parsed-list { display: flex; flex-direction: column; gap: 8px; margin-bottom: 16px; max-height: 280px; overflow-y: auto; }
.parsed-item { background: rgba(255,215,0,.05); border: 1px solid rgba(255,215,0,.2); border-radius: 8px; padding: 10px 12px; display: flex; align-items: center; gap: 10px; }
.parsed-check { width: 18px; height: 18px; border-radius: 4px; background: rgba(46,204,113,.2); border: 1px solid var(--win); display: flex; align-items: center; justify-content: center; flex-shrink: 0; font-size: 11px; cursor: pointer; transition: all .13s; }
.parsed-check.off { background: rgba(231,76,60,.1); border-color: var(--lose); }
.parsed-info { flex: 1; min-width: 0; }
.parsed-pick { font-family: 'Barlow Condensed', sans-serif; font-weight: 700; font-size: 14px; color: var(--white); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.parsed-meta { font-family: 'DM Mono', monospace; font-size: 9px; color: var(--dim); margin-top: 2px; }
.parsed-edit { background: none; border: 1px solid var(--border2); color: var(--dim); font-family: 'DM Mono', monospace; font-size: 8px; padding: 2px 7px; border-radius: 3px; cursor: pointer; flex-shrink: 0; }
.parsed-edit:hover { border-color: var(--accent); color: var(--accent); }

.scan-err { padding: 12px; background: rgba(231,76,60,.08); border: 1px solid rgba(231,76,60,.3); border-radius: 7px; font-family: 'DM Mono', monospace; font-size: 10px; color: rgba(231,76,60,.9); letter-spacing: .5px; margin-bottom: 14px; line-height: 1.5; }

/* MODAL shared */
.ov { position: fixed; inset: 0; background: rgba(0,8,30,.93); display: flex; align-items: center; justify-content: center; z-index: 100; padding: 18px; backdrop-filter: blur(5px); overflow-y: auto; }
.modal { background: var(--bg2); border: 1px solid var(--blue-light); border-radius: 14px; padding: 24px; width: 100%; max-width: 400px; box-shadow: 0 20px 60px rgba(0,0,0,.6), 0 0 50px rgba(0,48,135,.3); }
.m-title { font-family: 'Bebas Neue', sans-serif; font-size: 24px; letter-spacing: 3px; color: var(--white); margin-bottom: 20px; border-bottom: 1px solid var(--border2); padding-bottom: 10px; }
.fg { margin-bottom: 12px; }
.fl { display: block; font-family: 'DM Mono', monospace; font-size: 8px; color: var(--dim); letter-spacing: 2px; text-transform: uppercase; margin-bottom: 5px; }
.fi, .fs { width: 100%; background: var(--bg3); border: 1px solid var(--border2); border-radius: 7px; color: var(--white); padding: 9px 12px; font-family: 'Barlow Condensed', sans-serif; font-size: 14px; font-weight: 600; outline: none; transition: border-color .13s; }
.fi:focus, .fs:focus { border-color: var(--accent); }
.fs option { background: var(--bg2); }
.frow { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.m-btns { display: flex; gap: 8px; margin-top: 16px; }
.bp { flex: 1; padding: 12px; background: var(--blue); color: var(--white); border: none; border-radius: 7px; font-family: 'Bebas Neue', sans-serif; font-size: 16px; letter-spacing: 2px; cursor: pointer; transition: background .13s; }
.bp:hover { background: var(--blue-light); }
.bp.gold { background: var(--focus); color: #000; }
.bp.gold:hover { background: #ffe44d; }
.bs { padding: 12px 20px; background: transparent; color: var(--dim); border: 1px solid var(--border2); border-radius: 7px; font-family: 'Bebas Neue', sans-serif; font-size: 16px; cursor: pointer; transition: all .13s; }
.bs:hover { border-color: var(--accent); color: var(--accent); }

@media (max-width: 480px) {
  .title { font-size: 36px; letter-spacing: 3px; }
  .stats { grid-template-columns: repeat(2, 1fr); }
  .bc { flex-wrap: wrap; }
  .bc-payout { min-width: 60px; font-size: 10px; }
  .add-row { grid-template-columns: 1fr; }
}
`;

// ═══════════════════════════════════════════════════════════════════════════
// SCORE CARD
// ═══════════════════════════════════════════════════════════════════════════
function ScoreCard({ event, matchedBets }) {
  const isFocused  = matchedBets.length > 0;
  const comps      = event.competitions?.[0]?.competitors || [];
  const home       = comps.find(c => c.homeAway === "home");
  const away       = comps.find(c => c.homeAway === "away");
  const state      = event.status?.type?.state;
  const isLive     = state === "in";
  const isFinal    = state === "post";
  const isPre      = state === "pre";
  const statusTxt  = event.status?.type?.shortDetail || "";
  const network    = event.competitions?.[0]?.broadcasts?.[0]?.names?.[0] || "";
  const gameTime   = fmtTime(event.date);
  const hScore     = parseInt(home?.score ?? -1);
  const aScore     = parseInt(away?.score ?? -1);
  const showScores = isLive || isFinal;
  const hClass = !showScores ? "" : hScore > aScore ? "hi" : hScore < aScore ? "lo" : "tied";
  const aClass = !showScores ? "" : aScore > hScore ? "hi" : aScore < hScore ? "lo" : "tied";
  const combined   = showScores ? hScore + aScore : null;

  return (
    <div className={`sc ${isLive ? "live" : ""} ${isFocused ? "focus" : ""}`}>
      {isLive && isFocused  && <div className="dual-badge"><div className="live-badge">● LIVE</div><div className="focus-badge">🔥 YOUR BET</div></div>}
      {isLive && !isFocused && <div className="live-badge">● LIVE</div>}
      {!isLive && isFocused && <div className="focus-badge">🔥 YOUR BET</div>}
      <div className="sc-row">
        <span className="seed">{away?.curatedRank?.current > 0 && away.curatedRank.current < 26 ? away.curatedRank.current : ""}</span>
        <span className="sc-team">{away?.team?.shortDisplayName || away?.team?.name || "Away"}{away?.records?.[0]?.summary && <span className="sc-rec">{away.records[0].summary}</span>}</span>
        {showScores && <span className={`sc-score ${aClass}`}>{away?.score ?? "—"}</span>}
        {isPre      && <span className={`sc-time ${isFocused ? "ft" : ""}`}>{gameTime}</span>}
      </div>
      <hr className="sc-div" />
      <div className="sc-row">
        <span className="seed">{home?.curatedRank?.current > 0 && home.curatedRank.current < 26 ? home.curatedRank.current : ""}</span>
        <span className="sc-team">{home?.team?.shortDisplayName || home?.team?.name || "Home"}{home?.records?.[0]?.summary && <span className="sc-rec">{home.records[0].summary}</span>}</span>
        {showScores && <span className={`sc-score ${hClass}`}>{home?.score ?? "—"}</span>}
        {isPre && <span className="sc-time" />}
      </div>
      <div className="sc-foot">
        <div>
          <span className={`sc-badge ${isLive ? "live" : ""} ${isFocused && !isLive ? "focus-c" : ""}`}>{statusTxt}</span>
          {network && <span className="sc-net" style={{marginLeft:"8px"}}>{network}</span>}
          {combined !== null && isFocused && <div className="sc-total-line">Combined: {combined} pts</div>}
        </div>
        {isFocused && (
          <div className="sc-bet-labels">
            {matchedBets.map(b => <div key={b.id} className={`sc-bet-label ${b.status !== "pending" ? b.status : ""}`}>{betLabel(b)}</div>)}
          </div>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// BET CARD
// ═══════════════════════════════════════════════════════════════════════════
function BetCard({ bet, onStatus, onDelete }) {
  const win = calcWin(bet.odds, bet.stake);
  const payoutLabel =
    bet.status === "won"  ? `+$${win.toFixed(2)}` :
    bet.status === "lost" ? `-$${bet.stake.toFixed(2)}` :
    bet.status === "push" ? "PUSH" :
    `to win $${win.toFixed(2)}`;
  return (
    <div className={`bc ${bet.status !== "pending" ? bet.status : ""}`}>
      <div className="bc-stripe" />
      <div className="bc-info">
        <div className="bc-pick">{bet.pick}</div>
        <div className="bc-meta">{bet.betType} · {fmtOdds(bet.odds)} · ${bet.stake} stake</div>
        {bet.autoGraded && <div className="bc-auto">⚡ auto-graded from final score</div>}
        {bet.fromSlip   && <div className="bc-auto" style={{color:"var(--focus)"}}>📷 added from bet slip scan</div>}
      </div>
      <div className={`bc-payout ${bet.status}`}>{payoutLabel}</div>
      <div className="sbts">
        <button className={`sbt w ${bet.status==="won"  ?"on":""}`} onClick={() => onStatus(bet.id, bet.status==="won"  ?"pending":"won")}>W</button>
        <button className={`sbt l ${bet.status==="lost" ?"on":""}`} onClick={() => onStatus(bet.id, bet.status==="lost" ?"pending":"lost")}>L</button>
        <button className={`sbt p ${bet.status==="push" ?"on":""}`} onClick={() => onStatus(bet.id, bet.status==="push" ?"pending":"push")}>P</button>
      </div>
      <button className="del" onClick={() => onDelete(bet.id)}>✕</button>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// BET SLIP SCAN MODAL
// ═══════════════════════════════════════════════════════════════════════════
function BetSlipModal({ onClose, onAddBets }) {
  const [phase, setPhase]           = useState("upload"); // upload | scanning | review | error
  const [previewUrl, setPreviewUrl] = useState(null);
  const [imageData, setImageData]   = useState(null);
  const [mediaType, setMediaType]   = useState("image/jpeg");
  const [parsedBets, setParsedBets] = useState([]);
  const [selected, setSelected]     = useState([]);
  const [errMsg, setErrMsg]         = useState("");
  const [drag, setDrag]             = useState(false);
  const fileRef = useRef();

  const handleFile = async (file) => {
    if (!file || !file.type.startsWith("image/")) return;
    setPreviewUrl(URL.createObjectURL(file));
    setMediaType(file.type || "image/jpeg");
    const b64 = await fileToBase64(file);
    setImageData(b64);
    setPhase("preview");
  };

  const handleScan = async () => {
    if (!imageData) return;
    setPhase("scanning");
    setErrMsg("");
    try {
      const bets = await parseBetSlip(imageData, mediaType);
      setParsedBets(bets);
      setSelected(bets.map((_, i) => i));
      setPhase("review");
    } catch (e) {
      setErrMsg(e.message || "Failed to parse slip. Try a clearer photo.");
      setPhase("error");
    }
  };

  const toggleSelect = (i) => setSelected(s => s.includes(i) ? s.filter(x => x !== i) : [...s, i]);

  const handleAdd = () => {
    const toAdd = selected.map(i => ({
      ...parsedBets[i],
      id: Date.now() + i,
      status: "pending",
      fromSlip: true,
    }));
    onAddBets(toAdd);
    onClose();
  };

  return (
    <div className="ov" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="slip-modal">
        <div className="slip-title">📷 Scan Bet Slip</div>
        <div className="slip-sub">Take a photo or upload a screenshot — Claude will read the bets automatically</div>

        {/* UPLOAD */}
        {(phase === "upload") && (
          <div
            className={`upload-zone ${drag ? "drag" : ""}`}
            onDragOver={e => { e.preventDefault(); setDrag(true); }}
            onDragLeave={() => setDrag(false)}
            onDrop={e => { e.preventDefault(); setDrag(false); handleFile(e.dataTransfer.files[0]); }}
            onClick={() => fileRef.current?.click()}
          >
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={e => handleFile(e.target.files[0])}
            />
            <div className="upload-icon">📸</div>
            <div className="upload-title">TAP TO TAKE PHOTO</div>
            <div className="upload-sub">or drag & drop a screenshot here</div>
          </div>
        )}

        {/* PREVIEW */}
        {phase === "preview" && (
          <>
            <div className="slip-preview">
              <img src={previewUrl} alt="Bet slip" />
              <div className="slip-preview-actions">
                <button className="preview-retake" onClick={() => { setPhase("upload"); setPreviewUrl(null); setImageData(null); }}>↩ Retake</button>
              </div>
            </div>
            <div className="m-btns">
              <button className="bs" onClick={onClose}>Cancel</button>
              <button className="bp gold" onClick={handleScan}>🔍 SCAN SLIP</button>
            </div>
          </>
        )}

        {/* SCANNING */}
        {phase === "scanning" && (
          <div className="scanning">
            <div className="scanning-icon">⚙️</div>
            <div className="scanning-txt">READING SLIP...</div>
            <div className="scanning-sub">Claude is parsing your bet details</div>
          </div>
        )}

        {/* REVIEW */}
        {phase === "review" && (
          <>
            <div style={{fontFamily:"'DM Mono',monospace",fontSize:"9px",color:"var(--dim)",letterSpacing:"1px",marginBottom:"10px"}}>
              ✅ Found {parsedBets.length} bet{parsedBets.length !== 1 ? "s" : ""} — tap to deselect any you don't want
            </div>
            <div className="parsed-list">
              {parsedBets.map((b, i) => (
                <div key={i} className="parsed-item">
                  <div className={`parsed-check ${selected.includes(i) ? "" : "off"}`} onClick={() => toggleSelect(i)}>
                    {selected.includes(i) ? "✓" : "✕"}
                  </div>
                  <div className="parsed-info">
                    <div className="parsed-pick">{b.pick}</div>
                    <div className="parsed-meta">{b.betType} · {fmtOdds(b.odds)} · ${b.stake} · {b.round}</div>
                  </div>
                </div>
              ))}
            </div>
            <div className="m-btns">
              <button className="bs" onClick={onClose}>Cancel</button>
              <button className="bp gold" onClick={handleAdd} disabled={selected.length === 0}>
                ADD {selected.length} BET{selected.length !== 1 ? "S" : ""}
              </button>
            </div>
          </>
        )}

        {/* ERROR */}
        {phase === "error" && (
          <>
            <div className="scan-err">⚠ {errMsg}</div>
            <div className="m-btns">
              <button className="bs" onClick={onClose}>Cancel</button>
              <button className="bp" onClick={() => setPhase("upload")}>Try Again</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN APP
// ═══════════════════════════════════════════════════════════════════════════
const INTERVAL = 10;

export default function App() {
  const [tab, setTab]               = useState("scores");
  const [scores, setScores]         = useState([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState(null);
  const [apiUrl, setApiUrl]         = useState("");
  const [updated, setUpdated]       = useState(null);
  const [countdown, setCountdown]   = useState(INTERVAL);
  const [bets, setBets]             = useState(loadBets);
  const [autoGradedCount, setAutoGradedCount] = useState(0);
  const [showAdd, setShowAdd]       = useState(false);
  const [showScan, setShowScan]     = useState(false);
  const [nb, setNb]                 = useState({ round: "Round of 64", pick: "", betType: "Spread", odds: -110, stake: 150 });

  useEffect(() => { saveBets(bets); }, [bets]);

  const fetchScores = useCallback(async () => {
    const url = getScoreboardUrl();
    setApiUrl(url);
    setError(null);
    try {
      const resp = await fetch(url);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = await resp.json();
      const events = data.events || [];
      setScores(events);
      setUpdated(new Date());
      setBets(prevBets => {
        let changed = 0;
        const next = prevBets.map(bet => {
          if (bet.status !== "pending") return bet;
          for (const event of events) {
            if (!getBetsForGame(event, [bet]).length) continue;
            const result = gradeBet(bet, event);
            if (result) { changed++; return { ...bet, status: result, autoGraded: true }; }
          }
          return bet;
        });
        if (changed > 0) setAutoGradedCount(c => c + changed);
        return next;
      });
    } catch (err) {
      setError(err.message);
    }
    setLoading(false);
    setCountdown(INTERVAL);
  }, []);

  useEffect(() => { fetchScores(); const t = setInterval(fetchScores, INTERVAL * 1000); return () => clearInterval(t); }, [fetchScores]);
  useEffect(() => { const t = setInterval(() => setCountdown(c => c <= 1 ? INTERVAL : c - 1), 1000); return () => clearInterval(t); }, []);

  const upStatus   = (id, status) => setBets(p => p.map(b => b.id===id ? {...b, status, autoGraded: false} : b));
  const delBet     = (id)         => setBets(p => p.filter(b => b.id!==id));
  const addBet     = () => {
    if (!nb.pick.trim()) return;
    setBets(p => [...p, {...nb, id: Date.now(), status: "pending"}]);
    setShowAdd(false);
    setNb({ round: "Round of 64", pick: "", betType: "Spread", odds: -110, stake: 150 });
  };
  const addBetsFromSlip = (newBets) => setBets(p => [...p, ...newBets]);

  const stats = bets.reduce((a, b) => {
    a.wagered += b.stake;
    if (b.status==="won")  { a.w++; a.pnl += calcWin(b.odds, b.stake); }
    if (b.status==="lost") { a.l++; a.pnl -= b.stake; }
    if (b.status==="push") { a.push++; }
    return a;
  }, {w:0, l:0, push:0, pnl:0, wagered:0});

  const winPct     = stats.w + stats.l > 0 ? Math.round((stats.w/(stats.w+stats.l))*100) : null;
  const byRound    = ROUNDS.reduce((a,r) => { const rb=bets.filter(b=>b.round===r); if(rb.length) a[r]=rb; return a; }, {});
  const live       = scores.filter(e => e.status?.type?.state==="in");
  const upcoming   = scores.filter(e => e.status?.type?.state==="pre");
  const final      = scores.filter(e => e.status?.type?.state==="post");
  const focusCount = scores.filter(e => gameMatchesBets(e, bets)).length;
  const sortFocus  = arr => [...arr].sort((a,b) => gameMatchesBets(b,bets) - gameMatchesBets(a,bets));

  return (
    <>
      <style>{CSS}</style>
      <div className="app">
        <header className="hdr">
          <div className="hdr-glow" />
          <div className="hdr-dots"><span>• • • • •</span><span>• • • • •</span></div>
          <div className="crown">👑</div>
          <div className="title">GOLDFARBAPALOOZA</div>
          <div className="title-badge">Duke Blue Edition · Las Vegas</div>
          <div className="title-sub">🏀 NCAA Tournament · Betting Tracker 🏀</div>
        </header>

        <div className="tabs">
          <button className={`tab ${tab==="scores"?"active":""}`} onClick={()=>setTab("scores")}>📺 Live Scores</button>
          <button className={`tab ${tab==="bets"?"active":""}`}   onClick={()=>setTab("bets")}>🎲 Bet Tracker</button>
        </div>

        <div className="content">

          {tab==="scores" && (
            <>
              <div className="rbar">
                <div className="rbar-left">
                  {updated && <span className="rbar-info">Updated {updated.toLocaleTimeString()}</span>}
                  <span className="rbar-url">{apiUrl}</span>
                </div>
                <div className="rbar-right">
                  <span className="rbar-cd">↻ {countdown}s</span>
                  <button className="rbar-btn" onClick={fetchScores}>REFRESH</button>
                </div>
              </div>
              {error && <div className="api-warn">⚠ API Error: {error} — retrying in {countdown}s</div>}
              {autoGradedCount > 0 && <div className="auto-banner">⚡ {autoGradedCount} bet{autoGradedCount!==1?"s":""} auto-graded — check Bet Tracker</div>}
              {focusCount > 0 && <div className="focus-legend"><div className="focus-dot" /><span className="focus-txt">🔥 YOUR BET = gold highlight · {focusCount} game{focusCount!==1?"s":""} with active wagers</span></div>}
              {loading && <div className="no-games">LOADING SCORES...</div>}
              {!loading && !error && scores.length===0 && <div className="no-games">NO NCAA MEN'S BASKETBALL GAMES FOUND FOR TODAY<br/><span style={{fontSize:"9px",opacity:.5}}>Games may not be scheduled today or the tournament is between rounds.</span></div>}
              {live.length>0     && <><div className="sec-lbl">🔴 IN PROGRESS ({live.length})</div>{sortFocus(live).map(e    =><ScoreCard key={e.id} event={e} matchedBets={getBetsForGame(e,bets)}/>)}</>}
              {upcoming.length>0 && <><div className="sec-lbl">⏰ TODAY'S SCHEDULE ({upcoming.length})</div>{sortFocus(upcoming).map(e=><ScoreCard key={e.id} event={e} matchedBets={getBetsForGame(e,bets)}/>)}</>}
              {final.length>0    && <><div className="sec-lbl">✅ FINAL ({final.length})</div>{sortFocus(final).map(e        =><ScoreCard key={e.id} event={e} matchedBets={getBetsForGame(e,bets)}/>)}</>}
            </>
          )}

          {tab==="bets" && (
            <>
              {autoGradedCount > 0 && <div className="auto-banner">⚡ {autoGradedCount} bet{autoGradedCount!==1?"s":""} auto-graded from final scores</div>}
              <div className="stats">
                <div className="s-card"><div className="s-lbl">Record</div><div className={`s-val ${stats.w>stats.l?"g":stats.l>stats.w?"r":"bl"}`}>{stats.w}-{stats.l}{stats.push>0?`-${stats.push}`:""}</div></div>
                <div className="s-card"><div className="s-lbl">Net P&L</div><div className={`s-val ${stats.pnl>0?"g":stats.pnl<0?"r":"bl"}`}>{stats.pnl>=0?"+":""}{stats.pnl.toFixed(0)}</div></div>
                <div className="s-card"><div className="s-lbl">Win %</div><div className={`s-val ${winPct===null?"bl":winPct>=55?"g":winPct>=45?"bl":"r"}`}>{winPct!==null?`${winPct}%`:"--"}</div></div>
                <div className="s-card"><div className="s-lbl">Wagered</div><div className="s-val bl">${stats.wagered}</div></div>
              </div>

              {Object.entries(byRound).map(([round, rb]) => {
                const rs = rb.reduce((a,b) => { if(b.status==="won"){a.w++;a.pnl+=calcWin(b.odds,b.stake);} if(b.status==="lost"){a.l++;a.pnl-=b.stake;} return a; },{w:0,l:0,pnl:0});
                const hasSets = rs.w+rs.l>0;
                return (
                  <div key={round}>
                    <div className="rnd-hdr"><span>{round}</span>{hasSets && <span className={`rnd-pnl ${rs.pnl>0?"g":rs.pnl<0?"r":"n"}`}>{rs.pnl>=0?"+":""}${rs.pnl.toFixed(2)}</span>}</div>
                    {hasSets && <div className="rnd-rec">{rs.w}W – {rs.l}L THIS ROUND</div>}
                    {rb.map(bet=><BetCard key={bet.id} bet={bet} onStatus={upStatus} onDelete={delBet}/>)}
                  </div>
                );
              })}

              <div className="add-row">
                <button className="add-btn" onClick={()=>setShowAdd(true)}>+ ADD BET MANUALLY</button>
                <button className="add-btn scan" onClick={()=>setShowScan(true)}>📷 SCAN BET SLIP</button>
              </div>
            </>
          )}
        </div>

        {/* MANUAL ADD MODAL */}
        {showAdd && (
          <div className="ov" onClick={e=>e.target===e.currentTarget&&setShowAdd(false)}>
            <div className="modal">
              <div className="m-title">🎲 Add New Bet</div>
              <div className="fg"><label className="fl">Tournament Round</label><select className="fs" value={nb.round} onChange={e=>setNb(p=>({...p,round:e.target.value}))}>{ROUNDS.map(r=><option key={r}>{r}</option>)}</select></div>
              <div className="fg"><label className="fl">Your Pick</label><input className="fi" placeholder="e.g. Duke -3  ·  Kentucky ML  ·  Duke/UNC O148" value={nb.pick} onChange={e=>setNb(p=>({...p,pick:e.target.value}))} onKeyDown={e=>e.key==="Enter"&&addBet()} autoFocus /></div>
              <div className="fg"><label className="fl">Bet Type</label><select className="fs" value={nb.betType} onChange={e=>setNb(p=>({...p,betType:e.target.value}))}>{["Spread","Moneyline","Total","Parlay","Prop","Futures"].map(t=><option key={t}>{t}</option>)}</select></div>
              <div className="frow">
                <div className="fg"><label className="fl">Odds</label><input className="fi" type="number" placeholder="-110" value={nb.odds} onChange={e=>setNb(p=>({...p,odds:parseInt(e.target.value)||-110}))} /></div>
                <div className="fg"><label className="fl">Stake ($)</label><input className="fi" type="number" placeholder="150" value={nb.stake} onChange={e=>setNb(p=>({...p,stake:parseFloat(e.target.value)||150}))} /></div>
              </div>
              <div className="m-btns"><button className="bs" onClick={()=>setShowAdd(false)}>Cancel</button><button className="bp" onClick={addBet}>ADD BET</button></div>
            </div>
          </div>
        )}

        {/* BET SLIP SCAN MODAL */}
        {showScan && <BetSlipModal onClose={()=>setShowScan(false)} onAddBets={addBetsFromSlip} />}
      </div>
    </>
  );
}
