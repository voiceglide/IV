// ===================== Studio · render =====================
const $=id=>document.getElementById(id);
const W=1080,H=1920;
// Layout (1080×1920)
const L={cx:540,colL:120,colR:940,hook1:236,hook2:308,kicker:182,name:500,numRow:566,
  staffTop:600,staffBot:1082,playX:330,UB:[624,930],BB:[1004,1066],
  laneY:1112,laneH:60,kbY:1236,kbH:150,handle:1452};
const SPACING=270, REVEAL=2.7;
const INK='#2b2520', PAPER=[243,236,223], PINK='#c2385f';
const VOICE=['#b0574e','#6c5aa8','#3f72b0','#3d8a66','#c08a3e','#5b5148']; // bass in brick, then the upper voices top-down
let song=null;

// ---------- easing ----------
const clamp=u=>Math.max(0,Math.min(1,u));
const easeOut=u=>1-Math.pow(1-clamp(u),3);
const easeOutQuad=u=>{u=clamp(u); return 1-(1-u)*(1-u);};
const easeOutBack=u=>{u=clamp(u); const c1=1.70158,c3=c1+1; return 1+c3*Math.pow(u-1,3)+c1*Math.pow(u-1,2);};
const easeInOutSine=u=>0.5-0.5*Math.cos(Math.PI*clamp(u));

// ---------- model: the progression is unrolled three times so the video can loop with no seam ----------
function glideOf(i){const g=parseFloat($('glide').value)||0.26; return Math.min(g,0.6*(song.starts[i]-song.starts[i-1]));}
function slotPitch(i,k){const v=song.v[i]; if(k===0) return v.bass; return v.upper[Math.min(k-1,v.upper.length-1)];}
function idxAt(t){const s=song.starts; if(t<s[0]) return 0; let a=0,b=s.length-1; while(a<b){const m=(a+b+1)>>1; if(s[m]<=t) a=m; else b=m-1;} return a;}
function glideState(t){
  const s=song.starts, n=s.length; if(t<=s[0]) return {i:0,e:0};
  const i=idxAt(t); if(i===n-1) return {i,e:0};
  const g=glideOf(i+1), gs=s[i+1]-g; if(t<gs) return {i,e:0};
  return {i,e:easeInOutSine((t-gs)/g)};
}
function pitchAt(k,t){const {i,e}=glideState(t); const a=slotPitch(i,k); if(!e) return a; return a+(slotPitch(i+1,k)-a)*e;}
function noteAt(k,t){const {i,e}=glideState(t); return e<0.5?slotPitch(i,k):slotPitch(i+1,k);}
const SHARP_MAJ=new Set([7,2,9,4,11,6,1]), SHARP_MIN=new Set([4,11,6,1,8,3]);
function useSharps(ch){
  if(ch.acc==='♯') return true; if(ch.acc==='♭') return false;
  if(MINORISH.has(ch.q)) return SHARP_MIN.has(ch.root); if(ch.root===0||ch.root===5) return song.sharps; return SHARP_MAJ.has(ch.root);
}
function noteName(m,ch){const sh=ch?useSharps(ch):song.sharps; return (sh?SHARP:FLAT)[((m%12)+12)%12]+(Math.floor(m/12)-1)}
// upper voices and bass get their own bands, so the voices spread out and the bass sits just below them
function yOf(k,m){
  if(k===0){const sp=Math.max(song.bHi-song.bLo,7); return L.BB[0]+(song.bHi-m+1)/(sp+2)*(L.BB[1]-L.BB[0]);}
  const sp=Math.max(song.uHi-song.uLo,9); return L.UB[0]+(song.uHi-m+1)/(sp+2)*(L.UB[1]-L.UB[0]);
}

function buildSong(){
  const p=parseProgression($('prog').value);
  $('errs').textContent=p.bad.length?('Not recognised: '+p.bad.join(', ')):'';
  if(!p.chords.length){song=null; return;}
  VOICE_TOP=[62,81,71]; MEL=null;
  const base=p.chords, n=base.length, tri=[...base,...base,...base].map(c=>Object.assign({},c));
  const vAll=chooseVoicings(tri);
  if(!vAll){$('errs').textContent='Could not voice one of the chords.'; song=null; return;}
  const mid=vAll.slice(n,2*n), v=[...mid,...mid,...mid];
  let bpm=parseFloat(($('bpm').value||'').replace(',','.')); if(!(bpm>=20&&bpm<=300)) bpm=90;
  const spb=60/bpm, defB=parseFloat($('beats').value)||4, starts=[]; let t=0;
  for(const c of tri){starts.push(t); t+=(c.beats||defB)*spb;}
  const cycle=t/3;
  const ks=$('keysel').value; const key=ks==='auto'?detectKey(base):{root:+ks.split(':')[0],minor:ks.endsWith(':m')};
  const scale=[0,2,4,5,7,9,11].map(x=>(x+key.root+(key.minor?3:0))%12);
  tri.forEach(c=>{c.rn=romanOf(c,key); c.strong=!Q[c.q][0].every(x=>scale.includes((c.root+x)%12));});
  let uLo=99,uHi=0,bLo=99,bHi=0; for(const x of mid){uLo=Math.min(uLo,...x.upper); uHi=Math.max(uHi,...x.upper); bLo=Math.min(bLo,x.bass); bHi=Math.max(bHi,x.bass);}
  const startAt=Math.min(n-1,Math.max(0,curVideo&&curVideo.startAt!==undefined?curVideo.startAt:(n>1?1:0)));
  const lead=curVideo&&curVideo.lead!==undefined?curVideo.lead:0.26;
  const vs=cycle+starts[startAt]-lead;
  song={chords:tri,v,starts,end:t,cycle,n,vs,ve:vs+cycle,spb,key,sharps:p.sharps,uLo,uHi,bLo,bHi,dur:Math.max(0.4,Math.min(cycle/n,8)),kb:null,
    reveal:($('title').value||'').trim(), qSec:curVideo&&curVideo.qSec?curVideo.qSec:2.2};
  $('scrub').min=vs.toFixed(2); $('scrub').max=song.ve.toFixed(2);
  if(+$('scrub').value<vs||+$('scrub').value>song.ve) $('scrub').value=vs;
  paintStaticLayers();
}

// ---------- static layers: paper grain + faint staff guides ----------
const grain=document.createElement('canvas'); grain.width=W; grain.height=H;
(()=>{const g=grain.getContext('2d'), img=g.createImageData(W,H); let s=7;
  for(let i=0;i<img.data.length;i+=4){s=(s*1664525+1013904223)>>>0; const v=s>>>24; img.data[i]=img.data[i+1]=img.data[i+2]=v; img.data[i+3]=9;}
  g.putImageData(img,0,0);})();
const staff=document.createElement('canvas'); staff.width=W; staff.height=H;
function paintStaticLayers(){
  const g=staff.getContext('2d'); g.clearRect(0,0,W,H); if(!song) return;
  // one even, ruled grid over the whole staff: the upper voices' semitone step, repeated from top to bottom.
  // (before: a 28 px grid for the upper voices, a 7 px one for the bass and darker octave lines, which read as an
  // irregular grid once the video was compressed.) Integer y + 2 px width = every line covers exactly 2 pixel rows.
  const step=(L.UB[1]-L.UB[0])/(Math.max(song.uHi-song.uLo,9)+2), y0=yOf(1,song.uHi);
  g.fillStyle='rgba(43,37,32,0.045)';
  for(let y=y0-Math.floor((y0-L.staffTop)/step)*step;y<=L.staffBot+0.5;y+=step) g.fillRect(0,Math.round(y)-1,W,2);
}

// ---------- drawing helpers ----------
const cv=$('cv'), c=cv.getContext('2d');
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
function headerText(now){
  const t=now-song.vs, left=song.ve-now, hook=$('hook').value.trim(), q=$('question').value.trim();
  if(song.reveal&&left<=REVEAL) return {kind:'reveal',a:easeOut((REVEAL-left)/0.25),t:REVEAL-left};
  if(q&&left<=song.qSec) return {kind:'question',a:easeOut((song.qSec-left)/0.2),t:song.qSec-left,txt:q};
  if(hook&&t<2.45){const out=t>2.3?1-(t-2.3)/0.15:1; return {kind:'hook',a:out,t,txt:hook,drift:t>2.3?8*(t-2.3)/0.15:0};}
  return null;
}
function drawHeader(now,i){
  const ch=song.chords[i], since=Math.max(0,now-song.starts[i]), ht=headerText(now);
  c.save();
  // the hook is fully on screen from frame 0 (it is the thumbnail and the first thing read)
  if(ht&&ht.kind==='hook') drawRich(ht.txt,64,L.hook1,72,10,ht.a,ht.drift);
  else if(ht&&ht.kind==='question'){font(800,26); c.globalAlpha=ht.a; c.fillStyle=PINK; spaced('YOUR TURN',L.cx,L.kicker,5,'center'); drawRich(ht.txt,64,L.hook1+14,72,ht.t+0.3,ht.a,0);}
  else if(ht&&ht.kind==='reveal'){
    c.globalAlpha=ht.a; font(800,26); c.fillStyle=PINK; spaced('IT WAS',L.cx,L.kicker,6,'center');
    const parts=song.reveal.split(/\s+[—–-]\s+/); font(900,70); c.fillStyle=INK; c.textAlign='center';
    c.fillText(parts[0],L.cx,L.hook1+14+10*(1-ht.a)); if(parts[1]){font(600,38); c.fillStyle='rgba(43,37,32,.62)'; c.fillText(parts.slice(1).join(' — '),L.cx,L.hook1+70);}
  } else {
    // quiet meta line: section and key
    const t=now-song.vs, a=$('hook').value.trim()?easeOut((t-2.45)/0.3):1;
    c.globalAlpha=a; font(800,30); c.fillStyle='#6b625a';
    spaced([ch.section,keyName(song.key,song.sharps)].filter(Boolean).join('   ·   ').toUpperCase(),L.cx,L.hook1,3.5,'center');
  }
  // chord name: hard cut on the onset with a small settle; smaller while the hook text is up
  // the chord name steps down to 62% whenever header text is up, so two lines never touch it
  const t=now-song.vs, hookOn=!!$('hook').value.trim();
  let small=1;
  if(ht&&ht.kind!=='hook') small=1-0.38*easeOut(ht.t/0.3);
  else if(hookOn&&t<2.45) small=0.62;
  else if(hookOn&&t<2.75) small=0.62+0.38*easeOut((t-2.45)/0.3);
  const pop=1+0.06*(1-easeOut(since/0.16));
  c.globalAlpha=1; c.save(); c.translate(L.cx,L.name); c.scale(small*pop,small*pop); drawChord(ch,0,0,236,INK); c.restore();
  // roman numeral pill
  font(800,40); const rn=ch.rn, rw=c.measureText(rn).width+44;
  c.fillStyle=rgba(PINK,0.12); rr(L.cx-rw/2,L.numRow-38,rw,54,27); c.fill();
  c.fillStyle=PINK; c.textAlign='center'; c.fillText(rn,L.cx,L.numRow+3);
  c.restore();
}

// ---------- staff ----------
function drawStaff(now){
  const pps=SPACING/song.dur, i=idxAt(now), ch=song.chords[i], since=now-song.starts[i];
  c.save();
  // accent on chords outside the key: a breath of scale and a faint pink flash
  if(ch.strong&&since>=0&&since<0.12){const k=1+0.015*Math.sin(Math.PI*since/0.12); c.translate(L.cx,(L.staffTop+L.staffBot)/2); c.scale(k,k); c.translate(-L.cx,-(L.staffTop+L.staffBot)/2);}
  for(let j=1;j<song.starts.length;j++){
    const x=L.playX+(song.starts[j]-now)*pps; if(x<0||x>W) continue;
    c.strokeStyle='rgba(43,37,32,.05)'; c.lineWidth=2; c.beginPath(); c.moveTo(x,L.staffTop); c.lineTo(x,L.staffBot); c.stroke();
  }
  c.strokeStyle='rgba(43,37,32,.3)'; c.lineWidth=2; c.beginPath(); c.moveTo(L.playX,L.staffTop); c.lineTo(L.playX,L.staffBot); c.stroke();
  c.lineCap='round'; c.lineJoin='round';
  const stroke=pts=>{c.beginPath(); pts.forEach((p,j)=>j?c.lineTo(p[0],p[1]):c.moveTo(p[0],p[1])); c.stroke();};
  const paths=[];
  for(let k=5;k>=0;k--){const pts=[]; for(let x=-8;x<=W+8;x+=2) pts.push([x,yOf(k,pitchAt(k,now+(x-L.playX)/pps))]); paths.push({k,pts,split:pts.findIndex(p=>p[0]>=L.playX)});}
  for(const {k,pts,split} of paths){const f=c.createLinearGradient(L.playX,0,W,0); f.addColorStop(0,rgba(VOICE[k],.35)); f.addColorStop(1,rgba(VOICE[k],.05)); c.strokeStyle=f; c.lineWidth=4; stroke(pts.slice(split));}
  for(const {k,pts,split} of paths){
    const past=pts.slice(0,split+1);
    c.save(); c.translate(0,4); c.strokeStyle='rgba(43,37,32,.06)'; c.lineWidth=11; stroke(past); c.restore();
    const g=c.createLinearGradient(0,0,140,0); g.addColorStop(0,rgba(VOICE[k],0)); g.addColorStop(1,VOICE[k]);
    c.strokeStyle=g; c.lineWidth=9; stroke(past);
  }
  // dots, with a ring on the voices that just moved
  const cur=[], seen=new Set();
  for(let k=0;k<6;k++){const p=pitchAt(k,now), key=k===0?'b':Math.round(p*4); if(seen.has(key)) continue; seen.add(key); cur.push({k,p,y:yOf(k,p),col:VOICE[k],moved:i>0&&slotPitch(i,k)!==slotPitch(i-1,k)});}
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
    const nm=noteName(noteAt(d.k,now),ch); font(800,32); const pw=c.measureText(nm).width+34, ph=44;
    c.strokeStyle=rgba(d.col,.5); c.lineWidth=2; c.beginPath(); c.moveTo(L.playX+18,d.y); c.bezierCurveTo(L.playX+44,d.y,LX-26,d.ly,LX-4,d.ly); c.stroke();
    const s=d.moved&&since>=0&&since<0.22?0.85+0.15*easeOutBack(since/0.22):1;
    c.save(); c.translate(LX+pw/2,d.ly); c.scale(s,s); c.translate(-pw/2,0); // pop from the pill's centre, not its left edge
    c.fillStyle=d.col; rr(0,-ph/2,pw,ph,ph/2); c.fill();
    c.fillStyle='#fffdf8'; c.textAlign='left'; c.fillText(nm,17,11);
    c.restore();
    if(d.moved&&since>=0&&since<span){const dl=slotPitch(i,d.k)-slotPitch(i-1,d.k);
      c.globalAlpha=Math.min(1,(span-since)/0.3,since/0.1); font(800,32); c.fillStyle=d.col; c.textAlign='left';
      c.fillText((dl>0?'+':'−')+Math.abs(dl),LX+pw+14,d.ly+11); c.globalAlpha=1;}
  }
  c.restore();
}

// ---------- chord lane: previous, current, next ----------
function drawLane(now){
  const i=idxAt(now), since=now-song.starts[i], CW=250, STEP=275, y=L.laneY, h=L.laneH, dx=STEP*(1-easeOut(since/0.26));
  c.save(); c.beginPath(); c.rect(40,y-10,900,h+20); c.clip();
  for(let j=i-2;j<=i+2;j++){
    if(j<0||j>=song.chords.length) continue;
    const cx=L.cx+(j-i)*STEP+dx, x=cx-CW/2, cur=j===i, past=j<i;
    rr(x,y,CW,h,18);
    if(cur){c.fillStyle=INK; c.fill(); const en=song.starts[j+1]!==undefined?song.starts[j+1]:song.end, p=clamp((now-song.starts[j])/(en-song.starts[j]));
      c.save(); c.clip(); c.fillStyle='rgba(255,253,247,.10)'; c.fillRect(x,y,CW*p,h); c.restore();}
    else if(past){c.fillStyle='rgba(43,37,32,.06)'; c.fill();}
    else {c.strokeStyle='rgba(43,37,32,.22)'; c.lineWidth=2.5; c.stroke();}
    font(800,34); c.textAlign='center'; c.fillStyle=cur?'#f6efe3':past?'rgba(43,37,32,.32)':'rgba(43,37,32,.7)';
    c.fillText(song.chords[j].label,cx,y+h/2+12);
  }
  c.restore();
}

// ---------- piano ----------
function isBlack(m){return [1,3,6,8,10].includes(((m%12)+12)%12)}
function kbRange(){let mn=99,mx=0; for(const v of song.v){mn=Math.min(mn,v.bass); mx=Math.max(mx,v.upper[0]);} let lo=mn-1,hi=mx+1; while(isBlack(lo)) lo--; while(isBlack(hi)) hi++; return [lo,hi];}
function drawPiano(now){
  const [lo,hi]=song.kb||(song.kb=kbRange()), i=idxAt(now), since=now-song.starts[i];
  const whites=[]; for(let m=lo;m<=hi;m++) if(!isBlack(m)) whites.push(m);
  const ww=Math.min(56,(L.colR-L.colL)/whites.length), tw=ww*whites.length, x0=L.cx-tw/2, pad=16, y=L.kbY, h=L.kbH;
  const act=new Map(); for(let k=5;k>=0;k--) act.set(noteAt(k,now),VOICE[k]);
  const fresh=new Set(); if(i>0) for(let k=0;k<6;k++) if(slotPitch(i,k)!==slotPitch(i-1,k)) fresh.add(slotPitch(i,k));
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
function draw(now,forExport){
  c.globalAlpha=1; c.shadowColor='transparent'; drawBg();
  if(!song){font(700,44); c.fillStyle='rgba(43,37,32,.5)'; c.textAlign='center'; c.fillText('Type a progression',W/2,H/2); return;}
  const i=idxAt(now), since=now-song.starts[i];
  if(song.chords[i].strong&&since>=0&&since<0.1){c.fillStyle=rgba(PINK,0.03); c.fillRect(0,0,W,H);}
  drawHeader(now,i); drawStaff(now); drawLane(now); drawPiano(now);
  const handle=$('handle').value.trim();
  if(handle){c.save(); font(700,28); c.fillStyle='rgba(43,37,32,.6)'; c.textAlign='center'; c.fillText(handle,L.cx,L.handle); c.restore();}
}

// ---------- audio ----------
let ctx=null, comp=null, dry=null, sess=null, t0=0, playing=false;
function hz(m){return 440*Math.pow(2,(m-69)/12)}
function buildGraph(ac){
  const cp0=ac.createDynamicsCompressor(); cp0.threshold.value=-14; cp0.ratio.value=3; cp0.connect(ac.destination);
  // tame the low end before the compressor: low bass notes (B minor, C major) rumbled and made the compressor pump.
  // high-pass at 75 Hz + low shelf -9 dB under 140 Hz; the bass keeps its pitch through its harmonics.
  const hp=ac.createBiquadFilter(); hp.type='highpass'; hp.frequency.value=75; hp.Q.value=0.7;
  const ls=ac.createBiquadFilter(); ls.type='lowshelf'; ls.frequency.value=140; ls.gain.value=-9;
  hp.connect(ls); ls.connect(cp0); const cp=hp;
  const rev=ac.createConvolver(); const len=Math.floor(ac.sampleRate*2.6), buf=ac.createBuffer(2,len,ac.sampleRate);
  let seed=12345; const rnd=()=>{seed=(seed*1103515245+12345)&0x7fffffff; return seed/0x7fffffff;};
  for(let ch=0;ch<2;ch++){const d=buf.getChannelData(ch); for(let i=0;i<len;i++) d[i]=(rnd()*2-1)*Math.pow(1-i/len,2.6);}
  rev.buffer=buf; const wet=ac.createGain(); wet.gain.value=0.32; rev.connect(wet); wet.connect(cp);
  const dr=ac.createGain(); dr.gain.value=0.9; dr.connect(cp); dr.connect(rev);
  return {comp:cp,dry:dr};
}
function ensureAudio(){if(ctx) return; ctx=new (window.AudioContext||window.webkitAudioContext)(); const g=buildGraph(ctx); comp=g.comp; dry=g.dry;}
function pianoNote(f,t,end,out,lvl){
  const o1=ctx.createOscillator(); o1.type='sine'; o1.frequency.value=f;
  const o2=ctx.createOscillator(); o2.type='triangle'; o2.frequency.value=f*2.001;
  const g2=ctx.createGain(); g2.gain.value=0.18;
  const fl=ctx.createBiquadFilter(); fl.type='lowpass'; fl.frequency.value=Math.min(4500,f*6);
  const g=ctx.createGain(); g.gain.value=0; g.gain.setValueAtTime(0,t);
  g.gain.linearRampToValueAtTime(lvl,t+0.016); g.gain.setTargetAtTime(lvl*0.22,t+0.016,1.3); g.gain.setTargetAtTime(0,end,0.18);
  o1.connect(fl); o2.connect(g2); g2.connect(fl); fl.connect(g); g.connect(out);
  o1.start(t); o2.start(t); o1.stop(end+1); o2.stop(end+1);
}
function chordNotes(i){const v=song.v[i]; return [v.bass,...new Set(v.upper)];}
// soft glassy bell: a sine with a few quiet partials, instant attack, long gentle decay
function crystalNote(f,t,out,lvl){
  const g=ctx.createGain(); g.gain.setValueAtTime(0,t); g.gain.linearRampToValueAtTime(lvl,t+0.005); g.gain.setTargetAtTime(0,t+0.005,0.75);
  const fl=ctx.createBiquadFilter(); fl.type='lowpass'; fl.frequency.value=6500; fl.connect(g); g.connect(out);
  for(const [r,a,tau] of [[1,1,0],[2,0.2,0.4],[3.01,0.06,0.25],[4.17,0.03,0.08]]){
    const o=ctx.createOscillator(); o.type='sine'; o.frequency.value=f*r; const pg=ctx.createGain(); pg.gain.setValueAtTime(a,t); if(tau) pg.gain.setTargetAtTime(0,t,tau);
    o.connect(pg); pg.connect(fl); o.start(t); o.stop(t+4.5);
  }
}
// picked arpeggio under the pad: bass, then the chord tones up and down, one note per beat (6/8: one bar = one up-and-down)
function scheduleArp(S,n,abs){
  const lo=song.vs-4, hi=song.ve+1, step=song.spb;
  for(let i=0;i<n;i++){
    const end=i+1<n?S[i+1]:song.end; if(end<lo||S[i]>hi) continue;
    const v=song.v[i], b=v.bass<45?v.bass+12:v.bass, up=[...new Set(v.upper)].sort((a,c)=>a-c), L=[b,...up], k=L.length;
    const pat=k>=4?[0,1,2,3,2,1]:k===3?[0,1,2,1,2,1]:[0,1,0,1,0,1];
    let j=0; for(let t=S[i];t<end-1e-6;t+=step,j++){ if(t<lo||t>hi||late(t)) continue;
      const m=L[Math.min(pat[j%6],k-1)]; pianoNote(hz(m),abs(t),abs(t)+step*2.4,sess,j%6===0?0.12:0.095); }
  }
}
// crystal arpeggio over the upper voices, one note per beat, an octave up; only around the exported window to keep the node count low
function scheduleCrystal(S,n,abs){
  const lo=song.vs-4, hi=song.ve+1, step=song.spb;
  for(let i=0;i<n;i++){
    const end=i+1<n?S[i+1]:song.end; if(end<lo||S[i]>hi) continue;
    const up=[...new Set(song.v[i].upper)].sort((a,b)=>a-b).map(m=>m+12<=88?m+12:m), k=up.length;
    const pat=k>=4?[0,1,2,3,2,1]:k===3?[0,1,2,1,2,1]:[0,1,0,1,0,1];
    let b=0; for(let t=S[i];t<end-1e-6;t+=step,b++){ if(t<lo||t>hi||late(t)) continue;
      crystalNote(hz(up[Math.min(pat[b%6],k-1)]),abs(t),sess,b%6===0?0.034:0.024); }
  }
}
// notes that would start before the play head are skipped: the audio API plays past start times immediately,
// which piled every chord of the last seconds into one burst when Play started (live preview only)
function late(t){return t0+t<ctx.currentTime+0.005;}
// nostalgic omnichord (strumplate): each chord is swept upward like a harp, chord tones over about an octave and a half,
// soft plucked tones (sine + quiet overtones) with a natural decay, slow tape wow on everything.
// The sweep starts exactly on the chord change; long chords get a lighter second sweep on beat 3. The gliding pad holds the chord underneath.
function omniPluck(f,t,out,lvl,wow){
  const g=ctx.createGain(); g.gain.setValueAtTime(0,t); g.gain.linearRampToValueAtTime(lvl,t+0.004);
  const tau=Math.max(0.35,Math.min(1.1,0.9*Math.pow(440/f,0.45))); g.gain.setTargetAtTime(0,t+0.004,tau);
  const fl=ctx.createBiquadFilter(); fl.type='lowpass'; fl.frequency.value=Math.min(5200,f*7); fl.Q.value=0.4;
  fl.connect(g); g.connect(out);
  for(const [r,a,type] of [[1,1,'sine'],[2,0.22,'sine'],[1,0.12,'triangle'],[3,0.05,'sine']]){
    const o=ctx.createOscillator(); o.type=type; o.frequency.value=f*r; wow.connect(o.detune);
    const pg=ctx.createGain(); pg.gain.value=a; o.connect(pg); pg.connect(fl); o.start(t); o.stop(t+tau*6+0.1);
  }
}
function scheduleOmni(S,n,abs){
  const lo=song.vs-4, hi=song.ve+1, beat=song.spb;
  // tape wow (0.55 Hz, about 5 cents) + a little flutter (6 Hz, about 1.5 cents)
  const wow=ctx.createGain(); wow.gain.value=1;
  const w1=ctx.createOscillator(); w1.frequency.value=0.55; const w1g=ctx.createGain(); w1g.gain.value=5; w1.connect(w1g); w1g.connect(wow);
  const w2=ctx.createOscillator(); w2.frequency.value=6; const w2g=ctx.createGain(); w2g.gain.value=1.5; w2.connect(w2g); w2g.connect(wow);
  const ws=Math.max(0,ctx.currentTime), we=abs(song.end)+6; w1.start(ws); w2.start(ws); w1.stop(we); w2.stop(we);
  const sweep=(i,t,lvl)=>{
    if(t<lo||t>hi||late(t)) return;
    // a quick finger sweep across the strumplate: chord tones over two octaves, low to high, about 40 ms apart
    // (≈ 0.35 s for the whole sweep), so it is heard as a glissando, not as a block chord
    const v=song.v[i], pcs=new Set([v.bass,...v.upper].map(m=>((m%12)+12)%12)), base=Math.min(...v.upper)-5, notes=[];
    for(let m=base;m<=base+26&&notes.length<9;m++) if(pcs.has(((m%12)+12)%12)) notes.push(m);
    notes.forEach((m,k)=>omniPluck(hz(m),abs(t)+k*0.042,sess,lvl*(0.85+0.15*k/(notes.length-1||1)),wow));
  };
  for(let i=0;i<n;i++){
    const end=i+1<n?S[i+1]:song.end, len=end-S[i];
    sweep(i,S[i],0.024);
    if(len>=4*beat-1e-6) sweep(i,S[i]+2*beat,0.014);
  }
}
function schedule(mode){
  // times before the start of the context (chords already behind the play head) are clamped to 0: the audio API refuses negative times
  const S=song.starts, n=S.length, abs=t=>Math.max(0,t0+t), endAbs=abs(song.end);
  if(mode==='crystal') scheduleCrystal(S,n,abs);
  if(mode==='arp') scheduleArp(S,n,abs);
  if(mode==='omni') scheduleOmni(S,n,abs);
  if(mode==='piano'||mode==='both'){
    const lvl=mode==='piano'?0.075:0.06;
    for(let i=0;i<n;i++) chordNotes(i).forEach((m,o)=>{
      if(i>0&&chordNotes(i-1).includes(m)) return; // a held note keeps ringing
      let j=i+1; while(j<n&&chordNotes(j).includes(m)) j++;
      pianoNote(hz(m),abs(S[i])+o*0.012,j<n?abs(S[j]):endAbs+1.5,sess,m<52?lvl*1.1:lvl);
    });
  }
  if(mode!=='piano'){
    const lvl=mode==='pad'||mode==='arp'?0.07:mode==='omni'?0.06:0.04;
    for(let k=0;k<6;k++){
      const o1=ctx.createOscillator(), o2=ctx.createOscillator(); o1.type='triangle'; o2.type='sine'; o2.detune.value=7;
      const fl=ctx.createBiquadFilter(); fl.type='lowpass'; fl.frequency.value=k===0?1400:2200;
      const g=ctx.createGain(); g.gain.value=0; g.gain.setValueAtTime(0,ctx.currentTime);
      for(const o of [o1,o2]){
        o.frequency.setValueAtTime(hz(slotPitch(0,k)),Math.max(0,abs(S[0])-0.1));
        for(let i=1;i<n;i++){const gl=glideOf(i); o.frequency.setValueAtTime(hz(slotPitch(i-1,k)),abs(S[i]-gl)); o.frequency.exponentialRampToValueAtTime(hz(slotPitch(i,k)),abs(S[i]));}
      }
      for(let i=0;i<n;i++){
        let dup=false; for(let j=0;j<k;j++) if(slotPitch(i,j)===slotPitch(i,k)) dup=true;
        const Lv=dup?0:(k===0?lvl*1.05:lvl), gl=i?glideOf(i):0;
        g.gain.setTargetAtTime(Lv,abs(S[i]-gl),i?Math.max(0.08,gl/3):0.12);
      }
      g.gain.setTargetAtTime(0,endAbs,0.08);
      o1.connect(fl); o2.connect(fl); fl.connect(g); g.connect(sess);
      const st=Math.max(0,abs(S[0])-0.1); o1.start(st); o2.start(st); o1.stop(endAbs+4); o2.stop(endAbs+4);
    }
  }
}
let playFrom=0;
function play(from){
  playFrom=from===undefined?(song?song.vs:0):from;
  if(!song) return; ensureAudio(); if(ctx.state!=='running') ctx.resume();
  stopAudio(); sess=ctx.createGain(); sess.connect(dry);
  t0=ctx.currentTime+0.15-playFrom;
  try{schedule($('sound').value);}catch(e){$('status').textContent='Play failed ('+(e&&e.message||e)+').'; stopAudio(); return;}
  playing=true; $('status').textContent='';
}
function stopAudio(){if(sess){const s=sess; s.gain.setTargetAtTime(0,ctx.currentTime,0.04); setTimeout(()=>{try{s.disconnect()}catch(e){}},600); sess=null;} playing=false;}

// ---------- export: frame by frame, constant 30 fps, H.264 + AAC (Opus only where AAC is missing) ----------
let rec=null, chunks=[], outBlob=null, outExt='mp4', exporting=false;
async function renderAudioOffline(total,pre){
  const sr=48000, oac=new OfflineAudioContext(2,Math.ceil(sr*total),sr), save={ctx,comp,dry,sess,t0};
  try{ctx=oac; const g=buildGraph(oac); comp=g.comp; dry=g.dry; sess=oac.createGain(); sess.connect(dry); t0=pre; schedule($('sound').value);}
  finally{ctx=save.ctx; comp=save.comp; dry=save.dry; sess=save.sess; t0=save.t0;}
  return await oac.startRendering();
}
async function pickVideoConfig(){
  for(const codec of ['avc1.4d0029','avc1.4d0028','avc1.640028','avc1.42e028']){
    const cfg={codec,width:W,height:H,bitrate:8_000_000,framerate:30,avc:{format:'avc'}};
    try{if((await VideoEncoder.isConfigSupported(cfg)).supported) return cfg;}catch(e){}
  }
  return null;
}
async function pickAudioConfig(){
  if(!window.AudioEncoder) return null;
  for(const [codec,mux] of [['mp4a.40.2','aac'],['opus','opus']]){
    const cfg={codec,sampleRate:48000,numberOfChannels:2,bitrate:160000}; if(mux==='aac') cfg.aac={format:'aac'};
    try{if((await AudioEncoder.isConfigSupported(cfg)).supported) return {cfg,mux};}catch(e){}
  }
  return null;
}
async function startExport(){
  if(!song||exporting) return;
  const vcfg=window.VideoEncoder&&window.Mp4Muxer?await pickVideoConfig():null, ainfo=vcfg?await pickAudioConfig():null;
  if(!vcfg||!ainfo){$('status').textContent='This browser can’t render frame by frame; recording in real time instead…'; return startRealtimeExport();}
  stopAudio(); exporting=true; $('rec').disabled=true;
  try{
    // the window [vs, ve] is one full cycle taken from the middle of the unrolled timeline: frame N wraps exactly onto frame 0
    const fps=30, vs=song.vs, apad=0.12, pre=apad, total=apad+song.ve+0.3, N=Math.round(song.cycle*fps), skip=Math.round((apad+vs)*48000);
    $('status').textContent='Rendering audio…';
    const ab=await renderAudioOffline(total,pre);
    const muxer=new Mp4Muxer.Muxer({target:new Mp4Muxer.ArrayBufferTarget(),video:{codec:'avc',width:W,height:H,frameRate:fps},
      audio:{codec:ainfo.mux,numberOfChannels:2,sampleRate:48000},fastStart:'in-memory',firstTimestampBehavior:'offset'});
    let fail=null;
    let aChunks=0, gotDesc=false;
    const ASC=new Uint8Array([0x11,0x90]); // AAC-LC, 48 kHz, stereo — used when the browser gives no config
    const ae=new AudioEncoder({output:(ch,m)=>{
      aChunks++;
      // Safari hands over a whole ES descriptor instead of the 2-byte AAC config, which makes the track unreadable: always use our own
      if(ainfo.mux==='aac'&&!gotDesc){ m={decoderConfig:{codec:'mp4a.40.2',sampleRate:48000,numberOfChannels:2,description:ASC}}; gotDesc=true; }
      muxer.addAudioChunk(ch,m);
    },error:e=>{fail=e}}); ae.configure(ainfo.cfg);
    let planar=true;
    const Lc=ab.getChannelData(0), Rc=ab.getChannelData(1), step=4800;
    const endS=skip+Math.round(song.cycle*48000);
    for(let i=skip;i<endS;i+=step){
      const n=Math.min(step,endS-i), ts=Math.round((i-skip)/48000*1e6); let ad;
      if(planar){try{const data=new Float32Array(n*2); data.set(Lc.subarray(i,i+n),0); data.set(Rc.subarray(i,i+n),n);
        ad=new AudioData({format:'f32-planar',sampleRate:48000,numberOfFrames:n,numberOfChannels:2,timestamp:ts,data});}catch(e){planar=false;}}
      if(!planar){const data=new Float32Array(n*2); for(let q=0;q<n;q++){data[2*q]=Lc[i+q]; data[2*q+1]=Rc[i+q];}
        ad=new AudioData({format:'f32',sampleRate:48000,numberOfFrames:n,numberOfChannels:2,timestamp:ts,data});}
      ae.encode(ad); ad.close();
    }
    await ae.flush(); ae.close(); if(fail) throw fail; if(!aChunks) throw new Error('no audio was encoded');
    const ve=new VideoEncoder({output:(ch,m)=>muxer.addVideoChunk(ch,m),error:e=>{fail=e}}); ve.configure(vcfg);
    for(let f=0;f<N;f++){
      if(fail) throw fail;
      draw(vs+f/fps,true);
      const vf=new VideoFrame(cv,{timestamp:Math.round(f*1e6/fps),duration:Math.round(1e6/fps)}); ve.encode(vf,{keyFrame:f%60===0}); vf.close();
      while(ve.encodeQueueSize>6) await new Promise(r=>setTimeout(r,2));
      if(f%15===0){$('status').textContent=`Rendering video… ${Math.round(f/N*100)}%`; await new Promise(r=>setTimeout(r,0));}
    }
    await ve.flush(); ve.close(); if(fail) throw fail; muxer.finalize();
    const buf=muxer.target.buffer;
    $('status').textContent='Checking the sound…';
    const peak=await audioPeak(buf.slice(0));
    if(peak===null||peak<1e-4) throw new Error('the sound track could not be read back');
    outBlob=new Blob([buf],{type:'video/mp4'}); outExt='mp4';
    showOutput(`MP4 · 1080×1920 · 30 fps · sound ${ainfo.mux==='aac'?'AAC':'Opus'}${peak===null?'':' checked'}`);
  }catch(e){exporting=false; $('status').textContent='Export failed ('+(e&&e.message||e)+'). Recording in real time instead…'; return startRealtimeExport();}
  finally{exporting=false; $('rec').disabled=false;}
}
async function audioPeak(arrayBuf){
  // decode the finished MP4's sound track and return its loudest sample (null if this browser can't decode it here)
  try{ const ab=await ctx.decodeAudioData(arrayBuf); let p=0; for(let ch=0;ch<ab.numberOfChannels;ch++){const d=ab.getChannelData(ch); for(let i=0;i<d.length;i+=7){const v=Math.abs(d[i]); if(v>p) p=v;}} return p; }
  catch(e){ return null; }
}
function startRealtimeExport(){
  if(!window.MediaRecorder||!cv.captureStream){$('status').textContent='This browser can’t record video.'; return;}
  ensureAudio(); if(ctx.state!=='running') ctx.resume();
  const dest=ctx.createMediaStreamDestination(); comp.connect(dest);
  const stream=new MediaStream([...cv.captureStream(30).getVideoTracks(),...dest.stream.getAudioTracks()]);
  const mime=['video/mp4;codecs=avc1.42E01E,mp4a.40.2','video/mp4','video/webm'].find(m=>MediaRecorder.isTypeSupported&&MediaRecorder.isTypeSupported(m))||'';
  rec=new MediaRecorder(stream,mime?{mimeType:mime,videoBitsPerSecond:8e6}:{}); chunks=[];
  rec.ondataavailable=e=>{if(e.data&&e.data.size) chunks.push(e.data)};
  rec.onstop=()=>{try{comp.disconnect(dest)}catch(e){} outBlob=new Blob(chunks,{type:rec.mimeType||'video/webm'}); outExt=(rec.mimeType||'').includes('mp4')?'mp4':'webm'; rec=null; $('rec').disabled=false; showOutput('real-time recording');};
  rec.start(500); $('rec').disabled=true; play(song.vs);
  $('status').textContent='Recording… keep this page open until the end.';
}
function showOutput(desc){
  $('outVid').src=URL.createObjectURL(outBlob); $('outBox').style.display='grid';
  $('status').textContent=`Video ready · ${(outBlob.size/1048576).toFixed(1)} MB · ${desc}.`;
}



// ---------- examples: built-in progressions from plan.js ----------
/*PLAN*/
let curVideo=null;

// ---------- Studio UI: pick (example) → check (preview + sound) → export ----------
let curSource=null;           // {kind:'plan',i} | null (custom)
function setHead(title,sub){$('pickTitle').textContent=title; $('pickSub').textContent=sub;}
function clearOutput(){outBlob=null; $('outBox').style.display='none'; $('outVid').removeAttribute('src'); $('doneInfo').textContent='';}

function loadVideo(i){
  if(rec||exporting) return; const w=PLAN[i]; curVideo=w||null; curSource=w?{kind:'plan',i}:null;
  if(!w) return;
  $('prog').value=w.prog; $('bpm').value=w.bpm; $('beats').value='4'; $('keysel').value=w.key;
  $('title').value=''; $('hook').value=w.hook; $('question').value=w.q; $('sound').value=w.sound||'pad'; $('glide').value='0.26';
  setHead(w.name,'Example');
  stopAudio(); buildSong(); if(song) $('scrub').value=song.vs;
}

// ---------- sheets (modal bottom sheets: pick, result) ----------
let sheetFrom=null;
function openSheet(id){
  const s=$(id); if(!s.hidden) return; sheetFrom=document.activeElement; stopAudio();
  s.hidden=false; document.body.classList.add('lock'); s.querySelector('.close').focus({preventScroll:true});
}
function closeSheets(){
  let any=false; document.querySelectorAll('.sheet').forEach(s=>{if(!s.hidden){s.hidden=true; any=true;}});
  document.body.classList.remove('lock'); if(any&&sheetFrom&&sheetFrom.focus&&document.contains(sheetFrom)) sheetFrom.focus({preventScroll:true});
}
document.querySelectorAll('[data-close]').forEach(b=>b.addEventListener('click',closeSheets));
document.addEventListener('keydown',e=>{if(e.key==='Escape') closeSheets();});

// ---------- pick sheet ----------
function renderPlan(){
  const box=$('days'); box.textContent='';
  PLAN.forEach((w,i)=>{
    const el=document.createElement('button'); el.className='item'; el.type='button';
    el.setAttribute('aria-current',String(curSource&&curSource.kind==='plan'&&curSource.i===i));
    const img=document.createElement('img'); img.className='thumb'; img.alt=''; if(THUMBS[i]) img.src=THUMBS[i];
    const t=document.createElement('span'); t.className='t';
    const nm=document.createElement('b'); nm.textContent=w.name;
    const hk=document.createElement('span'); hk.className='hk'; hk.textContent=w.hook.replace(/\*/g,'');
    t.append(nm,hk); el.append(img,t);
    el.onclick=()=>pickPlan(i); box.appendChild(el);
  });
}
function openPick(){renderPlan(); openSheet('pick'); const cur=document.querySelector('#days [aria-current="true"]'); if(cur) cur.scrollIntoView({block:'center'});}
$('pickBtn').onclick=()=>openPick();
function pickPlan(i){closeSheets(); clearOutput(); loadVideo(i);}


// plan list: thumbnails are drawn once at start-up with the Studio's own code
const THUMBS=[]; let planBuilt=false;
function makeThumbs(){
  const keep=curVideo?PLAN.indexOf(curVideo):-1;
  PLAN.forEach((w,i)=>{
    loadVideo(i); if(!song){THUMBS[i]=''; return;} draw(song.vs+0.9,true);
    const tc=document.createElement('canvas'); tc.width=270; tc.height=480; tc.getContext('2d').drawImage(cv,0,0,270,480);
    THUMBS[i]=tc.toDataURL('image/jpeg',0.8);
  });
  if(keep>=0) loadVideo(keep);
}


// ---------- header, advanced, transport ----------
$('advBtn').onclick=()=>{const open=$('adv').hidden; $('adv').hidden=!open; $('advBtn').setAttribute('aria-expanded',String(open));};
(()=>{const ks=$('keysel'); for(let r=0;r<12;r++) for(const m of [false,true]){const o=document.createElement('option'); o.value=r+(m?':m':''); o.textContent=FLAT[r]+(m?' minor':' major'); ks.appendChild(o);}})();
const rebuild=()=>{if(!rec&&!exporting){stopAudio(); buildSong();}};
// typing in the progression makes it a custom video (no preset start point or question timing)
let tm=null; $('prog').addEventListener('input',()=>{curVideo=null; curSource=null; $('pickSub').textContent='Edited · custom chords'; clearTimeout(tm); tm=setTimeout(rebuild,450);});
let tb=null; $('bpm').addEventListener('input',()=>{clearTimeout(tb); tb=setTimeout(rebuild,450);});
['beats','keysel','glide','sound'].forEach(id=>$(id).addEventListener('change',rebuild));
$('title').addEventListener('input',()=>{if(song) song.reveal=$('title').value.trim();});
$('scrub').addEventListener('input',()=>{if(playing&&!rec) stopAudio();});
$('play').onclick=()=>{if(rec||exporting) return; if(playing) stopAudio(); else if(song) play(song.vs);};
$('rec').onclick=()=>{ensureAudio(); try{ctx.resume();}catch(e){} startExport();};

// ---------- export result: save and share ----------
$('openDone').onclick=()=>openSheet('done');
const outName=()=>(curVideo?curVideo.file:'progression')+'.'+outExt;
$('dl').onclick=async()=>{
  if(!outBlob) return;
  const a=document.createElement('a'); a.href=$('outVid').src; a.download=outName(); document.body.appendChild(a); a.click(); a.remove();
  $('doneInfo').textContent='Saving… if nothing happens, press and hold the video and choose Save.';
};
$('shareBtn').onclick=async()=>{
  if(!outBlob) return;
  try{await navigator.share({files:[new File([outBlob],outName(),{type:outBlob.type})],title:'Chord progression'});}
  catch(e){if(e&&e.name!=='AbortError') $('doneInfo').textContent='Sharing is not available here: use Save video.';}
};
const _showOutput=showOutput;
showOutput=function(desc){
  _showOutput(desc); $('doneInfo').textContent=$('status').textContent;
  let canShare=false; try{canShare=!!(navigator.canShare&&navigator.canShare({files:[new File([outBlob],outName(),{type:outBlob.type})]}));}catch(e){}
  $('shareBtn').hidden=!canShare; openSheet('done');
};

// ---------- keeps the controls in step with what the Studio is doing ----------
const ui={};
function setUI(k,v,fn){if(ui[k]!==v){ui[k]=v; fn(v);}}
function syncUI(){
  const busy=!!(rec||exporting);
  setUI('play',busy?'x':playing?'stop':'play',v=>{$('play').innerHTML=v==='stop'?'<span class="ico">■</span> Stop':'<span class="ico">▶</span> Play'; $('play').disabled=v==='x';});
  setUI('rec',busy,v=>{$('rec').textContent=v?'Exporting…':'Export MP4'; $('pickBtn').disabled=v; $('openDone').disabled=v;});
  setUI('prog',busy,v=>{$('progress').hidden=!v;});
  if(busy){const m=/(\d+)%/.exec($('status').textContent); setUI('pct',m?+m[1]:-1,v=>{$('progress').classList.toggle('wait',v<0); $('progressBar').style.width=v<0?'8%':Math.max(4,v)+'%';});}
  setUI('out',!!outBlob,v=>{$('openDone').hidden=!v;});
}

function loop(){
  syncUI();
  if(!exporting){
    let t=playing?ctx.currentTime-t0:+$('scrub').value;
    if(song){
      if(playing&&t>song.ve){ if(rec){rec.stop(); stopAudio();} else {play(song.vs); t=song.vs;} }
      draw(t,!!rec); if(playing) $('scrub').value=t;
    } else draw(0,false);
  }
  requestAnimationFrame(loop);
}
loadVideo(0);
(document.fonts&&document.fonts.load?Promise.all([document.fonts.load('800 100px Inter'),document.fonts.load('900 100px Inter')]):Promise.resolve()).finally(()=>{paintStaticLayers(); makeThumbs(); loadVideo(0); requestAnimationFrame(loop);});
