#!/usr/bin/env node

/**
 * 비디오 파일을 직접 처리하여 Supabase에 저장하는 스크립트
 *
 * 이 스크립트는:
 * 1. 02 폴더의 비디오 파일을 읽고
 * 2. 17 폴더의 JSON에서 수화 이름을 가져오고
 * 3. FFmpeg로 프레임을 추출하고
 * 4. 브라우저에서 MediaPipe로 랜드마크를 추출하고
 * 5. Supabase에 저장합니다
 *
 * 사용법:
 *   node scripts/process-videos.mjs [시작번호] [끝번호]
 *   node scripts/process-videos.mjs 1501 1505
 */

import puppeteer from 'puppeteer';
import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync, readdirSync, mkdirSync, rmSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
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
const TEMP_DIR = join(rootDir, 'temp_frames');

const delay = ms => new Promise(r => setTimeout(r, ms));

/**
 * FFmpeg로 비디오를 프레임으로 추출
 */
async function extractFrames(videoPath, outputDir, fps = 10) {
  return new Promise((resolve, reject) => {
    // 출력 디렉토리 생성
    if (!existsSync(outputDir)) {
      mkdirSync(outputDir, { recursive: true });
    }

    const ffmpeg = spawn('ffmpeg', [
      '-i', videoPath,
      '-vf', `fps=${fps}`,
      '-q:v', '2',
      '-f', 'image2',
      join(outputDir, 'frame_%04d.jpg')
    ], { stdio: ['ignore', 'pipe', 'pipe'] });

    let stderr = '';

    ffmpeg.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    ffmpeg.on('close', (code) => {
      if (code === 0) {
        try {
          const frames = readdirSync(outputDir)
            .filter(f => f.startsWith('frame_') && f.endsWith('.jpg'))
            .sort();
          resolve(frames.map(f => join(outputDir, f)));
        } catch (err) {
          reject(err);
        }
      } else {
        reject(new Error(`FFmpeg failed with code ${code}: ${stderr}`));
      }
    });

    ffmpeg.on('error', (err) => {
      reject(err);
    });
  });
}

/**
 * 브라우저에서 MediaPipe로 프레임 처리
 */
async function processFramesWithMediaPipe(framePaths, browser) {
  const page = await browser.newPage();

  try {
    // MediaPipe 초기화를 위한 HTML 페이지 생성
    const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <script src="https://cdn.jsdelivr.net/npm/@mediapipe/holistic/holistic.js" crossorigin="anonymous"></script>
  <script src="https://cdn.jsdelivr.net/npm/@mediapipe/camera_utils/camera_utils.js" crossorigin="anonymous"></script>
  <script src="https://cdn.jsdelivr.net/npm/@mediapipe/drawing_utils/drawing_utils.js" crossorigin="anonymous"></script>
</head>
<body>
  <canvas id="canvas" width="640" height="480"></canvas>
</body>
</html>
`;

    await page.setContent(htmlContent);
    await delay(1000);

    // MediaPipe 초기화
    await page.evaluate(() => {
      return new Promise((resolve) => {
        window.holistic = new window.Holistic({
          locateFile: (file) => {
            return \`https://cdn.jsdelivr.net/npm/@mediapipe/holistic/\${file}\`;
          }
        });

        window.holistic.setOptions({
          modelComplexity: 1,
          smoothLandmarks: true,
          enableSegmentation: false,
          smoothSegmentation: false,
          refineFaceLandmarks: true,
          minDetectionConfidence: 0.5,
          minTrackingConfidence: 0.5
        });

        window.resultsArray = [];
        window.holistic.onResults((results) => {
          window.resultsArray.push(results);
        });

        window.holisticReady = true;
        resolve();
      });
    });

    console.log('  🤖 MediaPipe 초기화 완료');

    // 특징 추출 함수를 브라우저에 주입
    await page.evaluate(() => {
      window.euclideanDistance = function(p1, p2) {
        const dx = p1.x - p2.x;
        const dy = p1.y - p2.y;
        const dz = p1.z - p2.z;
        return Math.sqrt(dx * dx + dy * dy + dz * dz);
      };

      window.calculateAngle = function(p1, p2, p3) {
        const v1 = { x: p1.x - p2.x, y: p1.y - p2.y, z: p1.z - p2.z };
        const v2 = { x: p3.x - p2.x, y: p3.y - p2.y, z: p3.z - p2.z };
        const dot = v1.x * v2.x + v1.y * v2.y + v1.z * v2.z;
        const len1 = Math.sqrt(v1.x * v1.x + v1.y * v1.y + v1.z * v1.z);
        const len2 = Math.sqrt(v2.x * v2.x + v2.y * v2.y + v2.z * v2.z);
        if (len1 === 0 || len2 === 0) return 0;
        return Math.acos(Math.max(-1, Math.min(1, dot / (len1 * len2))));
      };

      window.extractHandFeatures = function(handLandmarks) {
        if (!handLandmarks || handLandmarks.length < 21) return null;

        const palmCenter = {
          x: (handLandmarks[0].x + handLandmarks[5].x + handLandmarks[17].x) / 3,
          y: (handLandmarks[0].y + handLandmarks[5].y + handLandmarks[17].y) / 3,
          z: (handLandmarks[0].z + handLandmarks[5].z + handLandmarks[17].z) / 3
        };

        const handScale = window.euclideanDistance(handLandmarks[0], handLandmarks[12]);
        if (handScale === 0) return null;

        const calcFingerExt = (tipIdx, mcpIdx) => {
          const tipDist = window.euclideanDistance(handLandmarks[tipIdx], palmCenter);
          const baseDist = window.euclideanDistance(handLandmarks[mcpIdx], palmCenter);
          const ext = (tipDist / handScale) / Math.max(baseDist / handScale, 0.01);
          return Math.max(0, Math.min(1, (ext - 0.8) / 0.6));
        };

        const fingerExtensions = [
          calcFingerExt(4, 1), calcFingerExt(8, 5), calcFingerExt(12, 9),
          calcFingerExt(16, 13), calcFingerExt(20, 17)
        ];

        const fingerAngles = [];
        [[1,2,3,4], [5,6,7,8], [9,10,11,12], [13,14,15,16], [17,18,19,20]].forEach(bones => {
          for (let i = 0; i < bones.length - 2; i++) {
            fingerAngles.push(window.calculateAngle(
              handLandmarks[bones[i]],
              handLandmarks[bones[i+1]],
              handLandmarks[bones[i+2]]
            ));
          }
        });

        const fingerTips = [4, 8, 12, 16, 20];
        const fingerTipDistances = [];
        for (let i = 0; i < fingerTips.length; i++) {
          for (let j = i + 1; j < fingerTips.length; j++) {
            fingerTipDistances.push(
              window.euclideanDistance(handLandmarks[fingerTips[i]], handLandmarks[fingerTips[j]]) / handScale
            );
          }
        }

        const handShapeRatios = [
          window.euclideanDistance(handLandmarks[5], handLandmarks[17]) / handScale,
          window.euclideanDistance(handLandmarks[0], handLandmarks[12]) / handScale,
          window.euclideanDistance(handLandmarks[4], handLandmarks[8]) / handScale
        ];

        const fingerBendAngles = [
          window.calculateAngle(handLandmarks[2], handLandmarks[3], handLandmarks[4]),
          window.calculateAngle(handLandmarks[5], handLandmarks[7], handLandmarks[8]),
          window.calculateAngle(handLandmarks[9], handLandmarks[11], handLandmarks[12]),
          window.calculateAngle(handLandmarks[13], handLandmarks[15], handLandmarks[16]),
          window.calculateAngle(handLandmarks[17], handLandmarks[19], handLandmarks[20])
        ];

        return [
          ...fingerExtensions, ...fingerAngles, ...fingerTipDistances,
          ...handShapeRatios, ...fingerBendAngles
        ];
      };

      window.extractPoseFeatures = function(poseLandmarks) {
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

    // 각 프레임 처리
    const landmarksSequence = [];

    for (let i = 0; i < framePaths.length; i++) {
      const framePath = framePaths[i];
      const timestamp = (i / 10) * 1000; // 10fps 기준

      // 이미지를 base64로 읽기
      const imageData = readFileSync(framePath).toString('base64');

      // 브라우저에서 이미지 처리
      const landmarks = await page.evaluate(async (imgData, ts) => {
        const img = new Image();
        await new Promise((resolve, reject) => {
          img.onload = resolve;
          img.onerror = reject;
          img.src = 'data:image/jpeg;base64,' + imgData;
        });

        const canvas = document.getElementById('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);

        // MediaPipe 처리
        window.resultsArray = [];
        await window.holistic.send({ image: canvas });

        // 결과 대기
        await new Promise(r => setTimeout(r, 50));

        const results = window.resultsArray[window.resultsArray.length - 1];
        if (!results) return null;

        const leftHandFeatures = results.leftHandLandmarks
          ? window.extractHandFeatures(results.leftHandLandmarks)
          : null;
        const rightHandFeatures = results.rightHandLandmarks
          ? window.extractHandFeatures(results.rightHandLandmarks)
          : null;
        const poseFeatures = results.poseLandmarks
          ? window.extractPoseFeatures(results.poseLandmarks)
          : null;

        return {
          timestamp: ts,
          pose: results.poseLandmarks || null,
          left_hand: results.leftHandLandmarks || null,
          right_hand: results.rightHandLandmarks || null,
          face: results.faceLandmarks || null,
          left_hand_features: leftHandFeatures,
          right_hand_features: rightHandFeatures,
          pose_features: poseFeatures
        };
      }, imageData, timestamp);

      if (landmarks) {
        landmarksSequence.push(landmarks);
      }

      // 진행상황 표시
      if ((i + 1) % 10 === 0 || i === framePaths.length - 1) {
        process.stdout.write(`\r  진행: ${i + 1}/${framePaths.length} 프레임`);
      }
    }
    console.log('');

    return landmarksSequence;

  } finally {
    await page.close();
  }
}

/**
 * 비디오 처리
 */
async function processVideo(videoNumber, browser) {
  const videoPath = join(VIDEO_DIR, `${videoNumber}.mp4`);
  const jsonPath = join(JSON_DIR, `${videoNumber}.json`);

  // 파일 존재 확인
  if (!existsSync(videoPath)) {
    console.log(`⏭️  ${videoNumber}: 비디오 파일 없음`);
    return null;
  }

  if (!existsSync(jsonPath)) {
    console.log(`⏭️  ${videoNumber}: JSON 파일 없음`);
    return null;
  }

  // JSON 파일 읽기
  const jsonData = JSON.parse(readFileSync(jsonPath, 'utf-8'));
  const signName = jsonData.data[0]?.attributes[0]?.name;
  const duration = jsonData.metaData?.duration || 0;

  if (!signName) {
    console.log(`⏭️  ${videoNumber}: 수화 이름 없음`);
    return null;
  }

  console.log(`\n🎬 처리 중: ${videoNumber} - ${signName}`);

  // 임시 프레임 디렉토리
  const frameDir = join(TEMP_DIR, `${videoNumber}`);
  if (existsSync(frameDir)) {
    rmSync(frameDir, { recursive: true, force: true });
  }
  mkdirSync(frameDir, { recursive: true });

  try {
    // 프레임 추출
    console.log(`  📹 프레임 추출 중...`);
    const framePaths = await extractFrames(videoPath, frameDir, 10);
    console.log(`  ✅ ${framePaths.length}개 프레임 추출됨`);

    // 랜드마크 추출
    console.log(`  🤖 랜드마크 추출 중...`);
    const landmarksSequence = await processFramesWithMediaPipe(framePaths, browser);

    // 손이 감지된 프레임 확인
    const framesWithHands = landmarksSequence.filter(
      f => f.left_hand_features || f.right_hand_features
    ).length;

    console.log(`  👋 손 감지: ${framesWithHands}/${landmarksSequence.length} 프레임`);

    if (framesWithHands < 5) {
      console.log(`  ⚠️  손 감지 부족, 건너뜀`);
      return null;
    }

    // Supabase에 저장
    console.log(`  💾 Supabase에 저장 중...`);
    const { data, error } = await supabase
      .from('sign_language')
      .insert({
        name: signName,
        landmarks_sequence: landmarksSequence,
        duration: duration
      })
      .select();

    if (error) {
      console.error(`  ❌ 저장 실패:`, error.message);
      return null;
    }

    console.log(`  ✅ 저장 완료: ${signName}`);
    return data[0];

  } catch (error) {
    console.error(`  ❌ 오류:`, error.message);
    return null;
  } finally {
    // 임시 파일 정리
    if (existsSync(frameDir)) {
      rmSync(frameDir, { recursive: true, force: true });
    }
  }
}

/**
 * 메인 함수
 */
async function main() {
  const args = process.argv.slice(2);
  let startNum = 1501;
  let endNum = 1510;

  if (args.length >= 2) {
    startNum = parseInt(args[0]);
    endNum = parseInt(args[1]);
  } else if (args.length === 1) {
    startNum = parseInt(args[0]);
    endNum = startNum;
  }

  console.log('🚀 배치 학습 시작');
  console.log(`📂 비디오 범위: ${startNum} ~ ${endNum}`);
  console.log(`📍 Supabase URL: ${supabaseUrl}`);

  // Temp 디렉토리 생성
  if (!existsSync(TEMP_DIR)) {
    mkdirSync(TEMP_DIR, { recursive: true });
  }

  // Puppeteer 브라우저 실행
  console.log('\n🌐 브라우저 실행 중...');
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  console.log('✅ 브라우저 준비 완료\n');

  // 진행 상황
  let processed = 0;
  let success = 0;
  let failed = 0;
  const failedList = [];

  // 처리
  for (let num = startNum; num <= endNum; num++) {
    const numStr = num.toString().padStart(4, '0');
    const result = await processVideo(numStr, browser);

    processed++;
    if (result) {
      success++;
    } else {
      failed++;
      failedList.push(numStr);
    }

    // 진행상황 요약
    console.log(`\n📊 진행: ${processed}/${endNum - startNum + 1} | ✅ 성공: ${success} | ❌ 실패: ${failed}`);

    await delay(500);
  }

  // 브라우저 종료
  await browser.close();

  // 최종 정리
  console.log('\n\n🎉 배치 학습 완료!');
  console.log(`총 처리: ${processed}`);
  console.log(`성공: ${success}`);
  console.log(`실패: ${failed}`);

  if (failedList.length > 0) {
    console.log(`\n실패 목록: ${failedList.join(', ')}`);
  }

  // Temp 디렉토리 정리
  if (existsSync(TEMP_DIR)) {
    rmSync(TEMP_DIR, { recursive: true, force: true });
  }

  process.exit(0);
}

main().catch((error) => {
  console.error('❌치명적 오류:', error);
  process.exit(1);
});
