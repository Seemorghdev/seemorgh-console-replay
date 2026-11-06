# Seemorgh operator console: recorded replay

A static, read-only replay of the Seemorgh operator console for reviewers examining its recorded synthetic scenario.

**[Open the hosted replay](https://console.apps.mehridian.tech/)**

**Status.** Built: a browser replay of 91 synthetic frames, with five sensor feeds, fused tracks, and recorded AI Watch and Scenario Copilot output. Evidence: 15 local-model answers were recorded; 14 passed the model checks and one used the labelled deterministic fallback. Limits: this is a synthetic recording, not a live sensor feed, model service, or operational console.

## Quick-start

Requires Python 3 and a browser. No package installation or model download is needed. The map uses Leaflet and OpenStreetMap, so viewing it requires an internet connection. From the repository root:

```bash
python3 -m http.server 8000 --bind 127.0.0.1
```

Open <http://127.0.0.1:8000/>. Stop the server with Ctrl-C.

## Tests

On macOS, run `shasum -a 256 -c SHA256SUMS`: all 204 listed files should report `OK`. CI runs the same integrity check with `sha256sum`, checks that the manifest covers every replay file, and verifies that the 91 frames and both pages use replay mode. Workflow: `replay-integrity.yml`.

## How it fits

This is the recorded, static console replay for the [Seemorgh operator console project](https://mehridian.tech/projects/seemorgh-operator-console). It shows the synthetic scenario and saved explanations; the page does not run the model, sensors, or fusion engine.

## Licence

Apache-2.0. See `LICENSE` and `NOTICE`.

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

- **Source:** the console's private source repository, at merge commit `793a475dc2476fcaf247c619f8eecff372b223eb`.
- **The exporter:** its `scripts/export_replay.py` read running FUSE, SENSE and REASON services, plus a loopback local analyst.
- **The model:** Ollama 0.40.11 with `qwen3:4b`, digest `359d7dd4bcdab3d86b87d73ac27966f4dbb9f5efdfcc75d34a8764a09474fae7`, at temperature 0. One run, no retries.
- **Determinism:** before recording, all 91 frames were exported twice, from two separate processes, and came out byte-identical.
- **Integrity:** `SHA256SUMS` lists every replay file, and CI checks it on every push.

The page files are the console's own front end, unchanged except for `data-mode="replay"` on the two HTML pages, which switches every read to `replay/`. They were taken after one later wording fix in the private source: the "Behind the system" page now dates the private Gemini canary (15 July 2026) and says that the GKE deployment has since been torn down. The replay data is unaffected by that change.

## Limits

- **Synthetic scenario.** Tracks, sensor sites, classifications, uncertainty and RF bearings are scenario values, not field observations. The Munich basemap is a reference only.
- **Recorded, not live.** The model answers are one recording, and they don't show latency or real-time behaviour.
- **What fusion here doesn't do.** It's single-instant fusion with greedy association, not a temporal tracker. Confidence is a heuristic, not a calibrated probability.
- **No operational use.** The console explains evidence for human review. It never recommends or executes an action.

## Credits

- **The scenario:** it comes from the scenario generator provided for the TYTAN counter-UAS multi-sensor fusion challenge, the original brief for this work. Its output is published here with permission.
- **Third parties:** the map uses [Leaflet](https://leafletjs.com/) (BSD-2-Clause) and © [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors.
- **Licence:** the code in this repository is Apache-2.0; see `LICENSE` and `NOTICE`. The rest of the console's source remains private.
