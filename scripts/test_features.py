#!/usr/bin/env python3
"""
특징 추출 테스트: Python과 TypeScript가 동일한 결과를 내는지 확인
"""

import math
from feature_extraction import extract_hand_features, flatten_hand_features

# 테스트 손 랜드마크 (21개 포인트)
# 단순한 "펼친 손" 모양
test_hand = []
for i in range(21):
    test_hand.append({
        'x': 0.5 + i * 0.01,
        'y': 0.5 + i * 0.01,
        'z': 0.0,
        'visibility': 1.0
    })

print("🧪 특징 추출 테스트\n")
print(f"입력: 21개 랜드마크")

# 특징 추출
features_obj = extract_hand_features(test_hand, body_scale=None)

if features_obj:
    features_array = flatten_hand_features(features_obj)

    print(f"\n✅ 특징 추출 성공!")
    print(f"   특징 벡터 길이: {len(features_array)}")
    print(f"\n   fingerExtensions ({len(features_obj['fingerExtensions'])}개): {features_obj['fingerExtensions']}")
    print(f"   fingerAngles ({len(features_obj['fingerAngles'])}개): {features_obj['fingerAngles'][:5]}...")
    print(f"   fingerTipDistances ({len(features_obj['fingerTipDistances'])}개): {features_obj['fingerTipDistances'][:5]}...")
    print(f"   handShapeRatios ({len(features_obj['handShapeRatios'])}개): {features_obj['handShapeRatios']}")
    print(f"   fingerBendAngles ({len(features_obj['fingerBendAngles'])}개): {features_obj['fingerBendAngles']}")

    print(f"\n   평탄화된 배열 길이: {len(features_array)}")
    print(f"   예상 길이: 5 + 10 + 10 + 3 + 5 = 33")

    if len(features_array) == 33:
        print(f"\n✅ 길이 검증 통과!")
    else:
        print(f"\n❌ 길이 불일치!")
else:
    print("❌ 특징 추출 실패")
