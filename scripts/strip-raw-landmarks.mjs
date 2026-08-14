#!/usr/bin/env node
/**
 * landmarks_sequence 슬리밍 마이그레이션 (PostgREST raw fetch — Node20 호환)
 *
 * 각 수화 행의 landmarks_sequence에서 raw 랜드마크(pose/left_hand/right_hand)를 제거하고
 * 사전계산된 feature 벡터만 남긴다. 인식은 feature만 사용하므로 동작에 영향 없음.
 * → 행당 ~10MB → ~3.7MB. 전체 select=* 의 statement timeout(500) 해소.
 *
 * 사용법:
 *   node scripts/strip-raw-landmarks.mjs           # 백업 + 드라이런
 *   node scripts/strip-raw-landmarks.mjs --apply    # 백업 후 실제 update
 */
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

dotenv.config({ path: '.env.local' });
const URL = process.env.VITE_SUPABASE_URL;
const KEY = process.env.VITE_SUPABASE_ANON_KEY;
if (!URL || !KEY) { console.error('ENV 없음'); process.exit(1); }
const H = { apikey: KEY, Authorization: 'Bearer ' + KEY };
const APPLY = process.argv.includes('--apply');
const KB = n => (n / 1024).toFixed(1) + 'KB';
const REST = `${URL}/rest/v1/sign_languages`;

const RAW_KEYS = ['pose', 'left_hand', 'right_hand'];
const slimFrame = (f) => {
  const o = {};
  for (const k in f) if (!RAW_KEYS.includes(k)) o[k] = f[k];
  return o;
};
const slimSeq = (ls) => {
  if (!ls) return ls;
  if (!Array.isArray(ls) && ls.v === 2) return { v: 2, sequences: ls.sequences.map(s => s.map(slimFrame)) };
  if (Array.isArray(ls)) return ls.map(slimFrame);
  return ls;
};

async function main() {
  const metaRes = await fetch(`${REST}?select=id,name&order=created_at`, { headers: H });
  if (!metaRes.ok) { console.error('메타 조회 실패', metaRes.status, await metaRes.text()); process.exit(1); }
  const metas = await metaRes.json();
  console.log(`대상 행: ${metas.length}개\n`);

  // ── Phase 1: 전체 백업 (행별 fetch) ──
  const backupDir = path.resolve('backups');
  fs.mkdirSync(backupDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = path.join(backupDir, `signs-full-${stamp}.json`);

  const rows = [];
  let totalFull = 0, totalSlim = 0;
  for (const { id, name } of metas) {
    const r = await fetch(`${REST}?select=*&id=eq.${id}`, { headers: H });
    if (!r.ok) { console.error(`fetch 실패 ${name}:`, r.status); process.exit(1); }
    const data = (await r.json())[0];
    rows.push(data);
    const full = JSON.stringify(data.landmarks_sequence).length;
    const slim = JSON.stringify(slimSeq(data.landmarks_sequence)).length;
    totalFull += full; totalSlim += slim;
    console.log(`  ${String(name).padEnd(12)} full ${KB(full).padStart(9)} → slim ${KB(slim).padStart(9)}`);
  }
  fs.writeFileSync(backupPath, JSON.stringify(rows));
  console.log(`\n✅ 백업 완료: ${backupPath} (${KB(fs.statSync(backupPath).size)})`);
  console.log(`총합 full ${KB(totalFull)} → slim ${KB(totalSlim)} (${(100 * totalSlim / totalFull).toFixed(0)}%)\n`);

  if (!APPLY) {
    console.log('드라이런 종료. 실제 적용하려면 --apply 를 붙여 다시 실행하세요.');
    return;
  }

  // ── Phase 2: strip + PATCH ──
  console.log('=== 적용 시작 ===');
  for (const row of rows) {
    const slim = slimSeq(row.landmarks_sequence);
    const r = await fetch(`${REST}?id=eq.${row.id}`, {
      method: 'PATCH',
      headers: { ...H, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({ landmarks_sequence: slim }),
    });
    if (!r.ok) { console.error(`update 실패 ${row.name}:`, r.status, await r.text()); process.exit(1); }
    console.log(`  ✅ ${row.name} 업데이트`);
  }
  console.log('\n=== 마이그레이션 완료 ===');
}

main().catch(e => { console.error(e); process.exit(1); });
