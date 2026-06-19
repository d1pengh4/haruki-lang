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

  // 2. 손가락 관절 각도 (라디안, 10개) — 각 손가락 2개씩
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
 * 두 점 사이의 2D 유클리드 거리 (xy 평면)
 */
function dist2D(p1: Landmark, p2: Landmark): number {
  const dx = p1.x - p2.x;
  const dy = p1.y - p2.y;
  return Math.sqrt(dx * dx + dy * dy);
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
 */
function getHandScale(handLandmarks: Landmark[]): number {
  const wrist = handLandmarks[0];
  const middleFingerTip = handLandmarks[12];
  return euclideanDistance(wrist, middleFingerTip);
}

/**
 * 손가락 펴짐 정도 계산 (0: 완전히 구부림, 1: 완전히 펴짐)
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

  const normalizedTipDist = tipToPalmDist / handScale;
  const normalizedBaseDist = baseToPalmDist / handScale;

  const extension = normalizedTipDist / Math.max(normalizedBaseDist, 0.01);
  return Math.max(0, Math.min(1, (extension - 0.8) / 0.6));
}

/**
 * 손 특징 추출 (위치/크기/회전 불변)
 * 총 33차원: fingerExtensions(5) + fingerAngles(10) + fingerTipDistances(10) + handShapeRatios(3) + fingerBendAngles(5)
 * (각 손가락당 2개 각도: i < bones.length-2 → i=0,1)
 */
export function extractHandFeatures(handLandmarks: Landmark[]): HandFeatures | null {
  if (!handLandmarks || handLandmarks.length < 21) return null;

  const palmCenter = {
    x: (handLandmarks[0].x + handLandmarks[5].x + handLandmarks[17].x) / 3,
    y: (handLandmarks[0].y + handLandmarks[5].y + handLandmarks[17].y) / 3,
    z: (handLandmarks[0].z + handLandmarks[5].z + handLandmarks[17].z) / 3
  };

  const handScale = getHandScale(handLandmarks);
  if (handScale === 0) return null;

  const fingers = {
    thumb:  { tip: 4,  base: 2,  mcp: 1  },
    index:  { tip: 8,  base: 6,  mcp: 5  },
    middle: { tip: 12, base: 10, mcp: 9  },
    ring:   { tip: 16, base: 14, mcp: 13 },
    pinky:  { tip: 20, base: 18, mcp: 17 }
  };

  // 1. 손가락 펴짐 정도 (5개)
  const fingerExtensions = [
    calculateFingerExtension(handLandmarks, fingers.thumb.tip,  fingers.thumb.mcp,  palmCenter, handScale),
    calculateFingerExtension(handLandmarks, fingers.index.tip,  fingers.index.mcp,  palmCenter, handScale),
    calculateFingerExtension(handLandmarks, fingers.middle.tip, fingers.middle.mcp, palmCenter, handScale),
    calculateFingerExtension(handLandmarks, fingers.ring.tip,   fingers.ring.mcp,   palmCenter, handScale),
    calculateFingerExtension(handLandmarks, fingers.pinky.tip,  fingers.pinky.mcp,  palmCenter, handScale)
  ];

  // 2. 손가락 관절 각도 (10개) — 각 손가락 2개씩 (bones.length - 2 = 2)
  const fingerAngles: number[] = [];
  const fingerBones = [
    [1, 2, 3, 4],     // 엄지
    [5, 6, 7, 8],     // 검지
    [9, 10, 11, 12],  // 중지
    [13, 14, 15, 16], // 약지
    [17, 18, 19, 20]  // 새끼
  ];

  fingerBones.forEach(bones => {
    for (let i = 0; i < bones.length - 2; i++) {
      fingerAngles.push(calculateAngle(
        handLandmarks[bones[i]],
        handLandmarks[bones[i + 1]],
        handLandmarks[bones[i + 2]]
      ));
    }
  });

  // 3. 손가락 끝 간 정규화된 거리 (10개)
  const fingerTips = [4, 8, 12, 16, 20];
  const fingerTipDistances: number[] = [];
  for (let i = 0; i < fingerTips.length; i++) {
    for (let j = i + 1; j < fingerTips.length; j++) {
      fingerTipDistances.push(
        euclideanDistance(handLandmarks[fingerTips[i]], handLandmarks[fingerTips[j]]) / handScale
      );
    }
  }

  // 4. 손 모양 비율 (3개)
  const handWidth  = euclideanDistance(handLandmarks[5], handLandmarks[17]);
  const handLength = euclideanDistance(handLandmarks[0], handLandmarks[12]);
  const thumbSpread = euclideanDistance(handLandmarks[4], handLandmarks[8]);

  const handShapeRatios = [
    handWidth  / handScale,
    handLength / handScale,
    thumbSpread / handScale
  ];

  // 5. 손가락 굽힘 각도 (5개) — 각 손가락의 PIP-DIP-TIP 각도 (연속 관절 기준)
  const fingerBendAngles = [
    calculateAngle(handLandmarks[2],  handLandmarks[3],  handLandmarks[4]),  // 엄지: IP-DIP-TIP
    calculateAngle(handLandmarks[6],  handLandmarks[7],  handLandmarks[8]),  // 검지: PIP-DIP-TIP
    calculateAngle(handLandmarks[10], handLandmarks[11], handLandmarks[12]), // 중지: PIP-DIP-TIP
    calculateAngle(handLandmarks[14], handLandmarks[15], handLandmarks[16]), // 약지: PIP-DIP-TIP
    calculateAngle(handLandmarks[18], handLandmarks[19], handLandmarks[20])  // 새끼: PIP-DIP-TIP
  ];

  return { fingerExtensions, fingerAngles, fingerTipDistances, handShapeRatios, fingerBendAngles };
}

/**
 * 얼굴 특징 추출 (위치/크기 불변) - 20차원 (표정 포함)
 *
 * MediaPipe face landmark key indices:
 *   Left eye:  outer=33, inner=133, top=159, bottom=145, top2=158, bottom2=153
 *   Right eye: outer=362, inner=263, top=386, bottom=374, top2=385, bottom2=380
 *   Left eyebrow:  mid=105, inner=107, outer=70
 *   Right eyebrow: mid=334, inner=336, outer=300
 *   Mouth: left=61, right=291, top=0, bottom=17, innerTop=13, innerBottom=14
 *   Nose tip=1, nose bridge=6, chin=152
 *   Nostrils: left=129, right=358
 *   Cheeks: left=234, right=454
 */
export function extractFaceFeatures(faceLandmarks: Landmark[]): number[] | null {
  if (!faceLandmarks || faceLandmarks.length < 468) return null;

  const leftEyeOuter  = faceLandmarks[33];
  const leftEyeInner  = faceLandmarks[133];
  const leftEyeTop    = faceLandmarks[159];
  const leftEyeBot    = faceLandmarks[145];
  const leftEyeTop2   = faceLandmarks[158];
  const leftEyeBot2   = faceLandmarks[153];

  const rightEyeOuter = faceLandmarks[362];
  const rightEyeInner = faceLandmarks[263];
  const rightEyeTop   = faceLandmarks[386];
  const rightEyeBot   = faceLandmarks[374];
  const rightEyeTop2  = faceLandmarks[385];
  const rightEyeBot2  = faceLandmarks[380];

  const leftBrow       = faceLandmarks[105];
  const rightBrow      = faceLandmarks[334];
  const leftBrowInner  = faceLandmarks[107];
  const rightBrowInner = faceLandmarks[336];

  const mouthLeft  = faceLandmarks[61];
  const mouthRight = faceLandmarks[291];
  const mouthTop   = faceLandmarks[0];
  const mouthBot   = faceLandmarks[17];
  const mouthInTop = faceLandmarks[13];
  const mouthInBot = faceLandmarks[14];

  const nose   = faceLandmarks[1];
  const bridge = faceLandmarks[6];
  const chin   = faceLandmarks[152];

  const nostrilLeft  = faceLandmarks[129];
  const nostrilRight = faceLandmarks[358];
  const leftCheek    = faceLandmarks[234];
  const rightCheek   = faceLandmarks[454];

  const faceScale = dist2D(leftEyeOuter, rightEyeOuter);
  if (faceScale < 0.001) return null;

  const faceCenter: Landmark = {
    x: (leftEyeOuter.x + rightEyeOuter.x) / 2,
    y: (leftEyeOuter.y + rightEyeOuter.y) / 2,
    z: (leftEyeOuter.z + rightEyeOuter.z) / 2,
  };

  // 1. Left Eye Aspect Ratio (blink / openness)
  const leftEyeWidth = dist2D(leftEyeOuter, leftEyeInner);
  const leftEAR = leftEyeWidth > 0
    ? (dist2D(leftEyeTop, leftEyeBot) + dist2D(leftEyeTop2, leftEyeBot2)) / (2 * leftEyeWidth)
    : 0;

  // 2. Right Eye Aspect Ratio
  const rightEyeWidth = dist2D(rightEyeOuter, rightEyeInner);
  const rightEAR = rightEyeWidth > 0
    ? (dist2D(rightEyeTop, rightEyeBot) + dist2D(rightEyeTop2, rightEyeBot2)) / (2 * rightEyeWidth)
    : 0;

  // 3. Mouth Aspect Ratio (openness)
  const mouthWidth = dist2D(mouthLeft, mouthRight);
  const MAR = mouthWidth > 0
    ? (dist2D(mouthTop, mouthBot) + dist2D(mouthInTop, mouthInBot)) / (2 * mouthWidth)
    : 0;

  // 4. Mouth width normalized
  const mouthWidthNorm = mouthWidth / faceScale;

  // 5. Left eyebrow height (positive = raised)
  const leftBrowHeight = (leftEyeTop.y - leftBrow.y) / faceScale;

  // 6. Right eyebrow height
  const rightBrowHeight = (rightEyeTop.y - rightBrow.y) / faceScale;

  // 7. Head tilt (roll)
  const headTilt = Math.atan2(
    rightEyeOuter.y - leftEyeOuter.y,
    rightEyeOuter.x - leftEyeOuter.x
  );

  // 8. Head yaw (nose left/right offset)
  const headYaw = (nose.x - faceCenter.x) / faceScale;

  // 9. Head pitch (nose up/down offset)
  const headPitch = (nose.y - faceCenter.y) / faceScale;

  // 10. Nose-to-mouth distance
  const mouthCx = (mouthLeft.x + mouthRight.x) / 2;
  const mouthCy = (mouthLeft.y + mouthRight.y) / 2;
  const noseToMouth = dist2D(nose, { x: mouthCx, y: mouthCy, z: 0 }) / faceScale;

  // 11. Face height ratio (chin to eye center)
  const faceHeight = dist2D(chin, faceCenter) / faceScale;

  // 12. Nose bridge lateral offset
  const noseBridgeOffset = (bridge.x - faceCenter.x) / faceScale;

  // 13. Left eye center x (normalized within face width)
  const leftEyeCenterX = ((leftEyeOuter.x + leftEyeInner.x) / 2 - faceCenter.x) / faceScale;

  // 14. Right eye center x
  const rightEyeCenterX = ((rightEyeOuter.x + rightEyeInner.x) / 2 - faceCenter.x) / faceScale;

  // 15. Smile intensity — mouth corners lifted above mouth mid-line
  // (negative = smile: corners above centre; positive = frown: corners below)
  const mouthMidY = (mouthTop.y + mouthBot.y) / 2;
  const smile = (mouthMidY - (mouthLeft.y + mouthRight.y) / 2) / faceScale;

  // 16. Brow frown — distance between inner brow corners (small = furrowed)
  const browFrown = dist2D(leftBrowInner, rightBrowInner) / faceScale;

  // 17. Left cheek raise (AU6) — cheek landmark lifted toward eye
  const leftCheekHeight = (leftCheek.y - leftEyeBot.y) / faceScale;

  // 18. Right cheek raise
  const rightCheekHeight = (rightCheek.y - rightEyeBot.y) / faceScale;

  // 19. Nose wing spread (nostril dilation)
  const noseWingSpread = dist2D(nostrilLeft, nostrilRight) / faceScale;

  // 20. Lip inner gap ratio (vertical inner lip / mouth width)
  const lipInnerRatio = mouthWidth > 0
    ? dist2D(mouthInTop, mouthInBot) / mouthWidth
    : 0;

  return [
    leftEAR, rightEAR, MAR, mouthWidthNorm,          // 1-4
    leftBrowHeight, rightBrowHeight,                   // 5-6
    headTilt, headYaw, headPitch,                      // 7-9
    noseToMouth, faceHeight, noseBridgeOffset,         // 10-12
    leftEyeCenterX, rightEyeCenterX,                   // 13-14
    smile, browFrown,                                  // 15-16
    leftCheekHeight, rightCheekHeight,                 // 17-18
    noseWingSpread, lipInnerRatio,                     // 19-20
  ];
}

/**
 * 전신 포즈 특징 추출 (위치/크기 불변) - 24차원
 *
 * MediaPipe pose landmarks:
 *   0=nose, 11=leftShoulder, 12=rightShoulder,
 *   13=leftElbow, 14=rightElbow, 15=leftWrist, 16=rightWrist,
 *   23=leftHip, 24=rightHip
 */
export function extractPoseFeatures(poseLandmarks: Landmark[]): number[] | null {
  if (!poseLandmarks || poseLandmarks.length < 33) return null;

  const nose          = poseLandmarks[0];
  const leftShoulder  = poseLandmarks[11];
  const rightShoulder = poseLandmarks[12];
  const leftElbow     = poseLandmarks[13];
  const rightElbow    = poseLandmarks[14];
  const leftWrist     = poseLandmarks[15];
  const rightWrist    = poseLandmarks[16];
  const leftHip       = poseLandmarks[23];
  const rightHip      = poseLandmarks[24];

  const shoulderWidth = euclideanDistance(leftShoulder, rightShoulder);
  if (shoulderWidth < 0.001) return null;

  const torsoCenter: Landmark = {
    x: (leftShoulder.x + rightShoulder.x) / 2,
    y: (leftShoulder.y + rightShoulder.y) / 2,
    z: (leftShoulder.z + rightShoulder.z) / 2,
  };

  // Helper: normalize position relative to torso center by shoulder width
  const norm = (p: Landmark) => ({
    x: (p.x - torsoCenter.x) / shoulderWidth,
    y: (p.y - torsoCenter.y) / shoulderWidth,
    z: (p.z - torsoCenter.z) / shoulderWidth,
  });

  const lw = norm(leftWrist);
  const rw = norm(rightWrist);
  const le = norm(leftElbow);
  const re = norm(rightElbow);

  // 1. Left arm angle (shoulder-elbow-wrist)
  const leftArmAngle  = calculateAngle(leftShoulder,  leftElbow,  leftWrist);
  // 2. Right arm angle
  const rightArmAngle = calculateAngle(rightShoulder, rightElbow, rightWrist);

  // 3. Left upper arm direction (vertical reference: shoulder → down)
  const leftUpperArmAngle  = calculateAngle(
    { x: leftShoulder.x, y: leftShoulder.y + 0.1, z: leftShoulder.z },
    leftShoulder, leftElbow
  );
  // 4. Right upper arm direction
  const rightUpperArmAngle = calculateAngle(
    { x: rightShoulder.x, y: rightShoulder.y + 0.1, z: rightShoulder.z },
    rightShoulder, rightElbow
  );

  // 5. 전완 수직각: 팔꿈치에서 손목 방향이 수직과 이루는 각도 (leftArmAngle과 독립적)
  const leftElbowBend  = calculateAngle(
    { x: leftElbow.x,  y: leftElbow.y  + 0.1, z: leftElbow.z  },
    leftElbow,  leftWrist
  );
  // 6.
  const rightElbowBend = calculateAngle(
    { x: rightElbow.x, y: rightElbow.y + 0.1, z: rightElbow.z },
    rightElbow, rightWrist
  );

  // 7-9. Left wrist position (normalized x,y,z)
  // 10-12. Right wrist position
  // 13-14. Left elbow position (x,y)
  // 15-16. Right elbow position (x,y)

  // 17. Wrist distance (normalized)
  const wristDist = euclideanDistance(leftWrist, rightWrist) / shoulderWidth;

  // 18. Left wrist height relative to shoulder (negative = above shoulder)
  const leftWristHeight  = (leftWrist.y  - leftShoulder.y)  / shoulderWidth;
  // 19. Right wrist height
  const rightWristHeight = (rightWrist.y - rightShoulder.y) / shoulderWidth;

  // 20. Shoulder tilt (height difference)
  const shoulderTilt = (rightShoulder.y - leftShoulder.y) / shoulderWidth;

  // 21-22. 손목-코 거리 (어느 쪽 손이 얼굴 근처인지 포착 — 수화 위치 핵심)
  const leftWristToNose  = euclideanDistance(leftWrist,  nose) / shoulderWidth;
  const rightWristToNose = euclideanDistance(rightWrist, nose) / shoulderWidth;

  // 23-24. 손목이 코보다 위에 있는 정도 (음수 = 손목이 코 아래)
  const leftWristAboveNose  = (nose.y - leftWrist.y)  / shoulderWidth;
  const rightWristAboveNose = (nose.y - rightWrist.y) / shoulderWidth;

  return [
    leftArmAngle,           // 0
    rightArmAngle,          // 1
    leftUpperArmAngle,      // 2
    rightUpperArmAngle,     // 3
    leftElbowBend,          // 4
    rightElbowBend,         // 5
    lw.x, lw.y, lw.z,      // 6-8
    rw.x, rw.y, rw.z,      // 9-11
    le.x, le.y,             // 12-13
    re.x, re.y,             // 14-15
    wristDist,              // 16
    leftWristHeight,        // 17
    rightWristHeight,       // 18
    shoulderTilt,           // 19
    leftWristToNose,        // 20
    rightWristToNose,       // 21
    leftWristAboveNose,     // 22
    rightWristAboveNose,    // 23
  ];
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

  const ε = 1e-9;
  if (norm1 < ε && norm2 < ε) return 1.0; // 둘 다 제로 벡터 → 동일 (정지 상태)
  if (norm1 < ε || norm2 < ε) return 0;   // 한쪽만 제로 → 불일치
  return dotProduct / (Math.sqrt(norm1) * Math.sqrt(norm2));
}

/**
 * 손 특징을 평탄화된 배열로 변환 (33차원)
 */
export function flattenHandFeatures(features: HandFeatures): number[] {
  return [
    ...features.fingerExtensions,    // 5
    ...features.fingerAngles,         // 10
    ...features.fingerTipDistances,   // 10
    ...features.handShapeRatios,      // 3
    ...features.fingerBendAngles      // 5
  ]; // 총 33개
}

export interface FrameFeatures {
  left_hand_features: number[] | null;
  right_hand_features: number[] | null;
  face: number[] | null;
  pose_features: number[] | null;
}

// LandmarkFrame을 featureExtraction에서도 쓰기 위한 최소 인터페이스
export interface MinimalLandmarkFrame extends FrameFeatures {
  timestamp: number;
  pose: Array<{ x: number; y: number; z: number; visibility?: number }> | null;
  left_hand: Array<{ x: number; y: number; z: number; visibility?: number }> | null;
  right_hand: Array<{ x: number; y: number; z: number; visibility?: number }> | null;
}

/**
 * 시작/끝 무음(정지) 프레임 제거
 * 손/포즈 특징 변화량이 threshold 미만인 구간을 잘라냄
 */
export function trimSilence<T extends FrameFeatures>(
  frames: T[],
  threshold = 0.0008,
  bufferFrames = 3
): T[] {
  if (frames.length < 10) return frames;

  // 프레임 간 변화량 계산
  const variances: number[] = [0];
  for (let i = 1; i < frames.length; i++) {
    let total = 0, count = 0;
    const prev = frames[i - 1];
    const curr = frames[i];
    const calcVar = (a: number[] | null, b: number[] | null, w = 1) => {
      if (!a || !b) return;
      const v = a.reduce((s, val, j) => s + Math.abs(val - (b[j] ?? 0)), 0) / a.length;
      total += v * w; count += w;
    };
    calcVar(prev.right_hand_features, curr.right_hand_features);
    calcVar(prev.left_hand_features, curr.left_hand_features);
    calcVar(prev.pose_features, curr.pose_features, 0.3);
    variances.push(count > 0 ? total / count : 0);
  }

  let start = 0;
  for (let i = 0; i < variances.length; i++) {
    if (variances[i] > threshold) { start = Math.max(0, i - bufferFrames); break; }
  }

  let end = frames.length - 1;
  for (let i = variances.length - 1; i >= start; i--) {
    if (variances[i] > threshold) { end = Math.min(frames.length - 1, i + bufferFrames); break; }
  }

  const trimmed = frames.slice(start, end + 1);
  return trimmed.length >= 5 ? trimmed : frames;
}

/**
 * 얼굴 특징 벡터 좌우 반전 (20차원)
 * extractFaceFeatures의 출력 순서 기준:
 * [0]=leftEAR, [1]=rightEAR, [2]=MAR, [3]=mouthWidthNorm,
 * [4]=leftBrowH, [5]=rightBrowH, [6]=headTilt, [7]=headYaw, [8]=headPitch,
 * [9]=noseToMouth, [10]=faceHeight, [11]=noseBridgeOffset,
 * [12]=leftEyeCenterX, [13]=rightEyeCenterX,
 * [14]=smile, [15]=browFrown, [16]=leftCheekH, [17]=rightCheekH,
 * [18]=noseWingSpread, [19]=lipInnerRatio
 */
function flipFaceFeatures(f: number[]): number[] {
  if (!f || f.length < 20) return f;
  return [
    f[1],   f[0],   // 0-1: leftEAR ↔ rightEAR
    f[2],   f[3],   // 2-3: MAR, mouthWidthNorm (대칭)
    f[5],   f[4],   // 4-5: leftBrowHeight ↔ rightBrowHeight
    -f[6],          // 6: headTilt 부호 반전
    -f[7],          // 7: headYaw 부호 반전
    f[8],           // 8: headPitch (동일)
    f[9],   f[10],  // 9-10: noseToMouth, faceHeight (동일)
    -f[11],         // 11: noseBridgeOffset 부호 반전
    -f[13], -f[12], // 12-13: leftEyeCenterX ↔ rightEyeCenterX (교환+부호반전)
    f[14],  f[15],  // 14-15: smile, browFrown (대칭)
    f[17],  f[16],  // 16-17: leftCheekHeight ↔ rightCheekHeight
    f[18],  f[19],  // 18-19: noseWingSpread, lipInnerRatio (동일)
  ];
}

/**
 * 포즈 특징 벡터 좌우 반전 (24차원)
 * extractPoseFeatures의 출력 순서 기준
 */
function flipPoseFeatures(f: number[]): number[] {
  if (f.length < 20) return f;
  const base = [
    f[1],  f[0],          // 0-1: leftArmAngle ↔ rightArmAngle
    f[3],  f[2],          // 2-3: leftUpperArmAngle ↔ rightUpperArmAngle
    f[5],  f[4],          // 4-5: leftElbowBend ↔ rightElbowBend
    -f[9], f[10], f[11],  // 6-8: lw ← 반전된 rw (x 부호 반전)
    -f[6], f[7],  f[8],   // 9-11: rw ← 반전된 lw
    -f[14], f[15],        // 12-13: le ← 반전된 re
    -f[12], f[13],        // 14-15: re ← 반전된 le
    f[16],                // 16: wristDist (동일)
    f[18], f[17],         // 17-18: leftWristHeight ↔ rightWristHeight
    -f[19],               // 19: shoulderTilt 반전
  ];
  // 24차원 확장 (20-23)
  if (f.length >= 24) {
    base.push(
      f[21], f[20],       // 20-21: leftWristToNose ↔ rightWristToNose
      f[23], f[22],       // 22-23: leftWristAboveNose ↔ rightWristAboveNose
    );
  }
  return base;
}

/**
 * 랜드마크 프레임 수평 좌우 반전
 * 왼손 ↔ 오른손 교체, x 좌표 미러링
 */
export function flipLandmarkFrame<T extends MinimalLandmarkFrame>(frame: T): T {
  const mirrorLandmarks = (lms: MinimalLandmarkFrame['left_hand']) =>
    lms ? lms.map(lm => ({ ...lm, x: 1 - lm.x })) : null;

  return {
    ...frame,
    left_hand: mirrorLandmarks(frame.right_hand),
    right_hand: mirrorLandmarks(frame.left_hand),
    left_hand_features: frame.right_hand_features,
    right_hand_features: frame.left_hand_features,
    pose: frame.pose ? frame.pose.map(lm => ({ ...lm, x: 1 - lm.x })) : null,
    pose_features: frame.pose_features ? flipPoseFeatures(frame.pose_features) : null,
    face: frame.face ? flipFaceFeatures(frame.face) : null,
  };
}

/**
 * 시퀀스 전체 좌우 반전
 */
export function flipSequence<T extends MinimalLandmarkFrame>(frames: T[]): T[] {
  return frames.map(flipLandmarkFrame);
}

function compareFrameFeatures(f1: FrameFeatures, f2: FrameFeatures): number {
  let total = 0, count = 0;

  // 특징 비교 헬퍼:
  //  - 둘 다 있음 → 코사인 유사도 (0~1, clamp)
  //  - 한쪽만 있음 → 0.3 (약한 패널티) — 감지 노이즈나 일시적 미감지에 관대하게
  //  - 둘 다 없음 → 분모에서 제외 (패널티 없음)
  const add = (a: number[] | null, b: number[] | null, w: number) => {
    if (a && b) {
      // 코사인 유사도를 [0,1]로 clamp (음수 방지 — 특히 pose 정규화 좌표에서 발생)
      total += Math.max(0, calculateFeatureSimilarity(a, b)) * w;
      count += w;
    } else if (a || b) {
      total += 0.3 * w;
      count += w;
    }
  };

  add(f1.left_hand_features,  f2.left_hand_features,  10);
  add(f1.right_hand_features, f2.right_hand_features, 10);
  add(f1.pose_features,       f2.pose_features,        8); // 손 위치(얼굴/가슴 근처) 핵심
  add(f1.face,                f2.face,                  1); // 표정은 참고만

  return count > 0 ? total / count : 1.0;
}

/**
 * 연속 두 프레임의 특징 변화량(velocity) 계산
 * 손 모양의 변화 방향 = 동작 방향 정보
 */
function computeVelocity(curr: FrameFeatures, prev: FrameFeatures): FrameFeatures {
  const diff = (a: number[] | null, b: number[] | null): number[] | null => {
    if (!a || !b || a.length !== b.length) return null;
    return a.map((v, i) => v - b[i]);
  };
  return {
    left_hand_features:  diff(curr.left_hand_features,  prev.left_hand_features),
    right_hand_features: diff(curr.right_hand_features, prev.right_hand_features),
    face:                diff(curr.face,                prev.face),
    pose_features:       diff(curr.pose_features,       prev.pose_features),
  };
}

/**
 * Subsequence Dynamic Time Warping (SDTW)
 *
 * SDTW: 버퍼(긴 스트림) 안에서 시퀀스(짧은 참조)에 가장 잘 맞는 구간을 찾음.
 * - 첫 열 초기화 0 → 버퍼 어느 위치에서든 매칭 시작 가능
 * - velocity는 소폭 보너스(±10%)로만 반영 — 웹캠 노이즈에 robust
 * @returns similarity score 0~1
 */
export function calculateSubsequenceDTW(
  buffer: FrameFeatures[],
  sequence: FrameFeatures[]
): number {
  if (buffer.length < 2 || sequence.length < 2) return 0;

  const n = buffer.length;
  const m = sequence.length;

  // velocity 사전 계산
  const bufVels: (FrameFeatures | null)[] = buffer.map((f, i) =>
    i > 0 ? computeVelocity(f, buffer[i - 1]) : null
  );
  const seqVels: (FrameFeatures | null)[] = sequence.map((f, i) =>
    i > 0 ? computeVelocity(f, sequence[i - 1]) : null
  );

  const dtw = new Float32Array((n + 1) * (m + 1)).fill(Infinity);
  // 각 셀에서 소비된 버퍼 프레임 수 추적 (경로 길이 패널티용)
  const pLen = new Uint16Array((n + 1) * (m + 1)).fill(0);
  const idx = (i: number, j: number) => i * (m + 1) + j;

  // SDTW: 첫 열을 0으로 초기화 (버퍼 임의 위치에서 시작 허용)
  for (let i = 0; i <= n; i++) dtw[idx(i, 0)] = 0;

  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      const shapeSim = compareFrameFeatures(buffer[i - 1], sequence[j - 1]);

      // velocity: 동작 방향이 일치하면 소폭 보너스 (최대 ±10%)
      let sim = shapeSim;
      const bv = bufVels[i - 1];
      const sv = seqVels[j - 1];
      if (bv && sv) {
        const velSim = compareFrameFeatures(bv, sv);
        sim = Math.max(0, Math.min(1, shapeSim + (velSim - 0.5) * 0.2));
      }

      const cost = 1 - sim;
      const dDiag = dtw[idx(i - 1, j - 1)];
      const dBuf  = dtw[idx(i - 1, j)];
      const dSeq  = dtw[idx(i, j - 1)];
      const minPrev = Math.min(dDiag, dBuf, dSeq);
      dtw[idx(i, j)] = cost + minPrev;

      // 경로 길이: 버퍼 프레임 소비 여부에 따라 누적
      if (minPrev === dDiag)     pLen[idx(i, j)] = pLen[idx(i - 1, j - 1)] + 1; // 양쪽 전진
      else if (minPrev === dBuf) pLen[idx(i, j)] = pLen[idx(i - 1, j)]     + 1; // 버퍼만 전진
      else                       pLen[idx(i, j)] = pLen[idx(i, j - 1)];          // 시퀀스만 전진
    }
  }

  let minDist = Infinity;
  let bestPathLen = m;
  for (let i = 1; i <= n; i++) {
    if (dtw[idx(i, m)] < minDist) {
      minDist = dtw[idx(i, m)];
      bestPathLen = pLen[idx(i, m)];
    }
  }

  // 매칭된 버퍼 구간 길이 vs 참조 시퀀스 길이 비율 검사
  // 너무 짧은 버퍼 구간(초압축) 또는 너무 긴 구간(초신장)에 패널티
  const lengthRatio = bestPathLen / m;
  let lengthPenalty = 1.0;
  if (lengthRatio < 0.4 || lengthRatio > 3.0) lengthPenalty = 0.5;
  else if (lengthRatio < 0.6 || lengthRatio > 2.0) lengthPenalty = 0.8;

  const normalizedDist = minDist / m;
  return Math.max(0, 1 - normalizedDist) * lengthPenalty;
}

/**
 * 시퀀스를 목표 프레임 수로 선형 보간 리샘플링
 * 빠른/느린 동작 모두 동일한 길이로 비교하기 위해 사용
 */
export function resampleSequence(frames: FrameFeatures[], targetLength: number): FrameFeatures[] {
  if (frames.length === 0 || targetLength <= 1) return frames;
  if (frames.length === targetLength) return frames;

  const lerp = (a: number[] | null, b: number[] | null, t: number): number[] | null => {
    if (!a || !b || a.length !== b.length) return a ?? b;
    return a.map((v, i) => v * (1 - t) + b[i] * t);
  };

  const result: FrameFeatures[] = [];
  for (let i = 0; i < targetLength; i++) {
    const pos = (i / (targetLength - 1)) * (frames.length - 1);
    const lo = Math.floor(pos);
    const hi = Math.min(lo + 1, frames.length - 1);
    const t = pos - lo;
    const a = frames[lo], b = frames[hi];
    result.push({
      left_hand_features: lerp(a.left_hand_features, b.left_hand_features, t),
      right_hand_features: lerp(a.right_hand_features, b.right_hand_features, t),
      face: lerp(a.face, b.face, t),
      pose_features: lerp(a.pose_features, b.pose_features, t),
    });
  }
  return result;
}

/**
 * 모든 특징이 null인 프레임 제거 (버퍼 전처리)
 */
export function filterNullFrames<T extends FrameFeatures>(frames: T[]): T[] {
  return frames.filter(f =>
    f.left_hand_features !== null ||
    f.right_hand_features !== null ||
    f.pose_features !== null
  );
}
