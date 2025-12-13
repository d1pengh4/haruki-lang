/**
 * 위치/크기/회전 불변 수화 특징 추출
 *
 * 이 모듈은 손, 얼굴, 전신 포즈에서 절대 좌표가 아닌
 * 상대적 특징(비율, 각도, 정규화된 거리)을 추출하여
 * 다양한 환경에서 robust한 인식을 가능하게 합니다.
 */

export interface Landmark {
  x: number;
  y: number;
  z: number;
  visibility?: number;
}

export interface HandFeatures {
  // 1. 손가락 펴짐 정도 (0~1, 5개)
  fingerExtensions: number[];

  // 2. 손가락 간 각도 (라디안, 15개)
  fingerAngles: number[];

  // 3. 손가락 끝 간 정규화된 거리 비율 (10개)
  fingerTipDistances: number[];

  // 4. 손 모양 비율 (3개)
  handShapeRatios: number[];

  // 5. 손가락 굽힘 각도 (5개)
  fingerBendAngles: number[];
}

/**
 * 두 점 사이의 유클리드 거리 계산
 */
function euclideanDistance(p1: Landmark, p2: Landmark): number {
  const dx = p1.x - p2.x;
  const dy = p1.y - p2.y;
  const dz = p1.z - p2.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

/**
 * 세 점으로 이루어진 각도 계산 (p1-p2-p3)
 * @returns 라디안 각도 (0 ~ π)
 */
function calculateAngle(p1: Landmark, p2: Landmark, p3: Landmark): number {
  const v1 = {
    x: p1.x - p2.x,
    y: p1.y - p2.y,
    z: p1.z - p2.z
  };

  const v2 = {
    x: p3.x - p2.x,
    y: p3.y - p2.y,
    z: p3.z - p2.z
  };

  const dot = v1.x * v2.x + v1.y * v2.y + v1.z * v2.z;
  const len1 = Math.sqrt(v1.x * v1.x + v1.y * v1.y + v1.z * v1.z);
  const len2 = Math.sqrt(v2.x * v2.x + v2.y * v2.y + v2.z * v2.z);

  if (len1 === 0 || len2 === 0) return 0;

  const cosAngle = Math.max(-1, Math.min(1, dot / (len1 * len2)));
  return Math.acos(cosAngle);
}

/**
 * 손 크기 기준값 계산 (손목-중지 끝 거리)
 * 이 값으로 모든 거리를 정규화하여 손 크기에 불변하게 만듦
 */
function getHandScale(handLandmarks: Landmark[]): number {
  // 손목(0) - 중지 끝(12) 거리를 손 크기 기준으로 사용
  const wrist = handLandmarks[0];
  const middleFingerTip = handLandmarks[12];
  return euclideanDistance(wrist, middleFingerTip);
}

/**
 * 손가락 펴짐 정도 계산 (0: 완전히 구부림, 1: 완전히 펴짐)
 * 손가락 끝과 손바닥 중심 사이의 거리 비율로 계산
 */
function calculateFingerExtension(
  handLandmarks: Landmark[],
  fingerTipIndex: number,
  fingerBaseIndex: number,
  palmCenter: Landmark,
  handScale: number
): number {
  const tipToPalmDist = euclideanDistance(handLandmarks[fingerTipIndex], palmCenter);
  const baseToPalmDist = euclideanDistance(handLandmarks[fingerBaseIndex], palmCenter);

  // 정규화: 손 크기로 나눔
  const normalizedTipDist = tipToPalmDist / handScale;
  const normalizedBaseDist = baseToPalmDist / handScale;

  // 비율 계산 (펴진 정도)
  const extension = normalizedTipDist / Math.max(normalizedBaseDist, 0.01);

  // 0~1 범위로 클램핑
  return Math.max(0, Math.min(1, (extension - 0.8) / 0.6));
}

/**
 * 손 특징 추출 (위치/크기/회전 불변)
 * @param handLandmarks 손 랜드마크
 * @param bodyScale 신체 크기 기준값 (어깨 너비 등, 선택적)
 */
export function extractHandFeatures(handLandmarks: Landmark[], bodyScale?: number): HandFeatures | null {
  if (!handLandmarks || handLandmarks.length < 21) return null;

  // 손바닥 중심 계산 (손목, 검지, 새끼손가락 base의 중심)
  const palmCenter = {
    x: (handLandmarks[0].x + handLandmarks[5].x + handLandmarks[17].x) / 3,
    y: (handLandmarks[0].y + handLandmarks[5].y + handLandmarks[17].y) / 3,
    z: (handLandmarks[0].z + handLandmarks[5].z + handLandmarks[17].z) / 3
  };

  // 손 크기 기준값
  const handScale = getHandScale(handLandmarks);
  if (handScale === 0) return null;

  // 신체 크기 기준값이 제공되면 사용, 없으면 손 크기 사용
  // 하지만 손 내부 특징은 여전히 손 크기로 정규화 (손 모양 자체는 체구와 무관)
  const normalizationScale = handScale;

  // 손가락 인덱스 정의
  const fingers = {
    thumb: { tip: 4, base: 2, mcp: 1 },
    index: { tip: 8, base: 6, mcp: 5 },
    middle: { tip: 12, base: 10, mcp: 9 },
    ring: { tip: 16, base: 14, mcp: 13 },
    pinky: { tip: 20, base: 18, mcp: 17 }
  };

  // 1. 손가락 펴짐 정도 (5개)
  const fingerExtensions = [
    calculateFingerExtension(handLandmarks, fingers.thumb.tip, fingers.thumb.mcp, palmCenter, handScale),
    calculateFingerExtension(handLandmarks, fingers.index.tip, fingers.index.mcp, palmCenter, handScale),
    calculateFingerExtension(handLandmarks, fingers.middle.tip, fingers.middle.mcp, palmCenter, handScale),
    calculateFingerExtension(handLandmarks, fingers.ring.tip, fingers.ring.mcp, palmCenter, handScale),
    calculateFingerExtension(handLandmarks, fingers.pinky.tip, fingers.pinky.mcp, palmCenter, handScale)
  ];

  // 2. 손가락 관절 각도 (15개)
  const fingerAngles: number[] = [];
  const fingerBones = [
    [1, 2, 3, 4],    // 엄지
    [5, 6, 7, 8],    // 검지
    [9, 10, 11, 12], // 중지
    [13, 14, 15, 16],// 약지
    [17, 18, 19, 20] // 새끼
  ];

  fingerBones.forEach(bones => {
    for (let i = 0; i < bones.length - 2; i++) {
      const angle = calculateAngle(
        handLandmarks[bones[i]],
        handLandmarks[bones[i + 1]],
        handLandmarks[bones[i + 2]]
      );
      fingerAngles.push(angle);
    }
  });

  // 3. 손가락 끝 간 정규화된 거리 (10개)
  const fingerTips = [4, 8, 12, 16, 20];
  const fingerTipDistances: number[] = [];

  for (let i = 0; i < fingerTips.length; i++) {
    for (let j = i + 1; j < fingerTips.length; j++) {
      const dist = euclideanDistance(
        handLandmarks[fingerTips[i]],
        handLandmarks[fingerTips[j]]
      );
      // 손 크기로 정규화
      fingerTipDistances.push(dist / handScale);
    }
  }

  // 4. 손 모양 비율 (3개)
  const handWidth = euclideanDistance(handLandmarks[5], handLandmarks[17]); // 검지-새끼 base
  const handLength = euclideanDistance(handLandmarks[0], handLandmarks[12]); // 손목-중지 끝
  const thumbSpread = euclideanDistance(handLandmarks[4], handLandmarks[8]); // 엄지-검지 끝

  const handShapeRatios = [
    handWidth / handScale,   // 손 너비 비율
    handLength / handScale,  // 손 길이 비율 (항상 ~1.0)
    thumbSpread / handScale  // 엄지-검지 벌림 비율
  ];

  // 5. 손가락 굽힘 각도 (5개) - 전체 손가락 각도
  const fingerBendAngles = [
    calculateAngle(handLandmarks[2], handLandmarks[3], handLandmarks[4]),   // 엄지
    calculateAngle(handLandmarks[5], handLandmarks[7], handLandmarks[8]),   // 검지
    calculateAngle(handLandmarks[9], handLandmarks[11], handLandmarks[12]), // 중지
    calculateAngle(handLandmarks[13], handLandmarks[15], handLandmarks[16]),// 약지
    calculateAngle(handLandmarks[17], handLandmarks[19], handLandmarks[20]) // 새끼
  ];

  return {
    fingerExtensions,
    fingerAngles,
    fingerTipDistances,
    handShapeRatios,
    fingerBendAngles
  };
}

/**
 * 얼굴 특징 추출 (위치/크기 불변)
 */
export function extractFaceFeatures(faceLandmarks: Landmark[]): number[] | null {
  if (!faceLandmarks || faceLandmarks.length < 468) return null;

  // 주요 얼굴 포인트
  const leftEye = faceLandmarks[33];
  const rightEye = faceLandmarks[263];
  const nose = faceLandmarks[1];
  const leftMouth = faceLandmarks[61];
  const rightMouth = faceLandmarks[291];

  // 얼굴 크기 기준값 (양 눈 사이 거리)
  const faceScale = euclideanDistance(leftEye, rightEye);
  if (faceScale === 0) return null;

  // 얼굴 중심
  const faceCenter = {
    x: (leftEye.x + rightEye.x) / 2,
    y: (leftEye.y + rightEye.y) / 2,
    z: (leftEye.z + rightEye.z) / 2
  };

  // 정규화된 특징
  const features = [
    // 1. 입 너비 / 얼굴 너비
    euclideanDistance(leftMouth, rightMouth) / faceScale,

    // 2. 코-입 거리 / 얼굴 너비
    euclideanDistance(nose, faceCenter) / faceScale,

    // 3. 입 위치 (눈 기준 상대 y 좌표)
    (leftMouth.y - faceCenter.y) / faceScale,

    // 4. 얼굴 기울기 (눈의 각도)
    Math.atan2(rightEye.y - leftEye.y, rightEye.x - leftEye.x),

    // 5. 입 벌림 정도 (상하 입술 거리, 추정)
    Math.abs(leftMouth.z - faceCenter.z) / faceScale
  ];

  return features;
}

/**
 * 전신 포즈 특징 추출 (위치/크기 불변)
 */
export function extractPoseFeatures(poseLandmarks: Landmark[]): number[] | null {
  if (!poseLandmarks || poseLandmarks.length < 33) return null;

  // 주요 포즈 포인트
  const leftShoulder = poseLandmarks[11];
  const rightShoulder = poseLandmarks[12];
  const leftElbow = poseLandmarks[13];
  const rightElbow = poseLandmarks[14];
  const leftWrist = poseLandmarks[15];
  const rightWrist = poseLandmarks[16];

  // 어깨 너비를 기준값으로 사용
  const shoulderWidth = euclideanDistance(leftShoulder, rightShoulder);
  if (shoulderWidth === 0) return null;

  // 몸통 중심
  const torsoCenter = {
    x: (leftShoulder.x + rightShoulder.x) / 2,
    y: (leftShoulder.y + rightShoulder.y) / 2,
    z: (leftShoulder.z + rightShoulder.z) / 2
  };

  // 정규화된 특징
  const features = [
    // 1. 왼팔 각도 (어깨-팔꿈치-손목)
    calculateAngle(leftShoulder, leftElbow, leftWrist),

    // 2. 오른팔 각도
    calculateAngle(rightShoulder, rightElbow, rightWrist),

    // 3. 왼손 위치 (어깨 기준 정규화)
    (leftWrist.x - torsoCenter.x) / shoulderWidth,
    (leftWrist.y - torsoCenter.y) / shoulderWidth,
    (leftWrist.z - torsoCenter.z) / shoulderWidth,

    // 4. 오른손 위치 (어깨 기준 정규화)
    (rightWrist.x - torsoCenter.x) / shoulderWidth,
    (rightWrist.y - torsoCenter.y) / shoulderWidth,
    (rightWrist.z - torsoCenter.z) / shoulderWidth,

    // 5. 양손 간 거리 (정규화)
    euclideanDistance(leftWrist, rightWrist) / shoulderWidth
  ];

  return features;
}

/**
 * 두 특징 벡터 간 유사도 계산 (코사인 유사도)
 * @returns 0~1 (1에 가까울수록 유사)
 */
export function calculateFeatureSimilarity(features1: number[], features2: number[]): number {
  if (!features1 || !features2 || features1.length !== features2.length) return 0;

  let dotProduct = 0;
  let norm1 = 0;
  let norm2 = 0;

  for (let i = 0; i < features1.length; i++) {
    dotProduct += features1[i] * features2[i];
    norm1 += features1[i] * features1[i];
    norm2 += features2[i] * features2[i];
  }

  if (norm1 === 0 || norm2 === 0) return 0;

  return dotProduct / (Math.sqrt(norm1) * Math.sqrt(norm2));
}

/**
 * 손 특징을 평탄화된 배열로 변환
 */
export function flattenHandFeatures(features: HandFeatures): number[] {
  return [
    ...features.fingerExtensions,    // 5
    ...features.fingerAngles,         // 15
    ...features.fingerTipDistances,   // 10
    ...features.handShapeRatios,      // 3
    ...features.fingerBendAngles      // 5
  ]; // 총 38개 특징
}
