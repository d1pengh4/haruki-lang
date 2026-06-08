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

def extract_hand_features(hand_landmarks):
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
    """
    전신 포즈 특징 추출 - 20차원
    featureExtraction.ts의 extractPoseFeatures와 완전히 동일한 방식
    """
    if not pose_landmarks or len(pose_landmarks) < 33:
        return None

    def lm(idx):
        return pose_landmarks[idx]

    def dist3d(a, b):
        return math.sqrt((a['x']-b['x'])**2 + (a['y']-b['y'])**2 + (a['z']-b['z'])**2)

    left_shoulder  = lm(11); right_shoulder = lm(12)
    left_elbow     = lm(13); right_elbow    = lm(14)
    left_wrist     = lm(15); right_wrist    = lm(16)

    sw = dist3d(left_shoulder, right_shoulder)
    if sw < 0.001:
        return None

    tc_x = (left_shoulder['x'] + right_shoulder['x']) / 2
    tc_y = (left_shoulder['y'] + right_shoulder['y']) / 2
    tc_z = (left_shoulder['z'] + right_shoulder['z']) / 2

    def norm(p):
        return {
            'x': (p['x'] - tc_x) / sw,
            'y': (p['y'] - tc_y) / sw,
            'z': (p['z'] - tc_z) / sw,
        }

    lw = norm(left_wrist);  rw = norm(right_wrist)
    le = norm(left_elbow);  re = norm(right_elbow)

    # Arm angle helpers
    def angle3d(a, b, c):
        v1 = {'x': a['x']-b['x'], 'y': a['y']-b['y'], 'z': a['z']-b['z']}
        v2 = {'x': c['x']-b['x'], 'y': c['y']-b['y'], 'z': c['z']-b['z']}
        dot = v1['x']*v2['x'] + v1['y']*v2['y'] + v1['z']*v2['z']
        l1 = math.sqrt(v1['x']**2 + v1['y']**2 + v1['z']**2)
        l2 = math.sqrt(v2['x']**2 + v2['y']**2 + v2['z']**2)
        if l1 == 0 or l2 == 0:
            return 0
        return math.acos(max(-1, min(1, dot / (l1 * l2))))

    left_arm_angle   = angle3d(left_shoulder,  left_elbow,  left_wrist)
    right_arm_angle  = angle3d(right_shoulder, right_elbow, right_wrist)

    ref_left  = {'x': left_shoulder['x'],  'y': left_shoulder['y']  + 0.1, 'z': left_shoulder['z']}
    ref_right = {'x': right_shoulder['x'], 'y': right_shoulder['y'] + 0.1, 'z': right_shoulder['z']}
    left_upper_arm  = angle3d(ref_left,  left_shoulder,  left_elbow)
    right_upper_arm = angle3d(ref_right, right_shoulder, right_elbow)

    # 전완 수직각: 팔꿈치-손목 방향과 수직의 각도 (leftArmAngle과 독립)
    ref_lw = {'x': left_elbow['x'],  'y': left_elbow['y']  + 0.1, 'z': left_elbow['z']}
    ref_rw = {'x': right_elbow['x'], 'y': right_elbow['y'] + 0.1, 'z': right_elbow['z']}
    left_elbow_bend  = angle3d(ref_lw,  left_elbow,  left_wrist)
    right_elbow_bend = angle3d(ref_rw, right_elbow, right_wrist)

    wrist_dist = dist3d(left_wrist, right_wrist) / sw

    left_wrist_h  = (left_wrist['y']  - left_shoulder['y'])  / sw
    right_wrist_h = (right_wrist['y'] - right_shoulder['y']) / sw

    shoulder_tilt = (right_shoulder['y'] - left_shoulder['y']) / sw

    return [
        left_arm_angle, right_arm_angle,              # 1-2
        left_upper_arm, right_upper_arm,              # 3-4
        left_elbow_bend, right_elbow_bend,            # 5-6
        lw['x'], lw['y'], lw['z'],                    # 7-9
        rw['x'], rw['y'], rw['z'],                    # 10-12
        le['x'], le['y'],                             # 13-14
        re['x'], re['y'],                             # 15-16
        wrist_dist,                                   # 17
        left_wrist_h, right_wrist_h,                  # 18-19
        shoulder_tilt,                                # 20
    ]

def extract_face_features(face_landmarks):
    """
    얼굴 특징 추출 - 20차원 (표정 포함)
    featureExtraction.ts의 extractFaceFeatures와 완전히 동일한 방식

    주요 지표:
    1-2:  좌/우 눈 개방도 (EAR)
    3-4:  입 개방도 (MAR), 입 너비
    5-6:  좌/우 눈썹 높이
    7-9:  머리 기울기 (roll/yaw/pitch)
    10-12: 코-입 거리, 얼굴 높이, 코 위치
    13-14: 좌/우 눈 중심 x
    15-16: 미소 강도, 눈썹 찌푸림
    17-18: 좌/우 볼 올라감
    19-20: 콧구멍 펼침, 입술 내부 비율
    """
    if not face_landmarks or len(face_landmarks) < 468:
        return None

    def lm(idx):
        return face_landmarks[idx]

    def dist2d(a, b):
        return math.sqrt((a['x'] - b['x'])**2 + (a['y'] - b['y'])**2)

    # Key landmarks
    left_eye_outer  = lm(33);  left_eye_inner  = lm(133)
    left_eye_top    = lm(159); left_eye_bot    = lm(145)
    left_eye_top2   = lm(158); left_eye_bot2   = lm(153)

    right_eye_outer = lm(362); right_eye_inner = lm(263)
    right_eye_top   = lm(386); right_eye_bot   = lm(374)
    right_eye_top2  = lm(385); right_eye_bot2  = lm(380)

    left_brow        = lm(105); right_brow       = lm(334)
    left_brow_inner  = lm(107); right_brow_inner = lm(336)

    mouth_left   = lm(61);  mouth_right  = lm(291)
    mouth_top    = lm(0);   mouth_bot    = lm(17)
    mouth_in_top = lm(13);  mouth_in_bot = lm(14)

    nose   = lm(1); bridge = lm(6); chin = lm(152)
    nostril_left = lm(129); nostril_right = lm(358)
    left_cheek   = lm(234); right_cheek   = lm(454)

    # Face scale: inter-ocular distance
    face_scale = dist2d(left_eye_outer, right_eye_outer)
    if face_scale < 0.001:
        return None

    face_cx = (left_eye_outer['x'] + right_eye_outer['x']) / 2
    face_cy = (left_eye_outer['y'] + right_eye_outer['y']) / 2

    # 1. Left EAR
    lew = dist2d(left_eye_outer, left_eye_inner)
    left_ear = (dist2d(left_eye_top, left_eye_bot) + dist2d(left_eye_top2, left_eye_bot2)) / (2 * lew) if lew > 0 else 0

    # 2. Right EAR
    rew = dist2d(right_eye_outer, right_eye_inner)
    right_ear = (dist2d(right_eye_top, right_eye_bot) + dist2d(right_eye_top2, right_eye_bot2)) / (2 * rew) if rew > 0 else 0

    # 3. MAR
    mw = dist2d(mouth_left, mouth_right)
    mar = (dist2d(mouth_top, mouth_bot) + dist2d(mouth_in_top, mouth_in_bot)) / (2 * mw) if mw > 0 else 0

    # 4. Mouth width normalized
    mouth_width_norm = mw / face_scale

    # 5. Left eyebrow height
    left_brow_h = (left_eye_top['y'] - left_brow['y']) / face_scale

    # 6. Right eyebrow height
    right_brow_h = (right_eye_top['y'] - right_brow['y']) / face_scale

    # 7. Head tilt (roll)
    head_tilt = math.atan2(
        right_eye_outer['y'] - left_eye_outer['y'],
        right_eye_outer['x'] - left_eye_outer['x']
    )

    # 8. Head yaw
    head_yaw = (nose['x'] - face_cx) / face_scale

    # 9. Head pitch
    head_pitch = (nose['y'] - face_cy) / face_scale

    # 10. Nose-to-mouth distance
    mc_x = (mouth_left['x'] + mouth_right['x']) / 2
    mc_y = (mouth_left['y'] + mouth_right['y']) / 2
    nose_to_mouth = math.sqrt((nose['x'] - mc_x)**2 + (nose['y'] - mc_y)**2) / face_scale

    # 11. Face height ratio
    face_height = math.sqrt((chin['x'] - face_cx)**2 + (chin['y'] - face_cy)**2) / face_scale

    # 12. Nose bridge offset
    nose_bridge_offset = (bridge['x'] - face_cx) / face_scale

    # 13. Left eye center x
    left_eye_cx = ((left_eye_outer['x'] + left_eye_inner['x']) / 2 - face_cx) / face_scale

    # 14. Right eye center x
    right_eye_cx = ((right_eye_outer['x'] + right_eye_inner['x']) / 2 - face_cx) / face_scale

    # 15. Smile intensity
    mouth_mid_y = (mouth_top['y'] + mouth_bot['y']) / 2
    smile = (mouth_mid_y - (mouth_left['y'] + mouth_right['y']) / 2) / face_scale

    # 16. Brow frown (smaller = furrowed)
    brow_frown = dist2d(left_brow_inner, right_brow_inner) / face_scale

    # 17. Left cheek height
    left_cheek_h = (left_cheek['y'] - left_eye_bot['y']) / face_scale

    # 18. Right cheek height
    right_cheek_h = (right_cheek['y'] - right_eye_bot['y']) / face_scale

    # 19. Nose wing spread
    nose_wing = dist2d(nostril_left, nostril_right) / face_scale

    # 20. Lip inner vertical ratio
    lip_inner = dist2d(mouth_in_top, mouth_in_bot) / max(mw, 0.001)

    return [
        left_ear, right_ear, mar, mouth_width_norm,
        left_brow_h, right_brow_h,
        head_tilt, head_yaw, head_pitch,
        nose_to_mouth, face_height, nose_bridge_offset,
        left_eye_cx, right_eye_cx,
        smile, brow_frown,
        left_cheek_h, right_cheek_h,
        nose_wing, lip_inner,
    ]
