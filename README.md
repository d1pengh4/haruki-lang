# Haruki

A real-time AI-powered Korean Sign Language (KSL) translator.

Extracts hand, pose, and face landmarks using Google MediaPipe Holistic, then matches gestures against a Supabase database using 33-dimensional feature vectors with DTW + cosine similarity. Runs entirely in the browser — no installation required beyond a webcam.

**[haruki-lang.vercel.app](https://haruki-lang.vercel.app)**

---

## Tech Stack

| Layer | Stack |
|-------|-------|
| Frontend | React 18, TypeScript, Vite, Tailwind CSS, shadcn/ui, TanStack Query |
| ML | Google MediaPipe Holistic (CDN), Custom DTW / Cosine matching |
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
  └─ MediaPipe Holistic (CDN)
       └─ hands 21pt × 2, pose 33pt, face 468pt
            └─ featureExtraction.ts
                 └─ 33D feature vector (scale, position, rotation invariant)
                      └─ RecognitionMode
                           ├─ 90-frame sliding window buffer
                           ├─ DTW + cosine compare against all signs in Supabase
                           └─ append to sentence when score exceeds threshold
```

Feature vectors are pre-calculated at save time and stored inside each `landmarks_sequence` frame, so recognition never recomputes them at runtime.

---

## Recognition Algorithm

Each hand is represented as a **33-dimensional feature vector** normalized by the wrist-to-middle-finger distance, making it invariant to hand scale and camera distance.

| Index | Feature | Dim |
|-------|---------|-----|
| 0–4 | Finger extension | 5 |
| 5–14 | Finger joint angles | 10 |
| 15–24 | Fingertip pairwise distances | 10 |
| 25–27 | Hand shape ratios | 3 |
| 28–32 | Finger bend angles | 5 |

Recognition runs in two passes: cosine similarity quickly filters candidates, then DTW computes a time-warp-robust final score for each survivor. A sliding window searches the buffer for the best-matching segment, with a length penalty applied proportional to the size difference between the buffer segment and the stored sequence.

**Key parameters**

| Parameter | Value | Description |
|-----------|-------|-------------|
| Buffer size | 90 frames | ~3 seconds of history |
| Display threshold | 35% | minimum score to show a candidate |
| Recognition threshold | 48% | minimum score to append to sentence |
| Max length penalty | 12% | correction for sequence length mismatch |
| Motion variance threshold | 0.0012 | motion onset detection |
| Neutral pose confirmation | 2 frames | motion end detection |

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
  └─ MediaPipe Holistic (sampled at 10 FPS)
       └─ compute 33D feature vectors
            └─ original + horizontal flip (data augmentation)
                 └─ save to Supabase as JSONB
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

- MediaPipe is loaded at runtime from CDN. The app will not work in offline environments or where CDN URLs are blocked by CSP.
- Camera access requires HTTPS or localhost.
- RLS is currently open. Configure Supabase policies before exposing to production users.

---

## License

Copyright (c) 2024–2025 Euro Choi. All Rights Reserved.

Use, copying, modification, or distribution without the explicit written permission of the copyright holder is prohibited.
