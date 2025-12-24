"""
위치/크기/회전 불변 수화 특징 추출 (Python 버전)
TypeScript의 featureExtraction.ts를 Python으로 이식
"""

import numpy as np
import math

def euclidean_distance(p1, p2):
    """두 점 사이의 유클리드 거리"""
    dx = p1['x'] - p2['x']
    dy = p1['y'] - p2['y']
    dz = p1['z'] - p2['z']
    return math.sqrt(dx*dx + dy*dy + dz*dz)

def calculate_angle(p1, p2, p3):
    """세 점으로 이루어진 각도 계산 (p1-p2-p3)"""
    v1 = {
        'x': p1['x'] - p2['x'],
        'y': p1['y'] - p2['y'],
        'z': p1['z'] - p2['z']
    }

    v2 = {
        'x': p3['x'] - p2['x'],
        'y': p3['y'] - p2['y'],
        'z': p3['z'] - p2['z']
    }

    dot = v1['x']*v2['x'] + v1['y']*v2['y'] + v1['z']*v2['z']
    len1 = math.sqrt(v1['x']**2 + v1['y']**2 + v1['z']**2)
    len2 = math.sqrt(v2['x']**2 + v2['y']**2 + v2['z']**2)

    if len1 == 0 or len2 == 0:
        return 0

    cos_angle = max(-1, min(1, dot / (len1 * len2)))
    return math.acos(cos_angle)

def get_hand_scale(hand_landmarks):
    """손 크기 기준값 계산 (손목-중지 끝 거리)"""
    wrist = hand_landmarks[0]
    middle_finger_tip = hand_landmarks[12]
    return euclidean_distance(wrist, middle_finger_tip)

def calculate_finger_extension(hand_landmarks, tip_idx, base_idx, palm_center, hand_scale):
    """손가락 펴짐 정도 계산"""
    tip_to_palm = euclidean_distance(hand_landmarks[tip_idx], palm_center)
    base_to_palm = euclidean_distance(hand_landmarks[base_idx], palm_center)

    normalized_tip = tip_to_palm / hand_scale
    normalized_base = base_to_palm / hand_scale

    extension = normalized_tip / max(normalized_base, 0.01)
    return max(0, min(1, (extension - 0.8) / 0.6))

def extract_hand_features(hand_landmarks, body_scale=None):
    """손 특징 추출 (WebcamCapture와 동일)"""
    if not hand_landmarks or len(hand_landmarks) < 21:
        return None

    # 손바닥 중심
    palm_center = {
        'x': (hand_landmarks[0]['x'] + hand_landmarks[5]['x'] + hand_landmarks[17]['x']) / 3,
        'y': (hand_landmarks[0]['y'] + hand_landmarks[5]['y'] + hand_landmarks[17]['y']) / 3,
        'z': (hand_landmarks[0]['z'] + hand_landmarks[5]['z'] + hand_landmarks[17]['z']) / 3
    }

    # 손 크기 기준값
    hand_scale = get_hand_scale(hand_landmarks)
    if hand_scale == 0:
        return None

    # 손가락 인덱스
    fingers = {
        'thumb': {'tip': 4, 'base': 2, 'mcp': 1},
        'index': {'tip': 8, 'base': 6, 'mcp': 5},
        'middle': {'tip': 12, 'base': 10, 'mcp': 9},
        'ring': {'tip': 16, 'base': 14, 'mcp': 13},
        'pinky': {'tip': 20, 'base': 18, 'mcp': 17}
    }

    # 1. 손가락 펴짐 정도 (5개)
    finger_extensions = [
        calculate_finger_extension(hand_landmarks, fingers['thumb']['tip'], fingers['thumb']['mcp'], palm_center, hand_scale),
        calculate_finger_extension(hand_landmarks, fingers['index']['tip'], fingers['index']['mcp'], palm_center, hand_scale),
        calculate_finger_extension(hand_landmarks, fingers['middle']['tip'], fingers['middle']['mcp'], palm_center, hand_scale),
        calculate_finger_extension(hand_landmarks, fingers['ring']['tip'], fingers['ring']['mcp'], palm_center, hand_scale),
        calculate_finger_extension(hand_landmarks, fingers['pinky']['tip'], fingers['pinky']['mcp'], palm_center, hand_scale)
    ]

    # 2. 손가락 관절 각도 (10개)
    finger_bones = [
        [1, 2, 3, 4],     # 엄지
        [5, 6, 7, 8],     # 검지
        [9, 10, 11, 12],  # 중지
        [13, 14, 15, 16], # 약지
        [17, 18, 19, 20]  # 새끼
    ]

    finger_angles = []
    for bones in finger_bones:
        for i in range(len(bones) - 2):
            angle = calculate_angle(
                hand_landmarks[bones[i]],
                hand_landmarks[bones[i + 1]],
                hand_landmarks[bones[i + 2]]
            )
            finger_angles.append(angle)

    # 3. 손가락 끝 간 정규화된 거리 (10개)
    finger_tips = [4, 8, 12, 16, 20]
    finger_tip_distances = []
    for i in range(len(finger_tips)):
        for j in range(i + 1, len(finger_tips)):
            dist = euclidean_distance(
                hand_landmarks[finger_tips[i]],
                hand_landmarks[finger_tips[j]]
            )
            finger_tip_distances.append(dist / hand_scale)

    # 4. 손 모양 비율 (3개)
    hand_width = euclidean_distance(hand_landmarks[5], hand_landmarks[17])
    hand_length = euclidean_distance(hand_landmarks[0], hand_landmarks[12])
    thumb_spread = euclidean_distance(hand_landmarks[4], hand_landmarks[8])

    hand_shape_ratios = [
        hand_width / hand_scale,
        hand_length / hand_scale,
        thumb_spread / hand_scale
    ]

    # 5. 손가락 굽힘 각도 (5개)
    finger_bend_angles = [
        calculate_angle(hand_landmarks[2], hand_landmarks[3], hand_landmarks[4]),
        calculate_angle(hand_landmarks[5], hand_landmarks[7], hand_landmarks[8]),
        calculate_angle(hand_landmarks[9], hand_landmarks[11], hand_landmarks[12]),
        calculate_angle(hand_landmarks[13], hand_landmarks[15], hand_landmarks[16]),
        calculate_angle(hand_landmarks[17], hand_landmarks[19], hand_landmarks[20])
    ]

    return {
        'fingerExtensions': finger_extensions,
        'fingerAngles': finger_angles,
        'fingerTipDistances': finger_tip_distances,
        'handShapeRatios': hand_shape_ratios,
        'fingerBendAngles': finger_bend_angles
    }

def flatten_hand_features(features):
    """손 특징을 평탄화된 배열로 변환"""
    if not features:
        return None

    return (
        features['fingerExtensions'] +
        features['fingerAngles'] +
        features['fingerTipDistances'] +
        features['handShapeRatios'] +
        features['fingerBendAngles']
    )

def extract_pose_features(pose_landmarks):
    """포즈 특징 추출"""
    if not pose_landmarks or len(pose_landmarks) < 33:
        return None

    # 주요 관절 간 각도 (9개)
    angles = [
        # 왼팔
        calculate_angle(pose_landmarks[11], pose_landmarks[13], pose_landmarks[15]),  # 어깨-팔꿈치-손목
        calculate_angle(pose_landmarks[13], pose_landmarks[11], pose_landmarks[23]),  # 팔꿈치-어깨-엉덩이
        calculate_angle(pose_landmarks[11], pose_landmarks[23], pose_landmarks[25]),  # 어깨-엉덩이-무릎

        # 오른팔
        calculate_angle(pose_landmarks[12], pose_landmarks[14], pose_landmarks[16]),
        calculate_angle(pose_landmarks[14], pose_landmarks[12], pose_landmarks[24]),
        calculate_angle(pose_landmarks[12], pose_landmarks[24], pose_landmarks[26]),

        # 몸통
        calculate_angle(pose_landmarks[11], pose_landmarks[12], pose_landmarks[24]),
        calculate_angle(pose_landmarks[23], pose_landmarks[24], pose_landmarks[26]),
        calculate_angle(pose_landmarks[23], pose_landmarks[11], pose_landmarks[12])
    ]

    return angles
