#!/usr/bin/env python3
"""
배치 학습 스크립트: 02 폴더의 영상과 17 폴더의 JSON을 처리하여 Supabase에 저장
"""

import os
import sys
import json
import cv2
import mediapipe as mp
from pathlib import Path
from dotenv import load_dotenv
from supabase import create_client
from feature_extraction import extract_hand_features, flatten_hand_features, extract_pose_features
import math

# .env.local 로드
load_dotenv('.env.local')

# Supabase 클라이언트
SUPABASE_URL = os.getenv('VITE_SUPABASE_URL')
SUPABASE_KEY = os.getenv('VITE_SUPABASE_ANON_KEY')

if not SUPABASE_URL or not SUPABASE_KEY:
    print("❌ 에러: .env.local에서 Supabase 설정을 찾을 수 없습니다")
    sys.exit(1)

supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

# MediaPipe Holistic 초기화
mp_holistic = mp.solutions.holistic
holistic = mp_holistic.Holistic(
    model_complexity=0,
    smooth_landmarks=True,
    enable_segmentation=False,
    smooth_segmentation=False,
    refine_face_landmarks=True,
    min_detection_confidence=0.5,
    min_tracking_confidence=0.5
)

def landmark_to_dict(landmark):
    """MediaPipe 랜드마크를 딕셔너리로 변환"""
    return {
        'x': landmark.x,
        'y': landmark.y,
        'z': landmark.z,
        'visibility': getattr(landmark, 'visibility', 1.0)
    }

def calculate_body_scale(pose_landmarks):
    """신체 크기 기준값 계산 (어깨 너비)"""
    if not pose_landmarks or len(pose_landmarks) < 33:
        return None

    left_shoulder = pose_landmarks[11]
    right_shoulder = pose_landmarks[12]

    dx = left_shoulder['x'] - right_shoulder['x']
    dy = left_shoulder['y'] - right_shoulder['y']
    dz = left_shoulder['z'] - right_shoulder['z']

    return math.sqrt(dx*dx + dy*dy + dz*dz)

def process_video(video_path, fps=10):
    """
    영상 파일을 처리하여 랜드마크 시퀀스 추출
    WebcamCapture와 완전히 동일한 방식
    """
    print(f"📹 비디오 처리 시작: {video_path}")

    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        print(f"❌ 비디오를 열 수 없습니다: {video_path}")
        return None

    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    video_fps = cap.get(cv2.CAP_PROP_FPS)
    duration = total_frames / video_fps if video_fps > 0 else 0

    print(f"   총 프레임: {total_frames}, FPS: {video_fps:.1f}, 길이: {duration:.2f}초")

    # 프레임 샘플링
    frame_interval = max(1, int(video_fps / fps))
    sequence = []

    frame_count = 0
    processed_count = 0

    while cap.isOpened():
        ret, frame = cap.read()
        if not ret:
            break

        # 프레임 샘플링
        if frame_count % frame_interval != 0:
            frame_count += 1
            continue

        # RGB로 변환 (MediaPipe 요구사항)
        frame_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)

        # MediaPipe 처리
        results = holistic.process(frame_rgb)

        # 랜드마크를 딕셔너리로 변환
        pose_landmarks = None
        left_hand_landmarks = None
        right_hand_landmarks = None
        face_landmarks = None

        if results.pose_landmarks:
            pose_landmarks = [landmark_to_dict(lm) for lm in results.pose_landmarks.landmark]

        if results.left_hand_landmarks:
            left_hand_landmarks = [landmark_to_dict(lm) for lm in results.left_hand_landmarks.landmark]

        if results.right_hand_landmarks:
            right_hand_landmarks = [landmark_to_dict(lm) for lm in results.right_hand_landmarks.landmark]

        if results.face_landmarks:
            face_landmarks = [landmark_to_dict(lm) for lm in results.face_landmarks.landmark]

        # 신체 크기 기준값 계산 (WebcamCapture와 동일)
        body_scale = calculate_body_scale(pose_landmarks) if pose_landmarks else None

        # 손 특징 추출 (WebcamCapture와 동일: bodyScale 전달)
        left_hand_features_obj = extract_hand_features(left_hand_landmarks, body_scale) if left_hand_landmarks else None
        right_hand_features_obj = extract_hand_features(right_hand_landmarks, body_scale) if right_hand_landmarks else None
        pose_features = extract_pose_features(pose_landmarks) if pose_landmarks else None

        # 특징 평탄화 (WebcamCapture와 동일)
        left_hand_features = flatten_hand_features(left_hand_features_obj) if left_hand_features_obj else None
        right_hand_features = flatten_hand_features(right_hand_features_obj) if right_hand_features_obj else None

        # 타임스탬프 (밀리초)
        timestamp = (frame_count / video_fps) * 1000 if video_fps > 0 else frame_count * 100

        # WebcamCapture와 동일한 데이터 구조
        landmark_data = {
            'timestamp': timestamp,
            'pose': pose_landmarks,
            'left_hand': left_hand_landmarks,
            'right_hand': right_hand_landmarks,
            'face': face_landmarks,
            'left_hand_features': left_hand_features,
            'right_hand_features': right_hand_features,
            'pose_features': pose_features
        }

        sequence.append(landmark_data)
        processed_count += 1

        # 손 감지 로깅
        if left_hand_features or right_hand_features:
            print(f"   ✓ 프레임 {frame_count}: 왼손={'✓' if left_hand_features else '✗'}, 오른손={'✓' if right_hand_features else '✗'}")

        frame_count += 1

    cap.release()

    # 통계
    frames_with_hands = sum(1 for f in sequence if f['left_hand_features'] or f['right_hand_features'])
    detection_rate = (frames_with_hands / len(sequence) * 100) if sequence else 0

    print(f"✅ 비디오 처리 완료!")
    print(f"   총 프레임: {len(sequence)}개")
    print(f"   손 감지: {frames_with_hands}개 ({detection_rate:.1f}%)")

    if detection_rate < 30:
        print(f"⚠️  경고: 손 감지율이 낮습니다 ({detection_rate:.1f}%)")

    return sequence, duration

def read_label(json_path):
    """JSON 파일에서 수화 이름 읽기"""
    try:
        with open(json_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
            name = data['data'][0]['attributes'][0]['name']
            return name
    except Exception as e:
        print(f"❌ JSON 읽기 실패 ({json_path}): {e}")
        return None

def save_to_supabase(name, landmarks_sequence, duration):
    """Supabase에 저장"""
    try:
        result = supabase.table('sign_languages').insert({
            'name': name,
            'landmarks_sequence': landmarks_sequence,
            'duration': duration,
            'thumbnail': None
        }).execute()

        print(f"✅ Supabase 저장 완료: {name}")
        return True
    except Exception as e:
        print(f"❌ Supabase 저장 실패: {e}")
        return False

def process_single_file(video_number):
    """단일 파일 처리 (테스트용)"""
    video_path = f"02/{video_number}.mp4"
    json_path = f"17/{video_number}.json"

    print(f"\n{'='*60}")
    print(f"🎬 처리 시작: {video_number}")
    print(f"{'='*60}")

    # 파일 존재 확인
    if not os.path.exists(video_path):
        print(f"❌ 비디오 파일 없음: {video_path}")
        return False

    if not os.path.exists(json_path):
        print(f"❌ JSON 파일 없음: {json_path}")
        return False

    # 라벨 읽기
    name = read_label(json_path)
    if not name:
        return False

    print(f"📝 수화 이름: {name}")

    # 비디오 처리
    result = process_video(video_path)
    if not result:
        return False

    sequence, duration = result

    if not sequence or len(sequence) < 5:
        print(f"❌ 프레임이 충분하지 않습니다 (최소 5개 필요, 현재 {len(sequence)}개)")
        return False

    # Supabase 저장
    success = save_to_supabase(name, sequence, duration)

    print(f"\n{'='*60}")
    if success:
        print(f"✅ 완료: {video_number} ({name})")
    else:
        print(f"❌ 실패: {video_number}")
    print(f"{'='*60}\n")

    return success

if __name__ == '__main__':
    print("🚀 배치 학습 스크립트 시작")
    print(f"Supabase URL: {SUPABASE_URL}")
    print()

    # 테스트: 1501 파일만 처리
    test_number = "1501"
    success = process_single_file(test_number)

    if success:
        print("\n🎉 테스트 성공! 데이터베이스를 확인하세요.")
        print("전체 배치 처리를 원하면 스크립트를 수정하세요.")
    else:
        print("\n💥 테스트 실패!")
        sys.exit(1)
