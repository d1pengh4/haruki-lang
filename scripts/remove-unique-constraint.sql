-- Supabase 대시보드 SQL Editor에서 실행하세요
-- 이 스크립트는 sign_languages 테이블의 name 컬럼 unique 제약을 제거합니다
-- 같은 수화를 여러 번 학습할 수 있도록 중복을 허용합니다

ALTER TABLE sign_languages DROP CONSTRAINT IF EXISTS sign_languages_name_unique;
ALTER TABLE sign_languages DROP CONSTRAINT IF EXISTS sign_languages_name_key;

-- 확인: 제약이 제거되었는지 확인
SELECT conname, contype
FROM pg_constraint
WHERE conrelid = 'sign_languages'::regclass;
