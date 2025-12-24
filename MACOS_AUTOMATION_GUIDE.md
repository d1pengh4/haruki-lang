# 🔧 자동화 스크립트 - macOS 호환성 가이드

## 🎯 현재 상황

Puppeteer를 사용한 자동화 스크립트가 **macOS M1/M2/M3 (arm64) 아키텍처**에서 문제를 겪고 있습니다.

### 문제점
- Node.js (x64)와 Chrome (arm64)의 아키텍처 불일치
- Rosetta 변환으로 인한 성능 저하
- Puppeteer와 시스템 Chrome 간 호환성 문제

---

## ✅ 해결 방안

### 🟢 권장안 1: 수동 학습 (가장 안정적)

학습 모드에서 **직접 영상을 업로드**하여 학습시킵니다.

```bash
# 1. 개발 서버 시작
npm run dev

# 2. 웹 브라우저에서 http://localhost:5173 열기

# 3. "수화 학습하기" 버튼 클릭

# 4. "영상 업로드" 탭에서 영상 파일 선택
#    - 02/1501.mp4 선택

# 5. 자동으로 처리됨

# 6. 수화 이름 입력 (17/1501.json의 name 필드에서 확인)
#    - 예: "운전면허"

# 7. "저장" 버튼 클릭
```

**장점:**
- ✅ 100% 작동함
- ✅ 브라우저 자동화 불필요
- ✅ 문제 없음

**단점:**
- 수동으로 하나씩 해야 함
- 10개 파일 ≈ 30-40분

---

### 🔵 권장안 2: Playwright 사용 (더 나은 호환성)

Puppeteer 대신 **Playwright**를 사용합니다. (아직 구현 안 됨)

```bash
npm install -D @playwright/test

# 이후 batch-learn-playwright.mjs 사용
npm run batch-learn-playwright -- --count 10
```

**장점:**
- ✅ macOS 호환성 우수
- ✅ 자동화 가능
- ✅ 더 빠름

---

### 🟡 권장안 3: 직접 Supabase 저장 (제한적)

브라우저 없이 직접 Supabase에 저장합니다.

```bash
npm run direct-learn -- --count 10
```

**장점:**
- ✅ 자동화 가능
- ✅ 빠름

**단점:**
- ❌ 비디오 처리 미지원 (랜드마크 추출 안 함)
- ❌ 메타데이터만 저장

---

## 🎬 추천: 10개 파일 수동 학습 방법

가장 안정적이고 빠른 방법입니다.

### 준비물
- 웹 브라우저 (Chrome, Safari, Firefox)
- 1-2개 터미널

### 단계별 가이드

#### 1️⃣ 개발 서버 시작

**터미널 1:**
```bash
cd /Users/choieuro/Desktop/haruki-lang
npm run dev
```

확인:
```
  ➜  Local:   http://localhost:5173/
  ➜  press h to enter help
```

#### 2️⃣ 웹 페이지 열기

**웹 브라우저:**
```
http://localhost:5173
```

또는 자동으로 열릴 때까지 기다리기

#### 3️⃣ 학습할 파일 확인

처리할 파일 목록 (처음 10개):

| ID | 파일명 | 수화명 |
|----|--------|--------|
| 1501 | 1501.mp4 | 운전면허 |
| 1502 | 1502.mp4 | 골키퍼 |
| 1503 | 1503.mp4 | 구경 |
| 1504 | 1504.mp4 | ? |
| 1505 | 1505.mp4 | ? |
| ... | ... | ... |

<details>
<summary>📋 수화명 확인 방법</summary>

```bash
# 터미널 2에서:
cat 17/1501.json | jq '.data[0].attributes[0].name'

# 결과: "운전면허"
```

</details>

#### 4️⃣ 첫 번째 영상 학습

**웹 페이지:**
1. "수화 학습하기" 버튼 클릭
2. "영상 업로드" 탭 클릭
3. 파일 선택 또는 드래그 앤 드롭
   - `/Users/choieuro/Desktop/haruki-lang/02/1501.mp4`
4. 자동으로 비디오 처리 시작
5. 처리 완료 대기 (약 30초)
6. "운전면허" 입력
7. "저장" 클릭

#### 5️⃣ 반복

2~10번째 파일도 같은 방식으로 반복

### ⏱️ 예상 시간

- 파일당: 2-3분
- 10개 파일: 20-30분
- 점심먹으면서 진행 가능

---

## 🛠️ 다른 선택지들

### A. Node.js를 arm64 버전으로 다시 설치

```bash
# 현재 버전 확인
node --version
arch

# arm64 버전 설치
# https://nodejs.org/en/download/ 에서 Mac (ARM)
```

이후:
```bash
npm run batch-learn -- --count 10
```

### B. Docker 사용

```bash
# Docker 설치 후
docker run -it node:20-alpine /bin/bash

cd /app
npm run batch-learn -- --count 10
```

### C. GitHub Actions (CI/CD)

클라우드에서 자동화하기

---

## 📊 방법별 비교

| 방법 | 난이도 | 시간 | 안정성 | 자동화 |
|------|--------|------|--------|--------|
| 🎬 수동 학습 | 쉬움 | 30분 | ✅✅✅ | ❌ |
| 🔵 Playwright | 중간 | 10분 | ✅✅ | ✅ |
| 💾 직접 Supabase | 중간 | 5분 | ⚠️ | ✅ |
| 🔨 Node.js 재설치 | 어려움 | 1시간 | ✅✅ | ✅ |
| 🐳 Docker | 어려움 | 20분 | ✅✅✅ | ✅ |

---

## 🎯 제 추천

### 지금 당장: 수동 학습 (10개)
```bash
npm run dev
# 브라우저에서 10개 파일 수동 학습
```

### 나중에: Playwright로 자동화
```bash
# batch-learn-playwright.mjs 개발 예정
npm run batch-learn-playwright -- --count 1500
```

---

## 📞 추가 지원

질문이나 문제가 있으면:

1. **Puppeteer 문제**: 위의 "Node.js 재설치" 참고
2. **Playwright 설치**: `npm install -D @playwright/test`
3. **기타**: 문서 참고

---

**생성일**: 2025-12-21  
**권장사항**: 지금은 수동 학습, 나중에 Playwright 자동화
