# Haruki

실시간 AI 기반 한국 수화(KSL) 번역기.

Google MediaPipe Holistic으로 손·포즈·얼굴 랜드마크를 추출하고, 33차원 특징 벡터와 DTW + 코사인 유사도 매칭으로 수화를 텍스트로 변환합니다. 학습된 수화 데이터는 Supabase에 저장되며, 웹캠만 있으면 별도 설치 없이 브라우저에서 바로 실행됩니다.

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

`.env.local` 파일을 생성합니다:

```env
VITE_SUPABASE_URL=https://your-project-id.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
VITE_HUGGINGFACE_API_KEY=your-hf-token   # optional — 없으면 단어 그대로 연결
```

Supabase SQL Editor에서 `supabase/schema.sql`을 실행한 뒤 개발 서버를 시작합니다:

```bash
npm run dev        # localhost:5173
npm run build      # 프로덕션 빌드
npm run lint       # TypeScript 타입 체크
```

---

## Architecture

```
SignLanguageApp.tsx
├── WebcamCapture       — MediaPipe 초기화, 프레임 캡처, 랜드마크 시각화
├── RecognitionMode     — 슬라이딩 버퍼, DTW/코사인 스코어링, 문장 생성
├── LearningMode        — 수화 녹화, 품질 검증, 좌우 반전 증강
└── SignList            — Supabase 수화 목록 조회 / 검색 / 삭제
```

**데이터 흐름**

```
WebcamCapture
  └─ MediaPipe Holistic (CDN)
       └─ 손 21pt × 2, 포즈 33pt, 얼굴 468pt
            └─ featureExtraction.ts
                 └─ 33차원 특징 벡터 (스케일·위치·회전 불변)
                      └─ RecognitionMode
                           ├─ 90-frame 슬라이딩 윈도우
                           ├─ Supabase 전체 수화와 DTW + 코사인 비교
                           └─ 임계값 초과 시 문장에 추가
```

저장 시점에 특징 벡터를 사전 계산해 `landmarks_sequence` JSONB 안에 함께 보관하므로, 인식 시 실시간 재계산 없이 즉시 비교가 가능합니다.

---

## Recognition Algorithm

손 특징은 손목-중지 거리로 정규화된 **33차원 벡터**로 표현됩니다.

| Index | Feature | Dim |
|-------|---------|-----|
| 0–4 | 손가락 펴짐 정도 | 5 |
| 5–14 | 손가락 관절 각도 | 10 |
| 15–24 | 손가락 끝 간 거리 | 10 |
| 25–27 | 손 모양 비율 | 3 |
| 28–32 | 손가락 구부림 각도 | 5 |

인식은 두 단계로 진행됩니다. 먼저 코사인 유사도로 후보를 빠르게 필터링한 뒤, 통과한 후보에 대해 DTW(Dynamic Time Warping)로 시간 축 변형에 강인한 최종 점수를 계산합니다. 슬라이딩 윈도우로 버퍼 내 최적 구간을 찾고, 길이 차이에 비례한 페널티를 적용합니다.

**주요 파라미터**

| Parameter | Value | 설명 |
|-----------|-------|------|
| 버퍼 크기 | 90 frames | 약 3초 분량 유지 |
| 표시 임계값 | 35% | 후보 수화 화면 표시 기준 |
| 인식 확정 임계값 | 48% | 문장에 추가되는 기준 |
| 최대 길이 페널티 | 12% | 시퀀스 길이 차이 보정 |
| 움직임 분산 임계값 | 0.0012 | 동작 시작 감지 |
| 중립 포즈 확인 | 2 frames | 동작 종료 감지 |

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

`landmarks_sequence`는 프레임 배열로 구성됩니다. 각 프레임에는 원시 랜드마크 좌표와 사전 계산된 특징 벡터가 함께 저장됩니다:

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

v2 포맷은 원본 + 좌우 반전 시퀀스를 하나의 레코드에 묶어 저장합니다:

```json
{ "v": 2, "sequences": [ [...], [...] ] }
```

---

## Batch Processing

MP4 영상과 JSON 라벨 파일을 사용해 수화 데이터를 일괄 처리합니다.

```bash
cd scripts
pip install -r requirements.txt
python3 batch_process.py
```

**입력 구조**

```
02/1501.mp4       # 수화 영상 파일
17/1501.json      # 라벨: {"data": [{"attributes": [{"name": "운전면허"}]}]}
```

**처리 파이프라인**

```
MP4 (OpenCV)
  └─ MediaPipe Holistic (10 FPS 샘플링)
       └─ 33차원 특징 벡터 계산
            └─ 원본 + 좌우 반전 (데이터 증강)
                 └─ Supabase JSONB 저장
```

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

## Notes

- MediaPipe는 CDN에서 런타임 로드됩니다. 오프라인 환경이나 CSP가 엄격한 환경에서는 동작하지 않습니다.
- 카메라 접근은 HTTPS 또는 localhost에서만 허용됩니다.
- RLS는 현재 오픈 상태입니다. 프로덕션 사용 전 Supabase에서 정책을 설정하세요.

---

## License

Copyright (c) 2024–2025 Euro Choi. All Rights Reserved.

저작권자의 명시적 서면 허가 없이 이 소프트웨어의 사용, 복사, 수정, 배포를 금지합니다.
