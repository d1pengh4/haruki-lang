#!/usr/bin/env node

/**
 * Supabase에 저장된 수화 데이터 구조 확인 스크립트
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, '..');

dotenv.config({ path: join(rootDir, '.env.local') });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Supabase 환경변수가 설정되지 않았습니다.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  console.log('🔍 Supabase 수화 데이터 검사\n');

  // 최근 저장된 수화 데이터 가져오기
  const { data: signs, error } = await supabase
    .from('sign_languages')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(5);

  if (error) {
    console.error('❌ 데이터 조회 실패:', error.message);
    process.exit(1);
  }

  if (!signs || signs.length === 0) {
    console.log('📭 저장된 수화 데이터가 없습니다.');
    process.exit(0);
  }

  console.log(`📊 최근 ${signs.length}개 수화 데이터:\n`);

  signs.forEach((sign, index) => {
    console.log(`[${index + 1}] ${sign.name}`);
    console.log(`    ID: ${sign.id}`);
    console.log(`    생성일: ${new Date(sign.created_at).toLocaleString('ko-KR')}`);
    console.log(`    프레임 수: ${sign.landmarks_sequence?.length || 0}`);
    console.log(`    지속 시간: ${sign.duration || 0}초`);

    if (sign.landmarks_sequence && sign.landmarks_sequence.length > 0) {
      const firstFrame = sign.landmarks_sequence[0];
      const lastFrame = sign.landmarks_sequence[sign.landmarks_sequence.length - 1];

      console.log(`    첫 프레임:`);
      console.log(`      - timestamp: ${firstFrame.timestamp}`);
      console.log(`      - pose: ${firstFrame.pose ? `${firstFrame.pose.length}개` : '없음'}`);
      console.log(`      - left_hand: ${firstFrame.left_hand ? `${firstFrame.left_hand.length}개` : '없음'}`);
      console.log(`      - right_hand: ${firstFrame.right_hand ? `${firstFrame.right_hand.length}개` : '없음'}`);
      console.log(`      - face: ${firstFrame.face ? `${firstFrame.face.length}개` : '없음'}`);
      console.log(`      - left_hand_features: ${firstFrame.left_hand_features ? `${firstFrame.left_hand_features.length}개` : '없음'}`);
      console.log(`      - right_hand_features: ${firstFrame.right_hand_features ? `${firstFrame.right_hand_features.length}개` : '없음'}`);
      console.log(`      - pose_features: ${firstFrame.pose_features ? `${firstFrame.pose_features.length}개` : '없음'}`);

      // 특징 벡터가 있는 프레임 개수 확인
      const framesWithHandFeatures = sign.landmarks_sequence.filter(
        f => f.left_hand_features || f.right_hand_features
      ).length;

      console.log(`    손 특징 벡터가 있는 프레임: ${framesWithHandFeatures}/${sign.landmarks_sequence.length}`);

      // 손 감지율
      const detectionRate = (framesWithHandFeatures / sign.landmarks_sequence.length * 100).toFixed(1);
      console.log(`    손 감지율: ${detectionRate}%`);

      if (detectionRate < 50) {
        console.log(`    ⚠️  경고: 손 감지율이 낮습니다! 인식이 잘 안될 수 있습니다.`);
      }
    }

    console.log('');
  });

  // 전체 통계
  const { data: allSigns } = await supabase
    .from('sign_languages')
    .select('name, landmarks_sequence');

  if (allSigns) {
    console.log(`\n📈 전체 통계 (총 ${allSigns.length}개 수화):\n`);

    let totalFrames = 0;
    let totalWithFeatures = 0;
    let lowDetectionSigns = [];

    allSigns.forEach(sign => {
      const frames = sign.landmarks_sequence?.length || 0;
      const withFeatures = sign.landmarks_sequence?.filter(
        f => f.left_hand_features || f.right_hand_features
      ).length || 0;

      totalFrames += frames;
      totalWithFeatures += withFeatures;

      const rate = frames > 0 ? (withFeatures / frames * 100) : 0;
      if (rate < 50) {
        lowDetectionSigns.push({ name: sign.name, rate: rate.toFixed(1) });
      }
    });

    const avgDetectionRate = totalFrames > 0 ? (totalWithFeatures / totalFrames * 100).toFixed(1) : 0;

    console.log(`    평균 손 감지율: ${avgDetectionRate}%`);
    console.log(`    총 프레임 수: ${totalFrames}`);
    console.log(`    손 특징 있는 프레임: ${totalWithFeatures}`);

    if (lowDetectionSigns.length > 0) {
      console.log(`\n    ⚠️  손 감지율이 낮은 수화 (${lowDetectionSigns.length}개):`);
      lowDetectionSigns.slice(0, 10).forEach(s => {
        console.log(`      - ${s.name}: ${s.rate}%`);
      });
      if (lowDetectionSigns.length > 10) {
        console.log(`      ... 외 ${lowDetectionSigns.length - 10}개`);
      }
    }
  }
}

main().catch(error => {
  console.error('❌ 오류:', error);
  process.exit(1);
});
