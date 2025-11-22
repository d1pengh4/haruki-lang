-- ================================================
-- 한국 수화 번역기 - Supabase 데이터베이스 스키마
-- ================================================
-- 이 스크립트를 Supabase Dashboard의 SQL Editor에서 실행하세요
-- Dashboard: https://supabase.com/dashboard/project/YOUR_PROJECT/sql
-- ================================================

-- 1. 기존 테이블 삭제 (재실행 시)
DROP TABLE IF EXISTS sign_languages CASCADE;

-- 2. UUID 확장 활성화 (이미 활성화되어 있을 수 있음)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 3. sign_languages 테이블 생성
CREATE TABLE sign_languages (
  -- Primary Key
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- 타임스탬프
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- 수화 데이터
  name TEXT NOT NULL,
  landmarks_sequence JSONB NOT NULL,
  duration NUMERIC(10,2),
  thumbnail TEXT,

  -- 제약 조건
  CONSTRAINT sign_languages_name_unique UNIQUE (name),
  CONSTRAINT sign_languages_name_not_empty CHECK (char_length(name) > 0),
  CONSTRAINT sign_languages_duration_positive CHECK (duration IS NULL OR duration > 0)
);

-- 4. 인덱스 생성 (성능 최적화)
CREATE INDEX idx_sign_languages_created_at ON sign_languages(created_at DESC);
CREATE INDEX idx_sign_languages_name ON sign_languages(name);
CREATE INDEX idx_sign_languages_duration ON sign_languages(duration);

-- 5. updated_at 자동 업데이트 함수
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 6. updated_at 자동 업데이트 트리거
CREATE TRIGGER update_sign_languages_updated_at
  BEFORE UPDATE ON sign_languages
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- 7. Row Level Security (RLS) 활성화
ALTER TABLE sign_languages ENABLE ROW LEVEL SECURITY;

-- 8. RLS 정책 설정

-- 정책 1: 모든 사용자가 수화 데이터를 읽을 수 있음
CREATE POLICY "Anyone can read sign languages"
  ON sign_languages
  FOR SELECT
  USING (true);

-- 정책 2: 모든 사용자가 수화 데이터를 생성할 수 있음
-- (추후 인증 시스템 추가 시 authenticated 사용자만으로 제한 가능)
CREATE POLICY "Anyone can insert sign languages"
  ON sign_languages
  FOR INSERT
  WITH CHECK (true);

-- 정책 3: 모든 사용자가 수화 데이터를 업데이트할 수 있음
-- (추후 인증 시스템 추가 시 본인이 생성한 데이터만 수정하도록 제한 가능)
CREATE POLICY "Anyone can update sign languages"
  ON sign_languages
  FOR UPDATE
  USING (true)
  WITH CHECK (true);

-- 정책 4: 모든 사용자가 수화 데이터를 삭제할 수 있음
-- (추후 인증 시스템 추가 시 본인이 생성한 데이터만 삭제하도록 제한 가능)
CREATE POLICY "Anyone can delete sign languages"
  ON sign_languages
  FOR DELETE
  USING (true);

-- 9. 테이블 설명 (COMMENT)
COMMENT ON TABLE sign_languages IS '한국 수화 번역기 - 수화 동작 데이터 저장 테이블';
COMMENT ON COLUMN sign_languages.id IS '고유 식별자 (UUID)';
COMMENT ON COLUMN sign_languages.created_at IS '생성 일시';
COMMENT ON COLUMN sign_languages.updated_at IS '수정 일시 (자동 업데이트)';
COMMENT ON COLUMN sign_languages.name IS '수화 이름 (예: 안녕하세요, ㄱ, ㄴ)';
COMMENT ON COLUMN sign_languages.landmarks_sequence IS 'MediaPipe Holistic 랜드마크 시퀀스 (JSON 배열)';
COMMENT ON COLUMN sign_languages.duration IS '동작 지속 시간 (초)';
COMMENT ON COLUMN sign_languages.thumbnail IS '썸네일 이미지 (Base64 또는 URL)';

-- ================================================
-- 완료! 이제 애플리케이션에서 데이터를 저장할 수 있습니다.
-- ================================================

-- 10. 샘플 데이터 확인 쿼리 (선택 사항)
-- SELECT * FROM sign_languages ORDER BY created_at DESC;
