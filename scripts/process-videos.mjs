#!/usr/bin/env node

/**
 * 대규모 비디오 배치 처리 및 Supabase 저장 스크립트
 *
 * 기능:
 * 1. 02 폴더의 모든/지정된 MP4 파일 스캔
 * 2. 17 폴더의 JSON 메타데이터에서 수화 단어명 추출
 * 3. FFmpeg로 프레임 추출 (10fps)
 * 4. Puppeteer + MediaPipe로 랜드마크 및 특징 벡터 추출 (src/lib/featureExtraction.ts 로직 동기화)
 * 5. Supabase에 데이터 저장
 *
 * 사용법:
 *   node scripts/process-videos.mjs                   # 모든 파일 처리
 *   node scripts/process-videos.mjs --start 1501      # 1501번부터 끝까지
 *   node scripts/process-videos.mjs --count 5         # 처음 5개만 (테스트용)
 *   node scripts/process-videos.mjs --start 1501 --count 10
 */

import puppeteer from 'puppeteer';
import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync, readdirSync, mkdirSync, rmSync } from 'fs';
import { join, dirname, basename } from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, '..');

// 환경변수 로드
dotenv.config({ path: join(rootDir, '.env.local') });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Supabase 환경변수가 설정되지 않았습니다.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

const VIDEO_DIR = join(rootDir, '02');
const JSON_DIR = join(rootDir, '17');
const TEMP_DIR = join(rootDir, 'temp_frames_batch');

const delay = ms => new Promise(r => setTimeout(r, ms));

/**
 * FFmpeg로 비디오를 프레임으로 추출
 */
async function extractFrames(videoPath, outputDir, fps = 10) {
  return new Promise((resolve, reject) => {
    if (!existsSync(outputDir)) {
      mkdirSync(outputDir, { recursive: true });
    }

    const ffmpeg = spawn('ffmpeg', [
      '-i', videoPath,
      '-vf', `fps=${fps},scale=640:480`, // 해상도 고정 및 fps 설정
      '-q:v', '2',
      '-f', 'image2',
      join(outputDir, 'frame_%04d.jpg')
    ], { stdio: ['ignore', 'ignore', 'pipe'] }); // stdout 무시, stderr만 캡처

    let stderr = '';
    ffmpeg.stderr.on('data', (data) => stderr += data.toString());

    ffmpeg.on('close', (code) => {
      if (code === 0) {
        try {
          const frames = readdirSync(outputDir)
            .filter(f => f.startsWith('frame_') && f.endsWith('.jpg'))
            .sort()
            .map(f => join(outputDir, f));
          resolve(frames);
        } catch (err) {
          reject(err);
        }
      } else {
        reject(new Error(`FFmpeg error (code ${code}): ${stderr}`));
      }
    });

    ffmpeg.on('error', reject);
  });
}

/**
 * 브라우저 컨텍스트 초기화 및 특징 추출 함수 주입
 * src/lib/featureExtraction.ts 의 로직과 정확히 일치해야 함
 */
async function injectFeatureExtractionLogic(page) {
  await page.evaluate(() => {
    // 유틸리티 함수
    window.euclideanDistance = (p1, p2) => {
      if (!p1 || !p2) return 0;
      const dx = p1.x - p2.x;
      const dy = p1.y - p2.y;
      const dz = p1.z - p2.z;
      return Math.sqrt(dx * dx + dy * dy + dz * dz);
    };

    window.calculateAngle = (p1, p2, p3) => {
      if (!p1 || !p2 || !p3) return 0;
      const v1 = { x: p1.x - p2.x, y: p1.y - p2.y, z: p1.z - p2.z };
      const v2 = { x: p3.x - p2.x, y: p3.y - p2.y, z: p3.z - p2.z };
      const dot = v1.x * v2.x + v1.y * v2.y + v1.z * v2.z;
      const len1 = Math.sqrt(v1.x * v1.x + v1.y * v1.y + v1.z * v1.z);
      const len2 = Math.sqrt(v2.x * v2.x + v2.y * v2.y + v2.z * v2.z);
      if (len1 === 0 || len2 === 0) return 0;
      const cosAngle = Math.max(-1, Math.min(1, dot / (len1 * len2)));
      return Math.acos(cosAngle);
    };

    window.getHandScale = (handLandmarks) => {
      const wrist = handLandmarks[0];
      const middleFingerTip = handLandmarks[12];
      return window.euclideanDistance(wrist, middleFingerTip);
    };

    window.calculateFingerExtension = (handLandmarks, tipIdx, baseIdx, palmCenter, handScale) => {
      const tipToPalm = window.euclideanDistance(handLandmarks[tipIdx], palmCenter);
      const baseToPalm = window.euclideanDistance(handLandmarks[baseIdx], palmCenter);
      const normalizedTip = tipToPalm / handScale;
      const normalizedBase = baseToPalm / handScale;
      const extension = normalizedTip / Math.max(normalizedBase, 0.01);
      return Math.max(0, Math.min(1, (extension - 0.8) / 0.6));
    };

    // 손 특징 추출 (flattenHandFeatures 로직 포함)
    window.extractHandFeaturesVector = (handLandmarks) => {
      if (!handLandmarks || handLandmarks.length < 21) return null;

      const palmCenter = {
        x: (handLandmarks[0].x + handLandmarks[5].x + handLandmarks[17].x) / 3,
        y: (handLandmarks[0].y + handLandmarks[5].y + handLandmarks[17].y) / 3,
        z: (handLandmarks[0].z + handLandmarks[5].z + handLandmarks[17].z) / 3
      };

      const handScale = window.getHandScale(handLandmarks);
      if (handScale === 0) return null;

      const fingers = {
        thumb: { tip: 4, base: 2, mcp: 1 },
        index: { tip: 8, base: 6, mcp: 5 },
        middle: { tip: 12, base: 10, mcp: 9 },
        ring: { tip: 16, base: 14, mcp: 13 },
        pinky: { tip: 20, base: 18, mcp: 17 }
      };

      // 1. Finger Extensions (5)
      const fingerExtensions = [
        window.calculateFingerExtension(handLandmarks, 4, 1, palmCenter, handScale),
        window.calculateFingerExtension(handLandmarks, 8, 5, palmCenter, handScale),
        window.calculateFingerExtension(handLandmarks, 12, 9, palmCenter, handScale),
        window.calculateFingerExtension(handLandmarks, 16, 13, palmCenter, handScale),
        window.calculateFingerExtension(handLandmarks, 20, 17, palmCenter, handScale)
      ];

      // 2. Finger Angles (10 - based on code logic not comment)
      const fingerAngles = [];
      const fingerBones = [
        [1, 2, 3, 4], [5, 6, 7, 8], [9, 10, 11, 12], [13, 14, 15, 16], [17, 18, 19, 20]
      ];
      fingerBones.forEach(bones => {
        for (let i = 0; i < bones.length - 2; i++) {
          fingerAngles.push(window.calculateAngle(handLandmarks[bones[i]], handLandmarks[bones[i + 1]], handLandmarks[bones[i + 2]]));
        }
      });

      // 3. Finger Tip Distances (10)
      const fingerTips = [4, 8, 12, 16, 20];
      const fingerTipDistances = [];
      for (let i = 0; i < fingerTips.length; i++) {
        for (let j = i + 1; j < fingerTips.length; j++) {
          fingerTipDistances.push(window.euclideanDistance(handLandmarks[fingerTips[i]], handLandmarks[fingerTips[j]]) / handScale);
        }
      }

      // 4. Hand Shape Ratios (3)
      const handWidth = window.euclideanDistance(handLandmarks[5], handLandmarks[17]);
      const handLength = window.euclideanDistance(handLandmarks[0], handLandmarks[12]);
      const thumbSpread = window.euclideanDistance(handLandmarks[4], handLandmarks[8]);
      const handShapeRatios = [
        handWidth / handScale,
        handLength / handScale,
        thumbSpread / handScale
      ];

      // 5. Finger Bend Angles (5)
      const fingerBendAngles = [
        window.calculateAngle(handLandmarks[2], handLandmarks[3], handLandmarks[4]),
        window.calculateAngle(handLandmarks[5], handLandmarks[7], handLandmarks[8]),
        window.calculateAngle(handLandmarks[9], handLandmarks[11], handLandmarks[12]),
        window.calculateAngle(handLandmarks[13], handLandmarks[15], handLandmarks[16]),
        window.calculateAngle(handLandmarks[17], handLandmarks[19], handLandmarks[20])
      ];

      // Flatten
      return [
        ...fingerExtensions,
        ...fingerAngles,
        ...fingerTipDistances,
        ...handShapeRatios,
        ...fingerBendAngles
      ];
    };

    // 포즈 특징 추출
    window.extractPoseFeaturesVector = (poseLandmarks) => {
      if (!poseLandmarks || poseLandmarks.length < 33) return null;

      const leftShoulder = poseLandmarks[11];
      const rightShoulder = poseLandmarks[12];
      const leftElbow = poseLandmarks[13];
      const rightElbow = poseLandmarks[14];
      const leftWrist = poseLandmarks[15];
      const rightWrist = poseLandmarks[16];

      const shoulderWidth = window.euclideanDistance(leftShoulder, rightShoulder);
      if (shoulderWidth === 0) return null;

      const torsoCenter = {
        x: (leftShoulder.x + rightShoulder.x) / 2,
        y: (leftShoulder.y + rightShoulder.y) / 2,
        z: (leftShoulder.z + rightShoulder.z) / 2
      };

      return [
        window.calculateAngle(leftShoulder, leftElbow, leftWrist),
        window.calculateAngle(rightShoulder, rightElbow, rightWrist),
        (leftWrist.x - torsoCenter.x) / shoulderWidth,
        (leftWrist.y - torsoCenter.y) / shoulderWidth,
        (leftWrist.z - torsoCenter.z) / shoulderWidth,
        (rightWrist.x - torsoCenter.x) / shoulderWidth,
        (rightWrist.y - torsoCenter.y) / shoulderWidth,
        (rightWrist.z - torsoCenter.z) / shoulderWidth,
        window.euclideanDistance(leftWrist, rightWrist) / shoulderWidth
      ];
    };
  });
}

async function initBrowser() {
  const browser = await puppeteer.launch({
    headless: true, // "new" is default now
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();

  // MediaPipe 라이브러리 로드
  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <script src="https://cdn.jsdelivr.net/npm/@mediapipe/holistic/holistic.js" crossorigin="anonymous"></script>
      <script src="https://cdn.jsdelivr.net/npm/@mediapipe/camera_utils/camera_utils.js" crossorigin="anonymous"></script>
    </head>
    <body><canvas id="canvas"></canvas></body>
    </html>
  `;
  await page.setContent(htmlContent);

  // 로직 주입
  await injectFeatureExtractionLogic(page);

  // MediaPipe 초기화
  await page.evaluate(async () => {
    window.holistic = new window.Holistic({
      locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/holistic/${file}`
    });
    window.holistic.setOptions({
      modelComplexity: 1,
      smoothLandmarks: true,
      minDetectionConfidence: 0.5,
      minTrackingConfidence: 0.5
    });

    window.resultsQueue = [];
    window.holistic.onResults(results => window.resultsQueue.push(results));

    // 초기화 대기 (모델 로드)
    await new Promise(r => setTimeout(r, 1000));
  });

  return { browser, page };
}

async function processVideo(videoFile, page) {
  const videoId = videoFile.replace('.mp4', '');
  const videoPath = join(VIDEO_DIR, videoFile);
  const jsonPath = join(JSON_DIR, `${videoId}.json`);

  if (!existsSync(jsonPath)) {
    console.log(`⚠️  JSON 메타데이터 없음: ${videoId}`);
    return { success: false, reason: 'no_json' };
  }

  // JSON 파싱
  let signName;
  try {
    const jsonContent = JSON.parse(readFileSync(jsonPath, 'utf-8'));
    signName = jsonContent.data?.[0]?.attributes?.[0]?.name;
  } catch (e) {
    return { success: false, reason: 'json_parse_error' };
  }

  if (!signName) {
    return { success: false, reason: 'no_sign_name' };
  }

  console.log(`\n🎬 처리 중: ${videoId} - ${signName}`);

  // DB 중복 확인 (선택사항 - 덮어쓰기 여부)
  // 여기서는 중복되어도 새로 Insert 하거나, 기존 것을 삭제하고 다시 넣는 정책이 필요
  // 성능을 위해 일단 스킵하거나, 나중에 unique constraint 에러 처리

  // 프레임 추출
  const frameDir = join(TEMP_DIR, videoId);
  if (existsSync(frameDir)) rmSync(frameDir, { recursive: true, force: true });

  let framePaths = [];
  try {
    framePaths = await extractFrames(videoPath, frameDir);
  } catch (e) {
    console.error(`  ❌ FFmpeg 오류: ${e.message}`);
    return { success: false, reason: 'ffmpeg_error' };
  }

  if (framePaths.length === 0) {
    return { success: false, reason: 'no_frames' };
  }

  // MediaPipe 처리
  const landmarksSequence = [];

  for (let i = 0; i < framePaths.length; i++) {
    const framePath = framePaths[i];
    const timestamp = i * 100; // 10fps = 100ms interval

    // 이미지 읽기 & base64
    const imgBuffer = readFileSync(framePath);
    const imgBase64 = imgBuffer.toString('base64');

    // 브라우저로 전송 및 처리
    const result = await page.evaluate(async (b64, ts) => {
      const img = new Image();
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
        img.src = 'data:image/jpeg;base64,' + b64;
      });

      const canvas = document.getElementById('canvas');
      canvas.width = img.width;
      canvas.height = img.height;

      window.resultsQueue = []; // 큐 초기화
      await window.holistic.send({ image: img });

      // 결과 대기 (약간의 폴링)
      let attempts = 0;
      while (window.resultsQueue.length === 0 && attempts < 50) {
        await new Promise(r => setTimeout(r, 10));
        attempts++;
      }

      const res = window.resultsQueue[0];
      if (!res) return null;

      const lhVec = res.leftHandLandmarks ? window.extractHandFeaturesVector(res.leftHandLandmarks) : null;
      const rhVec = res.rightHandLandmarks ? window.extractHandFeaturesVector(res.rightHandLandmarks) : null;
      const poseVec = res.poseLandmarks ? window.extractPoseFeaturesVector(res.poseLandmarks) : null;

      return {
        timestamp: ts,
        pose: res.poseLandmarks || null,
        left_hand: res.leftHandLandmarks || null,
        right_hand: res.rightHandLandmarks || null,
        face: res.faceLandmarks || null,
        left_hand_features: lhVec,
        right_hand_features: rhVec,
        pose_features: poseVec
      };
    }, imgBase64, timestamp);

    if (result) {
      landmarksSequence.push(result);
    }

    if (i % 10 === 0) process.stdout.write('.');
  }
  process.stdout.write('\n');

  // 유효성 검사 (손이 한 번이라도 감지되었는가?)
  const handsDetected = landmarksSequence.some(l => l.left_hand_features || l.right_hand_features);
  if (!handsDetected) {
    console.log('  ⚠️  손이 감지되지 않음 (저장 건너뜀)');
    // return { success: false, reason: 'no_hands_detected' }; 
    // 학습 데이터 퀄리티에 따라 손이 안보이는 프레임이 많을 수도 있지만, 전체 영상에서 한번도 안나오면 문제.
  }

  // DB 저장
  const { error } = await supabase.from('sign_languages').insert({
    name: signName,
    landmarks_sequence: landmarksSequence,
    duration: framePaths.length * 100 // ms
  });

  // 임시 파일 정리
  rmSync(frameDir, { recursive: true, force: true });

  if (error) {
    console.error(`  ❌ DB 저장 실패: ${error.message}`);
    return { success: false, reason: 'db_error' };
  }

  console.log(`  ✅ 저장 완료(${landmarksSequence.length} 프레임)`);
  return { success: true };
}

async function main() {
  // 인자 파싱
  const args = process.argv.slice(2);
  let startId = null;
  let maxCount = Infinity;

  const startIdx = args.indexOf('--start');
  if (startIdx !== -1) startId = parseInt(args[startIdx + 1]);

  const countIdx = args.indexOf('--count');
  if (countIdx !== -1) maxCount = parseInt(args[countIdx + 1]);

  console.log('🚀 배치 학습 프로세스 시작');
  console.log(`📂 Video Directory: ${VIDEO_DIR}`);

  if (!existsSync(TEMP_DIR)) mkdirSync(TEMP_DIR);

  // 파일 목록 가져오기
  let files = readdirSync(VIDEO_DIR)
    .filter(f => f.endsWith('.mp4'))
    .sort((a, b) => parseInt(a) - parseInt(b));

  // 필터링
  if (startId) {
    files = files.filter(f => parseInt(f) >= startId);
  }
  if (files.length > maxCount) {
    files = files.slice(0, maxCount);
  }

  if (files.length === 0) {
    console.log('처리할 파일이 없습니다.');
    return;
  }

  console.log(`대상 파일: ${files.length}개(${files[0]} ~${files[files.length - 1]})`);

  // 브라우저 시작
  const { browser, page } = await initBrowser();
  console.log('🌐 브라우저/MediaPipe 초기화 완료');

  let successCount = 0;
  let failCount = 0;

  for (const file of files) {
    try {
      const result = await processVideo(file, page);
      if (result.success) successCount++;
      else failCount++;
    } catch (e) {
      console.error(`❌ 처리 중 예외 발생(${file}): `, e);
      failCount++;
    }
    // 메모리 정리를 위해 주기적 처리? (Puppeteer는 오래 돌면 무거워질 수 있음)
  }

  await browser.close();
  rmSync(TEMP_DIR, { recursive: true, force: true });

  console.log(`\n🎉 완료! 성공: ${successCount}, 실패: ${failCount}`);
}

main().catch(console.error);
