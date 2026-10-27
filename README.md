# Seemorgh operator console: recorded replay

**[Open the replay](https://console.apps.mehridian.tech/)** · [Portfolio account](https://mehridian.tech/projects/)

A static, read-only replay of the Seemorgh operator console. Five synthetic sensor feeds disagree on frame, units, timestamps and identity: long-range radar, plot radar, a precision tracker, RF direction-finding and a C2 network. The FUSE engine turns them into one prioritised air picture of fused tracks, each with its contributing sources and a modelled position uncertainty. Scrub the timeline from t=0 to t=90, select a track, and see which sources support it.

Every frame in this replay was exported from the real FUSE engine. AI Watch and Scenario Copilot show answers that a local model recorded once. Nothing here runs live: there's no server, model or sensor behind the page.

## What you're looking at

| Part | Source | Category |
| --- | --- | --- |
| Air picture, all 91 timesteps | FUSE engine output, exported frame by frame (`replay/frame-*.json`) | Synthetic scenario |
| Field evidence and bridge pages | SENSE public evidence record; FUSE bridge experiment at t=0 | As labelled on each page |
| Reasoning brief | Deterministic REASON fallback, one per timestep | Deterministic, not a model |
| AI Watch and Copilot | `qwen3:4b` answers, recorded on 27 October 2026 (`replay/analyst/`) | Recorded local-model output |

**How the recorded answers work.** The model never writes free text for the screen. For each scenario situation and track, it picked approved explanation slots and an approved review question. The console checks those against the selected track and scenario, then fills the slot templates with values from the frame being shown. The replay labels them `RECORDED LOCAL MODEL DRAFT · qwen3:4b · … · recorded 2026-10-27`.

Fifteen answers were recorded, one per situation, track and question, the same rule the live console follows. Fourteen passed the model checks. One Copilot question fell back to the labelled deterministic answer, which is the console's normal behaviour when the model's selection doesn't validate.

## How it was made

- **Source:** private `seemorgh-stack` at merge commit `793a475dc2476fcaf247c619f8eecff372b223eb`.
- **The exporter:** its `scripts/export_replay.py` read running FUSE, SENSE and REASON services, plus a loopback local analyst.
- **The model:** Ollama 0.40.11 with `qwen3:4b`, digest `359d7dd4bcdab3d86b87d73ac27966f4dbb9f5efdfcc75d34a8764a09474fae7`, at temperature 0. One run, no retries.
- **Determinism:** before recording, all 91 frames were exported twice, from two separate processes, and came out byte-identical.
- **Integrity:** `SHA256SUMS` lists every replay file, and CI checks it on every push.

The page files are the console's own front end, unchanged except for `data-mode="replay"` on the two HTML pages, which switches every read to `replay/`. They were taken after one later wording fix in `seemorgh-stack`: the "Behind the system" page now dates the private Gemini canary (15 July 2026) and says that the GKE deployment has since been torn down. The replay data is unaffected by that change.

## Limits

- **Synthetic scenario.** Tracks, sensor sites, classifications, uncertainty and RF bearings are scenario values, not field observations. The Munich basemap is a reference only.
- **Recorded, not live.** The model answers are one recording, and they don't show latency or real-time behaviour.
- **What fusion here doesn't do.** It's single-instant fusion with greedy association, not a temporal tracker. Confidence is a heuristic, not a calibrated probability.
- **No operational use.** The console explains evidence for human review. It never recommends or executes an action.

## Credits and licence

- **The scenario:** it comes from the scenario generator provided for the TYTAN counter-UAS multi-sensor fusion challenge, the original brief for this work. Its output is published here with permission.
- **Third parties:** the map uses [Leaflet](https://leafletjs.com/) (BSD-2-Clause) and © [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors.
- **Licence:** the code in this repository is Apache-2.0; see `LICENSE` and `NOTICE`. The rest of `seemorgh-stack` remains private.
