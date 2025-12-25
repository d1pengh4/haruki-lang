<div align="center">

# 🤟 HARUKI

### 실시간 AI 기반 한국 수화 번역기

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-20232A?logo=react&logoColor=61DAFB)](https://react.dev/)
[![Vite](https://img.shields.io/badge/Vite-646CFF?logo=vite&logoColor=white)](https://vitejs.dev/)
[![Supabase](https://img.shields.io/badge/Supabase-3ECF8E?logo=supabase&logoColor=white)](https://supabase.com/)
[![MediaPipe](https://img.shields.io/badge/MediaPipe-00ACC1?logo=google&logoColor=white)](https://google.github.io/mediapipe/)

**웹캠을 통한 실시간 수화 인식 및 텍스트 변환**

[🚀 빠른 시작](#-빠른-시작) · [📖 문서](#-프로젝트-구조) · [🎬 배치 학습](#-배치-학습) · [💡 알고리즘](#-핵심-알고리즘)

<img src="https://img.shields.io/badge/Status-Active-success?style=for-the-badge" alt="Status">
<img src="https://img.shields.io/badge/Build-Passing-success?style=for-the-badge" alt="Build">

---

### ✨ 주요 특징

🎥 **실시간 처리** · 🧠 **33차원 특징 추출** · 📊 **슬라이딩 윈도우** · 💾 **클라우드 저장** · 🎨 **현대적 UI**

</div>

---

## 📖 목차

- [개요](#-개요)
- [데모 영상](#-데모-영상)
- [주요 기능](#-주요-기능)
- [기술 스택](#-기술-스택)
- [빠른 시작](#-빠른-시작)
- [프로젝트 구조](#-프로젝트-구조)
- [핵심 알고리즘](#-핵심-알고리즘)
- [배치 학습](#-배치-학습)
- [사용 방법](#-사용-방법)
- [성능 최적화](#-성능-최적화)
- [문제 해결](#-문제-해결)
- [로드맵](#-로드맵)
- [기여하기](#-기여하기)
- [라이선스](#-라이선스)

---

## 🎯 개요

**Haruki**는 **Google MediaPipe Holistic**을 활용한 실시간 한국 수화 인식 시스템입니다.

웹캠을 통해 손, 얼굴, 전신 포즈를 감지하고 **슬라이딩 윈도우 + 코사인 유사도** 알고리즘으로 수화를 텍스트로 변환합니다.

### 💡 핵심 가치

```
🌐 접근성      → 누구나 웹 브라우저에서 무료로 사용
🚀 실시간      → 30 FPS 웹캠 처리, 즉각적인 피드백
🎓 학습 가능    → 새로운 수화를 직접 등록하고 학습
📊 정확도      → 최적화된 알고리즘으로 60%+ 인식률
🎨 사용자 친화적 → 직관적인 UI/UX, 검색 및 관리 기능
```

---

## 🎬 데모 영상

> ⚡️ 실시간 수화 인식 과정

1. **웹캠 실행** → MediaPipe가 손과 포즈 감지
2. **수화 동작** → 90프레임 버퍼에 동작 저장
3. **실시간 매칭** → 데이터베이스와 비교하여 인식
4. **문장 생성** → 인식된 단어를 자동으로 연결

```
📹 WebcamCapture → 🤖 MediaPipe → 📊 Feature Extraction → 🔍 Recognition → 📝 Sentence
```

---

## ✨ 주요 기능

<table>
<tr>
<td width="50%" valign="top">

### 🎥 실시간 인식 모드

- **MediaPipe Holistic** 통합
  - 손: 21개 랜드마크 × 2 (좌/우)
  - 포즈: 33개 랜드마크
  - 얼굴: 468개 랜드마크

- **33차원 손 특징 벡터**
  - 손가락 펴짐 (5개)
  - 손가락 각도 (10개)
  - 손가락 끝 거리 (10개)
  - 손 모양 비율 (3개)
  - 손가락 구부림 각도 (5개)

- **슬라이딩 윈도우 알고리즘**
  - 90프레임 버퍼 (약 3초)
  - 코사인 유사도 매칭
  - 길이 페널티 시스템
  - 중립 포즈 감지

</td>
<td width="50%" valign="top">

### 📚 학습 모드

- **웹캠 녹화**
  - 실시간 랜드마크 시각화
  - 녹화 시작/중지 제어
  - 품질 검증 (랜드마크 감지율)

- **데이터 저장**
  - Supabase 클라우드 저장
  - JSONB 형식으로 효율적 저장
  - 자동 타임스탬프 및 duration 계산

- **배치 학습 지원**
  - MP4 영상 파일 자동 처리
  - 10 FPS 샘플링
  - 좌우 반전 + 원본 2가지 버전
  - Body scale 정규화

</td>
</tr>

<tr>
<td colspan="2">

### 🗂️ 데이터 관리

- **검색 기능**: 수화 이름으로 실시간 검색
- **정렬**: 생성일 기준 내림차순
- **삭제**: 개별 항목 삭제 (확인 후)
- **접기/펼치기**: UI 공간 최적화
- **상세 정보**: 프레임 수, duration, 생성일 표시

</td>
</tr>
</table>

---

## 🛠️ 기술 스택

<div align="center">

### Frontend

![React](https://img.shields.io/badge/React_18.3-20232A?style=for-the-badge&logo=react&logoColor=61DAFB)
![TypeScript](https://img.shields.io/badge/TypeScript_5.6-007ACC?style=for-the-badge&logo=typescript&logoColor=white)
![Vite](https://img.shields.io/badge/Vite_6.0-646CFF?style=for-the-badge&logo=vite&logoColor=white)
![TailwindCSS](https://img.shields.io/badge/Tailwind_CSS-38B2AC?style=for-the-badge&logo=tailwind-css&logoColor=white)
![TanStack Query](https://img.shields.io/badge/TanStack_Query-FF4154?style=for-the-badge&logo=react-query&logoColor=white)

### AI/ML

![MediaPipe](https://img.shields.io/badge/MediaPipe-00ACC1?style=for-the-badge&logo=google&logoColor=white)
![Python](https://img.shields.io/badge/Python_3.x-3776AB?style=for-the-badge&logo=python&logoColor=white)
![OpenCV](https://img.shields.io/badge/OpenCV-5C3EE8?style=for-the-badge&logo=opencv&logoColor=white)

### Backend

![Supabase](https://img.shields.io/badge/Supabase-3ECF8E?style=for-the-badge&logo=supabase&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-316192?style=for-the-badge&logo=postgresql&logoColor=white)

</div>

### 상세 기술 스택

```typescript
Frontend Framework:
├── React 18.3          - UI 라이브러리
├── TypeScript 5.6      - 타입 안정성
├── Vite 6.0            - 초고속 빌드 도구
├── Tailwind CSS 3.4    - 유틸리티 CSS
├── shadcn/ui           - 접근성 높은 UI 컴포넌트
└── TanStack Query 5.59 - 서버 상태 관리

AI/ML Stack:
├── MediaPipe Holistic  - Google AI 포즈 감지
├── Python 3.x          - 배치 처리 스크립트
└── OpenCV              - 비디오 처리

Backend & Database:
├── Supabase            - BaaS 플랫폼
├── PostgreSQL          - 관계형 데이터베이스
└── REST API            - 자동 생성 API
```

---

## 🚀 빠른 시작

### 1️⃣ 저장소 클론

```bash
git clone https://github.com/d1pengh4/haruki-lang.git
cd haruki-lang
```

### 2️⃣ 의존성 설치

```bash
npm install
```

### 3️⃣ 환경 변수 설정

`.env.local` 파일을 생성하고 Supabase 정보를 입력하세요:

```env
# Supabase Configuration
VITE_SUPABASE_URL=https://your-project-id.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here
```

<details>
<summary>📋 Supabase 설정 방법</summary>

1. [Supabase](https://supabase.com) 가입 및 프로젝트 생성
2. SQL Editor에서 `supabase/schema.sql` 실행
3. Settings → API에서 URL과 Anon Key 복사
4. `.env.local` 파일에 붙여넣기

</details>

### 4️⃣ 개발 서버 실행

```bash
npm run dev
```

브라우저에서 `http://localhost:5173` 접속

### 5️⃣ 프로덕션 빌드

```bash
npm run build
npm run preview
```

---

## 📂 프로젝트 구조

```
haruki-lang/
├── 📁 src/
│   ├── 📁 api/
│   │   └── base44Client.ts           # Supabase API 래퍼
│   ├── 📁 components/
│   │   ├── 📁 sign-language/
│   │   │   ├── WebcamCapture.tsx     # 웹캠 + MediaPipe 통합
│   │   │   ├── LearningMode.tsx      # 수화 학습 모드
│   │   │   ├── RecognitionMode.tsx   # ⭐ 실시간 인식 엔진
│   │   │   ├── SignList.tsx          # 수화 목록 관리
│   │   │   └── VideoProcessor.tsx    # 영상 파일 처리
│   │   └── 📁 ui/                    # shadcn/ui 컴포넌트
│   ├── 📁 lib/
│   │   ├── supabaseClient.ts         # Supabase 설정
│   │   └── featureExtraction.ts      # 33차원 특징 추출
│   ├── 📁 pages/
│   │   └── SignLanguageApp.tsx       # ⭐ 메인 애플리케이션
│   └── main.tsx                      # React 엔트리 포인트
│
├── 📁 scripts/                       # 배치 처리 스크립트
│   ├── batch_process.py              # ⭐ 메인 배치 학습
│   ├── feature_extraction.py         # 손 특징 추출
│   ├── delete-sign.mjs               # DB 데이터 삭제
│   ├── requirements.txt              # Python 의존성
│   └── SETUP.md                     # 배치 학습 가이드
│
├── 📁 supabase/
│   └── schema.sql                    # 데이터베이스 스키마
│
├── 📁 02/                            # 수화 영상 파일 (gitignore)
├── 📁 17/                            # 수화 라벨 JSON (gitignore)
│
├── .env.local                        # 환경 변수 (gitignore)
├── .gitignore                        # Git 제외 파일
├── .vercelignore                     # Vercel 제외 파일
├── package.json                      # 프로젝트 설정
├── vite.config.ts                    # Vite 설정
├── tailwind.config.js                # Tailwind 설정
└── README.md                         # 프로젝트 문서
```

---

## 🧠 핵심 알고리즘

### 1. 33차원 손 특징 추출

```typescript
// src/lib/featureExtraction.ts
export function extractHandFeatures(handLandmarks: Landmark[], bodyScale: number) {
  const features: number[] = [];

  // [0-4] 손가락 펴짐 정도 (Finger Extensions)
  const fingerExtensions = calculateFingerExtensions(handLandmarks, bodyScale);
  features.push(...fingerExtensions); // 5개

  // [5-14] 손가락 관절 각도 (Finger Joint Angles)
  const fingerAngles = calculateFingerAngles(handLandmarks);
  features.push(...fingerAngles); // 10개

  // [15-24] 손가락 끝 간 거리 (Fingertip Distances)
  const fingerTipDistances = calculateFingerTipDistances(handLandmarks, bodyScale);
  features.push(...fingerTipDistances); // 10개

  // [25-27] 손 모양 비율 (Hand Shape Ratios)
  const handShapeRatios = calculateHandShapeRatios(handLandmarks);
  features.push(...handShapeRatios); // 3개

  // [28-32] 손가락 구부림 각도 (Finger Bend Angles)
  const fingerBendAngles = calculateFingerBendAngles(handLandmarks);
  features.push(...fingerBendAngles); // 5개

  return features; // Total: 33개 float
}
```

### 2. 슬라이딩 윈도우 매칭

```typescript
// src/components/sign-language/RecognitionMode.tsx

// 90프레임 버퍼 (약 3초, 30 FPS 기준)
const MOTION_BUFFER_SIZE = 90;
const DISPLAY_THRESHOLD = 55;  // 화면 표시 임계값 (55%)
const RECOGNITION_THRESHOLD = 60;  // 문장 추가 임계값 (60%)

// 슬라이딩 윈도우로 최적 매칭 탐색
for (let offset = 0; offset <= buffer.length - windowSize; offset += step) {
  const segment = buffer.slice(offset, offset + windowSize);

  // 코사인 유사도 계산
  const similarity = calculateCosineSimilarity(segment, sequence);

  // 길이 페널티 적용 (최대 12%)
  const lengthRatio = windowSize / sequence.length;
  const lengthPenalty = Math.abs(1 - lengthRatio);
  const penaltyFactor = Math.max(0.88, 1.0 - lengthPenalty * 0.03);

  // 최종 점수
  const finalScore = similarity * penaltyFactor;
  bestScore = Math.max(bestScore, finalScore);
}
```

### 3. 최적화 파라미터

| 파라미터 | 값 | 설명 | 효과 |
|---------|-----|------|------|
| `DISPLAY_THRESHOLD` | **55%** | 화면 표시 임계값 | 낮을수록 더 많은 후보 표시 |
| `RECOGNITION_THRESHOLD` | **60%** | 문장 추가 임계값 | 낮을수록 쉽게 인식 |
| `motion_variance` | **0.002** | 움직임 감지 | 낮을수록 미세한 동작 감지 |
| `buffer_minimum` | **8 frames** | 최소 버퍼 크기 | 짧은 동작도 인식 가능 |
| `sliding_window_step` | **windowSize / 8** | 윈도우 이동 보폭 | 작을수록 정밀하지만 느림 |
| `length_penalty_max` | **12%** | 최대 길이 페널티 | 낮을수록 길이 차이에 엄격 |

### 4. Body Scale 정규화

```python
# scripts/feature_extraction.py
def calculateBodyScale(poseLandmarks):
    """어깨 너비를 기준으로 body scale 계산"""
    left_shoulder = poseLandmarks[11]
    right_shoulder = poseLandmarks[12]

    shoulder_width = math.sqrt(
        (right_shoulder['x'] - left_shoulder['x'])**2 +
        (right_shoulder['y'] - left_shoulder['y'])**2
    )

    return shoulder_width if shoulder_width > 0 else 1.0
```

---

## 🎬 배치 학습

영상 파일을 자동으로 처리하여 Supabase에 학습 데이터를 저장합니다.

### 사전 요구사항

```bash
cd scripts
pip install -r requirements.txt
```

### 학습 데이터 준비

```
02/                   # MP4 영상 파일
├── 1501.mp4          # 운전면허
├── 1502.mp4          # 골키퍼
├── 1503.mp4          # 구경
├── 1504.mp4          # 성토
└── 2001.mp4          # 금시초문

17/                   # JSON 라벨 파일
├── 1501.json         # {"data": [{"attributes": [{"name": "운전면허"}]}]}
├── 1502.json
└── ...
```

### 배치 학습 실행

```python
# scripts/batch_process.py 수정
test_numbers = ["1501", "1502", "1503", "1504", "2001"]

# 실행
python3 scripts/batch_process.py
```

### 처리 과정

```
1. MP4 영상 읽기 (OpenCV)
   ↓
2. MediaPipe Holistic 처리
   ├─ Pose Landmarks (33개)
   ├─ Left Hand Landmarks (21개)
   ├─ Right Hand Landmarks (21개)
   └─ Face Landmarks (468개)
   ↓
3. 10 FPS 샘플링 (30 FPS → 10 FPS)
   ↓
4. 33차원 손 특징 벡터 생성
   ├─ Body Scale 정규화
   └─ 좌우 반전 + 원본 2가지 버전
   ↓
5. Supabase에 JSONB 형식으로 저장
```

### 현재 학습된 데이터

| 번호 | 수화 이름 | 프레임 수 | 길이 | 버전 | 손 감지율 |
|------|----------|---------|------|------|----------|
| 1501 | 운전면허 | 47 | 4.67초 | 2개 | 100% |
| 1502 | 골키퍼 | 35 | 3.50초 | 2개 | 100% |
| 1503 | 구경 | 37 | 3.67초 | 2개 | 100% |
| 1504 | 성토 | 40 | 4.00초 | 2개 | 100% |
| 2001 | 금시초문 | 39 | 3.83초 | 2개 | 100% |

**총**: 5개 수화, 10개 버전 (좌우 반전 + 원본)

---

## 📖 사용 방법

### 학습 모드

<table>
<tr>
<td width="30">1️⃣</td>
<td><strong>"수화 학습하기"</strong> 버튼 클릭</td>
</tr>
<tr>
<td>2️⃣</td>
<td>웹캠 권한 허용 및 랜드마크 감지 확인 (✅ 녹색 체크)</td>
</tr>
<tr>
<td>3️⃣</td>
<td>수화 이름 입력 (예: "안녕하세요", "감사합니다")</td>
</tr>
<tr>
<td>4️⃣</td>
<td><strong>"녹화 시작"</strong> → 수화 동작 수행 → <strong>"녹화 중지"</strong></td>
</tr>
<tr>
<td>5️⃣</td>
<td><strong>"수화 저장하기"</strong> 클릭하여 Supabase에 저장</td>
</tr>
</table>

### 인식 모드

<table>
<tr>
<td width="30">1️⃣</td>
<td>메인 화면에서 웹캠 자동 실행</td>
</tr>
<tr>
<td>2️⃣</td>
<td>등록된 수화 동작 수행</td>
</tr>
<tr>
<td>3️⃣</td>
<td>우측 패널에서 <strong>실시간 인식 결과</strong> 확인</td>
</tr>
<tr>
<td>4️⃣</td>
<td>인식된 단어가 자동으로 문장에 추가됨</td>
</tr>
<tr>
<td>5️⃣</td>
<td><strong>"복사"</strong> 버튼으로 클립보드에 저장</td>
</tr>
</table>

### 수화 관리

- 🔍 **검색**: 검색창에 수화 이름 입력하여 실시간 필터링
- 📊 **정렬**: 생성일 기준 내림차순 자동 정렬
- 🗑️ **삭제**: 각 항목의 휴지통 아이콘 클릭 (확인 후 삭제)
- 📁 **접기/펼치기**: 화살표 버튼으로 목록 토글하여 공간 절약

---

## ⚡ 성능 최적화

### 1. 프레임 샘플링

```typescript
// 30 FPS → 10 FPS 샘플링
if (frameCount % 3 === 0) {
  processFrame(frame);
}
```

### 2. 랜드마크 서브샘플링

```typescript
// 468개 얼굴 랜드마크 → 5개만 사용
const faceLandmarks = [33, 263, 1, 61, 291]; // 눈, 코, 입
```

### 3. 비동기 분석

```typescript
setTimeout(() => {
  analyzeMotionBuffer();
}, 0);
```

### 4. React Query 캐싱

```typescript
const { data: signs } = useQuery({
  queryKey: ['signs'],
  staleTime: 5 * 60 * 1000, // 5분
  cacheTime: 10 * 60 * 1000, // 10분
});
```

### 5. 빌드 최적화

```bash
# Vite 빌드 최적화
npm run build

# 결과: 772KB (gzip: 215KB)
# - Code splitting 적용
# - Tree shaking 자동
# - Minification 활성화
```

---

## 🐛 문제 해결

<details>
<summary><strong>❌ 웹캠이 작동하지 않아요</strong></summary>

- ✅ 브라우저 웹캠 권한 허용 확인
- ✅ HTTPS 또는 localhost에서 실행 필요
- ✅ 다른 프로그램이 웹캠 사용 중인지 확인
- ✅ 브라우저 콘솔(F12)에서 에러 메시지 확인

```bash
# 개발 서버 재시작
npm run dev
```

</details>

<details>
<summary><strong>❌ Supabase 연결 오류</strong></summary>

```bash
# .env.local 파일 확인
cat .env.local

# 올바른 형식인지 확인
VITE_SUPABASE_URL=https://...
VITE_SUPABASE_ANON_KEY=eyJ...
```

- ✅ Supabase 프로젝트가 활성화되어 있는지 확인
- ✅ `supabase/schema.sql` 실행 여부 확인
- ✅ 브라우저 콘솔에서 네트워크 탭 확인

</details>

<details>
<summary><strong>❌ 수화 인식이 잘 안돼요</strong></summary>

**환경 개선**:
- ✅ 충분한 조명 확보 (정면 조명 추천)
- ✅ 카메라와 1~2m 거리 유지
- ✅ 배경이 단순한 환경 (단색 배경 권장)
- ✅ 상체 전체가 화면에 나오도록 조정

**학습 개선**:
- ✅ 명확한 동작으로 녹화
- ✅ 최소 1~2초 이상 녹화
- ✅ 동일한 수화를 여러 번 학습
- ✅ 좌우 반전 모드 활용

**파라미터 조정**:
```typescript
// RecognitionMode.tsx
const DISPLAY_THRESHOLD = 50;  // 낮추면 더 쉽게 인식
const RECOGNITION_THRESHOLD = 55;  // 낮추면 더 쉽게 문장 추가
```

</details>

<details>
<summary><strong>❌ 빌드 오류</strong></summary>

```bash
# node_modules 삭제 후 재설치
rm -rf node_modules package-lock.json
npm install

# 캐시 삭제
npm run dev -- --force

# TypeScript 타입 체크
npx tsc --noEmit
```

</details>

<details>
<summary><strong>❌ 배치 학습 오류</strong></summary>

```bash
# Python 의존성 재설치
pip install -r scripts/requirements.txt --upgrade

# MediaPipe 버전 확인
python3 -c "import mediapipe; print(mediapipe.__version__)"

# OpenCV 설치 확인
python3 -c "import cv2; print(cv2.__version__)"
```

</details>

---

## 📊 데이터베이스 스키마

### `sign_languages` 테이블

```sql
CREATE TABLE sign_languages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  name TEXT NOT NULL UNIQUE,
  landmarks_sequence JSONB NOT NULL,
  duration NUMERIC(10,2),
  thumbnail TEXT
);

-- 인덱스
CREATE INDEX idx_sign_languages_created_at ON sign_languages(created_at DESC);
CREATE INDEX idx_sign_languages_name ON sign_languages(name);
CREATE INDEX idx_sign_languages_duration ON sign_languages(duration);
```

### `landmarks_sequence` 구조

```json
[
  {
    "timestamp": 0.0,
    "pose": [...],                      // 33개 포즈 랜드마크
    "left_hand": [...],                 // 21개 왼손 랜드마크
    "right_hand": [...],                // 21개 오른손 랜드마크
    "face": [...],                      // 468개 얼굴 랜드마크
    "left_hand_features": [33개 float], // 왼손 33차원 특징 벡터
    "right_hand_features": [33개 float],// 오른손 33차원 특징 벡터
    "pose_features": [...]              // 포즈 특징 벡터
  },
  // ... 더 많은 프레임
]
```

---

## 🗺️ 로드맵

### ✅ 완료

- [x] MediaPipe Holistic 통합
- [x] 실시간 수화 인식 엔진
- [x] 33차원 손 특징 추출
- [x] 슬라이딩 윈도우 매칭
- [x] 웹캠 학습 모드
- [x] 배치 학습 스크립트
- [x] 검색 및 관리 UI
- [x] Supabase 통합

### 🚧 진행 중

- [ ] HuggingFace Qwen 모델 통합 (문장 변환)
- [ ] 인식률 개선 (60% → 80%+)
- [ ] 더 많은 수화 데이터 학습

### 📅 계획

- [ ] 실시간 번역 모드 (수화 → 음성)
- [ ] 모바일 앱 버전 (React Native)
- [ ] 사용자 인증 및 개인 수화 사전
- [ ] 수화 교육 콘텐츠 통합
- [ ] 다국어 지원 (ASL, JSL 등)
- [ ] 오프라인 모드 (PWA)

---

## 🤝 기여하기

기여를 환영합니다! 다음 방법으로 참여하실 수 있습니다:

### 1. 이슈 제출

- 🐛 버그 리포트
- 💡 기능 제안
- 📚 문서 개선
- ❓ 질문

### 2. Pull Request

```bash
# 1. Fork the repository
# 2. Create your feature branch
git checkout -b feature/AmazingFeature

# 3. Commit your changes
git commit -m "Add some AmazingFeature"

# 4. Push to the branch
git push origin feature/AmazingFeature

# 5. Open a Pull Request
```

### 3. 코딩 가이드라인

- TypeScript 사용
- ESLint + Prettier 적용
- 컴포넌트 단위 설계
- 주석은 한글로 작성
- Commit 메시지는 [Conventional Commits](https://www.conventionalcommits.org/) 규칙 따르기

---

## 🎓 학습 리소스

- [MediaPipe 공식 문서](https://developers.google.com/mediapipe)
- [Supabase 시작하기](https://supabase.com/docs)
- [한국수어학회](https://www.korean-sign.or.kr/)
- [코사인 유사도](https://en.wikipedia.org/wiki/Cosine_similarity)
- [슬라이딩 윈도우 알고리즘](https://en.wikipedia.org/wiki/Sliding_window_protocol)

---

## 📝 라이선스

**All Rights Reserved** - 이 소프트웨어의 모든 권리는 저작권자에게 있습니다.

```
Copyright (c) 2024-2025 Euro Choi. All Rights Reserved.

이 소프트웨어와 관련 문서 파일(이하 "소프트웨어")의 사용, 복사, 수정, 병합,
게시, 배포, 재라이선스 및 판매는 저작권자의 명시적 서면 허가 없이 금지됩니다.

본 소프트웨어는 "있는 그대로" 제공되며, 명시적이거나 묵시적인 어떠한 종류의
보증도 제공하지 않습니다. 저작권자는 소프트웨어의 사용 또는 기타 거래로 인해
발생하는 어떠한 청구, 손해 또는 기타 책임에 대해서도 책임을 지지 않습니다.

무단 사용, 복제, 배포 시 법적 조치를 받을 수 있습니다.

This software and associated documentation files (the "Software") may not be
used, copied, modified, merged, published, distributed, sublicensed, or sold
without the express written permission of the copyright holder.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED. IN NO EVENT SHALL THE COPYRIGHT HOLDER BE LIABLE FOR ANY CLAIM,
DAMAGES OR OTHER LIABILITY ARISING FROM THE USE OF THE SOFTWARE.

Unauthorized use, reproduction, or distribution may result in legal action.
```

---

## 👨‍💻 개발자

<div align="center">

**Euro Choi**

[![Email](https://img.shields.io/badge/Email-eurochoic@icloud.com-EA4335?style=for-the-badge&logo=gmail&logoColor=white)](mailto:eurochoic@icloud.com)
[![GitHub](https://img.shields.io/badge/GitHub-d1pengh4-181717?style=for-the-badge&logo=github&logoColor=white)](https://github.com/d1pengh4)

</div>

---

## 🙏 감사의 말

이 프로젝트는 다음 오픈소스 프로젝트의 도움을 받았습니다:

- **Google MediaPipe** - 오픈소스 AI 모델 제공
- **Supabase** - 무료 백엔드 서비스
- **shadcn/ui** - 아름다운 UI 컴포넌트
- **한국수어학회** - 수화 자료 및 가이드라인
- **NIA 한국지능정보사회진흥원** - 수화 영상 데이터셋

---

<div align="center">

**Made with ❤️ for the Deaf Community**

[![Star on GitHub](https://img.shields.io/github/stars/d1pengh4/haruki-lang?style=social)](https://github.com/d1pengh4/haruki-lang)
[![Fork on GitHub](https://img.shields.io/github/forks/d1pengh4/haruki-lang?style=social)](https://github.com/d1pengh4/haruki-lang/fork)
[![Watch on GitHub](https://img.shields.io/github/watchers/d1pengh4/haruki-lang?style=social)](https://github.com/d1pengh4/haruki-lang)

---

### ⭐ 이 프로젝트가 도움이 되었다면 Star를 눌러주세요!

</div>
