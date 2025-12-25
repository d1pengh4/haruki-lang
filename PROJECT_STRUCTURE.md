# 🏗️ 프로젝트 구조

## 📁 디렉토리 구조

```
haruki-lang/
├── 02/                          # 수화 영상 파일 (1501개)
├── 17/                          # 수화 라벨 JSON 파일 (3000개)
├── scripts/                     # 배치 처리 스크립트
│   ├── batch_process.py         # ⭐ 메인 배치 학습 스크립트
│   ├── feature_extraction.py   # 손 특징 추출 함수
│   ├── delete-sign.mjs          # DB 데이터 삭제
│   ├── debug-recognition.mjs    # 인식 디버깅 도구
│   ├── check-all-frames.mjs     # 프레임 검증
│   ├── prepare-training.mjs     # 학습 데이터 준비
│   ├── remove-unique-constraint.sql  # DB 제약 제거
│   ├── requirements.txt         # Python 의존성
│   └── SETUP.md                # 배치 학습 설정 가이드
├── src/
│   ├── api/                    # API 클라이언트
│   ├── components/
│   │   ├── sign-language/
│   │   │   ├── WebcamCapture.tsx       # 웹캠 + MediaPipe
│   │   │   ├── LearningMode.tsx        # 수화 학습 모드
│   │   │   ├── RecognitionMode.tsx     # ⭐ 실시간 인식
│   │   │   └── SignList.tsx           # 수화 목록 표시
│   │   └── ui/                # shadcn/ui 컴포넌트
│   ├── lib/
│   │   ├── supabaseClient.ts  # Supabase 설정
│   │   ├── featureExtraction.ts  # 특징 추출 (33차원)
│   │   └── claudeApi.ts       # 문장 변환 API (미사용)
│   ├── pages/
│   │   └── SignLanguageApp.tsx  # ⭐ 메인 앱
│   └── main.tsx               # 앱 엔트리
├── supabase/                  # Supabase 설정
├── .env.local                 # 환경 변수 (gitignore)
├── package.json
└── README.md
```

---

## 📝 주요 파일 설명

### **1. 배치 학습 스크립트**

#### `scripts/batch_process.py` ⭐
**목적**: 영상 파일을 자동으로 처리하여 Supabase에 학습 데이터 저장

**주요 기능**:
- MP4 영상 → MediaPipe Holistic → 특징 추출
- 10 FPS 샘플링 (계산량 최적화)
- 좌우 반전 + 원본 2가지 버전 저장
- 33차원 손 특징 벡터 생성
- Body scale 정규화

**사용법**:
```bash
# 1501-1504, 2001 학습
python3 scripts/batch_process.py
```

#### `scripts/feature_extraction.py`
- 손 특징 추출 함수 모음
- `extract_hand_features()`: 33차원 벡터 생성
- `calculateBodyScale()`: 어깨 너비 기반 정규화

#### `scripts/delete-sign.mjs`
- Supabase에서 모든 수화 데이터 삭제
```bash
node scripts/delete-sign.mjs
```

---

### **2. 프론트엔드 주요 컴포넌트**

#### `src/pages/SignLanguageApp.tsx` ⭐
**역할**: 메인 애플리케이션 컴포넌트

**구성**:
- `WebcamCapture`: 웹캠 + MediaPipe 랜드마크 감지
- `RecognitionMode`: 실시간 수화 인식
- `LearningMode`: 수화 학습 (다이얼로그)
- `SignList`: 저장된 수화 목록 (검색, 접기/펼치기)

#### `src/components/sign-language/RecognitionMode.tsx` ⭐
**역할**: 실시간 수화 인식 엔진

**핵심 알고리즘**:
1. **모션 버퍼**: 90프레임 (약 3초) 유지
2. **슬라이딩 윈도우**: 학습 데이터와 비교
3. **코사인 유사도**: 특징 벡터 매칭
4. **길이 페널티**: 짧은 동작이 긴 동작과 매칭되는 것 방지
5. **중립 포즈 감지**: 수화 단어 분리

**최적화 파라미터**:
```typescript
DISPLAY_THRESHOLD = 55%      // 화면 표시
RECOGNITION_THRESHOLD = 60%  // 문장 추가
motion_variance = 0.002      // 움직임 감지
buffer_minimum = 8 frames    // 최소 버퍼
sliding_window_step = windowSize / 8  // 정밀도
length_penalty_max = 12%     // 길이 차이 페널티
```

#### `src/components/sign-language/WebcamCapture.tsx`
**역할**: 웹캠 비디오 + MediaPipe Holistic 통합

**처리 흐름**:
```
웹캠 프레임 (30 FPS)
    ↓
MediaPipe Holistic
    ↓
Landmarks 추출
├── pose (33 points)
├── leftHand (21 points)
├── rightHand (21 points)
└── face (468 points)
    ↓
특징 추출 (33차원 벡터)
    ↓
RecognitionMode에 전달
```

#### `src/lib/featureExtraction.ts`
**33차원 손 특징 벡터**:
```
[0-4]   : fingerExtensions (손가락 펴짐)
[5-14]  : fingerAngles (손가락 각도)
[15-24] : fingerTipDistances (손가락 끝 거리)
[25-27] : handShapeRatios (손 모양 비율)
[28-32] : fingerBendAngles (구부림 각도)
```

---

### **3. 데이터 구조**

#### Supabase `sign_languages` 테이블
```sql
CREATE TABLE sign_languages (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL,              -- 수화 이름
  landmarks_sequence JSONB NOT NULL,  -- 프레임 배열
  duration FLOAT,                  -- 영상 길이 (초)
  created_at TIMESTAMP,
  thumbnail TEXT                   -- 썸네일 (선택)
);
```

#### landmarks_sequence 구조
```json
[
  {
    "timestamp": 0.0,
    "pose": [...],                    // 33개 포즈 랜드마크
    "left_hand": [...],               // 21개 왼손 랜드마크
    "right_hand": [...],              // 21개 오른손 랜드마크
    "face": [...],                    // 468개 얼굴 랜드마크
    "left_hand_features": [33개 float],  // 왼손 특징 벡터
    "right_hand_features": [33개 float], // 오른손 특징 벡터
    "pose_features": [...]            // 포즈 특징 벡터
  },
  // ... 더 많은 프레임
]
```

---

## 🔧 개발 워크플로우

### **1. 새로운 수화 배치 학습**
```bash
# 1. batch_process.py의 test_numbers 수정
# 예: ["1505", "1506", "2002"]

# 2. 실행
python3 scripts/batch_process.py

# 3. 결과 확인 (Supabase 또는 웹 UI)
```

### **2. 인식 정확도 조정**
`RecognitionMode.tsx` 파라미터 조정:
```typescript
// 인식 임계값 (낮을수록 쉽게 인식)
DISPLAY_THRESHOLD = 55
RECOGNITION_THRESHOLD = 60

// 움직임 감지 (낮을수록 미세한 동작 감지)
motionVariance > 0.002

// 길이 페널티 (높을수록 엄격)
penaltyFactor = max(0.88, 1.0 - lengthPenalty * 0.03)
```

### **3. 전체 데이터 초기화**
```bash
# 모든 수화 삭제
node scripts/delete-sign.mjs

# 다시 학습
python3 scripts/batch_process.py
```

---

## 🎯 현재 학습된 데이터

| 번호 | 수화 이름 | 프레임 수 | 길이 | 버전 |
|------|----------|---------|------|------|
| 1501 | 운전면허 | 47 | 4.67초 | 2개 |
| 1502 | 골키퍼 | 35 | 3.50초 | 2개 |
| 1503 | 구경 | 37 | 3.67초 | 2개 |
| 1504 | 성토 | 40 | 4.00초 | 2개 |
| 2001 | 금시초문 | 39 | 3.83초 | 2개 |

**총**: 5개 수화, 10개 버전 (반전 + 원본)

---

## 📚 추가 문서

- `README.md`: 프로젝트 개요 및 설치 가이드
- `QUICK_START.md`: 빠른 시작 가이드
- `scripts/SETUP.md`: 배치 학습 설정 가이드

---

## 🔑 환경 변수 (`.env.local`)

```env
# Supabase
VITE_SUPABASE_URL=your-supabase-url
VITE_SUPABASE_ANON_KEY=your-anon-key

# Hugging Face (문장 변환 - 선택)
VITE_HUGGINGFACE_API_KEY=your-hf-key
```

---

## 🚀 실행 방법

```bash
# 개발 서버
npm run dev

# 빌드
npm run build

# 배치 학습
python3 scripts/batch_process.py
```
