# 📋 배치 자동 학습 시스템 - 완성 문서

## ✨ 완료된 작업

### 1️⃣ 배치 자동 학습 스크립트 (`batch-learn.mjs`)
**파일**: [`scripts/batch-learn.mjs`](scripts/batch-learn.mjs)

**기능:**
- 02 폴더의 모든 영상 파일 자동 검색
- 17 폴더의 JSON 메타데이터와 자동 매칭
- Puppeteer로 브라우저 자동화하여 수화 학습
- 실시간 진행 상황 출력
- 성공/실패 통계 및 재시도 명령어 제공

**사용법:**
```bash
npm run batch-learn                    # 모든 파일 처리
npm run batch-learn -- --start 1505    # 특정 ID부터 시작
npm run batch-learn -- --count 50      # 처음 50개만 처리
npm run batch-learn -- --start 1505 --count 50  # 조합 사용
```

**주요 특징:**
- ✅ 자동 매칭: 1501.mp4 ↔ 1501.json
- ✅ 실시간 로그: 각 단계별 상세 진행 상황
- ✅ 에러 핸들링: 실패한 파일 목록 제공
- ✅ 유연한 옵션: `--start`, `--count` 조합
- ✅ 최대 120초 타임아웃: 긴 비디오 처리 대기

---

### 2️⃣ 데이터 검증 스크립트 (`validate-data.mjs`)
**파일**: [`scripts/validate-data.mjs`](scripts/validate-data.mjs)

**기능:**
- 영상 파일과 JSON 메타데이터 매칭 검증
- 파일 크기 분석
- 누락된 파일 확인
- JSON 포맷 검증
- 성공률 계산

**사용법:**
```bash
npm run validate-data              # 기본 검증
npm run validate-data -- --verbose # 상세 출력
```

**출력 예시:**
```
✅ 발견된 영상: 1500개
✅ 발견된 JSON: 3000개
✅ 완벽한 매칭: 1500개
🎯 성공률: 100.0%
```

---

### 3️⃣ 가이드 문서

#### **QUICK_START.md** - 빠른 시작 (3단계)
- 가장 빠르고 간단한 시작 방법
- 일반 사용자용
- 터미널 명령어 3줄로 시작

#### **BATCH_LEARNING_GUIDE.md** - 상세 가이드
- 모든 옵션과 설정 설명
- 문제 해결 방법
- 대량 처리 예시
- 성능 최적화 팁
- 고급 커스터마이징

---

## 🔧 설치 및 설정

### 1. 패키지 설치 (이미 설치됨)
```bash
npm install
```

필요한 라이브러리:
- `puppeteer`: 브라우저 자동화
- `react`, `vite`: 웹 애플리케이션

### 2. npm 스크립트 추가됨
```json
{
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview",
    "lint": "tsc --noEmit",
    "auto-learn": "node ./scripts/auto-upload.mjs",
    "batch-learn": "node ./scripts/batch-learn.mjs",
    "validate-data": "node ./scripts/validate-data.mjs"
  }
}
```

---

## 📁 파일 구조

```
haruki-lang/
├── scripts/
│   ├── batch-learn.mjs          ✨ NEW: 배치 자동 학습
│   ├── validate-data.mjs         ✨ NEW: 데이터 검증
│   ├── auto-upload.mjs           (기존)
│   ├── auto-learn.mjs            (기존)
│   ├── check-training-data.mjs   (기존)
│   └── prepare-training.mjs      (기존)
├── QUICK_START.md               ✨ NEW: 빠른 시작
├── BATCH_LEARNING_GUIDE.md      ✨ NEW: 상세 가이드
├── 02/                          (영상 파일: 1501.mp4 ~ 3000.mp4)
├── 17/                          (JSON 메타데이터: 0001.json ~ 3000.json)
└── ...
```

---

## 🚀 사용 시나리오

### 시나리오 1: 처음 사용 (100개 테스트)

```bash
# 터미널 1
npm run dev

# 터미널 2 - 검증
npm run validate-data

# 터미널 2 - 처음 100개 처리
npm run batch-learn -- --count 100
```

**예상 시간**: 100-160분

---

### 시나리오 2: 대량 처리 (1500개 전부)

```bash
# 터미널 1
npm run dev

# 터미널 2 - 배치별 처리 (각 배치 150개, 약 150분 소요)

# 배치 1 (1501-1650)
npm run batch-learn -- --start 1501 --count 150
# → 약 150분 기다림

# 배치 2 (1651-1800)
npm run batch-learn -- --start 1651 --count 150
# → 약 150분 기다림

# ... 10번 반복 ...
```

**전체 예상 시간**: 20-30시간 (10개 배치)

---

### 시나리오 3: 실패 재시도

```bash
# 처음 실행
npm run batch-learn

# 처리 완료 후, 실패 목록 확인
# 예: 1520, 1535 실패

# 1520부터 재시도
npm run batch-learn -- --start 1520

# 계속되는 파일부터 재시도
npm run batch-learn -- --start 1535
```

---

## 🔍 데이터 매칭 방식

### 구조
```
02/1501.mp4  ↔  17/1501.json
02/1502.mp4  ↔  17/1502.json
...
```

### JSON 구조
```json
{
  "metaData": {
    "url": "...",
    "name": "파일명",
    "duration": 3.967
  },
  "data": [
    {
      "start": 1.298,
      "end": 2.779,
      "attributes": [
        {
          "name": "운전면허"  // ← 추출되는 수화 이름
        }
      ]
    }
  ]
}
```

### 추출 경로
```javascript
jsonData.data[0].attributes[0].name
```

---

## 📊 성능 예상

| 작업 | 시간 | 비고 |
|------|------|------|
| 10개 파일 | 10-15분 | 캐시 포함 |
| 50개 파일 | 50-80분 | 네트워크 상태 의존 |
| 100개 파일 | 100-160분 | 약 1-2.5시간 |
| 500개 파일 | 8-12시간 | 야간 처리 권장 |
| 1500개 파일 | 20-30시간 | 배치로 분할 권장 |

---

## 🛠️ 트러블슈팅

### 문제 1: "개발 서버에 연결할 수 없습니다"
```bash
# 해결
# 터미널 1에서 npm run dev 실행
npm run dev

# 터미널 2에서 batch-learn 실행
npm run batch-learn
```

### 문제 2: 자동화 실패
```bash
# 해결: --verbose로 상세 로그 확인
npm run validate-data -- --verbose

# 또는 처음 몇 개만 테스트
npm run batch-learn -- --count 3
```

### 문제 3: JSON 파일 이슈
```bash
# 해결: 데이터 검증
npm run validate-data -- --verbose

# 문제 있는 JSON 확인
cat 17/1501.json | head -20
```

---

## 💾 저장되는 데이터

각 배치 학습 후 Supabase에 저장됨:

```typescript
{
  id: "uuid",
  created_at: "2025-12-21T...",
  name: "운전면허",           // JSON에서 추출
  landmarks_sequence: [...],  // 비디오 처리 결과
  duration: 3.967,            // 초단위
  thumbnail: "image_url"      // 선택
}
```

---

## 📝 로그 예시

```
═══════════════════════════════════════════════════
🚀 배치 자동 수화 학습 시작
═══════════════════════════════════════════════════

✅ 발견된 영상 파일: 1500개

📍 시작 ID: 1501 (1500개 파일)
📊 처리할 파일: 1500개

🌐 브라우저 시작...

[1/1500] 📁 처리 중: 1501 ("운전면허")
   🌐 페이지 로드 중...
   🔘 "수화 학습하기" 버튼 클릭...
   🔘 "영상 업로드" 탭 클릭...
   📤 파일 업로드 중...
   ▶️  비디오 처리 시작...
   ⏳ 비디오 처리 대기 중... (최대 120초)
   ✅ 비디오 처리 완료!
   ✍️  수화 이름 입력: "운전면허"
   💾 저장 중...
   ✅ "운전면허" 저장 완료!

[2/1500] 📁 처리 중: 1502 ("골키퍼")
   ...

═══════════════════════════════════════════════════
📊 처리 완료 요약
═══════════════════════════════════════════════════
✅ 성공: 1498개
❌ 실패: 2개

실패한 파일 ID:
  - 1520
  - 1535

재시도 커맨드:
  npm run batch-learn -- --start 1520

✨ 배치 처리 완료!
```

---

## 🎯 다음 단계

1. **개발 서버 시작**
   ```bash
   npm run dev
   ```

2. **데이터 검증**
   ```bash
   npm run validate-data
   ```

3. **배치 학습 시작**
   ```bash
   npm run batch-learn
   ```

4. **Supabase에서 결과 확인**
   - Supabase Dashboard → `sign_languages` 테이블
   - 새로운 수화 데이터 자동 저장됨

---

## 📚 관련 문서

| 문서 | 용도 |
|------|------|
| [QUICK_START.md](QUICK_START.md) | 빠른 시작 (3줄) |
| [BATCH_LEARNING_GUIDE.md](BATCH_LEARNING_GUIDE.md) | 상세 가이드 |
| [README.md](README.md) | 프로젝트 개요 |

---

## 🤝 기술 스택

- **자동화**: Puppeteer (헤드리스 브라우저)
- **스크립트**: Node.js + ES Modules
- **파일 처리**: fs (파일 시스템)
- **데이터**: JSON 파싱, 메타데이터 추출
- **백엔드**: Supabase (자동 저장)

---

## ✅ 체크리스트

- [x] `batch-learn.mjs` 생성 (자동 학습)
- [x] `validate-data.mjs` 생성 (데이터 검증)
- [x] npm 스크립트 추가 (`batch-learn`, `validate-data`)
- [x] QUICK_START.md 작성
- [x] BATCH_LEARNING_GUIDE.md 작성
- [x] 데이터 매칭 로직 구현
- [x] 에러 핸들링 구현
- [x] 실시간 로그 출력 구현

---

## 🎉 준비 완료!

모든 설정이 완료되었습니다.

```bash
# 지금 시작하세요!
npm run dev              # 터미널 1
npm run batch-learn     # 터미널 2
```

---

**생성일**: 2025-12-21  
**버전**: 1.0  
**상태**: ✅ 완료
