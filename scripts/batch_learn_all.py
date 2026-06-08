#!/usr/bin/env python3
"""
전체 배치 학습 스크립트
- 02/ 폴더의 모든 MP4 영상을 처리하여 Supabase에 저장
- JSON start/end 시간으로 영상 트리밍
- 체크포인트 저장 → 중단 후 재개 가능
- 얼굴(20) + 포즈(20) + 손(38) 특징 추출

실행:
    python3 scripts/batch_learn_all.py                 # 전체 처리
    python3 scripts/batch_learn_all.py --start 1501 --end 1600   # 범위 지정
    python3 scripts/batch_learn_all.py --single 1501  # 단일 파일 테스트
    python3 scripts/batch_learn_all.py --reset         # 체크포인트 초기화
"""

import os
import sys
import json
import argparse
import time
import random
from pathlib import Path

import cv2
import mediapipe as mp
from dotenv import load_dotenv
from supabase import create_client

# ─── 경로 설정 ────────────────────────────────────────────────────────────────
SCRIPT_DIR = Path(__file__).parent
ROOT_DIR   = SCRIPT_DIR.parent
sys.path.insert(0, str(SCRIPT_DIR))

from feature_extraction import (
    extract_hand_features, flatten_hand_features,
    extract_pose_features, extract_face_features,
)

# ─── 환경변수 로드 ──────────────────────────────────────────────────────────────
load_dotenv(ROOT_DIR / '.env.local')

SUPABASE_URL = os.getenv('VITE_SUPABASE_URL')
SUPABASE_KEY = os.getenv('VITE_SUPABASE_ANON_KEY')

if not SUPABASE_URL or not SUPABASE_KEY:
    print("❌ .env.local에서 VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY를 찾을 수 없습니다.")
    sys.exit(1)

supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

# ─── 경로 상수 ──────────────────────────────────────────────────────────────────
VIDEO_DIR      = ROOT_DIR / '02'
LABEL_DIR      = ROOT_DIR / '17'
CHECKPOINT_FILE = SCRIPT_DIR / 'batch_checkpoint.json'

# ─── MediaPipe 초기화 ────────────────────────────────────────────────────────────
mp_holistic = mp.solutions.holistic
holistic = mp_holistic.Holistic(
    model_complexity=0,
    smooth_landmarks=True,
    enable_segmentation=False,
    smooth_segmentation=False,
    refine_face_landmarks=True,
    min_detection_confidence=0.5,
    min_tracking_confidence=0.5,
)


# ─── 유틸리티 ────────────────────────────────────────────────────────────────────
def lm_to_dict(lm):
    return {'x': lm.x, 'y': lm.y, 'z': lm.z, 'visibility': getattr(lm, 'visibility', 1.0)}


def read_label(number: str):
    """JSON 파일에서 수화 이름 + start/end 시간 읽기"""
    json_path = LABEL_DIR / f'{number}.json'
    if not json_path.exists():
        return None, None, None
    try:
        with open(json_path, 'r', encoding='utf-8') as f:
            d = json.load(f)
        entry = d['data'][0]
        name       = entry['attributes'][0]['name']
        start_time = entry.get('start', 0.0)
        end_time   = entry.get('end', None)
        return name, float(start_time), float(end_time) if end_time else None
    except Exception as e:
        print(f"  ⚠️  JSON 읽기 실패 ({json_path.name}): {e}")
        return None, None, None


def load_checkpoint() -> set:
    if CHECKPOINT_FILE.exists():
        with open(CHECKPOINT_FILE, 'r') as f:
            return set(json.load(f))
    return set()


def save_checkpoint(done: set):
    with open(CHECKPOINT_FILE, 'w') as f:
        json.dump(sorted(done), f)


# ─── 데이터 증강 ──────────────────────────────────────────────────────────────────
def add_noise(seq: list, sigma=0.025) -> list:
    """특징 벡터에 가우시안 노이즈 추가 (측정 불확실성 시뮬레이션)"""
    import copy
    noisy = copy.deepcopy(seq)
    for frame in noisy:
        for key in ('left_hand_features', 'right_hand_features', 'pose_features', 'face'):
            if frame.get(key):
                frame[key] = [v + random.gauss(0, sigma) for v in frame[key]]
    return noisy


def resample_seq(seq: list, ratio: float) -> list:
    """시퀀스를 ratio 배율로 선형 보간 리샘플링 (속도 변화 시뮬레이션)"""
    n = len(seq)
    target = max(5, int(n * ratio))
    if target == n:
        return seq

    def lerp(a, b, t):
        if a is None or b is None:
            return a if a is not None else b
        if not isinstance(a, list):
            return a
        return [av * (1 - t) + bv * t for av, bv in zip(a, b)]

    result = []
    for i in range(target):
        pos = i / (target - 1) * (n - 1) if target > 1 else 0
        lo = int(pos)
        hi = min(lo + 1, n - 1)
        t = pos - lo
        fa, fb = seq[lo], seq[hi]
        result.append({
            'timestamp':           fa['timestamp'],
            'pose':                fa['pose'],
            'left_hand':           fa['left_hand'],
            'right_hand':          fa['right_hand'],
            'face':                lerp(fa['face'],                fb['face'],                t),
            'left_hand_features':  lerp(fa['left_hand_features'],  fb['left_hand_features'],  t),
            'right_hand_features': lerp(fa['right_hand_features'], fb['right_hand_features'], t),
            'pose_features':       lerp(fa['pose_features'],       fb['pose_features'],       t),
        })
    return result


# ─── 비디오 처리 ──────────────────────────────────────────────────────────────────
def process_video(video_path: Path, start_sec: float, end_sec, flip: bool, sample_fps=15):
    """
    영상 처리 → LandmarkFrame 리스트 반환
    start_sec~end_sec 구간만 사용 (JSON 기준)
    """
    # P3-13: 영상 간 holistic 상태 오염 방지
    holistic.reset()
    cap = cv2.VideoCapture(str(video_path))
    if not cap.isOpened():
        return None, None

    video_fps   = cap.get(cv2.CAP_PROP_FPS) or 30.0
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    duration     = total_frames / video_fps

    # start / end 프레임 계산
    start_frame = int(start_sec * video_fps)
    end_frame   = int(end_sec * video_fps) if end_sec else total_frames
    end_frame   = min(end_frame, total_frames)

    interval = max(1, int(video_fps / sample_fps))
    sequence = []
    frame_idx = 0

    cap.set(cv2.CAP_PROP_POS_FRAMES, start_frame)

    while cap.isOpened():
        ret, frame = cap.read()
        if not ret:
            break

        abs_frame = start_frame + frame_idx
        if abs_frame >= end_frame:
            break

        frame_idx += 1
        if frame_idx % interval != 0:
            continue

        frame_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        if flip:
            frame_rgb = cv2.flip(frame_rgb, 1)

        res = holistic.process(frame_rgb)

        pose_lms  = [lm_to_dict(l) for l in res.pose_landmarks.landmark]  if res.pose_landmarks  else None
        lhand_lms = [lm_to_dict(l) for l in res.left_hand_landmarks.landmark]  if res.left_hand_landmarks  else None
        rhand_lms = [lm_to_dict(l) for l in res.right_hand_landmarks.landmark] if res.right_hand_landmarks else None
        face_lms  = [lm_to_dict(l) for l in res.face_landmarks.landmark]  if res.face_landmarks  else None

        lhf_obj = extract_hand_features(lhand_lms) if lhand_lms else None
        rhf_obj = extract_hand_features(rhand_lms) if rhand_lms else None

        lhf   = flatten_hand_features(lhf_obj) if lhf_obj else None
        rhf   = flatten_hand_features(rhf_obj) if rhf_obj else None
        posef = extract_pose_features(pose_lms)  if pose_lms  else None
        facef = extract_face_features(face_lms)  if face_lms  else None

        ts = (abs_frame / video_fps) * 1000
        sequence.append({
            'timestamp':           ts,
            'pose':                pose_lms,
            'left_hand':           lhand_lms,
            'right_hand':          rhand_lms,
            'face':                facef,          # 20-dim features (not raw)
            'left_hand_features':  lhf,
            'right_hand_features': rhf,
            'pose_features':       posef,
        })

    cap.release()

    clip_duration = (end_frame - start_frame) / video_fps
    return sequence, clip_duration


# ─── Supabase 저장 ─────────────────────────────────────────────────────────────
def save_to_supabase(name: str, sequences: list, duration: float) -> bool:
    """
    v2 포맷으로 저장: { "v": 2, "sequences": [[frame,...], [frame,...], ...] }
    원본 + 반전을 하나의 레코드에 저장 (SELECT → UPDATE or INSERT).
    """
    multi_seq = {"v": 2, "sequences": sequences}
    payload = {
        'name':               name,
        'landmarks_sequence': multi_seq,
        'duration':           round(duration, 3),
        'thumbnail':          None,
    }
    try:
        existing = supabase.table('sign_languages').select('id').eq('name', name).execute()
        if existing.data:
            supabase.table('sign_languages').update(payload).eq('name', name).execute()
        else:
            supabase.table('sign_languages').insert(payload).execute()
        return True
    except Exception as e:
        print(f"  ❌ Supabase 오류: {e}")
        return False


# ─── 단일 파일 처리 ─────────────────────────────────────────────────────────────
def process_one(number: str, verbose=True) -> bool:
    video_path = VIDEO_DIR / f'{number}.mp4'
    if not video_path.exists():
        if verbose:
            print(f"  ❌ 영상 없음: {video_path.name}")
        return False

    name, start_sec, end_sec = read_label(number)
    if not name:
        if verbose:
            print(f"  ❌ 라벨 없음: {number}.json")
        return False

    if verbose:
        print(f"  📝 {name}  [{start_sec:.2f}s ~ {end_sec or '끝'}s]")

    all_sequences = []
    best_dur = 0.0

    for flip in [False, True]:
        label = '원본' if not flip else '반전'
        seq, dur = process_video(video_path, start_sec, end_sec, flip=flip)
        if not seq or len(seq) < 5:
            if verbose:
                print(f"    ⚠️  {label}: 프레임 부족 ({len(seq) if seq else 0}개)")
            continue

        hands = sum(1 for f in seq if f['left_hand_features'] or f['right_hand_features'])
        rate  = hands / len(seq) * 100 if seq else 0
        if verbose:
            print(f"    {'✓' if rate >= 30 else '⚠️ '} {label}: {len(seq)}프레임  손감지 {rate:.0f}%  {dur:.2f}초")

        # 기본 시퀀스
        all_sequences.append(seq)

        # 속도 증강: 0.75x (느리게), 1.25x (빠르게)
        all_sequences.append(resample_seq(seq, 0.75))
        all_sequences.append(resample_seq(seq, 1.25))

        # 노이즈 증강: 2개 (σ=0.025)
        all_sequences.append(add_noise(seq, sigma=0.025))
        all_sequences.append(add_noise(seq, sigma=0.025))

        if not flip:
            best_dur = dur

    if not all_sequences:
        return False

    ok = save_to_supabase(name, all_sequences, best_dur)
    if ok and verbose:
        print(f"    💾 저장 완료: {len(all_sequences)}개 시퀀스 (v2 포맷, 속도+노이즈 증강 포함)")
    return ok


# ─── 메인 배치 루프 ────────────────────────────────────────────────────────────
def run_batch(numbers: list[str]):
    done      = load_checkpoint()
    pending   = [n for n in numbers if n not in done]
    total     = len(numbers)
    remaining = len(pending)

    print(f"\n{'='*60}")
    print(f"📦 배치 학습 시작")
    print(f"   전체: {total}개  |  완료: {total - remaining}개  |  남은: {remaining}개")
    print(f"{'='*60}\n")

    success = 0
    fail    = 0
    t_start = time.time()

    for i, number in enumerate(pending, 1):
        pct    = (total - remaining + i) / total * 100
        elapsed = time.time() - t_start
        eta_str = ''
        if i > 1:
            rate = elapsed / (i - 1)
            eta  = rate * (remaining - i)
            m, s = divmod(int(eta), 60)
            eta_str = f"  ETA {m}분{s:02d}초"

        print(f"[{total - remaining + i}/{total}] ({pct:.1f}%){eta_str}  ▶ {number}")

        try:
            ok = process_one(number, verbose=True)
        except Exception as e:
            print(f"  ❌ 예외 발생: {e}")
            ok = False

        if ok:
            success += 1
            done.add(number)
            save_checkpoint(done)
        else:
            fail += 1

        print()

    elapsed = time.time() - t_start
    m, s = divmod(int(elapsed), 60)
    print(f"{'='*60}")
    print(f"✅ 완료: {success}개  |  ❌ 실패: {fail}개  |  ⏱ {m}분{s:02d}초")
    print(f"{'='*60}")


# ─── CLI ──────────────────────────────────────────────────────────────────────
if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Haruki 배치 학습 스크립트')
    parser.add_argument('--start',  type=int, default=1501, help='시작 번호 (기본: 1501)')
    parser.add_argument('--end',    type=int, default=3000, help='종료 번호 포함 (기본: 3000)')
    parser.add_argument('--single', type=str, help='단일 파일 테스트 (예: 1501)')
    parser.add_argument('--reset',  action='store_true', help='체크포인트 초기화')
    args = parser.parse_args()

    if args.reset:
        if CHECKPOINT_FILE.exists():
            CHECKPOINT_FILE.unlink()
            print("✅ 체크포인트 초기화 완료")
        else:
            print("ℹ️  체크포인트 파일 없음")
        sys.exit(0)

    if args.single:
        print(f"\n🔍 단일 파일 테스트: {args.single}")
        ok = process_one(args.single, verbose=True)
        print("\n✅ 성공" if ok else "\n❌ 실패")
        sys.exit(0 if ok else 1)

    # 범위 처리
    all_videos = sorted(
        [p.stem for p in VIDEO_DIR.glob('*.mp4')
         if p.stem.isdigit() and args.start <= int(p.stem) <= args.end]
    )

    if not all_videos:
        print(f"❌ {VIDEO_DIR} 에서 영상을 찾을 수 없습니다 ({args.start}~{args.end})")
        sys.exit(1)

    run_batch(all_videos)
