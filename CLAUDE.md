# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Haruki** is a real-time AI-powered Korean Sign Language (KSL) translator. It uses Google MediaPipe Holistic for landmark extraction, then matches gestures against a Supabase database using cosine similarity and Subsequence Dynamic Time Warping (SDTW).

## Commands

```bash
# Development
npm run dev              # Vite dev server at localhost:5173
npm run build            # Production build → dist/
npm run lint             # TypeScript type check (tsc --noEmit)

# Data pipeline (Node.js scripts)
npm run prepare-training  # Prepare training data
npm run debug-recognition # Debug recognition logic
npm run check-frames      # Check all frames in database
npm run delete-sign       # Delete a sign from database

# Python batch processing
cd scripts
pip install -r requirements.txt
python3 batch_process.py      # Process MP4 videos + JSON labels → Supabase (saves both original + flipped)
python3 feature_extraction.py # Hand feature extraction
```

## Architecture

```
SignLanguageApp.tsx (orchestrator, state management)
├── WebcamCapture         - MediaPipe initialization, frame capture, landmark visualization
├── RecognitionMode       - Real-time recognition: sliding buffer, DTW/cosine scoring, sentence gen
├── LearningMode          - Record new gestures, quality metrics, augmentation (horizontal flip)
├── SignList              - Browse/search/delete learned signs from Supabase
└── VoiceMode             - Korean speech→text via Web Speech API (Chrome/Edge only, no external API)
```

**Data flow:**
1. `WebcamCapture` loads MediaPipe Holistic locally from `public/mediapipe/`, captures landmarks per frame
2. `featureExtraction.ts` converts raw landmarks → invariant feature vectors per frame: 33D per hand (shape) + 24D pose (arm position)
3. `RecognitionMode` maintains a 90-frame (~3s) sliding window buffer, compares against all signs in Supabase via SDTW + cosine similarity
4. `LearningMode` records gesture sequences, stores as JSONB in Supabase with pre-calculated feature vectors
5. Python `batch_process.py` processes MP4 + JSON label files to bulk-ingest training data, saving both original and horizontally-flipped versions per video

## Key Files

| File | Purpose |
|------|---------|
| `src/lib/featureExtraction.ts` | **Core ML logic** — hand/pose feature extraction, SDTW, cosine similarity |
| `src/components/sign-language/RecognitionMode.tsx` | Real-time recognition loop, scoring thresholds |
| `src/components/sign-language/WebcamCapture.tsx` | MediaPipe setup, landmark visualization |
| `src/components/sign-language/LearningMode.tsx` | Gesture recording, quality metrics |
| `src/api/base44Client.ts` | Supabase CRUD wrapper (`list`, `create`, `update`, `delete`, `get`) |
| `src/lib/supabaseClient.ts` | Supabase client init + TypeScript interfaces |
| `supabase/schema.sql` | DB schema: `sign_languages` table with JSONB `landmarks_sequence` |
| `src/lib/huggingfaceApi.ts` | HuggingFace Inference — converts KSL word sequences → natural Korean sentences (Qwen2.5-7B) |
| `src/lib/ttsService.ts` | Web Speech API wrapper — speaks recognized sentences aloud in Korean |
| `scripts/batch_process.py` | Bulk video → landmark → Supabase pipeline |
| `scripts/SETUP.md` | Supabase setup guide (dropping unique constraint for multi-version signs) |

## Recognition Logic

- **Feature vectors per frame**: 33D per hand (finger extensions ×5, joint angles ×10, fingertip distances ×10, shape ratios ×3, bend angles ×5) + 24D pose (arm angles, wrist/elbow positions, wrist-to-nose distances)
- **Sliding window**: 90-frame buffer; recognition fires after detecting motion then neutral pose
- **Thresholds**: display at 35% (`DISPLAY_THRESHOLD`), recognize at 48% (`RECOGNITION_THRESHOLD`); static gestures get +2~3% on both
- **Motion detection**: variance threshold 0.002, min 15 frames, 3 neutral frames to confirm end
- **Normalization**: hand features normalized by `handScale` (wrist-to-middle-finger distance); pose features normalized by shoulder width

## Database Schema

**Table: `sign_languages`**
- `name` (TEXT) — sign label; duplicate names are allowed (multiple versions of the same sign)
- `landmarks_sequence` (JSONB) — array of frames; each frame contains raw pose/hand/face landmarks + pre-calculated feature vectors (`left_hand_features`, `right_hand_features`, `pose_features`)
- `duration` (NUMERIC) — sequence length in seconds

The `name` unique constraint should be dropped to allow storing multiple versions (original + flipped) per sign — see `scripts/SETUP.md`. RLS is currently open (anyone can read/write).

## Environment Variables

```env
VITE_SUPABASE_URL=https://your-project-id.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
VITE_HUGGINGFACE_API_KEY=your-hf-token   # Optional; falls back to raw word join if absent
```

## Tech Stack

- **Frontend**: React 18, TypeScript, Vite, Tailwind CSS, shadcn/ui, TanStack Query
- **ML**: Google MediaPipe Holistic (loaded locally from `public/mediapipe/`), custom SDTW/cosine matching
- **Backend**: Supabase (PostgreSQL + JSONB)
- **Batch processing**: Python 3, OpenCV, MediaPipe Python SDK

## Coding Conventions

- Comments in Korean (existing codebase convention)
- Use TanStack Query for all Supabase data fetching
- Use shadcn/ui for all UI components
- Always work with extracted feature vectors (`left_hand_features`, `right_hand_features`, `pose_features`) — never raw landmark coordinates — for matching
- Store pre-calculated feature vectors inside `landmarks_sequence` JSONB frames at save time

## Gotchas

- **Entity vs table name**: `base44Client.ts` exposes `base44.entities.SignLanguage` (PascalCase), which maps to the `sign_languages` table. Use this wrapper, not raw Supabase client calls, for CRUD.
- **MediaPipe is bundled locally**: `WebcamCapture` loads MediaPipe Holistic via `<script>` tags pointing to `/mediapipe/` (served from `public/mediapipe/`). Works offline, but the WASM/model files (~tens of MB) are committed to the repo.
- **No test suite**: There are no automated tests. Validate recognition changes manually by running `npm run dev` and testing gestures live.
- **Multi-version signs**: `RecognitionMode` compares against all DB entries and picks the best match, so storing multiple versions of the same sign (original + flipped) improves recognition without changing the matching logic.
