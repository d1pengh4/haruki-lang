# 배치 비디오 학습 가이드

이 가이드는 02 폴더의 영상 파일과 17 폴더의 JSON 라벨을 사용하여 자동으로 수화 데이터를 학습하고 Supabase에 저장하는 방법을 설명합니다.

## 📋 사전 요구사항

1. **FFmpeg 설치**
   ```bash
   # macOS
   brew install ffmpeg

   # Ubuntu/Debian
   sudo apt-get install ffmpeg

   # Windows
   # https://ffmpeg.org/download.html 에서 다운로드
   ```

2. **의존성 설치**
   ```bash
   npm install
   ```

3. **환경변수 설정**
   `.env.local` 파일에 Supabase 정보가 있는지 확인:
   ```
   VITE_SUPABASE_URL=your-supabase-url
   VITE_SUPABASE_ANON_KEY=your-supabase-anon-key
   ```

## 📂 데이터 구조

### 02 폴더 (비디오 파일)
```
02/
├── 1501.mp4
├── 1502.mp4
├── 1503.mp4
└── ...
```

### 17 폴더 (JSON 라벨)
```
17/
├── 1501.json  # 1501.mp4에 대응
├── 1502.json  # 1502.mp4에 대응
├── 1503.json  # 1503.mp4에 대응
└── ...
```

### JSON 파일 형식
```json
{
  "metaData": {
    "duration": 3.967
  },
  "data": [
    {
      "attributes": [
        {
          "name": "운전면허"  // 이 값이 수화 이름으로 사용됨
        }
      ]
    }
  ]
}
```

## 🚀 사용법

### 1. 단일 비디오 테스트
하나의 비디오만 처리하여 테스트:
```bash
npm run process-videos 1501
```

### 2. 범위 지정 처리
특정 범위의 비디오들을 처리:
```bash
npm run process-videos 1501 1510
```
위 명령은 1501.mp4부터 1510.mp4까지 처리합니다.

### 3. 전체 처리
모든 비디오 처리 (기본값: 1501~1510):
```bash
npm run process-videos
```

## 🔄 처리 과정

스크립트는 다음 단계로 진행됩니다:

1. **파일 확인**
   - 02 폴더에서 비디오 파일 확인
   - 17 폴더에서 대응하는 JSON 파일 확인
   - JSON에서 수화 이름 추출

2. **프레임 추출**
   - FFmpeg를 사용하여 비디오를 10fps로 프레임 추출
   - temp_frames 폴더에 임시 저장

3. **랜드마크 추출**
   - Puppeteer로 브라우저 실행
   - MediaPipe Holistic으로 각 프레임 분석
   - 손, 얼굴, 포즈 랜드마크 추출
   - 특징 벡터 계산 (손 모양, 각도 등)

4. **품질 검증**
   - 손이 감지된 프레임이 5개 이상인지 확인
   - 부족하면 건너뜀

5. **Supabase 저장**
   - 수화 이름과 랜드마크 시퀀스를 데이터베이스에 저장

6. **정리**
   - 임시 프레임 파일 삭제

## 📊 출력 예시

```
🚀 배치 학습 시작
📂 비디오 범위: 1501 ~ 1510
📍 Supabase URL: https://your-project.supabase.co

🌐 브라우저 실행 중...
✅ 브라우저 준비 완료

🎬 처리 중: 1501 - 운전면허
  📹 프레임 추출 중...
  ✅ 40개 프레임 추출됨
  🤖 MediaPipe 초기화 완료
  🤖 랜드마크 추출 중...
  진행: 40/40 프레임
  👋 손 감지: 35/40 프레임
  💾 Supabase에 저장 중...
  ✅ 저장 완료: 운전면허

📊 진행: 1/10 | ✅ 성공: 1 | ❌ 실패: 0
```

## ⚠️ 주의사항

1. **처리 시간**
   - 한 비디오당 약 30초~1분 소요
   - 1500개 전체 처리 시 약 12~25시간 필요

2. **디스크 공간**
   - 임시 프레임 저장을 위한 공간 필요
   - 처리 후 자동으로 삭제됨

3. **메모리**
   - 브라우저가 메모리를 많이 사용할 수 있음
   - 필요시 일부씩 나누어 처리

4. **네트워크**
   - MediaPipe 모델을 CDN에서 로드
   - 안정적인 인터넷 연결 필요

## 🔧 트러블슈팅

### FFmpeg 오류
```
FFmpeg failed with code 1
```
→ FFmpeg가 제대로 설치되었는지 확인: `ffmpeg -version`

### 브라우저 실행 오류
```
브라우저 실행 오류
```
→ Puppeteer 재설치: `npm install puppeteer --force`

### Supabase 저장 오류
```
저장 실패: column "landmarks_sequence" does not exist
```
→ Supabase 테이블 스키마 확인:
```sql
CREATE TABLE sign_language (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  name TEXT NOT NULL,
  landmarks_sequence JSONB NOT NULL,
  duration REAL
);
```

### 손 감지 부족
```
손 감지 부족, 건너뜀
```
→ 비디오 품질이 낮거나 손이 잘 안 보이는 영상
→ 정상적인 동작이며, 해당 비디오는 자동으로 건너뜀

## 📈 성능 최적화

### 병렬 처리
여러 터미널에서 범위를 나누어 동시 실행:
```bash
# 터미널 1
npm run process-videos 1501 1600

# 터미널 2
npm run process-videos 1601 1700

# 터미널 3
npm run process-videos 1701 1800
```

### Headless 모드
스크립트는 기본적으로 headless: true로 실행되어 UI 없이 백그라운드에서 동작합니다.

## 🎯 인식 테스트

배치 학습 후 실제 인식이 잘 되는지 확인:

1. 웹 앱 실행:
   ```bash
   npm run dev
   ```

2. 인식 모드로 전환

3. 학습한 수화 동작 수행

4. 정확도 확인

## 📝 추가 스크립트

### 학습 데이터 목록 생성
```bash
node scripts/list-training-data.mjs
```

### 학습 데이터 검증
```bash
npm run validate-data
```

## 🆘 문제 해결

문제가 발생하면:
1. 로그 확인 (콘솔 출력)
2. Supabase 대시보드에서 데이터 확인
3. 작은 범위(1~2개)로 테스트
4. 환경변수 재확인

## 📚 관련 파일

- `scripts/process-videos.mjs` - 메인 처리 스크립트
- `src/lib/featureExtraction.ts` - 특징 추출 로직
- `src/lib/supabaseClient.ts` - Supabase 연결
- `src/components/sign-language/VideoProcessor.tsx` - 비디오 처리 컴포넌트
