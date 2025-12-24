#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function checkAllFrames() {
  console.log('🔍 모든 프레임 분석\n');

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
  console.log(`   총 프레임 수: ${signData.landmarks_sequence.length}\n`);

  let leftCount = 0;
  let rightCount = 0;
  let bothCount = 0;

  console.log('프레임별 손 감지:');
  for (let i = 0; i < signData.landmarks_sequence.length; i++) {
    const frame = signData.landmarks_sequence[i];
    const hasLeft = frame.left_hand_features && frame.left_hand_features.length === 33;
    const hasRight = frame.right_hand_features && frame.right_hand_features.length === 33;

    if (hasLeft) leftCount++;
    if (hasRight) rightCount++;
    if (hasLeft && hasRight) bothCount++;

    const leftMark = hasLeft ? '✓' : '✗';
    const rightMark = hasRight ? '✓' : '✗';

    console.log(`  프레임 ${i.toString().padStart(2)}: 왼손=${leftMark} 오른손=${rightMark}`);
  }

  console.log(`\n📊 통계:`);
  console.log(`  왼손 감지: ${leftCount}/${signData.landmarks_sequence.length} (${(leftCount/signData.landmarks_sequence.length*100).toFixed(1)}%)`);
  console.log(`  오른손 감지: ${rightCount}/${signData.landmarks_sequence.length} (${(rightCount/signData.landmarks_sequence.length*100).toFixed(1)}%)`);
  console.log(`  양손 모두: ${bothCount}/${signData.landmarks_sequence.length} (${(bothCount/signData.landmarks_sequence.length*100).toFixed(1)}%)`);
}

checkAllFrames().catch(console.error);
