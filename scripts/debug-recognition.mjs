#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

// 코사인 유사도 계산
function calculateCosineSimilarity(features1, features2) {
  if (!features1 || !features2 || features1.length !== features2.length) {
    return 0;
  }

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

async function debugRecognition() {
  console.log('🔍 인식 디버깅 시작\\n');

  // 운전면허 데이터 가져오기
  const { data: signData } = await supabase
    .from('sign_languages')
    .select('*')
    .eq('name', '운전면허')
    .single();

  if (!signData) {
    console.log('❌ 운전면허 데이터를 찾을 수 없습니다');
    return;
  }

  console.log(`✅ 운전면허 데이터 로드`);
  console.log(`   프레임 수: ${signData.landmarks_sequence.length}`);

  // 첫 번째 프레임 분석
  const frame = signData.landmarks_sequence[10]; // 중간 프레임

  console.log(`\\n📊 프레임 #10 분석:`);
  console.log(`   timestamp: ${frame.timestamp}`);
  console.log(`   left_hand_features: ${frame.left_hand_features ? `array[${frame.left_hand_features.length}]` : 'null'}`);
  console.log(`   right_hand_features: ${frame.right_hand_features ? `array[${frame.right_hand_features.length}]` : 'null'}`);

  // 왼손 특징 분석
  if (frame.left_hand_features) {
    console.log(`\\n   왼손 특징 벡터:`);
    console.log(`     fingerExtensions (0-4): ${JSON.stringify(frame.left_hand_features.slice(0, 5))}`);
    console.log(`     fingerAngles (5-14): ${JSON.stringify(frame.left_hand_features.slice(5, 15))}`);
    console.log(`     fingerTipDistances (15-24): ${JSON.stringify(frame.left_hand_features.slice(15, 25))}`);
    console.log(`     handShapeRatios (25-27): ${JSON.stringify(frame.left_hand_features.slice(25, 28))}`);
    console.log(`     fingerBendAngles (28-32): ${JSON.stringify(frame.left_hand_features.slice(28, 33))}`);

    const sum = frame.left_hand_features.reduce((a, b) => a + b, 0);
    const mean = sum / frame.left_hand_features.length;
    const variance = frame.left_hand_features.reduce((sum, val) => sum + (val - mean) ** 2, 0) / frame.left_hand_features.length;
    const stdDev = Math.sqrt(variance);

    console.log(`\\n   통계:`);
    console.log(`     평균: ${mean.toFixed(4)}`);
    console.log(`     표준편차: ${stdDev.toFixed(4)}`);
    console.log(`     최소값: ${Math.min(...frame.left_hand_features).toFixed(4)}`);
    console.log(`     최대값: ${Math.max(...frame.left_hand_features).toFixed(4)}`);
  }

  // 오른손 특징 분석
  if (frame.right_hand_features) {
    console.log(`\\n   오른손 특징 벡터:`);
    console.log(`     fingerExtensions (0-4): ${JSON.stringify(frame.right_hand_features.slice(0, 5))}`);
    console.log(`     fingerAngles (5-14): ${JSON.stringify(frame.right_hand_features.slice(5, 15))}`);
    console.log(`     fingerTipDistances (15-24): ${JSON.stringify(frame.right_hand_features.slice(15, 25))}`);
    console.log(`     handShapeRatios (25-27): ${JSON.stringify(frame.right_hand_features.slice(25, 28))}`);
    console.log(`     fingerBendAngles (28-32): ${JSON.stringify(frame.right_hand_features.slice(28, 33))}`);

    const sum = frame.right_hand_features.reduce((a, b) => a + b, 0);
    const mean = sum / frame.right_hand_features.length;
    const variance = frame.right_hand_features.reduce((sum, val) => sum + (val - mean) ** 2, 0) / frame.right_hand_features.length;
    const stdDev = Math.sqrt(variance);

    console.log(`\\n   통계:`);
    console.log(`     평균: ${mean.toFixed(4)}`);
    console.log(`     표준편차: ${stdDev.toFixed(4)}`);
    console.log(`     최소값: ${Math.min(...frame.right_hand_features).toFixed(4)}`);
    console.log(`     최대값: ${Math.max(...frame.right_hand_features).toFixed(4)}`);
  }

  // 다른 수화와 비교
  const { data: otherSigns } = await supabase
    .from('sign_languages')
    .select('name, landmarks_sequence')
    .neq('name', '운전면허')
    .limit(3);

  if (otherSigns && otherSigns.length > 0) {
    console.log(`\\n🔬 다른 수화와 유사도 비교 (왼손):`);

    for (const other of otherSigns) {
      if (!other.landmarks_sequence || other.landmarks_sequence.length === 0) continue;

      const otherFrame = other.landmarks_sequence[0];

      if (frame.left_hand_features && otherFrame.left_hand_features) {
        const similarity = calculateCosineSimilarity(frame.left_hand_features, otherFrame.left_hand_features);
        console.log(`   ${other.name}: ${(similarity * 100).toFixed(1)}%`);
      }
    }

    console.log(`\\n🔬 다른 수화와 유사도 비교 (오른손):`);

    for (const other of otherSigns) {
      if (!other.landmarks_sequence || other.landmarks_sequence.length === 0) continue;

      const otherFrame = other.landmarks_sequence[0];

      if (frame.right_hand_features && otherFrame.right_hand_features) {
        const similarity = calculateCosineSimilarity(frame.right_hand_features, otherFrame.right_hand_features);
        console.log(`   ${other.name}: ${(similarity * 100).toFixed(1)}%`);
      }
    }
  }

  // 자기 자신과의 유사도 (다른 프레임)
  console.log(`\\n🔄 같은 수화 내 프레임 간 유사도 (오른손):`);
  const frame0 = signData.landmarks_sequence[0];
  const frame5 = signData.landmarks_sequence[Math.min(5, signData.landmarks_sequence.length - 1)];
  const frame14 = signData.landmarks_sequence[Math.min(14, signData.landmarks_sequence.length - 1)];

  if (frame.right_hand_features && frame0.right_hand_features) {
    const sim1 = calculateCosineSimilarity(frame.right_hand_features, frame0.right_hand_features);
    console.log(`   프레임 10 vs 0: ${(sim1 * 100).toFixed(1)}%`);
  }

  if (frame.right_hand_features && frame5.right_hand_features) {
    const sim2 = calculateCosineSimilarity(frame.right_hand_features, frame5.right_hand_features);
    console.log(`   프레임 10 vs 5: ${(sim2 * 100).toFixed(1)}%`);
  }

  if (frame.right_hand_features && frame14.right_hand_features) {
    const sim3 = calculateCosineSimilarity(frame.right_hand_features, frame14.right_hand_features);
    console.log(`   프레임 10 vs 14: ${(sim3 * 100).toFixed(1)}%`);
  }
}

debugRecognition().catch(console.error);
