// Behind the System — production case study. Uses the same real APIs / in-image public evidence as
// the operator console (health-derived where relevant; all strings HTML-escaped). Supporting proof,
// not an operational surface. The field drone is never plotted on the TYTAN scenario map.

const API = { sense: "/api/sense", fuse: "/api/fuse", reason: "/api/reason" };
const DEV = { sense: "http://127.0.0.1:8081", fuse: "http://127.0.0.1:8082", reason: "http://127.0.0.1:8083" };
const FIXT = "fixtures/";
// Recorded replay (<html data-mode="replay">): read the exported engine files only; contact no service.
const REPLAY = typeof document !== "undefined" && document.documentElement?.dataset?.mode === "replay";
const REPLAY_DIR = "replay/";

function esc(s){ return String(s==null?"":s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;"); }
function num(x,d=1){ return (typeof x==="number"&&isFinite(x))?x.toFixed(d):"—"; }
async function tryFetch(paths){ for(const p of paths){ try{ const r=await fetch(p,{cache:"no-store"}); if(r.ok) return await r.json(); }catch(e){} } return null; }
const getFrame = t => REPLAY ? tryFetch([`${REPLAY_DIR}frame-${t}.json`]) : tryFetch([`${API.fuse}/scenario/frame?t=${t}`, `${DEV.fuse}/scenario/frame?t=${t}`, `${FIXT}frame-${t}.json`]);
const getBridge = () => REPLAY ? tryFetch([`${REPLAY_DIR}bridge-0.json`]) : tryFetch([`${API.fuse}/bridge?t=0`, `${DEV.fuse}/bridge?t=0`, `${FIXT}bridge-0.json`]);
const getField = () => REPLAY ? tryFetch([`${REPLAY_DIR}field-evidence.json`]) : tryFetch([`${API.sense}/field-evidence`, `${DEV.sense}/field-evidence`, `${FIXT}field-evidence.json`]);

// EXACT truth framing (required verbatim). Distinguishes the original TYTAN challenge from the extensions.
const EXTENSION_TRUTH = "Mehrdad then extended the fusion engine with a separately validated two-camera " +
  "field sensor that produces a field-derived optical position estimate; a scenario-aligned synthetic " +
  "interface experiment showing that an OpticalObservation-shaped report can be associated and fused; " +
  "and guarded Gemini reasoning over the fused picture, run once as a private canary on a GKE Autopilot " +
  "deployment (receipt dated 15 July 2026; that deployment has since been torn down). The bridge validates interface " +
  "compatibility and fusion behavior—it does not replay the field drone inside the TYTAN scenario.";

const ORIGIN = "The original brief was the TYTAN counter-UAS multi-sensor fusion challenge: take five " +
  "incompatible vendor feeds — disagreeing on frame, units, timestamps, and identity — and produce one " +
  "prioritized, honest air picture that holds through a crossing. That is what the operator console shows. " +
  EXTENSION_TRUTH;

function chip(l, cls){ return `<div class="chips"><span class="ev-badge ${cls}">${esc(l)}</span></div>`; }

async function build(){
  document.getElementById("origin").textContent = ORIGIN;
  const frame = await getFrame(74), bridge = await getBridge(), field = await getField();

  const chapters = [
    { id:"problem", num:"01", title:"Original TYTAN fusion problem", html: () => `
      <p>Five vendor systems disagree on coordinate frame, units, timestamps, and even what an "id" means.
      Some emit filtered tracks; one emits raw plots full of clutter; one is bearing-only RF. No feed is
      trustworthy alone. The job: fuse them into one prioritized picture, without overstating certainty.</p>
      ${chip("PROVEN (SCENARIO)","ev-proven")}` },

    { id:"fusion", num:"02", title:"Fusion behavior", html: () => {
      const t = (frame && frame.fused_tracks) ? frame.fused_tracks : [];
      return `<p>At every timestep the five feeds normalize, associate, de-duplicate, and prioritize into
      fused tracks. Nearby raw markers are several vendors measuring one possible object; clutter is
      rejected; RF stays bearing-only. Not every sensor sees every object.</p>
      ${chip("PROVEN (SCENARIO)","ev-proven")}
      <div class="card"><h3>Fused tracks @ t=74 (real FusionFrame${frame?"":" — unavailable"})</h3>
      ${t.length ? t.map(x=>`<div class="metric"><span class="n">P${esc(x.priority)}</span><span class="l">${esc(x.classification)} · ${esc(x.num_sources)} systems / ${esc((x.contributors||[]).length)} reports · ±${num(x.position_sigma_m,1)} m</span></div>`).join("") : `<div class="pending">Fusion frame unavailable — degraded state, not data.</div>`}
      </div>`; } },

    { id:"crossing", num:"03", title:"Crossing stress test", html: () => `
      <p>Between t=67 and t=81 the hostile and friendly interceptor tracks nearly cross. Fusion holds
      exactly one hostile and one friend through the crossing, and the hostile stays priority 1 — the hard
      case where naive trackers swap identities.</p>
      ${chip("PROVEN (SCENARIO)","ev-proven")}` },

    { id:"field", num:"04", title:"Separately validated field sensor", html: () => {
      if (!field || !field.detection) return `<p>Field evidence unavailable.</p>${chip("PROVEN (FIELD)","ev-field")}`;
      const d = field.detection, tr = field.triangulation || {};
      return `<p>The field sensor is two cameras. Detection is validated; localization is a
      telemetry-referenced estimate with honest, bounded uncertainty — not surveyed accuracy. This is
      supporting proof that the field sensor produces an optical position estimate; it is never plotted on
      the TYTAN scenario map.</p>
      ${chip("PROVEN (FIELD)","ev-field")}
      <div class="cols">
        <div class="card"><h3>Detector · ${esc(d.status||"?")}</h3>
          <div class="metric"><span class="n">${esc(d.frames_target_found)}/${esc(d.frames_total)}</span><span class="l">reference-matched (overlapping square)</span></div>
          <div class="metric"><span class="n">${num(d.median_px_error,2)} px</span><span class="l">median reference agreement</span></div>
          <div class="metric"><span class="n">${esc(d.whole_frame_found)}/8 · ${esc(d.legacy_tiling_found)}/8 · ${esc(d.frames_target_found)}/8</span><span class="l">whole-frame · legacy 3×3 · overlapping square</span></div>
        </div>
        <div class="card"><h3>Triangulation · ${esc(tr.status||"?")}${tr.publishable?" · publishable":""}</h3>
          ${(tr.hovers||[]).map(h=>`<div class="metric"><span class="n">${num(h.err_3d_nominal_m)} m</span><span class="l">${esc(h.label)} 3D err</span></div>`).join("")}
          <div class="metric"><span class="n">${num(tr.home_residual_rms_m,3)} m</span><span class="l">home residual RMS · ray-miss ${(tr.ray_miss_range_m||[]).map(x=>num(x,2)).join("–")} m</span></div>
          <div class="note">${esc(tr.uncertainties_note || "Uncertainty-bounded; not surveyed accuracy; GNSS absolute error not characterised.")}</div>
        </div>
      </div>`; } },

    { id:"bridge", num:"05", title:"Scenario-aligned synthetic bridge", html: () => {
      if (!bridge || !bridge.metrics) return `<p>Bridge result unavailable.</p>${chip("SCENARIO-ALIGNED SYNTHETIC","ev-synthetic")}`;
      const m = bridge.metrics;
      return `<p>The bridge is a scenario-aligned synthetic interface experiment: it shows that an
      OpticalObservation-shaped report can be associated and fused into the hostile track at a single
      instant (t=0). It validates interface compatibility and fusion behavior. It does not replay the
      field drone inside the TYTAN scenario, and no injected observation position is invented (the API
      does not expose one).</p>
      ${chip("SCENARIO-ALIGNED SYNTHETIC","ev-synthetic")}
      <div class="ba">
        <div class="cell"><div class="n">${num(m.sigma_before_m)} → ${num(m.sigma_after_m)} m</div><div class="l">modeled σ</div></div>
        <div class="cell"><div class="n">${esc(m.sources_before)} → ${esc(m.sources_after)}</div><div class="l">distinct source systems</div></div>
        <div class="cell"><div class="n">${esc(m.reports_before)} → ${esc(m.reports_after)}</div><div class="l">contributor reports</div></div>
      </div>
      <div class="note">Scenario-truth error ${num(m.scenario_truth_err_before_m)} → ${num(m.scenario_truth_err_after_m)} m is validation-only; truth is unavailable operationally. ${esc(bridge.caveat||"")}</div>`; } },

    { id:"reason", num:"06", title:"Gemini reasoning (private canary)", html: () => `
      <p>Reasoning is read-only over the fused picture. The public gateway mode was deterministic; Gemini
      reasoning through Vertex AI was validated once in a private canary via Workload Identity, across all six
      timeline bookmarks (receipt dated 15 July 2026). In the operator console the brief appears as
      assistance with permanent guardrails — human review required, no engagement recommendation — never an
      autonomous action, and it shows LIVE GEMINI only when a schema-valid brief proves it.</p>
      ${chip("PRIVATELY VALIDATED · 15 JULY 2026","ev-roadmap")}` },

    { id:"deploy", num:"07", title:"GKE deployment (historical)", html: () => `
      <p>The stack is packaged for GKE with Workload Identity, non-root containers, read-only root
      filesystems, and health checks that never call the model. It ran on a GKE Autopilot cluster for the
      July 2026 canary; that deployment has since been torn down, and this page is a static replay.
      Deployment detail lives here in the case study — deliberately absent from the operator rail.</p>
      ${chip("HISTORICAL · NOT RUNNING","ev-roadmap")}` },

    { id:"roadmap", num:"08", title:"Limitations & roadmap", html: () => `
      <p>Not yet claimed: field localization is uncertainty-bounded, not surveyed; the bridge is a single
      validated instant, not a continuous camera track; GNSS absolute error is uncharacterised; the
      injected optical position is not exposed by the API. A dynamic multi-instant bridge and live
      optical-position exposure are planned once the contract is extended and tested.</p>
      ${chip("ROADMAP","ev-roadmap")}` },
  ];

  document.getElementById("toc").innerHTML = chapters.map(c=>`<a href="#${c.id}">${c.num} · ${esc(c.title)}</a>`).join("");
  document.getElementById("chapters").innerHTML = chapters.map(c=>`
    <section class="chapter" id="${c.id}"><div class="num">${c.num}</div><h2>${esc(c.title)}</h2>${c.html()}</section>`).join("");
}

document.getElementById("backop").onclick = () => { window.location.href = "index.html"; };
if (REPLAY) {
  const note = document.createElement("div");
  note.className = "replay-note";
  note.setAttribute("role", "note");
  note.textContent = "Recorded replay · figures read from exported engine files · nothing runs live";
  document.body.prepend(note);
}
build();
