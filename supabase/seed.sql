-- ================================================
-- 한국 수화 번역기 - 샘플 데이터 (선택 사항)
-- ================================================
-- 이 파일은 테스트용 샘플 데이터를 추가합니다.
-- 실제 프로덕션에서는 실행하지 않아도 됩니다.
-- ================================================

-- 샘플 수화 데이터 1: "안녕"
INSERT INTO sign_languages (name, landmarks_sequence, duration, thumbnail)
VALUES (
  '안녕',
  '[
    {
      "timestamp": 0,
      "pose": null,
      "left_hand": null,
      "right_hand": [{"x": 0.5, "y": 0.5, "z": 0}],
      "face": null,
      "left_hand_features": null,
      "right_hand_features": [0.1, 0.2, 0.3]
    },
    {
      "timestamp": 100,
      "pose": null,
      "left_hand": null,
      "right_hand": [{"x": 0.6, "y": 0.4, "z": 0}],
      "face": null,
      "left_hand_features": null,
      "right_hand_features": [0.15, 0.25, 0.35]
    }
  ]'::jsonb,
  1.0,
  null
);

-- 샘플 수화 데이터 2: "감사합니다"
INSERT INTO sign_languages (name, landmarks_sequence, duration, thumbnail)
VALUES (
  '감사합니다',
  '[
    {
      "timestamp": 0,
      "pose": null,
      "left_hand": [{"x": 0.3, "y": 0.5, "z": 0}],
      "right_hand": [{"x": 0.7, "y": 0.5, "z": 0}],
      "face": null,
      "left_hand_features": [0.1, 0.2],
      "right_hand_features": [0.1, 0.2]
    },
    {
      "timestamp": 200,
      "pose": null,
      "left_hand": [{"x": 0.35, "y": 0.45, "z": 0}],
      "right_hand": [{"x": 0.65, "y": 0.45, "z": 0}],
      "face": null,
      "left_hand_features": [0.15, 0.25],
      "right_hand_features": [0.15, 0.25]
    }
  ]'::jsonb,
  2.0,
  null
);

-- 데이터 확인
SELECT
  id,
  name,
  duration,
  created_at,
  jsonb_array_length(landmarks_sequence) as frame_count
FROM sign_languages
ORDER BY created_at DESC;
