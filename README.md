# Haruki

실시간 AI 기반 한국 수화(KSL) 번역기. Google MediaPipe Holistic으로 손·포즈 랜드마크를 추출하고, DTW + 코사인 유사도로 수화를 텍스트로 변환합니다.

**[haruki-lang.vercel.app](https://haruki-lang.vercel.app)**

---

## Tech Stack

| Layer | Stack |
|-------|-------|
| Frontend | React 18, TypeScript, Vite, Tailwind CSS, shadcn/ui, TanStack Query |
| ML | Google MediaPipe Holistic (CDN), Custom DTW/Cosine matching |
| Backend | Supabase (PostgreSQL + JSONB) |
| Batch | Python 3, OpenCV, MediaPipe Python SDK |

---

## Getting Started

```bash
git clone https://github.com/d1pengh4/haruki-lang.git
cd haruki-lang
npm install
```

`.env.local` 생성:

```env
VITE_SUPABASE_URL=https://your-project-id.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
VITE_HUGGINGFACE_API_KEY=your-hf-token   # optional
```

```bash
npm run dev
```

---

## Architecture

```
SignLanguageApp.tsx
├── WebcamCapture       — MediaPipe 초기화, 프레임 캡처, 랜드마크 시각화
├── RecognitionMode     — 슬라이딩 버퍼, DTW/코사인 스코어링, 문장 생성
├── LearningMode        — 수화 녹화, 품질 검증, 좌우 반전 증강
└── SignList            — Supabase 수화 목록 조회/검색/삭제
```

**데이터 흐름**

1. `WebcamCapture` — MediaPipe Holistic CDN 로드, 프레임당 랜드마크 추출
2. `featureExtraction.ts` — 랜드마크 → 33차원 불변 특징 벡터 변환 (위치·스케일·회전 불변)
3. `RecognitionMode` — 90프레임 슬라이딩 윈도우로 Supabase 전체 수화와 DTW + 코사인 비교
4. `LearningMode` — 수화 시퀀스 녹화 후 사전 계산된 특징 벡터와 함께 Supabase JSONB 저장
5. Python 배치 스크립트 — MP4 + JSON 라벨 파일을 일괄 처리해 학습 데이터 삽입

---

## Recognition Algorithm

**33차원 손 특징 벡터** (스케일 정규화: 손목-중지 거리 기준)

| Index | Feature | Dim |
|-------|---------|-----|
| 0–4 | 손가락 펴짐 정도 | 5 |
| 5–14 | 손가락 관절 각도 | 10 |
| 15–24 | 손가락 끝 간 거리 | 10 |
| 25–27 | 손 모양 비율 | 3 |
| 28–32 | 손가락 구부림 각도 | 5 |

**슬라이딩 윈도우 파라미터**

| Parameter | Value |
|-----------|-------|
| 버퍼 크기 | 90 frames (~3s) |
| 표시 임계값 | 35% |
| 인식 확정 임계값 | 48% |
| 최대 길이 페널티 | 12% |
| 움직임 분산 임계값 | 0.0012 |
| 중립 포즈 확인 프레임 | 2 frames |

---

## Database Schema

**Table: `sign_languages`**

```sql
CREATE TABLE sign_languages (
  id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at         TIMESTAMPTZ DEFAULT NOW(),
  updated_at         TIMESTAMPTZ DEFAULT NOW(),
  name               TEXT NOT NULL UNIQUE,
  landmarks_sequence JSONB NOT NULL,  -- LandmarkFrame[] | MultiSequenceData (v2)
  duration           NUMERIC(10,2),
  thumbnail          TEXT
);
```

`landmarks_sequence` 프레임 구조:

```json
{
  "timestamp": 0.0,
  "pose": [...],
  "left_hand": [...],
  "right_hand": [...],
  "face": [...],
  "left_hand_features": [33 floats],
  "right_hand_features": [33 floats],
  "pose_features": [...]
}
```

---

## Batch Processing

MP4 영상 + JSON 라벨로 학습 데이터를 일괄 처리합니다.

```bash
cd scripts
pip install -r requirements.txt
python3 batch_process.py
```

입력 구조:

```
02/1501.mp4          # 수화 영상
17/1501.json         # {"data": [{"attributes": [{"name": "운전면허"}]}]}
```

처리 순서: MP4 → MediaPipe Holistic → 10 FPS 샘플링 → 33차원 특징 벡터 → Supabase JSONB 저장 (원본 + 좌우 반전)

---

## Key Files

| File | Description |
|------|-------------|
| `src/lib/featureExtraction.ts` | 33차원 특징 추출, DTW, 코사인 유사도 |
| `src/components/sign-language/RecognitionMode.tsx` | 실시간 인식 루프, 스코어링 |
| `src/components/sign-language/WebcamCapture.tsx` | MediaPipe 초기화, 랜드마크 시각화 |
| `src/components/sign-language/LearningMode.tsx` | 수화 녹화, 품질 지표 |
| `src/lib/supabaseClient.ts` | Supabase 클라이언트, TypeScript 인터페이스 |
| `src/lib/ttsService.ts` | Web Speech API 한국어 TTS |
| `src/lib/huggingfaceApi.ts` | Qwen2.5-7B 기반 자연어 문장 변환 |
| `supabase/schema.sql` | DB 스키마 |
| `scripts/batch_process.py` | 영상 → 랜드마크 → Supabase 파이프라인 |

---

## License

Copyright (c) 2024–2025 Euro Choi. All Rights Reserved.

무단 사용, 복제, 배포를 금지합니다.
