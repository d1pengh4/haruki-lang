<div align="center">

# 🤟 HARUKI

### 실시간 AI 기반 한국 수화 번역기

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-20232A?logo=react&logoColor=61DAFB)](https://react.dev/)
[![Vite](https://img.shields.io/badge/Vite-646CFF?logo=vite&logoColor=white)](https://vitejs.dev/)
[![Supabase](https://img.shields.io/badge/Supabase-3ECF8E?logo=supabase&logoColor=white)](https://supabase.com/)

**웹캠을 통한 실시간 수화 인식 및 텍스트 변환**

[데모 보기](#-주요-기능) · [시작하기](#-빠른-시작) · [문서](#-프로젝트-구조)

</div>

---

## 📖 목차

- [개요](#-개요)
- [주요 기능](#-주요-기능)
- [기술 스택](#-기술-스택)
- [빠른 시작](#-빠른-시작)
- [프로젝트 구조](#-프로젝트-구조)
- [핵심 알고리즘](#-핵심-알고리즘)
- [배치 학습](#-배치-학습)
- [사용 방법](#-사용-방법)
- [문제 해결](#-문제-해결)

---

## 🎯 개요

**Haruki**는 **MediaPipe Holistic**을 활용한 실시간 한국 수화 인식 시스템입니다.
웹캠을 통해 손, 얼굴, 전신 포즈를 감지하고 슬라이딩 윈도우 알고리즘으로 수화를 텍스트로 변환합니다.

### 왜 Haruki인가?

- 🎥 **실시간 처리** - 웹캠에서 30 FPS로 랜드마크 감지
- 🧠 **정교한 특징 추출** - 33차원 손 특징 벡터 생성
- 📊 **슬라이딩 윈도우 매칭** - 코사인 유사도 + 길이 페널티
- 💾 **클라우드 저장** - Supabase를 통한 데이터 관리
- 🎨 **현대적 UI** - shadcn/ui 기반 반응형 디자인

---

## ✨ 주요 기능

### 1️⃣ 실시간 수화 인식

<table>
<tr>
<td width="50%">

**WebcamCapture**
- MediaPipe Holistic 통합
- 손(21점), 포즈(33점), 얼굴(468점) 감지
- 33차원 손 특징 벡터 추출
- Body scale 정규화

</td>
<td width="50%">

**RecognitionMode**
- 90프레임 슬라이딩 윈도우 (약 3초)
- 코사인 유사도 매칭
- 길이 페널티 시스템
- 중립 포즈 감지로 단어 분리

</td>
</tr>
</table>

### 2️⃣ 학습 모드

- 웹캠으로 새로운 수화 동작 녹화
- 실시간 랜드마크 시각화
- Supabase에 자동 저장
- 반전 모드 지원 (좌우 대칭)

### 3️⃣ 배치 학습

- MP4 영상 파일 자동 처리
- 10 FPS 샘플링으로 최적화
- 좌우 반전 + 원본 2가지 버전 저장
- MediaPipe를 통한 특징 추출

### 4️⃣ 데이터 관리

- 수화 목록 검색 기능
- 접기/펼치기 UI
- 개별 삭제 기능
- 생성일 기준 정렬

---

## 🛠️ 기술 스택

### Frontend

```
React 18.3          - UI 라이브러리
TypeScript 5.6      - 타입 안정성
Vite 6.0            - 빌드 도구
Tailwind CSS 3.4    - 스타일링
shadcn/ui           - UI 컴포넌트
TanStack Query 5.59 - 서버 상태 관리
Lucide React        - 아이콘
```

### AI/ML

```
MediaPipe Holistic  - Google AI 포즈 감지 모델
- 손 랜드마크: 21개 3D 좌표
- 포즈 랜드마크: 33개 3D 좌표
- 얼굴 랜드마크: 468개 3D 좌표

특징 추출: 33차원 벡터
- fingerExtensions (5개)
- fingerAngles (10개)
- fingerTipDistances (10개)
- handShapeRatios (3개)
- fingerBendAngles (5개)
```

### Backend

```
Supabase            - BaaS 플랫폼
PostgreSQL          - 데이터베이스
REST API            - 자동 생성
JSONB               - 랜드마크 저장
```

### Batch Processing

```
Python 3.x          - 배치 학습 스크립트
MediaPipe           - 영상 처리
OpenCV              - 비디오 읽기
```

---

## 🚀 빠른 시작

### 1. 저장소 클론

```bash
git clone https://github.com/d1pengh4/haruki-lang.git
cd haruki-lang
```

### 2. 의존성 설치

```bash
npm install
```

### 3. 환경 변수 설정

`.env.local` 파일을 생성하고 Supabase 정보를 입력하세요:

```bash
VITE_SUPABASE_URL=https://your-project-id.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here
```

#### Supabase 설정 방법

1. [Supabase](https://supabase.com) 가입 및 프로젝트 생성
2. SQL Editor에서 `supabase/schema.sql` 실행
3. Settings → API에서 URL과 Key 복사

### 4. 개발 서버 실행

```bash
npm run dev
```

브라우저에서 `http://localhost:5173` 접속

### 5. 프로덕션 빌드

```bash
npm run build
npm run preview
```

---

## 📂 프로젝트 구조

```
haruki-lang/
├── 02/                          # 수화 영상 파일 (gitignore)
├── 17/                          # 수화 라벨 JSON (gitignore)
├── scripts/                     # 배치 처리 스크립트
│   ├── batch_process.py         # 메인 배치 학습 스크립트
│   ├── feature_extraction.py   # 손 특징 추출 함수
│   ├── delete-sign.mjs          # DB 데이터 삭제
│   ├── requirements.txt         # Python 의존성
│   └── SETUP.md                # 배치 학습 설정 가이드
├── src/
│   ├── api/
│   │   └── base44Client.ts     # Supabase API 래퍼
│   ├── components/
│   │   ├── sign-language/
│   │   │   ├── WebcamCapture.tsx       # 웹캠 + MediaPipe
│   │   │   ├── LearningMode.tsx        # 수화 학습 모드
│   │   │   ├── RecognitionMode.tsx     # 실시간 인식
│   │   │   └── SignList.tsx           # 수화 목록 표시
│   │   └── ui/                # shadcn/ui 컴포넌트
│   ├── lib/
│   │   ├── supabaseClient.ts  # Supabase 설정
│   │   └── featureExtraction.ts  # 특징 추출 (33차원)
│   ├── pages/
│   │   └── SignLanguageApp.tsx  # 메인 앱
│   └── main.tsx               # 앱 엔트리
├── supabase/
│   └── schema.sql             # DB 스키마
├── .env.local                 # 환경 변수 (gitignore)
├── package.json
└── README.md
```

---

## 🧠 핵심 알고리즘

### 1. 33차원 손 특징 추출

```typescript
// src/lib/featureExtraction.ts
export function extractHandFeatures(handLandmarks: any[], bodyScale: number) {
  const features = [];

  // [0-4] 손가락 펴짐 정도
  fingerExtensions = calculateFingerExtensions();

  // [5-14] 손가락 관절 각도
  fingerAngles = calculateFingerAngles();

  // [15-24] 손가락 끝 간 거리
  fingerTipDistances = calculateFingerTipDistances();

  // [25-27] 손 모양 비율
  handShapeRatios = calculateHandShapeRatios();

  // [28-32] 손가락 구부림 각도
  fingerBendAngles = calculateFingerBendAngles();

  return [...features]; // 33개 float
}
```

### 2. 슬라이딩 윈도우 매칭

```typescript
// src/components/sign-language/RecognitionMode.tsx

// 90프레임 버퍼 (약 3초)
const MOTION_BUFFER_SIZE = 90;

// 슬라이딩 윈도우로 최적 매칭 탐색
for (let offset = 0; offset <= buffer.length - windowSize; offset += step) {
  const segment = buffer.slice(offset, offset + windowSize);
  const similarity = calculateCosineSimilarity(segment, sequence);

  // 길이 페널티 적용
  const lengthRatio = windowSize / sequence.length;
  const lengthPenalty = Math.abs(1 - lengthRatio);
  const penaltyFactor = Math.max(0.88, 1.0 - lengthPenalty * 0.03);

  const finalScore = similarity * penaltyFactor;
  bestScore = Math.max(bestScore, finalScore);
}
```

### 3. 최적화 파라미터

| 파라미터 | 값 | 설명 |
|---------|-----|------|
| `DISPLAY_THRESHOLD` | 55% | 화면 표시 임계값 |
| `RECOGNITION_THRESHOLD` | 60% | 문장 추가 임계값 |
| `motion_variance` | 0.002 | 움직임 감지 |
| `buffer_minimum` | 8 frames | 최소 버퍼 크기 |
| `sliding_window_step` | windowSize / 8 | 윈도우 이동 보폭 |
| `length_penalty_max` | 12% | 최대 길이 페널티 |

---

## 🎬 배치 학습

영상 파일을 자동으로 처리하여 Supabase에 학습 데이터를 저장합니다.

### 사전 요구사항

```bash
# Python 의존성 설치
cd scripts
pip install -r requirements.txt
```

### 학습 데이터 준비

```
02/               # MP4 영상 파일
├── 1501.mp4
├── 1502.mp4
├── 1503.mp4
└── ...

17/               # JSON 라벨 파일
├── 1501.json     # {"data": [{"attributes": [{"name": "운전면허"}]}]}
├── 1502.json
└── ...
```

### 배치 학습 실행

```bash
# batch_process.py의 test_numbers 수정
test_numbers = ["1501", "1502", "1503", "1504", "2001"]

# 실행
python3 scripts/batch_process.py
```

### 처리 과정

1. MP4 영상 → MediaPipe Holistic → 랜드마크 추출
2. 10 FPS 샘플링 (30 FPS → 10 FPS)
3. 33차원 손 특징 벡터 생성
4. 좌우 반전 + 원본 2가지 버전 저장
5. Body scale 정규화 적용
6. Supabase에 저장

### 현재 학습된 데이터

| 번호 | 수화 이름 | 프레임 수 | 길이 | 버전 |
|------|----------|---------|------|------|
| 1501 | 운전면허 | 47 | 4.67초 | 2개 |
| 1502 | 골키퍼 | 35 | 3.50초 | 2개 |
| 1503 | 구경 | 37 | 3.67초 | 2개 |
| 1504 | 성토 | 40 | 4.00초 | 2개 |
| 2001 | 금시초문 | 39 | 3.83초 | 2개 |

**총**: 5개 수화, 10개 버전 (반전 + 원본)

---

## 📖 사용 방법

### 학습 모드

1. "수화 학습하기" 버튼 클릭
2. 웹캠 권한 허용
3. 랜드마크 감지 확인 (녹색 체크 표시)
4. 수화 이름 입력 (예: "안녕하세요")
5. "녹화 시작" → 동작 수행 → "녹화 중지"
6. "수화 저장하기" 클릭

### 인식 모드

1. 메인 화면에서 웹캠 자동 실행
2. 등록된 수화 동작 수행
3. 오른쪽 패널에서 실시간 인식 결과 확인
4. 인식된 단어가 자동으로 문장에 추가됨
5. "복사" 버튼으로 클립보드에 저장

### 수화 관리

- **검색**: 검색창에 수화 이름 입력
- **정렬**: 생성일 기준 내림차순
- **삭제**: 각 항목의 휴지통 아이콘 클릭
- **접기/펼치기**: 화살표 버튼으로 목록 토글

---

## 🐛 문제 해결

### 웹캠이 작동하지 않아요

- ✅ 브라우저 웹캠 권한 허용 확인
- ✅ HTTPS 또는 localhost에서 실행 필요
- ✅ 다른 프로그램이 웹캠 사용 중인지 확인
- ✅ 브라우저 콘솔에서 에러 메시지 확인

### Supabase 연결 오류

```bash
# .env.local 파일 확인
cat .env.local

# Supabase URL과 Key가 올바른지 확인
# 브라우저 콘솔에서 네트워크 탭 확인
```

### 수화 인식이 잘 안돼요

**환경 개선**:
- 충분한 조명 확보 (정면 조명 추천)
- 카메라와 1~2m 거리 유지
- 배경이 단순한 환경 (단색 배경 권장)
- 상체 전체가 화면에 나오도록 조정

**학습 개선**:
- 명확한 동작으로 녹화
- 최소 1~2초 이상 녹화
- 동일한 수화를 여러 번 학습
- 좌우 반전 모드 활용

### 빌드 오류

```bash
# node_modules 삭제 후 재설치
rm -rf node_modules package-lock.json
npm install

# 캐시 삭제
npm run dev -- --force
```

### 배치 학습 오류

```bash
# Python 의존성 재설치
pip install -r scripts/requirements.txt --upgrade

# MediaPipe 버전 확인
python3 -c "import mediapipe; print(mediapipe.__version__)"
```

---

## 📊 데이터베이스 스키마

### `sign_languages` 테이블

```sql
CREATE TABLE sign_languages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  name TEXT NOT NULL,
  landmarks_sequence JSONB NOT NULL,
  duration FLOAT,
  thumbnail TEXT
);

CREATE INDEX idx_sign_languages_created_at ON sign_languages(created_at DESC);
CREATE INDEX idx_sign_languages_name ON sign_languages(name);
```

### `landmarks_sequence` 구조

```json
[
  {
    "timestamp": 0.0,
    "pose": [...],                    // 33개 포즈 랜드마크
    "left_hand": [...],               // 21개 왼손 랜드마크
    "right_hand": [...],              // 21개 오른손 랜드마크
    "face": [...],                    // 468개 얼굴 랜드마크
    "left_hand_features": [33개],     // 왼손 특징 벡터
    "right_hand_features": [33개],    // 오른손 특징 벡터
    "pose_features": [...]            // 포즈 특징 벡터
  },
  // ... 더 많은 프레임
]
```

---

## 🎓 학습 리소스

- [MediaPipe 공식 문서](https://developers.google.com/mediapipe)
- [Supabase 시작하기](https://supabase.com/docs)
- [한국수어학회](https://www.korean-sign.or.kr/)
- [코사인 유사도](https://en.wikipedia.org/wiki/Cosine_similarity)

---

## 📝 라이선스

MIT License - 자유롭게 사용, 수정, 배포 가능합니다.

---

## 👨‍💻 개발자

**Euro Choi**
- Email: eurochoic@icloud.com
- GitHub: [@d1pengh4](https://github.com/d1pengh4)

---

## 🙏 감사의 말

- **Google MediaPipe** - 오픈소스 AI 모델 제공
- **Supabase** - 무료 백엔드 서비스
- **shadcn/ui** - 아름다운 UI 컴포넌트
- **한국수어학회** - 수화 자료 참고

---

<div align="center">

**Made with ❤️ for the Deaf Community**

[![Star on GitHub](https://img.shields.io/github/stars/d1pengh4/haruki-lang?style=social)](https://github.com/d1pengh4/haruki-lang)

</div>
