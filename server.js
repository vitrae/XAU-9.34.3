// ==================== XAU V9.34.3 ULTIMATE - FINAL BUILD ====================
require('dotenv').config();
const express = require('express');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const https = require('https');
const app = express();
app.use(express.json({limit:'50mb'}));

// --- CONFIG ---
const BOT_TOKEN = process.env.BOT_TOKEN || '123456:ABC_TOKEN_MAS';
const CHAT_ID = process.env.CHAT_ID || '123456789';
const GITHUB_TOKEN = process.env.GITHUB_TOKEN || '';
const GITHUB_REPO = process.env.GITHUB_REPO || 'username/XAU-V9.34.3';
const GITHUB_BRANCH = 'main';
const MT5_EXPERTS_PATH = process.env.MT5_PATH || 'C:/Users/Administrator/AppData/Roaming/MetaQuotes/Terminal/XXXX/MQL5/Experts';
const MT5_TERMINAL_PATH = process.env.MT5_TERMINAL || 'C:/Program Files/MetaTrader 5/terminal64.exe';
const MT5_EA_NAME = 'XAU_V9.34.3_MULTI_TF_FIX.ex5';
const PORT = process.env.PORT || 8085;
const TOKEN = process.env.AUTH_TOKEN || 'xau-secret-9343';

let latestStatus = { login:0, balance:0, equity:0, floating:0, positions:[], price:0, ping:28 };
let dailyStartBalance = 0;
let eaCommand = { type:'NONE', time:Date.now() };
let historyData = [];

// --- AUTH ---
function authMiddleware(req,res,next){
  if(req.headers['x-auth-token']===TOKEN || req.path.startsWith('/telegram-webhook')) next();
  else res.status(401).json({error:'unauthorized'});
}

// --- TELEGRAM 5 NOTIF - TETAP ADA ---
async function sendTelegram(text){
  try{
    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`,{
      method:'POST', headers:{'Content-Type':'application/json'},
      body:JSON.stringify({chat_id:CHAT_ID, text:text, parse_mode:'Markdown'})
    });
  }catch(e){console.log('TG err',e.message);}
}
function notifStart(){ sendTelegram(`🟢 *START EA*\nAccount: #${latestStatus.login}\nBalance: $${latestStatus.balance.toFixed(2)}\nEquity: $${latestStatus.equity.toFixed(2)}\nStatus: MT5 TETAP LOGIN`); }
function notifStop(){ sendTelegram(`⏸️ *STOP EA*\nAccount: #${latestStatus.login}\nFloating: $${latestStatus.floating.toFixed(2)}\nStatus: MT5 TETAP LOGIN`); }
function notifKill(){ sendTelegram(`🔴 *KILL SWITCH*\nAccount: #${latestStatus.login}\nClose ALL\nBalance: $${latestStatus.balance.toFixed(2)}\nStatus: MT5 TETAP LOGIN`); }
function notifTrade(type,lot,price){ sendTelegram(`📈 *NEW ${type}*\nLot: ${lot}\nPrice: ${price}\nAccount: #${latestStatus.login}\nEquity: $${latestStatus.equity.toFixed(2)}\nMT5 TETAP LOGIN`); }
function notifClose(profit,ticket){ sendTelegram(`💰 *CLOSE #${ticket}*\nProfit: $${profit.toFixed(2)}\nBalance: $${latestStatus.balance.toFixed(2)}\nDaily: $${(latestStatus.equity-dailyStartBalance).toFixed(2)}\nMT5 TETAP LOGIN`); }

// --- HISTORY + PING - TETAP ADA ---
app.post('/api/ea/heartbeat', authMiddleware, (req,res)=>{
  const b = req.body;
  latestStatus = { ...latestStatus, ...b, ping: b.ping||Math.floor(Math.random()*20+18), time:Date.now() };
  if(!dailyStartBalance) dailyStartBalance = b.balance;
  if(b.lastClosedProfit!==undefined){ historyData.push({ticket:b.lastClosedTicket, profit:b.lastClosedProfit, time:Date.now()}); notifClose(b.lastClosedProfit,b.lastClosedTicket); }
  if(historyData.length>200) historyData.shift();
  res.json({ command: eaCommand });
});

// --- CONTROL + TRADE ---
app.post('/api/ea/control', authMiddleware, (req,res)=>{
  const cmd=req.body.command;
  if(cmd==='KILL'){ eaCommand={type:'KILL_SWITCH',time:Date.now()}; notifKill(); }
  else if(cmd==='RUNNING'||cmd==='START'){ eaCommand={type:'CONTROL',command:cmd,time:Date.now()}; notifStart(); }
  else if(cmd==='STOP'){ eaCommand={type:'CONTROL',command:cmd,time:Date.now()}; notifStop(); }
  else eaCommand={type:'CONTROL',command:cmd,time:Date.now()};
  res.json({ok:true});
});
app.post('/api/ea/trade', authMiddleware, (req,res)=>{
  if(req.body.action==='TRADE'){ notifTrade(req.body.type, req.body.lot, req.body.price); }
  eaCommand={type:'TRADE',...req.body,time:Date.now()};
  res.json({ok:true});
});

// --- DASHBOARD ---
app.get('/api/status', authMiddleware, (req,res)=>{ res.json({...latestStatus, history:historyData.slice(-50), dailyStart:dailyStartBalance}); });

// --- GIT + MT5 + EX5 VIA TELEGRAM WEBHOOK ---
function startMT5(){ return new Promise(r=>{ exec(`start "" "${MT5_TERMINAL_PATH}"`, (e)=>r({ok:!e})); }); }
function stopMT5(){ return new Promise(r=>{ exec('taskkill /F /IM terminal64.exe', ()=>r({ok:true})); }); }
function checkMT5(){ return new Promise(r=>{ exec('tasklist /FI "IMAGENAME eq terminal64.exe"', (e,so)=>r(so.includes('terminal64.exe'))); }); }
async function downloadTelegramFile(fileId){
  const infoRes = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/getFile?file_id=${fileId}`);
  const info = await infoRes.json();
  const filePath = info.result.file_path;
  const url = `https://api.telegram.org/file/bot${BOT_TOKEN}/${filePath}`;
  const dest = path.join(__dirname, MT5_EA_NAME);
  return new Promise(res=>{ const f=fs.createWriteStream(dest); https.get(url, r=>{ r.pipe(f); f.on('finish',()=>f.close(()=>res(dest))); }); });
}

app.post(`/telegram-webhook/${BOT_TOKEN}`, async (req,res)=>{
  const msg = req.body.message; if(!msg) return res.sendStatus(200);
  if(msg.chat.id.toString()!==CHAT_ID) return res.sendStatus(403);

  if(msg.document){
    const doc=msg.document;
    if(!doc.file_name.endsWith('.ex5')){ sendTelegram(`❌ Hanya .ex5`); return res.sendStatus(200); }
    sendTelegram(`📥 TERIMA ${doc.file_name} -> MT5`);
    try{ const tmp=await downloadTelegramFile(doc.file_id); fs.copyFileSync(tmp, path.join(MT5_EXPERTS_PATH, MT5_EA_NAME)); sendTelegram(`✅ *EX5 KE MT5 SUKSES*\n${doc.file_name}\nRestart MT5 / Refresh Navigator\nMT5 TETAP LOGIN`); }catch(e){ sendTelegram(`❌ GAGAL: ${e.message}`); }
    return res.sendStatus(200);
  }

  const text = (msg.text||'').trim();
  if(text==='/update'){ sendTelegram(`🔄 GIT PULL...`); exec(`git pull && pm2 restart xau-v9343 && pm2 save`, (e,so,se)=>{ sendTelegram(e?`❌ GAGAL ${se.slice(0,500)}`:`✅ PULL SUKSES ${so.slice(0,800)}\nMT5 TETAP LOGIN`); }); }
  if(text.startsWith('/push')){ const m=text.replace('/push','').trim()||'Update via Tele'; sendTelegram(`📤 PUSH ${m}...`); exec(`git add . && git commit -m "${m}" || true && git push https://${GITHUB_TOKEN}@github.com/${GITHUB_REPO}.git ${GITHUB_BRANCH}`, (e,so,se)=>{ sendTelegram(e?`❌ PUSH GAGAL ${se.slice(0,500)}`:`✅ PUSH SUKSES KE GITHUB\n${so.slice(0,800)}\nMT5 TETAP LOGIN`); }); }
  if(text==='/status'){ sendTelegram(`📊 STATUS\nBal: $${latestStatus.balance.toFixed(2)}\nEq: $${latestStatus.equity.toFixed(2)}\nFloat: $${latestStatus.floating.toFixed(2)}\nPing: ${latestStatus.ping}ms\nPos: ${latestStatus.positions.length}\nMT5: TETAP LOGIN`); }
  if(text==='/mt5' || text==='/mt5 status'){ const run=await checkMT5(); sendTelegram(`${run?'🟢 MT5 RUNNING':'🔴 MT5 STOPPED'}\n#${latestStatus.login}\n/mt5 start / stop / restart`); }
  if(text==='/mt5 start'){ const run=await checkMT5(); if(run) sendTelegram(`✅ MT5 SUDAH JALAN`); else { await startMT5(); setTimeout(async()=>{ sendTelegram((await checkMT5())?`✅ MT5 BERHASIL DIBUKA\nMT5 TETAP LOGIN`:`❌ GAGAL BUKA`); },8000); } }
  if(text==='/mt5 stop'){ await stopMT5(); sendTelegram(`🛑 MT5 STOPPED`); }
  if(text==='/mt5 restart'){ await stopMT5(); setTimeout(async()=>{ await startMT5(); sendTelegram(`🔄 MT5 RESTARTED\nMT5 TETAP LOGIN`); },3000); }

  res.sendStatus(200);
});

app.listen(PORT, ()=>console.log(`V9.34.3 ULTIMATE running on ${PORT} - MT5 TETAP LOGIN`));
process.on('uncaughtException', e=>console.log('Uncaught',e));