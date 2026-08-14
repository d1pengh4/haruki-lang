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
const NO_BACKUP = process.argv.includes('--no-backup'); // 재시도 시 백업 생략 (원본 백업 이미 확보된 경우)
const sleep = ms => new Promise(r => setTimeout(r, ms));
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
    console.log(`  ${String(name).padEnd(12)} 현재 ${KB(full).padStart(9)} → slim ${KB(slim).padStart(9)}`);
  }
  if (!NO_BACKUP) {
    fs.writeFileSync(backupPath, JSON.stringify(rows));
    console.log(`\n✅ 백업 완료: ${backupPath} (${KB(fs.statSync(backupPath).size)})`);
  } else {
    console.log('\n(백업 생략 — 원본 백업 이미 확보)');
  }
  console.log(`총합 현재 ${KB(totalFull)} → slim ${KB(totalSlim)} (${(100 * totalSlim / totalFull).toFixed(0)}%)\n`);

  if (!APPLY) {
    console.log('드라이런 종료. 실제 적용하려면 --apply 를 붙여 다시 실행하세요.');
    return;
  }

  // ── Phase 2: strip + PATCH (재시도 포함, 이미 슬림된 행은 건너뜀) ──
  console.log('=== 적용 시작 ===');
  const RAW_PRESENT = f => f && (('pose' in f) || ('left_hand' in f) || ('right_hand' in f));
  const hasRaw = (ls) => {
    if (!ls) return false;
    const seqs = (!Array.isArray(ls) && ls.v === 2) ? ls.sequences : (Array.isArray(ls) ? [ls] : []);
    return seqs.some(s => s.some(RAW_PRESENT));
  };
  const failed = [];
  for (const row of rows) {
    if (!hasRaw(row.landmarks_sequence)) { console.log(`  ⏭️  ${row.name} 이미 슬림 (건너뜀)`); continue; }
    const slim = slimSeq(row.landmarks_sequence);
    let ok = false, lastErr = '';
    for (let attempt = 1; attempt <= 4 && !ok; attempt++) {
      const r = await fetch(`${REST}?id=eq.${row.id}`, {
        method: 'PATCH',
        headers: { ...H, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
        body: JSON.stringify({ landmarks_sequence: slim }),
      });
      if (r.ok) { ok = true; break; }
      lastErr = `${r.status} ${(await r.text()).slice(0, 80)}`;
      console.log(`  … ${row.name} 시도 ${attempt} 실패(${r.status}), 재시도`);
      await sleep(1500 * attempt);
    }
    if (ok) console.log(`  ✅ ${row.name} 업데이트`);
    else { console.log(`  ❌ ${row.name} 최종 실패: ${lastErr}`); failed.push(row.name); }
  }
  console.log(failed.length ? `\n⚠️ 남은 실패: ${failed.join(', ')} (재실행하면 이어서 시도)` : '\n=== 마이그레이션 완료 ===');
  process.exit(failed.length ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
