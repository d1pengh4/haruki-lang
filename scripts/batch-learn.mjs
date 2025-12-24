#!/usr/bin/env node

/**
 * 간결하고 안정적인 배치 자동 수화 학습 스크립트
 * - 기본적으로 Puppeteer 번들 Chromium을 사용하여 about:blank 문제를 회피
 * - 로컬 dev 서버에 대해 localhost 및 127.0.0.1을 모두 시도
 * - 실패 시 재시도 로직과 상세 로깅 제공
 *
 * 사용예:
 *   npm run batch-learn -- --count 1
 *   USE_SYSTEM_CHROME=1 npm run batch-learn -- --count 1
 */

import puppeteer from 'puppeteer';
import { readFileSync, existsSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, '..');

const videoDir = join(rootDir, '02');
const metadataDir = join(rootDir, '17');
const delay = ms => new Promise(r => setTimeout(r, ms));

async function checkPort(port, timeout = 2000) {
  const http = await import('http');
  return new Promise(resolve => {
    const req = http.request({ hostname: '127.0.0.1', port, path: '/', method: 'HEAD' }, res => resolve(true));
    req.on('error', () => resolve(false));
    req.setTimeout(timeout, () => { req.destroy(); resolve(false); });
    req.end();
  });
}

async function findActivePort() {
  const candidates = [5173, 5175, 3000, 5174];
  for (const p of candidates) if (await checkPort(p)) return p;
  return 5173;
}

const args = process.argv.slice(2);
let startId = null, maxCount = Infinity;
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--start' && args[i+1]) startId = args[i+1];
  if (args[i] === '--count' && args[i+1]) maxCount = parseInt(args[i+1]);
}

function getVideoFileIds() {
  try { return readdirSync(videoDir).filter(f => f.endsWith('.mp4')).map(f=>f.replace('.mp4','')).sort((a,b)=>parseInt(a)-parseInt(b)); }
  catch { return []; }
}

function getSignNameFromJson(id) {
  try { const p = join(metadataDir, `${id}.json`); if (!existsSync(p)) return null; const j = JSON.parse(readFileSync(p,'utf8')); return j?.data?.[0]?.attributes?.[0]?.name ?? null; }
  catch { return null; }
}

function videoExists(id){ return existsSync(join(videoDir, `${id}.mp4`)); }

async function learnSignWithPuppeteer(browser, id, name, idx, total) {
  const page = await browser.newPage();
  const videoPath = join(videoDir, `${id}.mp4`);
  try {
    console.log(`\n[${idx}/${total}] 처리: ${id} - ${name}`);
    const port = await findActivePort();
    const hosts = [`http://localhost:${port}`, `http://127.0.0.1:${port}`];

    let ok=false, last=null;
    for (let a=1;a<=3 && !ok;a++){
      for (const h of hosts){
        console.log(` 시도 ${a}: ${h}`);
        try { await page.goto(h, { waitUntil:['domcontentloaded','networkidle2'], timeout:20000 }); }
        catch(e){ console.warn('  goto 실패', e.message); }
        await delay(400);
        const cur = page.url(); console.log(' 현재 URL:', cur);
        if (cur && cur!=='about:blank' && (cur.includes('localhost')||cur.includes('127.0.0.1'))){ ok=true; break; }
      }
      if (!ok){ last='about:blank 또는 접속불가'; await delay(800); }
    }
    if (!ok){ console.error(' 페이지 로드 실패:', last); return false; }

    await delay(500);
    const clicked = await page.evaluate(()=>{ const b=Array.from(document.querySelectorAll('button')).find(x=>x.textContent.includes('수화 학습하기')); if(b){b.click(); return true} return false; });
    if (!clicked){ console.error('수화 학습하기 버튼 없음'); return false; }
    await delay(1000);
    try{ await page.evaluate(()=>{ const b=Array.from(document.querySelectorAll('button')).find(x=>x.textContent.includes('영상 업로드')||x.textContent.includes('비디오 업로드')); if(b) b.click(); }); }catch{}
    await delay(600);

    const fileInput = await page.$('#video-upload') || await page.$('input[type="file"]');
    if (!fileInput){ console.error('파일 input 없음'); return false; }
    try{ await fileInput.uploadFile(videoPath); } catch(e){ console.error('파일 업로드 실패', e.message); return false; }

    for (let t=0;t<60;t++){ await delay(1000); try{ const done = await page.evaluate(()=>Array.from(document.querySelectorAll('[role="alert"]')).some(a=>/처리 완료|완료|completed/i.test(a.textContent))); if (done) break; }catch{} }

    try{ const nameInput = await page.$('input[placeholder*="수화"]') || await page.$('input[type="text"]'); if (nameInput){ await nameInput.focus(); await page.keyboard.type(name, {delay:30}); } } catch{}
    try{ await page.evaluate(()=>{ const b=Array.from(document.querySelectorAll('button')).find(x=>/저장/.test(x.textContent)&&!/취소|삭제/.test(x.textContent)); if(b) b.click(); }); }catch{}
    await delay(1200);
    return true;
  } catch(e){ console.error('학습 오류:', e.message); return false; }
  finally{ try{ await page.close(); }catch{} }
}

async function main(){
  console.log('배치 학습 시작');
  const all = getVideoFileIds(); if (!all.length){ console.error('02 폴더에 mp4 파일이 없습니다.'); process.exit(1); }
  let ids = all; if (startId){ const si = ids.indexOf(startId); if (si>=0) ids = ids.slice(si); }
  if (ids.length>maxCount) ids = ids.slice(0, maxCount);
  const valid = ids.filter(id=> getSignNameFromJson(id) && videoExists(id)); if (!valid.length){ console.error('처리할 파일이 없습니다.'); process.exit(1); }

  const useSystemChrome = process.env.USE_SYSTEM_CHROME==='1' || args.includes('--use-chrome');
  const chromePaths = ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome','/usr/bin/google-chrome','/usr/bin/chromium'];
  let executablePath=undefined; if (useSystemChrome){ for (const p of chromePaths) if (existsSync(p)){ executablePath=p; break;} if (!executablePath) console.warn('시스템 Chrome을 찾을 수 없어 번들 Chromium 사용'); }

  let browser;
  try{
    browser = await puppeteer.launch({ headless:false, executablePath, args:['--no-first-run','--no-default-browser-check','--disable-extensions'] });
    try{ console.log('브라우저:', await browser.version()); }catch{}
    let succ=0, fail=0, failed=[];
    for (let i=0;i<valid.length;i++){ const id=valid[i]; const name=getSignNameFromJson(id); const ok = await learnSignWithPuppeteer(browser,id,name,i+1,valid.length); if (ok) succ++; else { fail++; failed.push(id); } await delay(700); }
    console.log('완료: 성공',succ,'실패',fail); if (failed.length) console.log('실패 목록:', failed.slice(0,20));
  }catch(e){ console.error('브라우저 실행 오류:', e.message); process.exit(1); }
  finally{ if (browser) try{ await browser.close(); }catch{} }
}

process.on('unhandledRejection', e=>{ console.error('UnhandledRejection', e); process.exit(1); });
main();
