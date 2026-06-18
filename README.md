# Haruki

A real-time AI-powered Korean Sign Language (KSL) translator.

Extracts hand, pose, and face landmarks using Google MediaPipe Holistic, then matches gestures against a Supabase database using 33-dimensional feature vectors with DTW + cosine similarity. Runs entirely in the browser — no installation required beyond a webcam.

**[haruki-lang.vercel.app](https://haruki-lang.vercel.app)**

---

## Tech Stack

| Layer | Stack |
|-------|-------|
| Frontend | React 18, TypeScript, Vite, Tailwind CSS, shadcn/ui, TanStack Query |
| ML | Google MediaPipe Holistic (local), Custom SDTW / Cosine matching |
| Backend | Supabase (PostgreSQL + JSONB) |
| Batch | Python 3, OpenCV, MediaPipe Python SDK |
| Deploy | Vercel |

---

## Getting Started

```bash
git clone https://github.com/d1pengh4/haruki-lang.git
cd haruki-lang
npm install
```

Create `.env.local`:

```env
VITE_SUPABASE_URL=https://your-project-id.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
VITE_HUGGINGFACE_API_KEY=your-hf-token   # optional — falls back to raw word join
```

Run `supabase/schema.sql` in the Supabase SQL Editor, then start the dev server:

```bash
npm run dev        # localhost:5173
npm run build      # production build
npm run lint       # TypeScript type check
```

---

## Architecture

```
SignLanguageApp.tsx
├── WebcamCapture       — MediaPipe init, frame capture, landmark visualization
├── RecognitionMode     — sliding buffer, DTW/cosine scoring, sentence generation
├── LearningMode        — gesture recording, quality validation, horizontal flip augmentation
└── SignList            — browse / search / delete signs from Supabase
```

**Data flow**

```
WebcamCapture
  └─ MediaPipe Holistic (local /mediapipe/)
       └─ hands 21pt × 2, pose 33pt, face 468pt
            └─ featureExtraction.ts
                 ├─ hand: 33D feature vector (scale/position/rotation invariant)
                 ├─ pose: 24D feature vector (shoulder-normalized, wrist-to-nose)
                 └─ face: 20D feature vector (EAR, MAR, brow, head angles…)
                      └─ RecognitionMode
                           ├─ 2.5s sliding window buffer (~75 frames)
                           ├─ Subsequence DTW + cosine compare against Supabase
                           └─ append to sentence when score exceeds threshold
```

Feature vectors are pre-calculated at save time and stored inside each `landmarks_sequence` frame, so recognition never recomputes them at runtime.

---

## Recognition Algorithm

Three feature vectors are extracted per frame and concatenated for matching.

**Hand (33D per hand)** — normalized by wrist-to-middle-finger distance

| Index | Feature | Dim |
|-------|---------|-----|
| 0–4 | Finger extension | 5 |
| 5–14 | Finger joint angles | 10 |
| 15–24 | Fingertip pairwise distances | 10 |
| 25–27 | Hand shape ratios | 3 |
| 28–32 | Finger bend angles | 5 |

**Pose (24D)** — normalized by shoulder width, includes wrist-to-nose distance (critical for sign location)

**Face (20D)** — EAR, MAR, brow heights, head angles, smile intensity (weight 1/29, for reference only)

Recognition uses **Subsequence DTW (SDTW)**: finds the best-matching sub-window inside the 2.5s buffer for each stored sequence, with a ±10% velocity bonus. For robustness, both original and resampled buffer variants are evaluated and the best score is used. Cosine pre-filtering limits full DTW to the top-12 candidates.

**Key parameters**

| Parameter | Value | Description |
|-----------|-------|-------------|
| Buffer size | ~75 frames | 2.5 seconds of history |
| Display threshold | 35% | minimum score to show a candidate |
| Recognition threshold | 50% | minimum score to confirm |
| Consecutive frames | 3 | required to lock in a recognition |
| Motion variance threshold | 0.0012 | motion onset detection |
| Neutral pose confirmation | 2 frames | word boundary detection |

**Augmentation (LearningMode)** — each recorded take generates: original + horizontal flip + 0.75× speed + 1.25× speed (up to 4 sequences/take, 5 takes max). All sequences are merged with any existing entries, so batch-learned and manually-recorded data coexist.

---

## Database Schema

```sql
CREATE TABLE sign_languages (
  id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at         TIMESTAMPTZ DEFAULT NOW(),
  updated_at         TIMESTAMPTZ DEFAULT NOW(),
  name               TEXT NOT NULL UNIQUE,
  landmarks_sequence JSONB NOT NULL,
  duration           NUMERIC(10,2),
  thumbnail          TEXT
);

CREATE INDEX idx_sign_languages_name       ON sign_languages(name);
CREATE INDEX idx_sign_languages_created_at ON sign_languages(created_at DESC);
```

`landmarks_sequence` is an array of frames. Each frame contains raw landmark coordinates alongside pre-calculated feature vectors:

```json
{
  "timestamp": 0.033,
  "pose": [ { "x": 0.5, "y": 0.3, "z": 0.0, "visibility": 0.99 }, "..." ],
  "left_hand": [ "..." ],
  "right_hand": [ "..." ],
  "left_hand_features": [0.12, 0.45, "...", 0.89],
  "right_hand_features": [0.08, 0.51, "...", 0.77],
  "pose_features": [ "..." ]
}
```

The v2 format bundles original and horizontally flipped sequences into a single record:

```json
{ "v": 2, "sequences": [ [...], [...] ] }
```

---

## Batch Processing

Bulk-ingest training data from MP4 videos and JSON label files.

```bash
cd scripts
pip install -r requirements.txt
python3 batch_process.py
```

**Input structure**

```
02/1501.mp4       # sign video
17/1501.json      # label: {"data": [{"attributes": [{"name": "운전면허"}]}]}
```

**Pipeline**

```
MP4 (OpenCV)
  └─ MediaPipe Holistic (sampled at 15 FPS, model_complexity=1)
       └─ compute hand 33D + pose 24D + face 20D feature vectors
            └─ original + horizontal flip + speed variants (augment level 0/1/2)
                 └─ merge with existing sequences in Supabase (v2 format)
```

---

## Key Files

| File | Description |
|------|-------------|
| `src/lib/featureExtraction.ts` | 33D feature extraction, DTW, cosine similarity |
| `src/components/sign-language/RecognitionMode.tsx` | real-time recognition loop, scoring |
| `src/components/sign-language/WebcamCapture.tsx` | MediaPipe init, landmark visualization |
| `src/components/sign-language/LearningMode.tsx` | gesture recording, quality metrics |
| `src/lib/supabaseClient.ts` | Supabase client, TypeScript interfaces |
| `src/lib/ttsService.ts` | Web Speech API Korean TTS |
| `src/lib/huggingfaceApi.ts` | Qwen2.5-7B natural sentence generation |
| `supabase/schema.sql` | database schema |
| `scripts/batch_process.py` | video → landmarks → Supabase pipeline |

---

## Notes

- MediaPipe is loaded from `/mediapipe/` (local static files bundled in `public/`). No CDN dependency.
- Camera access requires HTTPS or localhost.
- The `name` unique constraint on `sign_languages` should be dropped to allow multiple versions per sign — see `scripts/SETUP.md`.
- RLS is currently open. Configure Supabase policies before exposing to production users.

---

## License

Copyright (c) 2024–2025 Euro Choi. All Rights Reserved.

Use, copying, modification, or distribution without the explicit written permission of the copyright holder is prohibited.
