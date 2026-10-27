// Seemorgh Operator Console — vanilla ES module. Operator-first IA.
// Left: prioritized contacts + minimal status. Center: Air Picture overview (Raw/Fused/Both, real
// 0–90 timeline, guided tour). Right: selected-track detail + reasoning assistance.
// Data comes from the real services (health-derived data_mode; HTTP-reachable is NOT "live").
// Every service/model string is HTML-escaped. Reasoning LIVE only when a schema-valid brief proves it.
// Playback consumes real per-timestep frames (no interpolation, no manufactured JS timeline).

const API = { sense: "/api/sense", fuse: "/api/fuse", reason: "/api/reason", analyst: "/api/local-analyst" };
const DEV = { sense: "http://127.0.0.1:8081", fuse: "http://127.0.0.1:8082", reason: "http://127.0.0.1:8083", analyst: "http://127.0.0.1:8084" };
// Recorded replay: a static, read-only copy of this console (<html data-mode="replay">). Every frame,
// health record and recorded local-model answer is a file under replay/. No service, dev port or
// model is contacted, and recorded model output is labelled as recorded.
const REPLAY = typeof document !== "undefined" && document.documentElement?.dataset?.mode === "replay";
const REPLAY_DIR = "replay/";
// In-image, schema-valid deterministic fallback fixtures (copied into the console image by the
// Dockerfile). Only the six bookmark frames exist offline; live/API mode animates all 91.
const FIXT = "fixtures/";
const BOOKMARKS = [0, 40, 67, 74, 81, 90], CROSS = [67, 81];
const FALLBACK_FRAME_TS = new Set(BOOKMARKS);   // which t values have an offline fixture
// Fixed scenario play area around the GCS. Recomputing bounds from each frame made the map pan and
// rescale as random clutter, RF rays, and fetched history changed. Geometry outside this honest
// scenario envelope is clipped by the SVG instead of moving the operator's frame of reference.
const VIEWPORT_ENU_M = { west: -4500, east: 8500, south: -1000, north: 20000 };

// Fixed locations are part of this synthetic scenario definition. They are not discovered sensor
// positions and are never presented as a real installation. C2 has no physical location in the
// payload, so it stays in the installation list and is deliberately absent from the map.
const SENSOR_SITES = {
  long_range_radar: { latitude: 48.2100, longitude: 11.6500, label: "Long-range radar", symbol: "radar" },
  raw_plots: { latitude: 48.0500, longitude: 11.7100, label: "Plot radar", symbol: "plot" },
  rf_sensor: { latitude: 48.0500, longitude: 11.6100, label: "RF direction finding", symbol: "rf" },
};
const SOURCE_LABEL = { long_range_radar:"Long-range radar", precision_sensor:"Precision tracker", raw_plots:"Plot radar", c2_network:"C2 network", rf_sensor:"RF direction finding" };

const state = {
  t: 74, show: "fused", selected: "FT-001", playing: false,
  dataMode: {}, health: {}, frameMode: "unknown", panelOpen: false, sensorFocus: null,
  watchPaused: false,
  scenarioCatalog: null,
  analyst: { key: null, requestSeq: 0, status: "not_started", result: null },
  copilot: { open: false, baseKey: null, requestSeq: 0, status: "idle", content: null, answer: null, questionText: null },
  map: null, mapInitialised: false,
  layers: { fused: true, raw: false, rays: true, sensors: true, uncertainty: true, history: true },
};

// ---- safety: escape everything before it touches innerHTML ----
function esc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
function num(x, d = 1) { return (typeof x === "number" && isFinite(x)) ? x.toFixed(d) : "—"; }
function distanceBearing(a, b) {
  if (!a || !b || !Number.isFinite(a.latitude) || !Number.isFinite(a.longitude)
      || !Number.isFinite(b.latitude) || !Number.isFinite(b.longitude)) return null;
  const rad = Math.PI / 180, lat1 = a.latitude * rad, lat2 = b.latitude * rad;
  const dLat = (b.latitude - a.latitude) * rad, dLon = (b.longitude - a.longitude) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  const range_m = 6371000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  const y = Math.sin(dLon) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  return { range_m, bearing_deg: (Math.atan2(y, x) / rad + 360) % 360 };
}
function fmtRange(m) { return m == null ? "—" : m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`; }
function fmtBearing(d) { return d == null ? "—" : `${Math.round(d).toString().padStart(3, "0")}°`; }

// ---- data layer (preserved: API -> dev ports -> in-image fixture; data_mode from health) ----
async function tryFetch(paths) {
  for (const p of paths) {
    try { const r = await fetch(p, { cache: "no-store" }); if (r.ok) return await r.json(); }
    catch (e) {}
  }
  return null;
}
async function getHealth(svc) {
  if (REPLAY) return await tryFetch([`${REPLAY_DIR}${svc}-health.json`]);
  return await tryFetch([`${API[svc]}/health`, `${DEV[svc]}/health`]);
}
// Frame fetch: live/dev first; fixture fallback ONLY for the bookmark timesteps that ship offline.
// Replay has every integer timestep as an exported engine frame.
async function fetchFrame(t) {
  if (REPLAY) return await tryFetch([`${REPLAY_DIR}frame-${t}.json`]);
  const paths = [`${API.fuse}/scenario/frame?t=${t}`, `${DEV.fuse}/scenario/frame?t=${t}`];
  if (FALLBACK_FRAME_TS.has(t)) paths.push(`${FIXT}frame-${t}.json`);
  return await tryFetch(paths);
}
async function getBridge(t) {
  if (REPLAY) return await tryFetch([`${REPLAY_DIR}bridge-0.json`]);
  return await tryFetch([`${API.fuse}/bridge?t=${t}`, `${DEV.fuse}/bridge?t=${t}`, `${FIXT}bridge-0.json`]);
}
async function getFieldEvidence() {
  if (REPLAY) return await tryFetch([`${REPLAY_DIR}field-evidence.json`]);
  return await tryFetch([`${API.sense}/field-evidence`, `${DEV.sense}/field-evidence`, `${FIXT}field-evidence.json`]);
}
async function getBrief(t) {
  if (REPLAY) return await tryFetch([`${REPLAY_DIR}brief-${t}.json`]);
  return await tryFetch([`${API.reason}/brief?t=${t}`, `${DEV.reason}/brief?t=${t}`]);
}
// Recorded local-model answers, captured once per distinct scenario packet. index.json maps
// "t:fused_id" (Watch) and "t:fused_id[:question_id]" (Copilot) to a recorded response file, so a
// replayed answer is still checked by the same track/scenario/slot guards before display.
let replayIndex = null;
async function recordedAnalyst(kind, key) {
  if (!replayIndex) replayIndex = tryFetch([`${REPLAY_DIR}analyst/index.json`]);
  const index = await replayIndex;
  const file = index?.[kind]?.[key];
  return (typeof file === "string" && /^[A-Za-z0-9_.-]+\.json$/.test(file)) ? await tryFetch([`${REPLAY_DIR}analyst/${file}`]) : null;
}
function modelDraftLabel(result) {
  const when = REPLAY && typeof result?.recorded_at === "string" ? ` · recorded ${result.recorded_at}` : "";
  return `${REPLAY ? "RECORDED LOCAL MODEL DRAFT" : "LOCAL MODEL DRAFT"} · ${result?.model || "configured local model"} · validated slots${when}`;
}
async function postJSON(paths, body) {
  for (const p of paths) {
    try {
      const r = await fetch(p, { method: "POST", cache: "no-store", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (r.ok) return await r.json();
    } catch (e) {}
  }
  return null;
}
async function getLocalAnalystBrief(t, fusedId, isCurrent = () => true) {
  if (REPLAY) return await queueLocalAnalyst(() => recordedAnalyst("brief", `${t}:${fusedId}`), isCurrent);
  return await queueLocalAnalyst(() => postJSON([`${API.analyst}/brief`, `${DEV.analyst}/brief`], { t, fused_id: fusedId }), isCurrent);
}
// Keep Watch and Copilot requests sequential on a small local model. Each response
// still passes the selected-track/scenario guards before it can reach the display.
let localAnalystQueue = Promise.resolve();
function queueLocalAnalyst(request, isCurrent = () => true) {
  const run = () => isCurrent() ? request() : null;
  const next = localAnalystQueue.then(run, run);
  localAnalystQueue = next.catch(() => null);
  return next;
}
async function getCopilotContent(t, fusedId, questionId = null, isCurrent = () => true) {
  const body = { t, fused_id: fusedId };
  if (questionId) body.question_id = questionId;
  if (REPLAY) return await queueLocalAnalyst(() => recordedAnalyst("copilot", `${t}:${fusedId}${questionId ? `:${questionId}` : ""}`), isCurrent);
  return await queueLocalAnalyst(() => postJSON([`${API.analyst}/copilot`, `${DEV.analyst}/copilot`], body), isCurrent);
}
async function loadScenarioCatalog() {
  const catalog = await tryFetch(["scenario-catalog.json"]);
  if (catalog && Array.isArray(catalog.scenarios) && typeof catalog.evidence_boundary === "string") state.scenarioCatalog = catalog;
}

// ---- frame cache + stale-request protection ----
const frameCache = new Map();   // t -> frame JSON (real fetched frames only)
let selectionSeq = 0;           // increments on every user-driven timestep/selection change
async function loadFrame(t) {
  if (frameCache.has(t)) return frameCache.get(t);
  const f = await fetchFrame(t);
  if (f) frameCache.set(t, f);
  return f;
}
// Fetch + render for a timestep, guarded so a slow response can't overwrite a newer selection.
async function goto(t, { fromPlayback = false } = {}) {
  t = Math.max(0, Math.min(90, Math.round(Number(t) || 0)));
  const seq = ++selectionSeq;
  state.t = t;
  const timeline = document.getElementById("timeline");
  if (timeline) timeline.value = String(t);
  const f = await loadFrame(t);
  if (seq !== selectionSeq) return;   // a newer selection happened while we awaited — drop this one
  state.frame = f;
  draw();
  return f;
}

// ---- health: data mode from the payload, not reachability ----
async function refreshHealth() {
  for (const svc of ["sense", "fuse", "reason"]) {
    const h = await getHealth(svc);
    state.health[svc] = h && h.status === "ok";
    state.dataMode[svc] = h ? (h.data_mode || "unknown") : "offline";
  }
  // The Air Picture's frame source mode follows FUSE.
  state.frameMode = state.dataMode.fuse || "unknown";
  draw();
}

const clsColor = { hostile: "var(--hostile)", friend: "var(--friend)", unknown: "var(--unknown)" };
const clsName = { hostile: "Hostile", friend: "Friendly interceptor", unknown: "Unknown contact" };
const srcColor = { long_range_radar:"var(--s1)", precision_sensor:"var(--s2)", raw_plots:"var(--s3)", c2_network:"var(--s4)", rf_sensor:"var(--s5)" };

function ensureMap(gcs) {
  if (state.map || !gcs || !window.L) return;
  const map = L.map("map", { zoomControl: true, attributionControl: true, preferCanvas: true, minZoom: 8, maxZoom: 17 })
    .setView([gcs.latitude, gcs.longitude], 12);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19, attribution: "© OpenStreetMap contributors"
  }).addTo(map);
  state.map = map;
  const redraw = () => { if (state.frame) renderMap(document.getElementById("air"), state.frame, state.show); };
  map.on("move zoom resize", redraw);
}

// ---- map renderer (adapted from the approved renderer to production FusionFrame payloads) ----
// Plots: GCS, fused tracks (σ + priority), raw per-source reports, RF bearing-only rays, rejected/
// known clutter ONLY when the payload labels it, velocity, and real fetched-frame history trails.
// Deterministic label placement; selected marker synced with the contact list. Field drone is never
// plotted here (this consumes FusionFrame/TYTAN only — field evidence lives on its own page).
function renderMap(svg, frame, show) {
  svg.innerHTML = "";
  if (!frame) { svg.innerHTML = `<text x="20" y="30" fill="var(--faint)" font-size="13">No fusion frame at t=${state.t}.</text>`; return; }
  const showFused = state.layers.fused;
  const showRaw = state.layers.raw;
  const showRays = state.layers.rays;
  const showSensors = state.layers.sensors;
  const showUncertainty = state.layers.uncertainty;
  const showHistory = state.layers.history;
  const tracks = frame.fused_tracks || [];
  const gcs = frame.gcs;
  const selectedTrack = tracks.find(t => t.fused_id === state.selected);
  const selectedSources = new Set((selectedTrack?.contributors || []).map(c => c.source_system));
  const sensorFocus = state.sensorFocus;
  const sensorSites = gcs ? [
    { source: "precision_sensor", latitude: gcs.latitude, longitude: gcs.longitude, label: "Precision tracker", symbol: "precision" },
    ...Object.entries(SENSOR_SITES).map(([source, site]) => ({ source, ...site })),
  ] : Object.entries(SENSOR_SITES).map(([source, site]) => ({ source, ...site }));

  // collect plottable geometry for the projection extent
  const rawPts = [], rays = [], clutter = [];
  if (frame.raw_by_source) {
    for (const [src, items] of Object.entries(frame.raw_by_source)) {
      for (const it of (items || [])) {
        if (it.geometry_type === "bearing_ray" && typeof it.origin_latitude === "number") {
          rays.push({ src, lat: it.origin_latitude, lon: it.origin_longitude, bearing: it.bearing_deg, len: it.display_length_m || 10000 });
        } else if (it.clutter === true && typeof it.latitude === "number") {
          clutter.push({ src, lat: it.latitude, lon: it.longitude });
        } else if (typeof it.latitude === "number" && typeof it.longitude === "number") {
          rawPts.push({ src, lat: it.latitude, lon: it.longitude });
        }
      }
    }
  }
  const rayEnds = rays.map(r => {
    const dLat = (r.len / 111320) * Math.cos(r.bearing * Math.PI / 180);
    const dLon = (r.len / (111320 * Math.cos(r.lat * Math.PI / 180))) * Math.sin(r.bearing * Math.PI / 180);
    return { ...r, elat: r.lat + dLat, elon: r.lon + dLon };
  });

  // real fetched-frame history (only timesteps we have actually fetched — never interpolated)
  const history = {};
  if (showFused && showHistory) {
    for (const tr of tracks) history[tr.fused_id] = [];
    const seen = [...frameCache.keys()].filter(t => t <= state.t).sort((a,b)=>a-b);
    for (const ht of seen) {
      const hf = frameCache.get(ht);
      for (const htr of (hf.fused_tracks || [])) {
        if (history[htr.fused_id]) history[htr.fused_id].push(htr.position);
      }
    }
  }

  if (!state.map) { svg.innerHTML = `<text x="20" y="30" fill="var(--faint)" font-size="12">Map unavailable at t=${state.t}.</text>`; return; }
  const bounds = svg.getBoundingClientRect(), W = Math.max(1, bounds.width), H = Math.max(1, bounds.height), pad = 0;
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`); svg.setAttribute("preserveAspectRatio", "none");
  const center = state.map.getCenter();
  const x = lon => state.map.latLngToContainerPoint([center.lat, lon]).x;
  const y = lat => state.map.latLngToContainerPoint([lat, center.lng]).y;
  const p0 = state.map.containerPointToLatLng([W / 2, H / 2]);
  const p1 = state.map.containerPointToLatLng([W / 2, H / 2 + 1]);
  const mPerUnit = Math.max(.1, p0.distanceTo(p1));

  let s = `<g stroke="var(--line)" stroke-width="1" opacity=".76">`;
  for (let gx = 80; gx < W - 40; gx += 80) s += `<line x1="${gx}" y1="${pad}" x2="${gx}" y2="${H-pad}"/>`;
  for (let gy = 80; gy < H - 30; gy += 80) s += `<line x1="${pad}" y1="${gy}" x2="${W-pad}" y2="${gy}"/>`;
  s += `</g><g fill="var(--faint)" font-size="8">`;
  for (let gx = 80; gx < W - 40; gx += 160) s += `<text x="${gx+3}" y="${H-pad-8}">${Math.round((gx - x(gcs?.longitude || center.lng)) * mPerUnit / 1000)} km E</text>`;
  for (let gy = 80; gy < H - 30; gy += 160) s += `<text x="8" y="${gy-3}">${Math.round((y(gcs?.latitude || center.lat) - gy) * mPerUnit / 1000)} km N</text>`;
  s += `</g><text x="${pad}" y="${pad-15}" fill="var(--ink)" fill-opacity=".86" font-size="9">MUNICH REFERENCE MAP · SCENARIO GEOMETRY SYNTHETIC · GCS-RELATIVE</text>`;
  // GCS
  if (gcs) {
    const gcx = x(gcs.longitude), gcy = y(gcs.latitude);
    for (const m of [1000, 2500, 5000, 10000, 20000]) {
      const r = m / mPerUnit;
      s += `<circle cx="${gcx}" cy="${gcy}" r="${r}" fill="none" stroke="var(--gcs)" stroke-opacity=".2" stroke-dasharray="3 5"/>`;
      if (m >= 5000) s += `<text x="${gcx+r+4}" y="${gcy-3}" fill="var(--faint)" font-size="8">${m / 1000} km</text>`;
    }
    if (selectedSources.has("precision_sensor")) s += `<circle cx="${gcx}" cy="${gcy}" r="17" fill="none" stroke="var(--proven)" stroke-width="1.5" stroke-dasharray="3 2"/>`;
    if (sensorFocus === "precision_sensor") s += `<circle cx="${gcx}" cy="${gcy}" r="21" fill="none" stroke="var(--ink)" stroke-width="1.5"/>`;
    s += `<circle cx="${gcx}" cy="${gcy}" r="7" fill="var(--gcs)"/><circle cx="${gcx}" cy="${gcy}" r="13" fill="none" stroke="var(--gcs)" stroke-opacity=".55"/>
      <text x="${gcx+12}" y="${gcy+4}" fill="var(--gcs)" font-size="11">GCS · PRECISION TRACKER</text>`;
  }
  // Scenario-defined installations. Markers are locations from the deterministic scenario source,
  // never inferred from a report. A selected contributor gains a halo; C2 has no location and is
  // intentionally omitted here. RF remains a source marker plus its real bearing ray, not a point.
  if (showSensors) {
    for (const site of sensorSites) {
      if (site.source === "precision_sensor") continue; // the GCS marker represents its co-located tracker
      const sx = x(site.longitude), sy = y(site.latitude);
      const col = srcColor[site.source] || "var(--dim)";
      const used = selectedSources.has(site.source);
      const focused = sensorFocus === site.source;
      if (used) s += `<circle cx="${sx}" cy="${sy}" r="12" fill="none" stroke="var(--proven)" stroke-width="1.5" stroke-dasharray="3 2"/>`;
      if (focused) s += `<circle cx="${sx}" cy="${sy}" r="16" fill="none" stroke="var(--ink)" stroke-width="1.5"/>`;
      if (site.symbol === "radar") s += `<path d="M ${sx} ${sy-7} L ${sx+7} ${sy} L ${sx} ${sy+7} L ${sx-7} ${sy} Z" fill="${col}"/>`;
      else if (site.symbol === "rf") s += `<circle cx="${sx}" cy="${sy}" r="5" fill="none" stroke="${col}" stroke-width="2"/><circle cx="${sx}" cy="${sy}" r="1.7" fill="${col}"/>`;
      else if (site.symbol === "plot") s += `<rect x="${sx-5}" y="${sy-5}" width="10" height="10" fill="${col}"/>`;
      else s += `<circle cx="${sx}" cy="${sy}" r="5" fill="${col}"/>`;
      const suffix = focused ? " · FOCUS" : (used ? " · CONTRIBUTOR" : "");
      s += `<text x="${sx+9}" y="${sy-8}" fill="${focused ? 'var(--ink)' : used ? 'var(--proven)' : col}" font-size="9">${esc(site.label.toUpperCase())}${suffix}</text>`;
    }
  }
  const scaleW = Math.max(22, 1000 / mPerUnit);
  s += `<g transform="translate(${W-pad-110},${H-pad-16})" fill="var(--dim)" font-size="8"><rect width="${scaleW}" height="4" fill="var(--dim)"/><rect x="${scaleW}" width="${scaleW}" height="4" fill="none" stroke="var(--dim)"/><text x="0" y="15">0</text><text x="${scaleW*2-16}" y="15">2 km</text></g>`;
  // raw reports (Raw/Both) — several vendors measuring one possible object
  if (showRaw) {
    for (const r of rawPts) {
      if (sensorFocus && r.src !== sensorFocus) continue;
      s += `<circle cx="${x(r.lon)}" cy="${y(r.lat)}" r="${sensorFocus ? 4.5 : 3.4}" fill="${srcColor[r.src]||'var(--faint)'}" fill-opacity=".82"/>`;
    }
    // Rejected/known clutter — only because the payload labels it clutter:true.
    for (const c of clutter) {
      if (sensorFocus && c.src !== sensorFocus) continue;
      const cx = x(c.lon), cy = y(c.lat), r = 4.5;
      s += `<g stroke="var(--faint)" stroke-width="1"><circle cx="${cx}" cy="${cy}" r="${r}" fill="none"/><line x1="${cx-r}" y1="${cy-r}" x2="${cx+r}" y2="${cy+r}"/><line x1="${cx-r}" y1="${cy+r}" x2="${cx+r}" y2="${cy-r}"/></g>`;
    }
  }
  // RF remains bearing-only: rays appear only when this explicit layer is enabled.
  if (showRays) {
    for (const r of rayEnds) {
      if (sensorFocus && r.src !== sensorFocus) continue;
      s += `<line x1="${x(r.lon)}" y1="${y(r.lat)}" x2="${x(r.elon)}" y2="${y(r.elat)}" stroke="${srcColor[r.src]||'var(--s5)'}" stroke-opacity=".7" stroke-dasharray="5 4"/>`;
      s += `<circle cx="${x(r.lon)}" cy="${y(r.lat)}" r="3" fill="${srcColor[r.src]||'var(--s5)'}"/>`;
    }
  }
  // fused tracks (Fused/Both)
  const labels = [];   // deterministic collision handling: collect then place
  if (showFused) {
    // real snapshot-history trails first (behind markers)
    for (const [fid, arr] of Object.entries(history)) {
      if (arr.length < 2) continue;
      const tr = tracks.find(t => t.fused_id === fid); const col = tr ? (clsColor[tr.classification]||"var(--dim)") : "var(--dim)";
      const pts = arr.map(p => `${x(p.longitude)},${y(p.latitude)}`).join(" ");
      s += `<polyline points="${pts}" fill="none" stroke="${col}" stroke-opacity=".3" stroke-dasharray="2 3"/>`;
    }
    for (const t of tracks) {
      const cx = x(t.position.longitude), cy = y(t.position.latitude);
      const col = clsColor[t.classification] || "var(--dim)";
      const sel = t.fused_id === state.selected;
      const sr = Math.max(6, Math.min(90, (t.position_sigma_m || 10) / mPerUnit));
      if (showUncertainty) s += `<circle cx="${cx}" cy="${cy}" r="${sr}" fill="${col}" fill-opacity="${sel?.12:.06}" stroke="${col}" stroke-opacity=".35" stroke-dasharray="4 4"/>`;
      // velocity direction (course_deg, N=0 clockwise)
      if (typeof t.course_deg === "number") {
        const rad = (t.course_deg - 90) * Math.PI / 180;
        s += `<line x1="${cx}" y1="${cy}" x2="${cx + Math.cos(rad)*22}" y2="${cy + Math.sin(rad)*22}" stroke="${col}" stroke-opacity=".8" stroke-width="1.5"/>`;
      }
      if (sel) s += `<circle cx="${cx}" cy="${cy}" r="13" fill="none" stroke="${col}" stroke-width="1.5"/>`;
      s += `<circle cx="${cx}" cy="${cy}" r="6" fill="${col}" data-fid="${esc(t.fused_id)}" style="cursor:pointer"/>`;
      labels.push({ cx, cy, col, sel, text: `${t.fused_id}·P${t.priority} ${(t.classification||"").toUpperCase()}`,
        sub: `±${num(t.position_sigma_m,0)}m · ${t.num_sources} src` });
    }
  }
  // deterministic label placement: fixed order, dodge to first non-colliding anchor + leader line
  s += placeLabels(labels);
  svg.innerHTML = s;
  // marker <-> contact sync
  svg.querySelectorAll("[data-fid]").forEach(m => m.addEventListener("click", () => selectContact(m.dataset.fid)));
}

function placeLabels(labels) {
  const placed = []; let out = "";
  const CAND = [[10,-6],[10,12],[-10,-6],[-10,12],[16,-16],[16,20],[-16,-16],[-16,20]];
  const boxOf = (lx, ly, txt) => ({ x: lx, y: ly - 11, w: txt.length * 6.2 + 4, h: 24 });
  const hit = (a, b) => !(a.x+a.w < b.x || b.x+b.w < a.x || a.y+a.h < b.y || b.y+b.h < a.y);
  labels.forEach(l => placed.push({ x: l.cx-8, y: l.cy-8, w: 16, h: 16 }));   // marker keep-outs
  labels.slice().sort((a,b)=> a.text < b.text ? -1 : 1).forEach(l => {
    let chosen = null, dodged = false;
    for (let i = 0; i < CAND.length; i++) {
      const c = CAND[i], lx = c[0] < 0 ? l.cx + c[0] - l.text.length*6.2 : l.cx + c[0];
      const box = boxOf(lx, l.cy + c[1], l.text);
      if (!placed.some(q => hit(box, q))) { chosen = { lx, ly: l.cy + c[1], box }; dodged = i > 0; break; }
    }
    if (!chosen) { const lx = l.cx + 10; chosen = { lx, ly: l.cy - 6, box: boxOf(lx, l.cy-6, l.text) }; }
    placed.push(chosen.box);
    if (dodged) out += `<line x1="${l.cx}" y1="${l.cy}" x2="${chosen.lx}" y2="${chosen.ly-3}" stroke="${l.col}" stroke-opacity=".5"/>`;
    out += `<text x="${chosen.lx}" y="${chosen.ly}" fill="${l.col}" font-size="11" font-family="var(--disp)" font-weight="${l.sel?'700':'400'}">${esc(l.text)}</text>`;
    out += `<text x="${chosen.lx}" y="${chosen.ly+13}" fill="var(--faint)" font-size="10">${esc(l.sub)}</text>`;
  });
  return out;
}

function renderLegend() {
  const items = [
    ["GCS / precision","var(--gcs)"], ["Long-range radar","var(--s1)"], ["Plot radar","var(--s3)"],
    ["C2 network (logical)","var(--s4)"], ["RF bearing-only","var(--s5)"],
  ];
  return items.map(([l,c]) => `<span class="lg"><span style="width:8px;height:8px;border-radius:50%;background:${c};display:inline-block"></span>${esc(l)}</span>`).join("")
    + `<span class="lg" style="color:var(--faint)">green halo = selected-track contributor · RF = bearing-only · history = fetched frames only</span>`;
}

// ---- reasoning assistance (right panel; preserved live-badge truth logic) ----
function briefIsSchemaValid(b) {
  return b && typeof b.situation_summary === "string" && b.situation_summary.length > 0
    && typeof b.evidence_boundary === "string"
    && b.human_review_required === true && b.no_engagement_recommendation === true
    && ["live_gemini","deterministic_fixture","unavailable"].includes(b.source_status)
    && Array.isArray(b.priority_explanations);
}
async function reasoningHTML() {
  const b = await getBrief(state.t);
  const guardrail = `<div class="reason-guardrail">Human review required · No engagement recommendation</div>`;
  if (!b || !briefIsSchemaValid(b)) {
    return `<div class="brief"><div class="bh"><span class="ev-badge ev-roadmap">UNAVAILABLE</span> reasoning · assistance</div>
      <p class="obs">No schema-valid reasoning brief for t=${state.t}. Evidence boundary and verification stand regardless.</p>
      <p class="obs">Recommended: verify with an independent sensor.</p>${guardrail}</div>`;
  }
  // LIVE only when the validated brief itself says live_gemini AND names a model. HTTP 200 never suffices.
  const isLive = b.source_status === "live_gemini" && !!b.model;
  const status = isLive ? "live_gemini" : (b.source_status === "unavailable" ? "unavailable" : "deterministic_fixture");
  const label = { live_gemini:"LIVE GEMINI", deterministic_fixture:"DETERMINISTIC FALLBACK", unavailable:"UNAVAILABLE" }[status];
  const cls = isLive ? "ev-proven" : "ev-roadmap";
  const model = isLive ? esc(b.model) : "—";
  const top = (b.priority_explanations || [])[0];
  const topHtml = top ? `<p class="obs"><b>${esc(top.fused_id)}:</b> ${esc(top.rationale)}${top.uncertainty_note?` — ${esc(top.uncertainty_note)}`:""}</p>` : "";
  const missing = (b.missing_information || []).length
    ? `<p class="obs">Recommended: verify / observe — ${(b.missing_information||[]).map(esc).join("; ")}</p>` : "";
  return `<div class="brief"><div class="bh"><span class="ev-badge ${cls}">${esc(label)}</span> reasoning · assistance</div>
    <p>${esc(b.situation_summary)}</p>${topHtml}
    <p class="obs">Evidence boundary: ${esc(b.evidence_boundary)}</p>${missing}
    <p class="obs muted">model: <b>${model}</b> · t=${state.t}</p>${guardrail}</div>`;
}

// ---- contacts + status + panel ----
function contactsHTML() {
  const tracks = state.frame ? (state.frame.fused_tracks || []) : [];
  if (!tracks.length) return `<div class="muted" style="padding:10px">No fused tracks at t=${state.t}.</div>`;
  return [...tracks].sort((a,b)=>a.priority-b.priority).map(t => `
    <button class="contact ${esc(t.classification)}" type="button" role="option" data-fid="${esc(t.fused_id)}" aria-current="${t.fused_id===state.selected}">
      <span class="pri">P${esc(t.priority)}</span>
      <div class="who"><div class="cls">${esc(clsName[t.classification]||t.classification)}</div><div class="id">${esc(t.fused_id)} · ${esc(t.classification)}</div></div>
      <div class="k">${esc(t.num_sources)} sys<br>±${num(t.position_sigma_m,0)} m</div>
    </button>`).join("");
}
function installationHTML() {
  const tracks = state.frame ? (state.frame.fused_tracks || []) : [];
  const selected = tracks.find(t => t.fused_id === state.selected);
  const used = new Set((selected?.contributors || []).map(c => c.source_system));
  const rows = [
    ["precision_sensor", "Precision tracker", "GCS co-located", "radar"],
    ["long_range_radar", "Long-range radar", "fixed synthetic site", "radar"],
    ["raw_plots", "Plot radar", "fixed synthetic site", "radar"],
    ["rf_sensor", "RF direction finding", "bearing-only", "rf"],
    ["c2_network", "C2 network", "no physical location", "net"],
  ];
  return `<div class="install-hd"><span>Installation</span><b>${state.sensorFocus ? 'FOCUS' : 'SYNTHETIC'}</b></div>${rows.map(([source, label, detail, sym]) => {
    const contributes = used.has(source);
    const focused = state.sensorFocus === source;
    return `<button class="install-row ${contributes ? 'used' : ''} ${focused ? 'focus' : ''}" type="button" data-source="${esc(source)}" aria-pressed="${focused}"><span class="isym ${sym}" aria-hidden="true"></span><span><strong>${esc(label)}</strong><br><em>${esc(detail)}</em></span><em>${focused ? 'FOCUSED' : contributes ? 'CONTRIBUTES' : 'AVAILABLE'}</em></button>`;
  }).join("")}`;
}
function siteContextHTML() {
  const gcs = state.frame?.gcs;
  return `<div class="site-grid"><div class="site-kv">Reference<b>${gcs ? "GCS anchor" : "Unavailable"}</b></div><div class="site-kv">Frame<b>t=${state.t}</b></div><div class="site-kv">Coordinate frame<b>GCS-relative</b></div><div class="site-kv">Evidence<b>Scenario synthetic</b></div></div>`;
}
function evidenceControlsHTML() {
  const stats = state.frame?.stats || {};
  const controls = [
    ["raw", "Raw reports", stats.n_raw ?? "—"],
    ["rays", "RF bearings", "direction only"],
    ["sensors", "Installations", "synthetic sites"],
    ["history", "Fetched history", "real frames only"],
  ];
  return `<div class="evidence-controls">${controls.map(([layer, label, note]) => `<button type="button" data-evidence-layer="${layer}" aria-pressed="${!!state.layers[layer]}">${esc(label)}<small>${esc(note)}</small></button>`).join("")}</div>`;
}
function statusHTML() {
  const tracks = state.frame ? (state.frame.fused_tracks || []) : [];
  const hostile = tracks.filter(t => t.classification === "hostile").length;
  const svcs = ["fuse","sense","reason"].map(sv =>
    `<span class="svc ${state.health[sv]?'ok':'down'}"><span class="d"></span>${esc(sv)} ${esc(state.dataMode[sv]||'—')}${REPLAY ? ' · recorded' : ''}</span>`).join(" ");
  return `<div class="row"><span class="dot" style="background:${hostile?'var(--hostile)':'var(--proven)'}"></span>${tracks.length} fused tracks · ${hostile} hostile</div>
    <div class="row" style="flex-wrap:wrap;gap:6px">${svcs}</div>
    <div class="row mono">scenario t=${state.t} · frame source: ${esc(state.frameMode)}</div>
    <button class="behind" id="behind">Behind the system · project evidence →</button>`;
}
function telemetryHTML() {
  const stats = state.frame && state.frame.stats || {};
  const tracks = state.frame && state.frame.fused_tracks || [];
  const hostile = tracks.filter(t => t.classification === "hostile").length;
  const cells = [
    [stats.n_fused ?? tracks.length, "fused tracks"],
    [hostile, "hostile tracks"],
    [stats.n_raw ?? "—", "raw reports"],
    [stats.n_contributors ?? "—", "contributors"],
    [stats.n_unassociated_reports ?? "—", "unassociated"],
  ];
  return cells.map(([n, label]) => `<div class="metric"><b>${esc(n)}</b><span>${esc(label)}</span></div>`).join("");
}
function trackStripHTML() {
  const tracks = [...(state.frame?.fused_tracks || [])].sort((a, b) => a.priority - b.priority);
  const head = `<div class="track-head" aria-hidden="true"><span>Track</span><span>Pri</span><span>Class</span><span>GCS range</span><span>Speed</span><span>σ horiz.</span><span>Sources</span></div>`;
  if (!tracks.length) return `${head}<div class="track-empty">No fused tracks in fetched frame t=${state.t}.</div>`;
  return head + tracks.map(tr => {
    const rel = distanceBearing(state.frame?.gcs, tr.position);
    return `<button class="track-row" type="button" data-track-id="${esc(tr.fused_id)}" aria-current="${tr.fused_id === state.selected}">
      <span class="track-id">${esc(tr.fused_id)}</span><span>P${esc(tr.priority)}</span><span class="track-class ${esc(tr.classification)}">${esc(clsName[tr.classification] || tr.classification)}</span><span>${fmtRange(rel?.range_m)}</span><span>${num(tr.velocity_mps, 0)} m/s</span><span>±${num(tr.position_sigma_m, 0)} m</span><span>${esc(tr.num_sources)}</span>
    </button>`;
  }).join("");
}
function scenarioActivityHTML(tr) {
  const current = state.frame;
  if (!current || !tr) return `<div class="activity-row"><span>Current frame</span><b>Unavailable</b></div>`;
  const currentRF = (current.raw_by_source?.rf_sensor || []).filter(r => r.geometry_type === "bearing_ray").length;
  const fetched = [...frameCache.entries()].filter(([t]) => t < state.t).sort((a, b) => b[0] - a[0]).slice(0, 3);
  const latest = fetched.map(([t, frame]) => {
    const present = (frame.fused_tracks || []).some(x => x.fused_id === tr.fused_id);
    return `<div class="activity-row"><span>t=${t} · fetched frame</span><b>${present ? `${esc(tr.fused_id)} present` : "track absent"}</b></div>`;
  }).join("");
  return `<div class="activity-row"><span>t=${state.t} · selected track</span><b>${esc(tr.fused_id)} · ${esc(tr.num_sources)} sources</b></div>
    <div class="activity-row"><span>t=${state.t} · frame totals</span><b>${esc(current.stats?.n_fused ?? (current.fused_tracks || []).length)} fused · ${esc(current.stats?.n_raw ?? "—")} raw</b></div>
    ${currentRF ? `<div class="activity-row"><span>t=${state.t} · RF evidence</span><b>${currentRF} bearing${currentRF === 1 ? "" : "s"} only</b></div>` : ""}
    ${latest || `<div class="activity-row"><span>Fetched scenario history</span><b>Current frame only</b></div>`}`;
}
// ---- proactive scenario watch ------------------------------------------------
// The catalogue matcher, not the local model, determines the scenario. Its fixed templates keep
// the main dashboard grounded while the optional model is limited to approving scenario options.
function scenarioForWatch(tr) {
  const catalog = state.scenarioCatalog;
  if (!catalog) return null;
  const rules = [...catalog.scenarios].sort((a, b) => a.precedence - b.precedence);
  return rules.find(card => {
    const match = card.match || {};
    if (match.frame_unavailable) return !state.frame;
    if (match.track_absent) return !!state.frame && !tr;
    if (!tr) return false;
    if (match.time && !(match.time[0] <= state.t && state.t <= match.time[1])) return false;
    if (match.classification && tr.classification !== match.classification) return false;
    if (match.priority && tr.priority !== match.priority) return false;
    if (match.max_sources && tr.num_sources > match.max_sources) return false;
    return true;
  }) || null;
}
function scenarioValues(tr) {
  return {
    fused_id: tr?.fused_id || "selected track", classification: tr?.classification || "unavailable",
    priority: tr?.priority ?? "—", num_sources: tr?.num_sources ?? "—", sigma_m: num(tr?.position_sigma_m, 0),
    contributors: [...new Set((tr?.contributors || []).map(c => SOURCE_LABEL[c.source_system] || c.source_system))].join(", ") || "no contributor metadata",
  };
}
function scenarioLine(template, values) {
  return String(template).replace(/\{(fused_id|classification|priority|num_sources|sigma_m|contributors)\}/g, (_, key) => values[key]);
}
function modelSlotLines(result, match, tr, surface) {
  const ids = result?.response?.[`${surface}_slot_ids`];
  const allowed = match?.model_slots?.[surface] || [];
  if (!Array.isArray(ids) || ids.length !== allowed.length || new Set(ids).size !== ids.length
      || !ids.every(id => typeof id === "string" && allowed.includes(id) && typeof match.slot_templates?.[id] === "string")) return null;
  // Reuse validated slot choices, never cached numeric prose: values always come
  // from the currently fetched FUSE frame, with no per-frame model invocation.
  return ids.map(id => scenarioLine(match.slot_templates[id], scenarioValues(tr)));
}
function analystStatus(match) {
  if (state.watchPaused) return "PAUSED · SCENARIO";
  if (!match || !state.analyst.key) return "SCENARIO MATCHED";
  if (state.analyst.status === "pending") return REPLAY ? "LOADING RECORDED DRAFT" : "LOCAL MODEL CHECKING";
  if (state.analyst.status === "validated") return REPLAY ? "RECORDED LOCAL MODEL DRAFT" : "LOCAL MODEL DRAFT";
  return "DETERMINISTIC SCENARIO FALLBACK";
}
function validLocalAnalystResult(value, match, tr) {
  const response = value?.response;
  return value?.source_status === "validated_local_model_slots" && value?.scenario_id === match.id
    && value?.selected_track_id === tr?.fused_id && Array.isArray(value?.watch) && value.watch.length === 2
    && response?.scenario_id === match.id && response?.selected_track_id === tr?.fused_id
    && Array.isArray(response?.watch_slot_ids) && Array.isArray(response?.copilot_slot_ids)
    && Array.isArray(response?.question_slot_ids) && Array.isArray(response?.evidence_keys)
    && Array.isArray(response?.uncertainty_keys) && typeof response?.review_question_id === "string"
    && modelSlotLines(value, match, tr, "watch") !== null
    && modelSlotLines(value, match, tr, "copilot") !== null
    && typeof value?.evidence_boundary === "string" && typeof value?.provenance === "string";
}
function maybeRequestLocalAnalyst(match, tr) {
  if (state.watchPaused || !match || !tr || match.id === "track_absent" || match.id === "frame_unavailable") return;
  const key = `${match.id}:${tr.fused_id}`;
  if (state.analyst.key === key) return; // one request per scenario transition or track selection
  state.analyst = { key, requestSeq: state.analyst.requestSeq + 1, status: "pending", result: null };
  const requestSeq = state.analyst.requestSeq;
  getLocalAnalystBrief(state.t, tr.fused_id, () => !state.watchPaused && state.analyst.requestSeq === requestSeq && state.analyst.key === key).then(result => {
    // A crossing/boundary/selection transition invalidates an older in-flight response.
    if (state.watchPaused || state.analyst.requestSeq !== requestSeq || state.analyst.key !== key) return;
    state.analyst.status = validLocalAnalystResult(result, match, tr) ? "validated" : "unavailable";
    state.analyst.result = state.analyst.status === "validated" ? result : null;
    draw();
  });
}
function watchHTML(tr) {
  const match = scenarioForWatch(tr);
  if (!match) return `<details class="panel-section watch" open><summary>AI watch · scenario signals</summary><div class="section-body"><div class="pending">Scenario catalogue unavailable. The selected synthetic track remains visible without a model request.</div></div></details>`;
  maybeRequestLocalAnalyst(match, tr);
  const values = scenarioValues(tr);
  const result = state.analyst.result;
  const hasModelDraft = state.analyst.status === "validated" && validLocalAnalystResult(result, match, tr);
  const lines = (hasModelDraft ? modelSlotLines(result, match, tr, "watch") : (match.lines || []).map(line => scenarioLine(line, values))).map(line => `<p>${esc(line)}</p>`).join("");
  const modelQuestion = hasModelDraft ? result.response?.review_question_id : null;
  const question = match.review_questions?.[modelQuestion] || match.review_questions?.[Object.keys(match.review_questions || {})[0]] || "No review question is defined.";
  const current = state.watchPaused
    ? `<article class="watch-entry"><div class="watch-meta"><span>watch paused</span><span>t=${state.t}</span></div><p>Updates and local-model requests are held until resumed. The selected track details remain current.</p><span class="watch-source">Local display control</span></article>`
    : `<article class="watch-entry change"><div class="watch-meta"><span>${esc(match.title)}</span><span>t=${state.t}</span></div>${lines}<span class="watch-source">${hasModelDraft ? esc(modelDraftLabel(result)) : `DETERMINISTIC SCENARIO FALLBACK · fixed catalogue v${esc(state.scenarioCatalog.version)}`}</span></article>`;
  const boundary = `<article class="watch-entry boundary"><div class="watch-meta"><span>evidence boundary</span><span>scenario</span></div><p>${esc(state.scenarioCatalog.evidence_boundary)}</p><span class="watch-source">PROVEN (SCENARIO) · synthetic timeline</span></article>`;
  const status = analystStatus(match), toggleLabel = state.watchPaused ? "Resume watch" : "Pause watch";
  return `<details class="panel-section watch" open><summary>AI watch · scenario signals</summary><div class="section-body"><div class="watch-summary"><span class="watch-status"><i></i>${esc(status)}</span><span>${esc(match.title)}</span></div><div class="watch-feed">${current}${boundary}</div><div class="watch-foot"><span>Review question: ${esc(question)} Proactive, not autonomous; no actions or commands.</span><button id="watchToggle" type="button" aria-pressed="${state.watchPaused}">${toggleLabel}</button></div></div></details>`;
}
// ---- separate scenario Copilot ------------------------------------------------
// This surface uses the same server-built scenario packet as AI Watch. It has no free-text
// prompt: operators can only select questions explicitly approved by the matched catalogue card.
function selectedTrack() { return (state.frame?.fused_tracks || []).find(track => track.fused_id === state.selected) || null; }
function validCopilotContent(value, match, tr) {
  const modelContent = value?.source_status === "validated_local_model_slots";
  const deterministicContent = value?.source_status === "deterministic_scenario_copilot";
  return (modelContent || deterministicContent) && value?.scenario_id === match?.id
    && (!tr || value?.selected_track_id === tr.fused_id)
    && Array.isArray(value?.summary) && Array.isArray(value?.questions)
    && value.questions.every(question => typeof question?.id === "string" && typeof question?.text === "string")
    && typeof value?.evidence_boundary === "string" && typeof value?.provenance === "string";
}
function requestCopilotQuestion(questionId) {
  const tr = selectedTrack(), match = scenarioForWatch(tr);
  const content = state.copilot.content;
  if (!tr || !match || state.copilot.status === "answering" || !validCopilotContent(content, match, tr)) return;
  const question = content.questions.find(item => item.id === questionId);
  if (!question) return;
  const requestSeq = state.copilot.requestSeq + 1;
  state.copilot = { ...state.copilot, requestSeq, status: "answering", answer: null, questionText: question.text };
  draw();
  getCopilotContent(state.t, tr.fused_id, questionId, () => state.copilot.requestSeq === requestSeq && state.copilot.open).then(result => {
    if (state.copilot.requestSeq !== requestSeq || !state.copilot.open) return;
    state.copilot.status = validCopilotContent(result, match, tr) && result?.answer?.question_id === questionId ? "ready" : "unavailable";
    if (state.copilot.status === "ready") { state.copilot.content = result; state.copilot.answer = result.answer; }
    draw();
  });
}
function maybeLoadCopilot() {
  if (!state.copilot.open) return;
  const tr = selectedTrack(), match = scenarioForWatch(tr);
  if (!tr || !match || match.id === "track_absent" || match.id === "frame_unavailable") return;
  const baseKey = `${match.id}:${tr.fused_id}`;
  if (state.copilot.baseKey === baseKey && (state.copilot.content || state.copilot.status === "loading" || state.copilot.status === "unavailable")) return;
  // When Watch already has a validated slot packet for this same track and scenario,
  // Copilot renders that exact packet rather than asking the local model again.
  if (validLocalAnalystResult(state.analyst.result, match, tr)) {
    state.copilot = {
      open: true, baseKey, requestSeq: state.copilot.requestSeq + 1, status: "ready",
      content: state.analyst.result, answer: null, questionText: null,
    };
    return;
  }
  const requestSeq = state.copilot.requestSeq + 1;
  state.copilot = { open: true, baseKey, requestSeq, status: "loading", content: null, answer: null, questionText: null };
  getCopilotContent(state.t, tr.fused_id, null, () => state.copilot.requestSeq === requestSeq && state.copilot.baseKey === baseKey && state.copilot.open).then(result => {
    if (state.copilot.requestSeq !== requestSeq || state.copilot.baseKey !== baseKey || !state.copilot.open) return;
    state.copilot.status = validCopilotContent(result, match, tr) ? "ready" : "unavailable";
    state.copilot.content = state.copilot.status === "ready" ? result : null;
    draw();
  });
}
function copilotHTML(tr, match) {
  const copilot = state.copilot, content = copilot.content;
  if (!tr || !match) return `<section class="copilot-dialog" role="dialog" aria-modal="true" aria-labelledby="copilotTitle"><header class="copilot-head"><div><h2 id="copilotTitle">Scenario Copilot</h2><p>No selected scenario track is available.</p></div><button class="copilot-close" id="copilotClose" aria-label="Close scenario Copilot">×</button></header><div class="copilot-thread"><div class="copilot-message boundary">Select a fused track to open a bounded synthetic-scenario evidence explanation.</div></div></section>`;
  const context = `<span class="copilot-proven">PROVEN (SCENARIO) · t=${esc(state.t)} · ${esc(tr.fused_id)}</span>`;
  let thread = `<div class="copilot-message"><strong>Local evidence explainer</strong><p>This chat is limited to the selected synthetic scenario packet. It has no free-text input and cannot suggest actions.</p></div>`;
  let options = `<div class="copilot-options"><h3>Approved review questions</h3><div class="copilot-pending">Loading the current scenario packet…</div></div>`;
  if (validCopilotContent(content, match, tr)) {
    const source = content.source_status === "validated_local_model_slots" ? modelDraftLabel(content) : "DETERMINISTIC SCENARIO FALLBACK";
    const summary = content.source_status === "validated_local_model_slots" ? modelSlotLines(content, match, tr, "copilot") : (match.lines || []).map(line => scenarioLine(line, scenarioValues(tr)));
    thread += `<div class="copilot-message"><strong>${esc(content.title)}</strong><span class="copilot-source">${esc(source)}</span>${(summary || []).map(line => `<p>${esc(line)}</p>`).join("")}</div>`;
    if (copilot.questionText) thread += `<div class="copilot-message operator"><strong>Approved review question</strong><p>${esc(copilot.questionText)}</p></div>`;
    if (copilot.status === "answering") thread += `<div class="copilot-message"><strong>Copilot</strong><p>Preparing the bounded review response…</p></div>`;
    if (copilot.answer) thread += `<div class="copilot-message"><strong>Copilot</strong><p>${esc(copilot.answer.text)}</p></div>`;
    thread += `<div class="copilot-message boundary"><strong>Evidence boundary</strong><p>${esc(content.evidence_boundary)}</p><p>${esc(content.provenance)}</p></div>`;
    const disabled = copilot.status === "answering" ? " disabled" : "";
    options = `<div class="copilot-options"><h3>Approved review questions</h3>${content.questions.map(question => `<button type="button" data-copilot-question="${esc(question.id)}"${disabled}>${esc(question.text)}</button>`).join("")}</div>`;
  } else if (copilot.status === "unavailable") {
    thread += `<div class="copilot-message boundary"><strong>Scenario packet unavailable</strong><p>The selected-track details remain visible. Copilot did not receive a usable bounded packet.</p></div>`;
    options = `<div class="copilot-options"><h3>Approved review questions</h3><div class="copilot-pending">Unavailable until a current scenario packet can be fetched.</div></div>`;
  }
  return `<section class="copilot-dialog" role="dialog" aria-modal="true" aria-labelledby="copilotTitle"><header class="copilot-head"><div><h2 id="copilotTitle">Scenario Copilot</h2><p>Evidence explanation and human review only.</p>${context}</div><button class="copilot-close" id="copilotClose" aria-label="Close scenario Copilot">×</button></header><div class="copilot-thread" aria-live="polite">${thread}</div>${options}<footer class="copilot-foot">No free-text prompt · no operational recommendations · synthetic scenario only</footer></section>`;
}
function renderCopilot() {
  const root = document.getElementById("copilotModal"), launch = document.getElementById("copilotLaunch");
  if (!root) return;
  root.hidden = !state.copilot.open;
  if (launch) launch.setAttribute("aria-expanded", String(state.copilot.open));
  if (!state.copilot.open) { root.innerHTML = ""; return; }
  const tr = selectedTrack(), match = scenarioForWatch(tr);
  maybeLoadCopilot();
  root.innerHTML = copilotHTML(tr, match);
  const close = document.getElementById("copilotClose");
  if (close) close.onclick = () => { state.copilot.open = false; renderCopilot(); };
  root.onclick = event => { if (event.target === root) { state.copilot.open = false; renderCopilot(); } };
  root.querySelectorAll("[data-copilot-question]").forEach(button => { button.onclick = () => requestCopilotQuestion(button.dataset.copilotQuestion); });
}

async function panelHTML() {
  const tracks = state.frame ? (state.frame.fused_tracks || []) : [];
  const tr = tracks.find(t => t.fused_id === state.selected);
  if (!tr) return `<div class="pending">No selected fused track at t=${state.t}. Select a priority contact to inspect its synthetic scenario geometry.</div>`;
  const pct = Math.round((tr.confidence || 0) * 100);
  const rows = [...new Set((tr.contributors || []).map(c => c.source_system))].map(source => `<span class="chip">${esc(source)}</span>`).join("");
  const rel = distanceBearing(state.frame && state.frame.gcs, tr.position);
  const rank = [...tracks].sort((a,b) => a.priority-b.priority).findIndex(x => x.fused_id === tr.fused_id) + 1;
  return `<button class="panel-toggle" id="panelToggle" type="button" aria-expanded="${state.panelOpen}">Track details</button>
    <div class="target-select" aria-label="Target selection"><button id="targetPrev" type="button" aria-label="Previous priority track">‹</button><div class="target-current"><span>Target selection · ${rank} of ${tracks.length}</span><b>${esc(tr.fused_id)} · P${esc(tr.priority)} ${esc(tr.classification)}</b></div><button id="targetNext" type="button" aria-label="Next priority track">›</button></div>
    <div class="incident-head"><div class="severity">P${esc(tr.priority)}</div><div><h2>${esc(tr.fused_id)}</h2><div class="incident-sub">${esc(clsName[tr.classification]||tr.classification)} · selected fused track</div><span class="tag">PROVEN (SCENARIO) · SYNTHETIC TIMELINE</span></div></div>
    <details class="panel-section" open><summary>Selected track · kinematics</summary><div class="section-body"><div class="data-grid"><div class="data-card alert"><span>classification</span><b>${esc(tr.classification)}</b></div><div class="data-card"><span>GCS range</span><b>${fmtRange(rel?.range_m)}</b></div><div class="data-card"><span>GCS bearing</span><b>${fmtBearing(rel?.bearing_deg)}</b></div><div class="data-card"><span>altitude</span><b>${num(tr.position?.altitude_m,0)} m</b></div><div class="data-card"><span>ground speed</span><b>${num(tr.velocity_mps,0)} m/s</b></div><div class="data-card"><span>course</span><b>${num(tr.course_deg,0)}°</b></div></div></div></details>
    <details class="panel-section" open><summary>Fusion evidence</summary><div class="section-body"><div class="source-count"><span>Modelled horizontal σ</span><b>±${num(tr.position_sigma_m,1)} m</b></div><div class="source-count"><span>Confidence heuristic</span><b>${num(tr.confidence,3)}</b></div><div class="barwrap"><i style="width:${pct}%"></i></div><div class="source-count"><span>Source systems</span><b>${esc(tr.num_sources)}</b></div><div class="contribs">${rows || `<span class="muted">No contributor metadata.</span>`}</div></div></details>
    ${watchHTML(tr)}
    <details class="panel-section"><summary>Synthetic activity · fetched frames</summary><div class="section-body"><div class="activity">${scenarioActivityHTML(tr)}</div></div></details>
    `;
}

// ---- guided tour over the persistent Air Picture (real frames only) ----
const TOUR = [
  { t: 74, show: "fused", sel: "FT-001", title: "The hostile, at a glance", body: "FT-001 is priority 1: hostile, fused from four source systems. Heading and modeled uncertainty are on the map now." },
  { t: 74, show: "both", sel: "FT-001", title: "Five feeds, one picture", body: "Both shows the raw vendor reports behind each track — several vendors measuring one object, plus any rejected clutter the frame labels." },
  { t: 67, show: "fused", sel: "FT-001", title: "The crossing stress test", body: "Between t=67 and t=81 hostile and friend nearly cross; fusion keeps exactly one of each and the hostile stays P1." },
  { t: 81, show: "fused", sel: "FT-003", title: "Identity held through the crossing", body: "After the crossing FT-003 remains the friendly interceptor — RF never cleared it; classification held on C2 + kinematics." },
  { t: 90, show: "fused", sel: "FT-002", title: "The weak track stays honest", body: "FT-002 (unknown) is radar + C2 only — larger σ, lower confidence. The picture shows what it does not know." },
];
let tourOn = false, tourStep = 0;
function tourHTML() {
  const st = TOUR[tourStep];
  const dots = TOUR.map((_,i)=>`<i class="${i===tourStep?'on':''}"></i>`).join("");
  return `<div class="step">Guided tour · ${tourStep+1} / ${TOUR.length} · same Air Picture</div>
    <h3>${esc(st.title)}</h3><p>${esc(st.body)}</p>
    <div class="row"><div class="dots">${dots}</div>
      <button id="tourPrev" ${tourStep===0?'disabled':''}>← Prev</button>
      <button id="tourNext" ${tourStep===TOUR.length-1?'disabled':''}>Next →</button>
      <button id="tourEnd">Exit</button></div>`;
}
async function applyTour() { const st = TOUR[tourStep]; state.show = st.show; state.selected = st.sel; await goto(st.t); }

// ---- 0–90 playback: sequential async, cache, no overlapping intervals, no interpolation ----
let playToken = 0;
async function playLoop() {
  const mine = ++playToken;
  // In fixture mode only the six bookmark frames exist; step through those. With the live/dev engine
  // every integer timestep is fetched. Never interpolate; only advance after each frame resolves.
  const liveEngine = state.frameMode !== "fixture" && state.frameMode !== "offline";
  const seq = liveEngine ? Array.from({length: 91}, (_, i) => i) : BOOKMARKS;
  let idx = Math.max(0, seq.findIndex(v => v >= state.t));
  while (state.playing && mine === playToken) {
    const t = seq[idx % seq.length];
    await goto(t, { fromPlayback: true });   // awaits the real frame; stale-guarded inside goto
    if (!state.playing || mine !== playToken) break;
    await sleep(prefersReducedMotion() ? 900 : 550);
    idx++;
  }
}
function sleep(ms){ return new Promise(r => setTimeout(r, ms)); }
function prefersReducedMotion(){ return window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches; }
function togglePlay() {
  state.playing = !state.playing;
  document.getElementById("play").setAttribute("aria-pressed", String(state.playing));
  document.getElementById("play").textContent = state.playing ? "❚❚" : "▶";
  if (state.playing) playLoop(); else playToken++;   // bump token to stop the loop
}
function stopPlay() { if (state.playing) { state.playing = false; playToken++; const p = document.getElementById("play"); p.setAttribute("aria-pressed","false"); p.textContent = "▶"; } }

// ---- selection ----
function selectContact(fid) { stopPlayIfManual(); state.selected = fid; state.panelOpen = true; document.body.classList.add("sheet-open"); draw(); }
function cycleTarget(direction) {
  const tracks = [...(state.frame?.fused_tracks || [])].sort((a,b) => a.priority-b.priority);
  if (!tracks.length) return;
  const at = Math.max(0, tracks.findIndex(t => t.fused_id === state.selected));
  state.selected = tracks[(at + direction + tracks.length) % tracks.length].fused_id;
  draw();
}
function selectSensor(source) {
  state.sensorFocus = state.sensorFocus === source ? null : source;
  state.layers.sensors = true;
  state.layers.raw = !!state.sensorFocus;
  state.layers.rays = !state.sensorFocus || source === "rf_sensor";
  draw();
}
function stopPlayIfManual() { /* selection during playback keeps playing but pins selection */ }

// ---- render ----
async function draw() {
  const tl = document.getElementById("tlabel"); if (tl) tl.textContent = "t=" + state.t;
  const tv = document.getElementById("tval"); if (tv) tv.textContent = "t=" + state.t;
  const timeline = document.getElementById("timeline"); if (timeline) timeline.value = String(state.t);
  const timelineControl = document.getElementById("timelineControl");
  if (timelineControl) timelineControl.style.setProperty("--timeline-progress", `${(state.t / 90) * 100}%`);
  ensureMap(state.frame?.gcs);
  renderMap(document.getElementById("air"), state.frame, state.show);
  document.getElementById("legend").innerHTML = renderLegend();
  document.getElementById("telemetry").innerHTML = telemetryHTML();
  document.getElementById("trackStrip").innerHTML = trackStripHTML();
  document.querySelectorAll("[data-track-id]").forEach(row => { row.onclick = () => selectContact(row.dataset.trackId); });
  const rangeLabel = document.getElementById("mapRange");
  if (rangeLabel) rangeLabel.textContent = !state.frame?.gcs ? "Map geometry unavailable" : state.sensorFocus === "c2_network" ? "C2 logical contributor · no map geometry" : state.sensorFocus ? `SOURCE FOCUS · ${SOURCE_LABEL[state.sensorFocus] || state.sensorFocus}` : "GCS-relative geometry";
  document.querySelectorAll("#showseg button").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.show === state.show)));
  document.querySelectorAll("[data-layer]").forEach(b => b.setAttribute("aria-pressed", String(!!state.layers[b.dataset.layer])));
  document.querySelectorAll(".bm").forEach(b => b.setAttribute("aria-pressed", String(+b.dataset.b === state.t)));

  document.getElementById("contacts").innerHTML = contactsHTML();
  document.querySelectorAll(".contact").forEach(c => {
    c.onclick = () => selectContact(c.dataset.fid);
    c.onkeydown = (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); selectContact(c.dataset.fid); } };
  });
  document.getElementById("installation").innerHTML = installationHTML();
  document.querySelectorAll(".install-row[data-source]").forEach(row => { row.onclick = () => selectSensor(row.dataset.source); });
  document.getElementById("siteContext").innerHTML = siteContextHTML();
  document.getElementById("evidenceControls").innerHTML = evidenceControlsHTML();
  document.querySelectorAll("[data-evidence-layer]").forEach(button => { button.onclick = () => { const layer = button.dataset.evidenceLayer; state.layers[layer] = !state.layers[layer]; if (layer === "raw") state.sensorFocus = null; draw(); }; });
  document.getElementById("status").innerHTML = statusHTML();
  const behind = document.getElementById("behind"); if (behind) behind.onclick = () => { window.location.href = "behind-the-system.html"; };

  // frame-source honesty label
  const ff = document.getElementById("frameflag");
  if (ff) ff.textContent = (state.frameMode === "fixture" || state.frameMode === "offline")
    ? "fixture / deterministic · 6 of 91 frames offline · no interpolation"
    : "live engine · all 91 real frames · no interpolation";

  document.getElementById("panel").innerHTML = await panelHTML();
  const panelToggle = document.getElementById("panelToggle");
  if (panelToggle) panelToggle.onclick = () => { state.panelOpen = !state.panelOpen; document.body.classList.toggle("sheet-open", state.panelOpen); draw(); };
  const targetPrev = document.getElementById("targetPrev"), targetNext = document.getElementById("targetNext");
  if (targetPrev) targetPrev.onclick = () => cycleTarget(-1);
  if (targetNext) targetNext.onclick = () => cycleTarget(1);
  const watchToggle = document.getElementById("watchToggle");
  if (watchToggle) watchToggle.onclick = () => {
    state.watchPaused = !state.watchPaused;
    if (state.watchPaused && state.analyst.status === "pending") {
      state.analyst = { key: null, requestSeq: state.analyst.requestSeq + 1, status: "not_started", result: null };
    }
    draw();
  };
  document.querySelectorAll("[data-utility]").forEach(button => {
    const action = button.dataset.utility;
    const pressed = action === "air" ? state.show === "fused" && !state.layers.raw : action === "priority" ? state.selected === "FT-001" : action === "sensors" ? state.layers.sensors : action === "evidence" ? state.show === "raw" : state.layers.history;
    button.setAttribute("aria-pressed", String(pressed));
  });
  const copilotLaunch = document.getElementById("copilotLaunch");
  if (copilotLaunch) copilotLaunch.onclick = () => { state.copilot.open = true; draw(); };
  renderCopilot();

  const tourEl = document.getElementById("tour");
  tourEl.classList.toggle("on", tourOn);
  const tt = document.getElementById("tourToggle");
  tt.setAttribute("aria-pressed", String(tourOn)); tt.textContent = tourOn ? "▷ Tour running" : "▷ Guided tour";
  if (tourOn) {
    tourEl.innerHTML = tourHTML();
    document.getElementById("tourPrev").onclick = () => { if (tourStep>0){tourStep--;applyTour();} };
    document.getElementById("tourNext").onclick = () => { if (tourStep<TOUR.length-1){tourStep++;applyTour();} };
    document.getElementById("tourEnd").onclick = () => { tourOn = false; draw(); };
  }
}

// ---- wiring ----
async function boot() {
  // Retained bookmarks support the offline fixture adapter only. The operator control is the full
  // 0–90 range input; all live positions fetch their own real engine frame.
  const bm = document.getElementById("bookmarks");
  BOOKMARKS.forEach(b => {
    const btn = document.createElement("button");
    btn.className = "bm" + ((b>=CROSS[0]&&b<=CROSS[1])?" cross":"");
    btn.textContent = "t="+b; btn.dataset.b = b; btn.setAttribute("aria-label", `Jump to timestep ${b}`);
    btn.onclick = () => { stopPlay(); goto(b); };
    bm.appendChild(btn);
  });
  document.getElementById("showseg").onclick = e => {
    const b = e.target.closest("button"); if (!b) return;
    state.show = b.dataset.show;
    state.sensorFocus = null;
    if (state.show === "fused") Object.assign(state.layers, { fused:true, raw:false, rays:true, sensors:true });
    if (state.show === "raw") Object.assign(state.layers, { fused:false, raw:true, rays:true, sensors:true });
    if (state.show === "both") Object.assign(state.layers, { fused:true, raw:true, rays:true, sensors:true });
    draw();
  };
  document.getElementById("layers").onclick = e => {
    const b = e.target.closest("button[data-layer]"); if (!b) return;
    const layer = b.dataset.layer; state.layers[layer] = !state.layers[layer]; draw();
  };
  document.getElementById("play").onclick = togglePlay;
  const timeline = document.getElementById("timeline");
  const selectTimeline = e => { stopPlay(); goto(e.currentTarget.value); };
  timeline.oninput = selectTimeline;
  timeline.onchange = selectTimeline;
  document.getElementById("tourToggle").onclick = () => { tourOn = !tourOn; if (tourOn){ tourStep=0; applyTour(); } else draw(); };
  document.querySelectorAll("[data-utility]").forEach(button => { button.onclick = () => {
    const action = button.dataset.utility;
    if (action === "air") { state.show = "fused"; state.sensorFocus = null; Object.assign(state.layers, { fused:true, raw:false, rays:true, sensors:true }); }
    if (action === "priority") { const first = [...(state.frame?.fused_tracks || [])].sort((a,b)=>a.priority-b.priority)[0]; if (first) state.selected = first.fused_id; }
    if (action === "sensors") state.layers.sensors = !state.layers.sensors;
    if (action === "evidence") { state.show = "raw"; state.sensorFocus = null; Object.assign(state.layers, { fused:false, raw:true, rays:true, sensors:true }); }
    if (action === "history") state.layers.history = !state.layers.history;
    draw();
  }; });

  document.addEventListener("keydown", e => {
    const inControl = /^(BUTTON|INPUT|SELECT|TEXTAREA)$/.test((e.target.tagName||"")) || e.target.isContentEditable;
    if (e.key === "ArrowRight" && !inControl) { stopPlay(); goto(Math.min(90, state.t + 1)); }
    else if (e.key === "ArrowLeft" && !inControl) { stopPlay(); goto(Math.max(0, state.t - 1)); }
    else if (e.key === " " && !inControl) { e.preventDefault(); togglePlay(); }   // Space toggles play only outside controls
    else if (e.key === "Escape" && state.copilot.open) { state.copilot.open = false; renderCopilot(); }
  });

  if (REPLAY) {
    const note = document.createElement("div");
    note.className = "replay-note";
    note.setAttribute("role", "note");
    note.textContent = "Recorded replay · synthetic scenario · frames exported from the FUSE engine · model answers recorded locally · nothing runs live";
    document.body.prepend(note);
  }
  await loadScenarioCatalog();
  refreshHealth();
  if (!REPLAY) setInterval(refreshHealth, 15000);   // replay health is a fixed recorded file
  goto(state.t);
}
boot();
