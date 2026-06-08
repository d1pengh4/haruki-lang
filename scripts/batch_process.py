#!/usr/bin/env python3
"""
Haruki 배치 학습 스크립트 (통합본)

사용법:
    python3 scripts/batch_process.py                           # 02/ 전체 처리
    python3 scripts/batch_process.py --start 1501 --end 1600  # 범위 지정
    python3 scripts/batch_process.py --numbers 1501 1502 1503  # 특정 번호 지정
    python3 scripts/batch_process.py --single 1501            # 단일 파일 테스트
    python3 scripts/batch_process.py --retry-failed           # 실패 파일 재시도
    python3 scripts/batch_process.py --reset                  # 체크포인트 초기화
    python3 scripts/batch_process.py --dry-run                # 저장 없이 처리 결과 확인
    python3 scripts/batch_process.py --fps 10 --augment 1    # FPS·증강 레벨 조절
    python3 scripts/batch_process.py --min-hand-rate 50      # 최소 손 감지율 기준 상향
"""

import os
import sys
import json
import argparse
import time
import random
import copy
from pathlib import Path

import cv2
import mediapipe as mp
from dotenv import load_dotenv
from supabase import create_client

# tqdm은 선택적 의존성 — 없어도 동작함
try:
    from tqdm import tqdm
    HAS_TQDM = True
except ImportError:
    HAS_TQDM = False

# ─── 경로 설정 ─────────────────────────────────────────────────────────────────
SCRIPT_DIR = Path(__file__).parent
ROOT_DIR   = SCRIPT_DIR.parent
sys.path.insert(0, str(SCRIPT_DIR))

from feature_extraction import (
    extract_hand_features, flatten_hand_features,
    extract_pose_features, extract_face_features,
)

# ─── 환경변수 로드 ─────────────────────────────────────────────────────────────
load_dotenv(ROOT_DIR / '.env.local')

SUPABASE_URL = os.getenv('VITE_SUPABASE_URL')
SUPABASE_KEY = os.getenv('VITE_SUPABASE_ANON_KEY')

if not SUPABASE_URL or not SUPABASE_KEY:
    print("ERROR: .env.local에서 VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY를 찾을 수 없습니다.")
    sys.exit(1)

supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

# ─── 경로 상수 ─────────────────────────────────────────────────────────────────
VIDEO_DIR        = ROOT_DIR / '02'
LABEL_DIR        = ROOT_DIR / '17'
CHECKPOINT_FILE  = SCRIPT_DIR / 'batch_checkpoint.json'
FAILED_FILE      = SCRIPT_DIR / 'batch_failed.json'

# ─── MediaPipe 설정 (공통) ─────────────────────────────────────────────────────
MP_CONFIG = dict(
    model_complexity=0,
    smooth_landmarks=True,
    enable_segmentation=False,
    smooth_segmentation=False,
    refine_face_landmarks=True,
    min_detection_confidence=0.5,
    min_tracking_confidence=0.5,
)


# ─── 유틸리티 ──────────────────────────────────────────────────────────────────
def lm_to_dict(lm):
    return {
        'x': lm.x,
        'y': lm.y,
        'z': lm.z,
        'visibility': getattr(lm, 'visibility', 1.0),
    }


def read_label(number: str):
    """JSON 파일에서 수화 이름과 start/end 시간 읽기"""
    json_path = LABEL_DIR / f'{number}.json'
    if not json_path.exists():
        return None, None, None
    try:
        with open(json_path, 'r', encoding='utf-8') as f:
            d = json.load(f)
        entry      = d['data'][0]
        name       = entry['attributes'][0]['name']
        start_time = entry.get('start', 0.0)
        end_time   = entry.get('end', None)
        return name, float(start_time), (float(end_time) if end_time is not None else None)
    except Exception as e:
        print(f"  WARNING: JSON 읽기 실패 ({json_path.name}): {e}")
        return None, None, None


def load_checkpoint() -> set:
    if CHECKPOINT_FILE.exists():
        with open(CHECKPOINT_FILE, 'r') as f:
            return set(json.load(f))
    return set()


def save_checkpoint(done: set):
    with open(CHECKPOINT_FILE, 'w') as f:
        json.dump(sorted(done), f)


def load_failed() -> list:
    if FAILED_FILE.exists():
        with open(FAILED_FILE, 'r') as f:
            return json.load(f)
    return []


def save_failed(failed: list):
    with open(FAILED_FILE, 'w') as f:
        json.dump(sorted(failed), f, ensure_ascii=False, indent=2)


# ─── 데이터 증강 ───────────────────────────────────────────────────────────────
def add_noise(seq: list, sigma: float = 0.025) -> list:
    """
    특징 벡터에 가우시안 노이즈 추가.
    실제 웹캠 환경의 측정 불확실성을 시뮬레이션하여 인식 강인성 향상.
    원시 랜드마크(pose, left_hand, right_hand)는 건드리지 않음 —
    저장 후 재사용 가능성 유지.
    """
    noisy = copy.deepcopy(seq)
    for frame in noisy:
        for key in ('left_hand_features', 'right_hand_features', 'pose_features', 'face'):
            v = frame.get(key)
            if v:
                frame[key] = [x + random.gauss(0, sigma) for x in v]
    return noisy


def resample_seq(seq: list, ratio: float) -> list:
    """
    시퀀스를 ratio 배율로 선형 보간 리샘플링.
    ratio < 1.0: 느린 동작 시뮬레이션 (0.75x 권장)
    ratio > 1.0: 빠른 동작 시뮬레이션 (1.25x 권장)
    최소 5프레임 보장.
    """
    n      = len(seq)
    target = max(5, int(n * ratio))
    if target == n:
        return seq

    def lerp_feat(a, b, t):
        """특징 벡터 선형 보간. None이면 남은 쪽 그대로."""
        if a is None or b is None:
            return a if a is not None else b
        if not isinstance(a, list):
            return a
        return [av * (1 - t) + bv * t for av, bv in zip(a, b)]

    result = []
    for i in range(target):
        pos = (i / (target - 1) * (n - 1)) if target > 1 else 0.0
        lo  = int(pos)
        hi  = min(lo + 1, n - 1)
        t   = pos - lo
        fa, fb = seq[lo], seq[hi]
        result.append({
            'timestamp':           fa['timestamp'],
            # 원시 랜드마크는 보간하지 않음 (lo 프레임 값 유지)
            'pose':                fa['pose'],
            'left_hand':           fa['left_hand'],
            'right_hand':          fa['right_hand'],
            # 특징 벡터는 선형 보간
            'face':                lerp_feat(fa['face'],                fb['face'],                t),
            'left_hand_features':  lerp_feat(fa['left_hand_features'],  fb['left_hand_features'],  t),
            'right_hand_features': lerp_feat(fa['right_hand_features'], fb['right_hand_features'], t),
            'pose_features':       lerp_feat(fa['pose_features'],       fb['pose_features'],       t),
        })
    return result


def build_augmented_sequences(base_seq: list, augment_level: int) -> list:
    """
    증강 레벨에 따라 시퀀스 목록 생성.

    level 0 — 기본 시퀀스만 (1개)
    level 1 — 기본 + 속도 변형 2개 (총 3개)
    level 2 — 기본 + 속도 2개 + 노이즈 2개 (총 5개, DEFAULT)

    flip은 process_one에서 별도로 처리하므로 여기서는 단방향만 처리.
    """
    seqs = [base_seq]

    if augment_level >= 1:
        seqs.append(resample_seq(base_seq, 0.75))   # 느린 동작
        seqs.append(resample_seq(base_seq, 1.25))   # 빠른 동작

    if augment_level >= 2:
        seqs.append(add_noise(base_seq, sigma=0.025))
        seqs.append(add_noise(base_seq, sigma=0.025))

    return seqs


# ─── 비디오 처리 ───────────────────────────────────────────────────────────────
def process_video(
    video_path: Path,
    start_sec: float,
    end_sec,
    flip: bool,
    holistic,          # 호출자로부터 주입받음 (수화당 1 인스턴스 재사용)
    sample_fps: int = 15,
) -> tuple:
    """
    영상에서 LandmarkFrame 리스트 추출.
    - start_sec ~ end_sec 구간만 처리 (JSON label 기준)
    - flip=True: 좌우 반전 (웹캠 미러링 보정)
    - holistic 인스턴스는 호출자가 관리 (수화별 격리 보장)
    반환: (sequence, clip_duration) 또는 (None, None)
    """
    cap = cv2.VideoCapture(str(video_path))
    if not cap.isOpened():
        return None, None

    video_fps    = cap.get(cv2.CAP_PROP_FPS) or 30.0
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))

    start_frame = int(start_sec * video_fps)
    end_frame   = int(end_sec * video_fps) if end_sec is not None else total_frames
    end_frame   = min(end_frame, total_frames)

    interval  = max(1, int(video_fps / sample_fps))
    sequence  = []
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

        pose_lms  = [lm_to_dict(l) for l in res.pose_landmarks.landmark]       if res.pose_landmarks       else None
        lhand_lms = [lm_to_dict(l) for l in res.left_hand_landmarks.landmark]  if res.left_hand_landmarks  else None
        rhand_lms = [lm_to_dict(l) for l in res.right_hand_landmarks.landmark] if res.right_hand_landmarks else None
        face_lms  = [lm_to_dict(l) for l in res.face_landmarks.landmark]       if res.face_landmarks       else None

        lhf_obj = extract_hand_features(lhand_lms) if lhand_lms else None
        rhf_obj = extract_hand_features(rhand_lms) if rhand_lms else None

        lhf   = flatten_hand_features(lhf_obj) if lhf_obj else None
        rhf   = flatten_hand_features(rhf_obj) if rhf_obj else None
        posef = extract_pose_features(pose_lms) if pose_lms  else None
        facef = extract_face_features(face_lms) if face_lms  else None

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
def save_to_supabase(name: str, sequences: list, duration: float, dry_run: bool) -> bool:
    """
    v2 포맷으로 저장: { "v": 2, "sequences": [[frame,...], ...] }
    이미 존재하는 수화는 UPDATE, 없으면 INSERT.
    dry_run=True면 실제 저장 없이 성공으로 간주.
    """
    if dry_run:
        print(f"  [DRY-RUN] 저장 건너뜀: {name} ({len(sequences)}개 시퀀스, {duration:.2f}초)")
        return True

    payload = {
        'name':               name,
        'landmarks_sequence': {'v': 2, 'sequences': sequences},
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
        print(f"  ERROR Supabase: {e}")
        return False


# ─── 단일 파일 처리 ────────────────────────────────────────────────────────────
def process_one(
    number: str,
    sample_fps: int    = 15,
    augment_level: int = 2,
    min_hand_rate: int = 30,
    dry_run: bool      = False,
    verbose: bool      = True,
) -> bool:
    """
    단일 파일 처리.

    MediaPipe 인스턴스를 수화 단위로 생성하고 context manager로 관리.
    → 수화 간 완전한 상태 격리 보장 (reset() 의존 없음).
    → 원본 + 반전을 같은 인스턴스로 처리하므로 생성 비용은 수화당 1회.

    품질 필터 (min_hand_rate):
    - 손 감지율이 min_hand_rate% 미만인 버전(원본/반전)은 저장에서 제외.
    - 두 버전 모두 필터링되면 해당 수화 저장 실패 처리.
    """
    video_path = VIDEO_DIR / f'{number}.mp4'
    if not video_path.exists():
        if verbose:
            print(f"  ERROR: 영상 없음: {video_path.name}")
        return False

    name, start_sec, end_sec = read_label(number)
    if not name:
        if verbose:
            print(f"  ERROR: 라벨 없음: {number}.json")
        return False

    if verbose:
        aug_label = ['없음', '속도만', '속도+노이즈'][min(augment_level, 2)]
        print(f"  {name}  [{start_sec:.2f}s ~ {end_sec or '끝'}s]  "
              f"FPS={sample_fps}  증강={aug_label}  최소감지율={min_hand_rate}%")

    all_sequences = []
    best_dur      = 0.0

    # 수화 단위로 MediaPipe 인스턴스 생성 (context manager로 수명 관리)
    with mp.solutions.holistic.Holistic(**MP_CONFIG) as holistic:
        for flip in [False, True]:
            label = '원본' if not flip else '반전'
            seq, dur = process_video(
                video_path, start_sec, end_sec,
                flip=flip, holistic=holistic, sample_fps=sample_fps,
            )

            if not seq or len(seq) < 5:
                if verbose:
                    print(f"    SKIP {label}: 프레임 부족 ({len(seq) if seq else 0}개, 최소 5개 필요)")
                continue

            # 품질 필터: 손 감지율 검사
            detected = sum(1 for f in seq if f['left_hand_features'] or f['right_hand_features'])
            rate     = detected / len(seq) * 100
            quality  = 'OK' if rate >= min_hand_rate else 'LOW'

            if verbose:
                symbol = 'OK' if rate >= min_hand_rate else '!!'
                print(f"    [{symbol}] {label}: {len(seq)}프레임  손감지 {rate:.0f}%  {dur:.2f}초")

            if rate < min_hand_rate:
                if verbose:
                    print(f"    SKIP {label}: 손 감지율 {rate:.0f}% < 기준 {min_hand_rate}% "
                          f"— 품질 불량 시퀀스 제외")
                continue

            # 증강 생성
            augmented = build_augmented_sequences(seq, augment_level)
            all_sequences.extend(augmented)

            if not flip:
                best_dur = dur

    if not all_sequences:
        if verbose:
            print(f"  FAIL: 저장 가능한 시퀀스 없음 (모든 버전 품질 미달 또는 프레임 부족)")
        return False

    ok = save_to_supabase(name, all_sequences, best_dur, dry_run)
    if verbose and ok and not dry_run:
        print(f"  SAVED: {name}  총 {len(all_sequences)}개 시퀀스")
    return ok


# ─── 배치 루프 ─────────────────────────────────────────────────────────────────
def run_batch(
    numbers: list,
    sample_fps: int    = 15,
    augment_level: int = 2,
    min_hand_rate: int = 30,
    dry_run: bool      = False,
):
    done      = load_checkpoint()
    pending   = [n for n in numbers if n not in done]
    total     = len(numbers)
    remaining = len(pending)

    print(f"\n{'='*64}")
    print(f"Haruki 배치 학습")
    print(f"전체 {total}개  |  이미 완료 {total - remaining}개  |  처리 예정 {remaining}개")
    if dry_run:
        print(f"*** DRY-RUN 모드: Supabase에 저장하지 않습니다 ***")
    print(f"{'='*64}\n")

    if not pending:
        print("처리할 파일이 없습니다. --reset으로 체크포인트를 초기화할 수 있습니다.")
        return

    success_list = []
    fail_list    = []
    t_start      = time.time()

    iterator = pending
    if HAS_TQDM:
        iterator = tqdm(pending, desc='배치 학습', unit='sign', dynamic_ncols=True)

    for i, number in enumerate(iterator, 1):
        elapsed = time.time() - t_start
        eta_str = ''
        if i > 1 and not HAS_TQDM:
            rate    = elapsed / (i - 1)
            eta     = rate * (remaining - i)
            m, s    = divmod(int(max(0, eta)), 60)
            eta_str = f"  ETA {m}m{s:02d}s"

        if not HAS_TQDM:
            completed = total - remaining + i
            print(f"[{completed}/{total}]{eta_str}  {number}")

        try:
            ok = process_one(
                number,
                sample_fps=sample_fps,
                augment_level=augment_level,
                min_hand_rate=min_hand_rate,
                dry_run=dry_run,
                verbose=True,
            )
        except Exception as e:
            print(f"  EXCEPTION: {e}")
            ok = False

        if ok:
            success_list.append(number)
            if not dry_run:
                done.add(number)
                save_checkpoint(done)
        else:
            fail_list.append(number)

        if not HAS_TQDM:
            print()

    # 실패 목록 저장
    if fail_list:
        # 기존 실패 목록과 합산 (중복 제거)
        existing_failed = set(load_failed())
        merged_failed   = sorted(existing_failed | set(fail_list))
        save_failed(merged_failed)

    elapsed = time.time() - t_start
    m, s    = divmod(int(elapsed), 60)

    print(f"\n{'='*64}")
    print(f"완료: {len(success_list)}개  |  실패: {len(fail_list)}개  |  소요: {m}분{s:02d}초")
    if fail_list:
        print(f"실패 목록 저장됨: {FAILED_FILE}")
        print(f"재시도: python3 scripts/batch_process.py --retry-failed")
    print(f"{'='*64}")


# ─── CLI ───────────────────────────────────────────────────────────────────────
if __name__ == '__main__':
    parser = argparse.ArgumentParser(
        description='Haruki 배치 학습 스크립트',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
증강 레벨 (--augment):
  0  기본 시퀀스만 (원본+반전 = 2개)
  1  속도 변형 추가: 0.75x + 1.25x (원본+반전 = 6개)
  2  속도 + 노이즈 (원본+반전 = 10개, 기본값)
        """,
    )
    parser.add_argument('--start',         type=int,   default=1501,  help='시작 번호 (기본: 1501)')
    parser.add_argument('--end',           type=int,   default=3000,  help='종료 번호 (기본: 3000)')
    parser.add_argument('--numbers',       type=str,   nargs='+',     help='특정 번호 지정')
    parser.add_argument('--single',        type=str,                  help='단일 파일 테스트')
    parser.add_argument('--retry-failed',  action='store_true',       help='batch_failed.json 목록 재시도')
    parser.add_argument('--reset',         action='store_true',       help='체크포인트 초기화')
    parser.add_argument('--dry-run',       action='store_true',       help='저장 없이 처리 결과만 확인')
    parser.add_argument('--fps',           type=int,   default=15,    help='샘플링 FPS (기본: 15)')
    parser.add_argument('--augment',       type=int,   default=2,     choices=[0, 1, 2],
                        help='증강 레벨 0/1/2 (기본: 2)')
    parser.add_argument('--min-hand-rate', type=int,   default=30,    help='최소 손 감지율 %% (기본: 30)')
    args = parser.parse_args()

    # 공통 옵션
    opts = dict(
        sample_fps    = args.fps,
        augment_level = args.augment,
        min_hand_rate = args.min_hand_rate,
        dry_run       = args.dry_run,
    )

    # ── 체크포인트 초기화 ──
    if args.reset:
        if CHECKPOINT_FILE.exists():
            CHECKPOINT_FILE.unlink()
            print("체크포인트 초기화 완료.")
        else:
            print("체크포인트 파일 없음.")
        sys.exit(0)

    # ── 단일 파일 테스트 ──
    if args.single:
        print(f"\n단일 테스트: {args.single}")
        ok = process_one(args.single, **opts, verbose=True)
        sys.exit(0 if ok else 1)

    # ── 실패 파일 재시도 ──
    if args.retry_failed:
        failed = load_failed()
        if not failed:
            print("재시도할 실패 파일이 없습니다.")
            sys.exit(0)
        print(f"실패 파일 {len(failed)}개 재시도: {failed}")
        # 재시도 전 실패 목록 초기화 (run_batch가 새로 기록)
        FAILED_FILE.unlink(missing_ok=True)
        run_batch(failed, **opts)
        sys.exit(0)

    # ── 특정 번호 지정 ──
    if args.numbers:
        run_batch(args.numbers, **opts)
        sys.exit(0)

    # ── 범위 처리 ──
    all_videos = sorted(
        p.stem for p in VIDEO_DIR.glob('*.mp4')
        if p.stem.isdigit() and args.start <= int(p.stem) <= args.end
    )
    if not all_videos:
        print(f"ERROR: {VIDEO_DIR}에서 영상을 찾을 수 없습니다 ({args.start}~{args.end})")
        sys.exit(1)

    run_batch(all_videos, **opts)
