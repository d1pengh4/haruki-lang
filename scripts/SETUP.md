# 배치 학습 설정 가이드

## 1. Supabase 설정

같은 수화를 여러 번 학습하고, 반전/비반전 버전을 모두 저장하려면 Supabase 테이블의 unique 제약을 제거해야 합니다.

### Supabase Dashboard에서 실행:

1. Supabase 프로젝트 대시보드 접속
2. 왼쪽 메뉴에서 **SQL Editor** 클릭
3. **New query** 클릭
4. 아래 SQL을 붙여넣고 실행:

```sql
ALTER TABLE sign_languages DROP CONSTRAINT IF EXISTS sign_languages_name_unique;
ALTER TABLE sign_languages DROP CONSTRAINT IF EXISTS sign_languages_name_key;
```

5. 확인:

```sql
SELECT conname, contype
FROM pg_constraint
WHERE conrelid = 'sign_languages'::regclass;
```

`sign_languages_name_unique` 또는 `sign_languages_name_key` 제약이 사라졌는지 확인하세요.

## 2. 배치 처리 실행

제약을 제거한 후:

```bash
python3 scripts/batch_process.py
```

이제 각 영상마다 **2개 버전**이 저장됩니다:
- **반전 버전**: 웹캠 미러 모드와 동일 (좌우 반전)
- **원본 버전**: 실제 영상 그대로

## 3. 인식 정확도 향상

같은 수화의 여러 버전이 데이터베이스에 있으면:
- RecognitionMode가 모든 버전과 비교
- 가장 높은 유사도 사용
- 결과: 어느 방향으로 수화를 해도 인식됨!

## 4. 수동 학습 (LearningMode)

웹캠으로 학습할 때도 이제 중복 이름이 허용됩니다:
- 같은 수화를 여러 각도/속도로 녹화 가능
- 데이터 증강 효과로 인식률 향상
