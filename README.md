# HARUKI - 한국 수화 번역기

🤟 **실시간 AI 기반 한국 수화 인식 및 텍스트 변환**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-61DAFB?logo=react&logoColor=black)](https://react.dev/)
[![Vite](https://img.shields.io/badge/Vite-646CFF?logo=vite&logoColor=white)](https://vitejs.dev/)
[![Supabase](https://img.shields.io/badge/Supabase-3ECF8E?logo=supabase&logoColor=white)](https://supabase.com/)

---

## 📋 목차

- [개요](#-개요)
- [주요 기능](#-주요-기능)
- [기술 스택](#-기술-스택)
- [시작하기](#-시작하기)
- [프로젝트 구조](#-프로젝트-구조)
- [핵심 알고리즘](#-핵심-알고리즘)
- [사용 방법](#-사용-방법)
- [데이터베이스 스키마](#-데이터베이스-스키마)
- [문제 해결](#-문제-해결)
- [라이선스](#-라이선스)

---

## 🔭 개요

**Haruki**는 **MediaPipe Holistic**을 활용한 실시간 한국 수화 인식 시스템입니다. 웹캠을 통해 손, 얼굴, 전신 포즈를 감지하고 AI 기반 매칭 알고리즘으로 수화를 텍스트로 변환합니다.

### 특징
- 🎥 실시간 웹캠 기반 랜드마크 감지
- 📚 학습 모드로 새로운 수화 동작 등록
- 🔍 인식 모드로 실시간 수화 번역 및 문장 생성
- 💾 Supabase 클라우드 저장소
- 🎨 shadcn/ui 기반 현대적인 UI

---

## ✨ 주요 기능

| 기능 | 설명 |
|------|------|
| **실시간 랜드마크 감지** | MediaPipe Holistic으로 손(21점), 전신(33점), 얼굴(5점) 감지 |
| **학습 모드** | 새로운 수화 동작을 녹화하고 클라우드에 저장 |
| **인식 모드** | DTW 알고리즘 기반 실시간 수화 인식 (정확도 65%+) |
| **문장 생성** | 인식된 수화를 자동으로 문장으로 연결 |
| **클라우드 저장소** | Supabase PostgreSQL 기반 데이터 관리 |
| **성능 모니터링** | 실시간 FPS 표시 및 버퍼 상태 확인 |

---

## 🛠️ 기술 스택

### Frontend
- **React 18.3** - UI 라이브러리
- **TypeScript 5.6** - 타입 안정성
- **Vite 6.0** - 빌드 도구
- **Tailwind CSS 3.4** - 스타일링
- **shadcn/ui** - UI 컴포넌트
- **TanStack Query 5.59** - 서버 상태 관리

### AI/ML
- **MediaPipe Holistic** - Google의 포즈/손/얼굴 감지 모델
  - 손 특징 추출: 31차원 벡터
  - 동적 타임 워핑(DTW) 기반 매칭
  - 슬라이딩 윈도우 버퍼 (3초)

### Backend
- **Supabase**
  - PostgreSQL 데이터베이스
  - 자동 생성 REST API
  - Row Level Security (RLS)
  - 실시간 구독

---

## 🚀 시작하기

### 1️⃣ 사전 요구사항

- Node.js 18.x 이상
- npm 또는 yarn
- Supabase 계정 (무료)

### 2️⃣ 설치

```bash
# 저장소 클론
git clone https://github.com/d1pengh4/haruki-lang.git
cd haruki-lang

# 의존성 설치
npm install
```

### 3️⃣ Supabase 설정

#### (1) Supabase 프로젝트 생성
1. [Supabase](https://supabase.com) 접속 및 로그인
2. "New Project" 클릭
3. 프로젝트 정보 입력:
   - Name: `haruki-sign-language`
   - Region: `Northeast Asia (Seoul)`
4. "Create new project" 클릭

#### (2) 데이터베이스 스키마 생성
1. Supabase Dashboard → SQL Editor
2. `supabase/schema.sql` 파일 내용 복사 및 실행
3. 성공 메시지 확인

#### (3) 환경 변수 설정
```bash
# .env.local 파일 생성
cp .env.example .env.local

# Supabase Dashboard → Settings → API에서 값 복사
VITE_SUPABASE_URL=https://your-project-id.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here
```

### 4️⃣ 개발 서버 실행

```bash
npm run dev
```

브라우저에서 `http://localhost:5173` 열기

---

## 📂 프로젝트 구조

```
haruki/
├── src/
│   ├── main.tsx                      # React 엔트리 포인트
│   ├── index.css                     # 글로벌 스타일
│   ├── lib/
│   │   ├── supabaseClient.ts         # Supabase 클라이언트 설정
│   │   └── utils.ts                  # 유틸리티 함수
│   ├── api/
│   │   └── base44Client.ts           # Supabase API 래퍼
│   ├── components/
│   │   ├── ui/                       # shadcn/ui 컴포넌트
│   │   └── sign-language/
│   │       ├── WebcamCapture.tsx     # 웹캠 + MediaPipe 감지 (348줄)
│   │       ├── LearningMode.tsx      # 수화 학습 모드 (280줄)
│   │       └── RecognitionMode.tsx   # 수화 인식 모드 (340줄)
│   └── pages/
│       └── SignLanguageApp.tsx       # 메인 앱
├── supabase/
│   ├── schema.sql                    # DB 스키마
│   └── seed.sql                      # 샘플 데이터
├── package.json
├── vite.config.ts
├── tailwind.config.js
└── tsconfig.json
```

---

## 🎯 핵심 알고리즘

### 1. 손 특징 추출 (31차원 벡터)

```typescript
// src/components/sign-language/WebcamCapture.tsx
const calculateHandFeatures = (handLandmarks) => {
  const features = [];

  // 1. 손가락 끝-손바닥 거리 (5개)
  fingerTips.forEach(tip => {
    const distance = euclideanDistance(handLandmarks[tip], palmCenter);
    features.push(distance);
  });

  // 2. 손가락 관절 각도 (15개)
  fingerBones.forEach(bones => {
    const angle = calculateAngle(p1, p2, p3);
    features.push(angle);
  });

  // 3. 손가락 끝 간 거리 (10개)
  // 4. 손바닥 면적 (1개)

  return features; // 31차원
};
```

### 2. 동적 타임 워핑 (DTW) 매칭

```typescript
// src/components/sign-language/RecognitionMode.tsx
const calculateMotionSimilarity = (buffer, sequence) => {
  // 슬라이딩 윈도우로 최적 매칭 위치 탐색
  for (let offset = 0; offset <= buffer.length - windowSize; offset++) {
    const segment = buffer.slice(offset, offset + windowSize);

    // 프레임별 유사도 계산
    const frameSimilarities = segment.map((frame, i) =>
      compareFrames(frame, sequence[i])
    );

    const avgSimilarity = average(frameSimilarities);
    bestSimilarity = Math.max(bestSimilarity, avgSimilarity);
  }

  return bestSimilarity;
};
```

### 3. 가중치 시스템

| 요소 | 가중치 | 설명 |
|------|--------|------|
| 손 (좌/우) | **5.0** | 수화의 핵심 (랜드마크 60% + 특징 40%) |
| 얼굴 | **2.0** | 표정 정보 |
| 전신 포즈 | **1.0** | 보조 정보 |

### 4. 성능 최적화

- 프레임 샘플링: 2프레임마다 분석
- 랜드마크 서브샘플링: 10개당 1개
- 비동기 분석: `setTimeout` 활용
- 3초 슬라이딩 윈도우 버퍼

---

## 📖 사용 방법

### 학습 모드

1. "수화 학습하기" 버튼 클릭
2. 웹캠 권한 허용
3. 카메라 앞에서 신체 감지 확인 (녹색 체크)
4. 수화 이름 입력 (예: "안녕하세요", "ㄱ")
5. "녹화 시작" → 동작 수행 → "녹화 중지"
6. "수화 저장하기" 클릭

### 인식 모드

1. 메인 화면에서 웹캠 자동 실행
2. 등록된 수화 동작 수행
3. 오른쪽 패널에서 실시간 인식 결과 확인
4. 인식된 단어가 자동으로 문장 생성
5. "복사" 버튼으로 클립보드 저장

---

## 📊 데이터베이스 스키마

### `sign_languages` 테이블

| 컬럼 | 타입 | 설명 |
|------|------|------|
| `id` | UUID | 고유 식별자 (자동 생성) |
| `created_at` | TIMESTAMPTZ | 생성 일시 |
| `updated_at` | TIMESTAMPTZ | 수정 일시 (자동 업데이트) |
| `name` | TEXT | 수화 이름 (UNIQUE) |
| `landmarks_sequence` | JSONB | MediaPipe 랜드마크 시퀀스 |
| `duration` | NUMERIC(10,2) | 동작 지속 시간 (초) |
| `thumbnail` | TEXT | 썸네일 이미지 (선택) |

### 인덱스
- `idx_sign_languages_created_at` - 생성일 내림차순
- `idx_sign_languages_name` - 이름 검색 최적화
- `idx_sign_languages_duration` - 지속 시간 필터링

---

## 🐛 문제 해결

### 웹캠이 작동하지 않아요
- ✅ 브라우저 웹캠 권한 허용 확인
- ✅ HTTPS 또는 localhost에서 실행 필요
- ✅ 다른 프로그램이 웹캠 사용 중인지 확인

### Supabase 연결 오류
- ✅ `.env.local` 파일의 URL과 Key 확인
- ✅ Supabase 프로젝트가 활성화되어 있는지 확인
- ✅ `supabase/schema.sql` 실행 여부 확인
- ✅ 브라우저 콘솔에서 에러 메시지 확인

### 수화 인식이 잘 안돼요
- ✅ 충분한 조명 확보
- ✅ 카메라와 1~2m 거리 유지
- ✅ 배경이 단순한 환경에서 촬영
- ✅ 학습 시 명확한 동작으로 녹화
- ✅ 최소 0.5초 이상 녹화

### 빌드 오류
```bash
# node_modules 삭제 후 재설치
rm -rf node_modules package-lock.json
npm install
```

---

## 🔐 보안 고려사항

### 현재 상태 (프로토타입)
⚠️ 모든 사용자가 수화 데이터 읽기/쓰기/삭제 가능
⚠️ 사용자 인증 없음

### 프로덕션 배포 시 권장사항

1. **Supabase Auth 통합**
```sql
CREATE POLICY "Authenticated users only"
  ON sign_languages FOR ALL
  USING (auth.uid() IS NOT NULL);
```

2. **사용자별 데이터 분리**
```sql
ALTER TABLE sign_languages ADD COLUMN user_id UUID REFERENCES auth.users(id);
```

3. **Rate Limiting** - Supabase Edge Functions 활용

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

**Made with ❤️ for the Deaf Community**
