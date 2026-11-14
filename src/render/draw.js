// Canvas renderer: draws one frame of the video (1080×1920) for a song at a given time.
// No audio, no project editing: it only reads the song built by core/song.js.
import { keyName } from '../core/theory.js';
import { slotPitch, idxAt, pitchAt, noteAt, noteName } from '../core/song.js';

export const W=1080, H=1920;

// Layout (1080×1920)
const L={cx:540,colL:120,colR:940,hook1:236,hook2:308,kicker:182,name:500,numRow:566,
  staffTop:600,staffBot:1082,playX:330,UB:[624,930],BB:[1004,1066],
  laneY:1112,laneH:60,kbY:1236,kbH:150,handle:1452};
const SPACING=270, REVEAL=2.7;
const INK='#2b2520', PAPER=[243,236,223], PINK='#c2385f';
const VOICE=['#b0574e','#6c5aa8','#3f72b0','#3d8a66','#c08a3e','#5b5148']; // bass in brick, then the upper voices top-down

// ---------- easing ----------
const clamp=u=>Math.max(0,Math.min(1,u));
const easeOut=u=>1-Math.pow(1-clamp(u),3);
const easeOutQuad=u=>{u=clamp(u); return 1-(1-u)*(1-u);};
const easeOutBack=u=>{u=clamp(u); const c1=1.70158,c3=c1+1; return 1+c3*Math.pow(u-1,3)+c1*Math.pow(u-1,2);};


/** @param {HTMLCanvasElement} cv */
export function createRenderer(cv){
const c=/** @type {CanvasRenderingContext2D} */(cv.getContext('2d'));
let staffFor=null;
// ---------- loop time ----------
// Everything on screen is periodic in song.cycle, so the first frame and the frame one cycle later are identical.
// phase: seconds since the loop start, in [0,cycle). fold: any time mapped into the exported window [vs,ve) (for pitch lookups).
// The discrete "event clock" (chord name, lane, rings, pills) runs `lead` seconds ahead of the sound: the name changes when the voices
// start moving, so the first frame of the loop (which is `lead` before the first chord arrives) already shows the first chord.
const wrap=(d,cyc)=>d-Math.floor((d+1e-6)/cyc)*cyc;
const phaseOf=(song,now)=>Math.max(0,wrap(now-song.vs,song.cycle));
const foldT=(song,t)=>song.vs+Math.max(0,wrap(t-song.vs,song.cycle));
function clockOf(song,now){
  const s0=song.starts[song.n], lead=Math.max(0,s0-song.vs);
  const d=Math.max(0,wrap(now+lead-s0,song.cycle)), i=idxAt(song,s0+d);
  return {i,since:d-(song.starts[i]-s0),lead};
}
// upper voices and bass get their own bands, so the voices spread out and the bass sits just below them
function yOf(song,k,m){
  if(k===0){const sp=Math.max(song.bHi-song.bLo,7); return L.BB[0]+(song.bHi-m+1)/(sp+2)*(L.BB[1]-L.BB[0]);}
  const sp=Math.max(song.uHi-song.uLo,9); return L.UB[0]+(song.uHi-m+1)/(sp+2)*(L.UB[1]-L.UB[0]);
}
// ---------- static layers: paper grain + faint staff guides ----------
const grain=document.createElement('canvas'); grain.width=W; grain.height=H;
(()=>{const g=grain.getContext('2d'), img=g.createImageData(W,H); let s=7;
  for(let i=0;i<img.data.length;i+=4){s=(s*1664525+1013904223)>>>0; const v=s>>>24; img.data[i]=img.data[i+1]=img.data[i+2]=v; img.data[i+3]=9;}
  g.putImageData(img,0,0);})();
const staff=document.createElement('canvas'); staff.width=W; staff.height=H;
function paintStaticLayers(song){
  const g=staff.getContext('2d'); g.clearRect(0,0,W,H); if(!song) return;
  // one even, ruled grid over the whole staff: the upper voices' semitone step, repeated from top to bottom.
  // (before: a 28 px grid for the upper voices, a 7 px one for the bass and darker octave lines, which read as an
  // irregular grid once the video was compressed.) Integer y + 2 px width = every line covers exactly 2 pixel rows.
  const step=(L.UB[1]-L.UB[0])/(Math.max(song.uHi-song.uLo,9)+2), y0=yOf(song,1,song.uHi);
  g.fillStyle='rgba(43,37,32,0.045)';
  for(let y=y0-Math.floor((y0-L.staffTop)/step)*step;y<=L.staffBot+0.5;y+=step) g.fillRect(0,Math.round(y)-1,W,2);
}

// ---------- drawing helpers ----------

function font(w,px){c.font=`${w} ${px}px Inter, system-ui, sans-serif`}
function rr(x,y,w,h,r){c.beginPath(); if(c.roundRect) c.roundRect(x,y,w,h,r); else c.rect(x,y,w,h);}
function rgba(hex,a){const n=parseInt(hex.slice(1),16); return `rgba(${n>>16},${(n>>8)&255},${n&255},${a})`;}
function spaced(txt,x,y,sp,align){let w=0; for(const ch of txt) w+=c.measureText(ch).width+sp; w-=sp; let xx=align==='center'?x-w/2:align==='right'?x-w:x; c.textAlign='left'; for(const ch of txt){c.fillText(ch,xx,y); xx+=c.measureText(ch).width+sp;} return w;}
function chordMetrics(ch,size){
  font(800,size); const rw=c.measureText(ch.letter).width;
  font(700,size*0.46); const aw=ch.acc?c.measureText(ch.acc).width:0;
  const suf=ch.qd+(ch.slash?'/'+ch.slash:''); const sw=suf?c.measureText(suf).width:0;
  return {rw,suf,total:rw+Math.max(aw,sw)+(aw||sw?size*0.05:0)};
}
function drawChord(ch,x,y,size,col){
  const m=chordMetrics(ch,size); let x0=x-m.total/2;
  c.fillStyle=col; c.textAlign='left'; c.textBaseline='alphabetic';
  font(800,size); c.fillText(ch.letter,x0,y); x0+=m.rw+size*0.035;
  font(700,size*0.46); if(ch.acc) c.fillText(ch.acc,x0,y-size*0.5); if(m.suf) c.fillText(m.suf,x0,y);
}
// hook / question text: "*word*" is drawn in pink; words rise in one after another
function richLines(txt,size,maxW){
  font(800,size); const words=txt.split(/\s+/).filter(Boolean).map(w=>{const pink=/^\*.*\*[.,!?]*$/.test(w)||/^\*/.test(w)&&/\*/.test(w.slice(1)); return {t:w.replace(/\*/g,''),pink};});
  const lines=[]; let cur=[], wsum=0; const sp=c.measureText(' ').width;
  for(const w of words){const ww=c.measureText(w.t).width; if(cur.length&&wsum+sp+ww>maxW){lines.push(cur); cur=[]; wsum=0;} cur.push(w); wsum+=(cur.length>1?sp:0)+ww;}
  if(cur.length) lines.push(cur);
  // balance two-line text so no word is left alone on the second line
  if(lines.length===2){const all=words, wOf=ws=>ws.reduce((a,w,k)=>a+c.measureText(w.t).width+(k?sp:0),0); let best=null;
    for(let k=1;k<all.length;k++){const a=all.slice(0,k), b=all.slice(k), m=Math.max(wOf(a),wOf(b)); if(m<=maxW&&(!best||m<best.m)) best={m,l:[a,b]};}
    if(best) return best.l;}
  return lines;
}
function drawRich(txt,size,y1,lh,t,alpha,drift){
  if(alpha<=0||!txt) return;
  const lines=richLines(txt,size,L.colR-L.colL); font(800,size); const sp=c.measureText(' ').width; let wi=0;
  c.save(); c.textAlign='left';
  lines.forEach((ln,j)=>{
    const tw=ln.reduce((a,w,k)=>a+c.measureText(w.t).width+(k?sp:0),0); let x=L.cx-tw/2;
    for(const w of ln){const u=easeOut((t-wi*0.06)/0.32); c.globalAlpha=alpha*u; c.fillStyle=w.pink?PINK:INK;
      c.fillText(w.t,x,y1+j*lh+16*(1-u)-drift); x+=c.measureText(w.t).width+sp; wi++;}
  });
  c.restore();
}

// ---------- background ----------
function drawBg(){
  c.fillStyle=`rgb(${PAPER.join(',')})`; c.fillRect(0,0,W,H);
  const g=c.createRadialGradient(W/2,H*0.42,80,W/2,H*0.46,H*0.82);
  g.addColorStop(0,'rgba(255,253,248,.7)'); g.addColorStop(1,'rgba(255,253,248,0)'); c.fillStyle=g; c.fillRect(0,0,W,H);
  const v=c.createRadialGradient(W/2,H/2,H*0.45,W/2,H/2,H*0.78);
  v.addColorStop(0,'rgba(90,70,45,0)'); v.addColorStop(1,'rgba(90,70,45,.09)'); c.fillStyle=v; c.fillRect(0,0,W,H);
  c.drawImage(grain,0,0); c.drawImage(staff,0,0);
}

// ---------- header: hook / question / reveal text, then the chord name ----------
// Layers over one loop (phase p): the hook (or, without one, the quiet meta line) at the start; the question, then the reveal in the last
// seconds. The late layer fades out just before the wrap and the first layer fades back in, so frame `cycle` equals frame 0.
const HOOK_ON=2.3, HOOK_OFF=2.45, LATE_OUT=0.35, WRAP_IN=0.12;
function headerLayers(song,p){
  const cyc=song.cycle, left=cyc-p;
  const late=song.reveal&&left<=REVEAL?'reveal':song.question&&left<=song.qSec?'question':null;
  let lateA=0, lateT=0;
  if(late){const dur=late==='reveal'?REVEAL:song.qSec; lateT=dur-left; lateA=easeOut(lateT/(late==='reveal'?0.25:0.2))*clamp((left-(WRAP_IN))/(LATE_OUT-WRAP_IN));}
  const rise=clamp((p-(cyc-WRAP_IN))/WRAP_IN);              // the first layer comes back just before the wrap
  const early=late&&left>WRAP_IN?0:1;
  let hookA=0, drift=0;
  if(song.hook){ if(p<HOOK_ON) hookA=1; else if(p<HOOK_OFF){hookA=1-(p-HOOK_ON)/(HOOK_OFF-HOOK_ON); drift=8*(1-hookA);} if(cyc-p<=WRAP_IN) hookA=Math.max(hookA,rise); hookA*=early; }
  const metaA=song.hook?easeOut((p-HOOK_OFF)/0.3)*(1-hookA)*(late?0:1):late?rise*early:1;
  return {late,lateA,lateT,hookA,drift,metaA};
}
function drawHeader(song,now,i,since){
  const ch=song.chords[i], p=phaseOf(song,now), H_=headerLayers(song,p);
  c.save();
  // the hook is fully on screen from frame 0 (it is the thumbnail and the first thing read)
  if(H_.hookA>0) drawRich(song.hook,64,L.hook1,72,10,H_.hookA,H_.drift);
  if(H_.late==='question'&&H_.lateA>0){font(800,26); c.globalAlpha=H_.lateA; c.fillStyle=PINK; spaced('YOUR TURN',L.cx,L.kicker,5,'center'); drawRich(song.question,64,L.hook1+14,72,H_.lateT+0.3,H_.lateA,0);}
  if(H_.late==='reveal'&&H_.lateA>0){
    c.globalAlpha=H_.lateA; font(800,26); c.fillStyle=PINK; spaced('IT WAS',L.cx,L.kicker,6,'center');
    const parts=song.reveal.split(/\s+[—–-]\s+/); font(900,70); c.fillStyle=INK; c.textAlign='center';
    c.fillText(parts[0],L.cx,L.hook1+14+10*(1-H_.lateA)); if(parts[1]){font(600,38); c.fillStyle='rgba(43,37,32,.62)'; c.fillText(parts.slice(1).join(' — '),L.cx,L.hook1+70);}
  }
  if(H_.metaA>0){
    // quiet meta line: section and key
    c.globalAlpha=H_.metaA; font(800,30); c.fillStyle='#6b625a';
    spaced([ch.section,keyName(song.key,song.sharps)].filter(Boolean).join('   ·   ').toUpperCase(),L.cx,L.hook1,3.5,'center');
  }
  // chord name: full size from the first frame (the header text sits above it); a small settle on each change
  const pop=1+0.06*Math.sin(Math.PI*clamp(since/0.2));
  c.globalAlpha=1; c.save(); c.translate(L.cx,L.name); c.scale(pop,pop); drawChord(ch,0,0,236,INK); c.restore();
  // roman numeral pill
  font(800,40); const rn=ch.rn, rw=c.measureText(rn).width+44;
  c.fillStyle=rgba(PINK,0.12); rr(L.cx-rw/2,L.numRow-38,rw,54,27); c.fill();
  c.fillStyle=PINK; c.textAlign='center'; c.fillText(rn,L.cx,L.numRow+3);
  c.restore();
}

// ---------- staff ----------
function drawStaff(song,now,i,since){
  const pps=SPACING/song.dur, ch=song.chords[i];
  c.save();
  // accent on chords outside the key: a breath of scale and a faint pink flash
  if(ch.strong&&since>=0&&since<0.12){const k=1+0.015*Math.sin(Math.PI*since/0.12); c.translate(L.cx,(L.staffTop+L.staffBot)/2); c.scale(k,k); c.translate(-L.cx,-(L.staffTop+L.staffBot)/2);}
  const phs=Math.max(0,wrap(now-song.vs,song.cycle))+song.vs; // `now` brought into [vs,ve); chord boundaries repeat every cycle
  for(let m=-2;m<=2;m++) for(let j=song.n;j<2*song.n;j++){
    const x=L.playX+(song.starts[j]+m*song.cycle-phs)*pps; if(x<0||x>W) continue;
    c.strokeStyle='rgba(43,37,32,.05)'; c.lineWidth=2; c.beginPath(); c.moveTo(x,L.staffTop); c.lineTo(x,L.staffBot); c.stroke();
  }
  c.strokeStyle='rgba(43,37,32,.3)'; c.lineWidth=2; c.beginPath(); c.moveTo(L.playX,L.staffTop); c.lineTo(L.playX,L.staffBot); c.stroke();
  c.lineCap='round'; c.lineJoin='round';
  const stroke=pts=>{c.beginPath(); pts.forEach((p,j)=>j?c.lineTo(p[0],p[1]):c.moveTo(p[0],p[1])); c.stroke();};
  const paths=[];
  for(let k=5;k>=0;k--){const pts=[]; for(let x=-8;x<=W+8;x+=2) pts.push([x,yOf(song,k,pitchAt(song,k,foldT(song,now+(x-L.playX)/pps)))]); paths.push({k,pts,split:pts.findIndex(p=>p[0]>=L.playX)});}
  for(const {k,pts,split} of paths){const f=c.createLinearGradient(L.playX,0,W,0); f.addColorStop(0,rgba(VOICE[k],.35)); f.addColorStop(1,rgba(VOICE[k],.05)); c.strokeStyle=f; c.lineWidth=4; stroke(pts.slice(split));}
  for(const {k,pts,split} of paths){
    const past=pts.slice(0,split+1);
    c.save(); c.translate(0,4); c.strokeStyle='rgba(43,37,32,.06)'; c.lineWidth=11; stroke(past); c.restore();
    const g=c.createLinearGradient(0,0,140,0); g.addColorStop(0,rgba(VOICE[k],0)); g.addColorStop(1,VOICE[k]);
    c.strokeStyle=g; c.lineWidth=9; stroke(past);
  }
  // dots, with a ring on the voices that just moved
  const cur=[], seen=new Set();
  for(let k=0;k<6;k++){const p=pitchAt(song,k,foldT(song,now)), key=k===0?'b':Math.round(p*4); if(seen.has(key)) continue; seen.add(key); cur.push({k,p,y:yOf(song,k,p),col:VOICE[k],moved:slotPitch(song,i,k)!==slotPitch(song,i-1,k)});}
  cur.sort((a,b)=>a.y-b.y);
  for(const d of cur){
    if(d.moved&&since>=0&&since<0.35){const u=easeOutQuad(since/0.35); c.strokeStyle=rgba(d.col,0.5*(1-u)); c.lineWidth=3; c.beginPath(); c.arc(L.playX,d.y,16*(1+0.8*u),0,Math.PI*2); c.stroke();}
    c.fillStyle=d.col; c.beginPath(); c.arc(L.playX,d.y,14,0,Math.PI*2); c.fill();
    c.strokeStyle='#fffdf8'; c.lineWidth=4.5; c.stroke();
  }
  // note pills in a column, 52 px apart at least, tied to their dots
  const LX=400, GAP=52, lab=cur.map(d=>({...d,ly:d.y}));
  for(let j=1;j<lab.length;j++) if(lab[j].ly-lab[j-1].ly<GAP) lab[j].ly=lab[j-1].ly+GAP;
  const over=lab.length?lab[lab.length-1].ly-(L.staffBot-8):0; if(over>0) lab.forEach(d=>d.ly-=over);
  for(let j=lab.length-2;j>=0;j--) if(lab[j+1].ly-lab[j].ly<GAP) lab[j].ly=lab[j+1].ly-GAP;
  const span=Math.min(1.2,(song.starts[i+1]!==undefined?song.starts[i+1]-song.starts[i]:2)*0.8);
  for(const d of lab){
    const nm=noteName(song,noteAt(song,d.k,foldT(song,now)),ch); font(800,32); const pw=c.measureText(nm).width+34, ph=44;
    c.strokeStyle=rgba(d.col,.5); c.lineWidth=2; c.beginPath(); c.moveTo(L.playX+18,d.y); c.bezierCurveTo(L.playX+44,d.y,LX-26,d.ly,LX-4,d.ly); c.stroke();
    const s=d.moved&&since>=0&&since<0.22?0.85+0.15*easeOutBack(since/0.22):1;
    c.save(); c.translate(LX+pw/2,d.ly); c.scale(s,s); c.translate(-pw/2,0); // pop from the pill's centre, not its left edge
    c.fillStyle=d.col; rr(0,-ph/2,pw,ph,ph/2); c.fill();
    c.fillStyle='#fffdf8'; c.textAlign='left'; c.fillText(nm,17,11);
    c.restore();
    if(d.moved&&since>=0&&since<span){const dl=slotPitch(song,i,d.k)-slotPitch(song,i-1,d.k);
      c.globalAlpha=Math.min(1,(span-since)/0.3,since/0.1); font(800,32); c.fillStyle=d.col; c.textAlign='left';
      c.fillText((dl>0?'+':'−')+Math.abs(dl),LX+pw+14,d.ly+11); c.globalAlpha=1;}
  }
  c.restore();
}

// ---------- chord lane: previous, current, next ----------
function drawLane(song,now,i,since){
  const CW=250, STEP=275, y=L.laneY, h=L.laneH, dx=STEP*(1-easeOut(since/0.26));
  c.save(); c.beginPath(); c.rect(40,y-10,900,h+20); c.clip();
  for(let j=i-2;j<=i+2;j++){
    const cx=L.cx+(j-i)*STEP+dx, x=cx-CW/2, cur=j===i, past=j<i;
    rr(x,y,CW,h,18);
    if(cur){c.fillStyle=INK; c.fill(); const p=clamp(since/(song.starts[i+1]-song.starts[i]));
      c.save(); c.clip(); c.fillStyle='rgba(255,253,247,.10)'; c.fillRect(x,y,CW*p,h); c.restore();}
    else if(past){c.fillStyle='rgba(43,37,32,.06)'; c.fill();}
    else {c.strokeStyle='rgba(43,37,32,.22)'; c.lineWidth=2.5; c.stroke();}
    font(800,34); c.textAlign='center'; c.fillStyle=cur?'#f6efe3':past?'rgba(43,37,32,.32)':'rgba(43,37,32,.7)';
    c.fillText(song.chords[song.n+(((j-song.n)%song.n)+song.n)%song.n].label,cx,y+h/2+12);
  }
  c.restore();
}

// ---------- piano ----------
function isBlack(m){return [1,3,6,8,10].includes(((m%12)+12)%12)}
function kbRange(song){let mn=99,mx=0; for(const v of song.v){mn=Math.min(mn,v.bass); mx=Math.max(mx,v.upper[0]);} let lo=mn-1,hi=mx+1; while(isBlack(lo)) lo--; while(isBlack(hi)) hi++; return [lo,hi];}
function drawPiano(song,now,i,since){
  const [lo,hi]=song.kb||(song.kb=kbRange(song));
  const whites=[]; for(let m=lo;m<=hi;m++) if(!isBlack(m)) whites.push(m);
  const ww=Math.min(56,(L.colR-L.colL)/whites.length), tw=ww*whites.length, x0=L.cx-tw/2, pad=16, y=L.kbY, h=L.kbH;
  const act=new Map(); for(let k=5;k>=0;k--) act.set(noteAt(song,k,foldT(song,now)),VOICE[k]);
  const fresh=new Set(); if(i>0) for(let k=0;k<6;k++) if(slotPitch(song,i,k)!==slotPitch(song,i-1,k)) fresh.add(slotPitch(song,i,k));
  const press=m=>act.has(m)?(fresh.has(m)&&since>=0&&since<0.08?4*since/0.08:4):0;
  c.save();
  c.shadowColor='rgba(43,37,32,.25)'; c.shadowBlur=30; c.shadowOffsetY=10;
  rr(x0-pad,y-pad-6,tw+pad*2,h+pad*2+6,24); c.fillStyle='#231e1a'; c.fill(); c.shadowColor='transparent';
  whites.forEach((m,j)=>{
    const x=x0+j*ww, col=act.get(m), p=press(m), g=c.createLinearGradient(0,y,0,y+h);
    if(col){g.addColorStop(0,rgba(col,.8)); g.addColorStop(1,col);} else {g.addColorStop(0,'#fffdf8'); g.addColorStop(1,'#ece3d4');}
    rr(x+1.5,y+p,ww-3,h-p,[0,0,9,9]); c.fillStyle=g; c.fill();
  });
  for(let m=lo;m<=hi;m++){
    if(!isBlack(m)) continue; const j=whites.indexOf(m-1); if(j<0) continue;
    const x=x0+(j+1)*ww-ww*0.31, col=act.get(m), bw=ww*0.62, bh=h*0.6, p=press(m), g=c.createLinearGradient(0,y,0,y+bh);
    if(col){g.addColorStop(0,rgba(col,.85)); g.addColorStop(1,col);} else {g.addColorStop(0,'#3d352e'); g.addColorStop(1,'#1c1814');}
    rr(x,y+p,bw,bh-p*0.5,[0,0,6,6]); c.fillStyle=g; c.fill();
  }
  for(const [m,col] of act){ if(m<lo||m>hi) continue;
    let x,bw; if(isBlack(m)){const j=whites.indexOf(m-1); x=x0+(j+1)*ww-ww*0.31; bw=ww*0.62;} else {const j=whites.indexOf(m); x=x0+j*ww+1.5; bw=ww-3;}
    c.shadowColor=col; c.shadowBlur=14; c.fillStyle=col; rr(x+4,y-pad-2,bw-8,5,3); c.fill(); }
  c.restore();
}

// ---------- frame ----------
function draw(song,now){
  c.globalAlpha=1; c.shadowColor='transparent'; drawBg();
  if(!song){font(700,44); c.fillStyle='rgba(43,37,32,.5)'; c.textAlign='center'; c.fillText('Add a chord to begin',W/2,H/2); return;}
  const {i,since}=clockOf(song,now);
  if(song.chords[i].strong&&since>=0&&since<0.1){c.fillStyle=rgba(PINK,0.03); c.fillRect(0,0,W,H);}
  drawHeader(song,now,i,since); drawStaff(song,now,i,since); drawLane(song,now,i,since); drawPiano(song,now,i,since);
  const handle=song.watermark;
  if(handle){c.save(); font(700,28); c.fillStyle='rgba(43,37,32,.6)'; c.textAlign='center'; c.fillText(handle,L.cx,L.handle); c.restore();}
}

return {
  /** Draw the frame at time `now` (seconds on the song's own clock). A null song draws the empty state. */
  draw(song,now){ if(song&&staffFor!==song){paintStaticLayers(song); staffFor=song;} draw(song,now); },
  /** What the header shows at `now` (for tests): the chord label. */
  debug(song,now){ const {i}=clockOf(song,now); return {chord:song.chords[i].label}; },
  canvas:cv,
};
}
