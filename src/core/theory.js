// Music theory: chord parser, keyboard voicings with smooth voice leading, key detection, roman numerals.
// Pure functions, no DOM, no audio.
export const FLAT=['C','D♭','D','E♭','E','F','G♭','G','A♭','A','B♭','B'];
export const SHARP=['C','C♯','D','D♯','E','F','F♯','G','G♯','A','A♯','B'];
export const Q={
  '':[[0,4,7],[0,4]], 'm':[[0,3,7],[0,3]], '5':[[0,7],[0,7]],
  '7':[[0,4,7,10],[0,4,10]], 'maj7':[[0,4,7,11],[0,4,11]], 'm7':[[0,3,7,10],[0,3,10]],
  'mmaj7':[[0,3,7,11],[0,3,11]], '6':[[0,4,7,9],[0,4,9]], 'm6':[[0,3,7,9],[0,3,9]],
  'sus4':[[0,5,7],[0,5,7]], 'sus2':[[0,2,7],[0,2,7]], '7sus4':[[0,5,7,10],[0,5,10]],
  'dim':[[0,3,6],[0,3,6]], 'dim7':[[0,3,6,9],[0,3,6,9]], 'm7b5':[[0,3,6,10],[0,3,6,10]],
  'aug':[[0,4,8],[0,4,8]], 'add9':[[0,2,4,7],[0,2,4]], 'madd9':[[0,2,3,7],[0,2,3]],
  '9':[[0,2,4,7,10],[0,2,4,10]], 'maj9':[[0,2,4,7,11],[0,2,4,11]], 'm9':[[0,2,3,7,10],[0,2,3,10]],
  '13':[[0,2,4,7,9,10],[0,4,9,10]]
};
export const QALIAS={'M':'','maj':'','min':'m','mi':'m','-':'m','M7':'maj7','Maj7':'maj7','ma7':'maj7','Δ':'maj7','Δ7':'maj7',
  'min7':'m7','mi7':'m7','-7':'m7','mM7':'mmaj7','m(maj7)':'mmaj7','min6':'m6','-6':'m6','sus':'sus4','7sus':'7sus4',
  '2':'sus2','°':'dim','o':'dim','°7':'dim7','o7':'dim7','ø':'m7b5','ø7':'m7b5','m7-5':'m7b5','-7b5':'m7b5','+':'aug',
  'add2':'add9','madd2':'madd9','m(add9)':'madd9','maj13':'13','7(13)':'13'};
export const QDISP={'':'','m':'m','5':'5','7':'7','maj7':'maj7','m7':'m7','mmaj7':'m(maj7)','6':'6','m6':'m6','sus4':'sus4',
  'sus2':'sus2','7sus4':'7sus4','dim':'dim','dim7':'dim7','m7b5':'m7♭5','aug':'aug','add9':'add9','madd9':'m(add9)',
  '9':'9','maj9':'maj9','m9':'m9','13':'13'};
export const MINORISH=new Set(['m','m7','m6','m9','madd9','mmaj7','dim','dim7','m7b5']);
export const LETTER={C:0,D:2,E:4,F:5,G:7,A:9,B:11};
export function accVal(a){return (a==='#'||a==='♯')?1:(a==='b'||a==='♭')?-1:0}
export function accSym(a){return (a==='#'||a==='♯')?'♯':(a==='b'||a==='♭')?'♭':''}
export function normQ(s){s=s.replace(/♭/g,'b').replace(/♯/g,'#').trim();if(Object.hasOwn(Q,s))return s;if(Object.hasOwn(QALIAS,s))return QALIAS[s];return null}
export function makeChord(letter,acc,q,slashTxt){
  const root=(LETTER[letter]+accVal(acc)+12)%12; let bass=root;
  if(slashTxt){bass=(LETTER[slashTxt[0]]+accVal(slashTxt.slice(1))+12)%12;}
  return {root,q,bass,letter,acc:accSym(acc),qd:QDISP[q],slash:slashTxt?slashTxt[0]+accSym(slashTxt.slice(1)):'',
    label:letter+accSym(acc)+QDISP[q]+(slashTxt?'/'+slashTxt[0]+accSym(slashTxt.slice(1)):'')};
}
export function parseChord(s){
  s=s.trim(); if(!s) return null;
  s=s[0].toUpperCase()+s.slice(1);
  const m=s.match(/^([A-G])([#b♯♭]?)([^/]*)(?:\/([A-Ga-g])([#b♯♭]?))?$/);
  if(!m) return null;
  const q=normQ(m[3]); if(q===null) return null;
  return makeChord(m[1],m[2],q,m[4]?m[4].toUpperCase()+(m[5]||''):'');
}
export const MAX_CHORDS=512, MAX_REPEAT=64, MAX_EXPANDED_CHARS=20000;
export const MSG_TOO_BIG='This progression is too long: the repeats expand to more than '+MAX_CHORDS+' chords. Shorten it or use fewer repeats.';
/** Thrown when repeats would expand beyond a sane size. The message is written for the person using the app. */
export class ProgressionError extends Error {}
// Section names "[...]" and lyrics "..." are protected while repeats expand, so "(soft)x2" inside a name stays text.
export function expandRepeats(text){
  const kept=[]; text=String(text).replace(/[]/g,' ');
  text=text.replace(/"[^"]*"|\[[^\]]*\]/g,m=>{kept.push(m); return ''+(kept.length-1)+'';});
  let prev;
  do{prev=text; text=text.replace(/\(([^()]*)\)\s*[x×*](\d+)/g,(_,body,n)=>{
    const k=Math.min(MAX_REPEAT,+n); if(body.length*k>MAX_EXPANDED_CHARS) throw new ProgressionError(MSG_TOO_BIG);
    return Array(k).fill(body).join(' ');});
    if(text.length>MAX_EXPANDED_CHARS) throw new ProgressionError(MSG_TOO_BIG);
  }while(text!==prev);
  return text.replace(/[()]/g,' ').replace(/(\d+)/g,(_,i)=>kept[+i]);
}
/** On a progression that is too large, chords is empty and `error` says why (it is also put in `bad`).
 * @returns {{chords:any[], bad:string[], sharps:boolean, error?:string}} */
export function parseProgression(text){
  text=String(text);
  let expanded;
  try{expanded=expandRepeats(text);}catch(e){if(e instanceof ProgressionError) return {chords:[],bad:['(too many repeats)'],sharps:false,error:e.message}; throw e;}
  const toks=expanded.match(/"[^"]*"|\[[^\]]*\]|\[[^\s]*|(?:[^\s|,]|(?<=:\d),(?=\d))+/g)||[]; const out=[], bad=[];
  let section='', lyric=null, secStart=true;
  for(const t of toks){
    if(t[0]==='"'){lyric=t.slice(1,-1).trim(); continue;}
    if(t[0]==='['){ if(t[t.length-1]!==']'){bad.push(t); continue;} section=t.slice(1,-1).trim(); secStart=true; continue;}
    let beats=null, body=t; const mm=t.match(/^(.+?):(\d+(?:[.,]\d+)?)$/);
    if(mm){body=mm[1]; beats=Math.max(0.25,parseFloat(mm[2].replace(',','.')));}
    const c=parseChord(body);
    if(c){c.beats=beats; c.section=section; c.secStart=secStart; secStart=false; c.lyric=lyric; lyric=null; out.push(c);} else bad.push(t);
  }
  if(out.length>MAX_CHORDS) return {chords:[],bad:['(too many chords)'],sharps:false,error:MSG_TOO_BIG};
  return {chords:out,bad,sharps:/[#♯]/.test(text)};
}
export function chordToText(c){
  const acc=c.acc==='♭'?'b':c.acc==='♯'?'#':'';
  const sl=c.slash?'/'+c.slash.replace('♭','b').replace('♯','#'):'';
  return c.letter+acc+c.q+sl+(c.beats?':'+c.beats:'');
}
// ---- keyboard voicings ----
export function upperIntervals(q){
  const [all,req]=Q[q]; if(q==='5') return [0,7,12];
  if(all.length>=5){let iv=all.filter(x=>x!==7); if(iv.length>4) iv=req.slice(0,4); return iv;}
  return all;
}
const VOICE_TOP=[62,81,71];
export function keyboardVoicings(ch){
  const iv=upperIntervals(ch.q), pcs=iv.map(i=>(ch.root+i)%12), k=pcs.length, out=[];
  const basses=[]; for(let b=36;b<=50;b++) if(b%12===ch.bass) basses.push(b);
  const uppers=[];
  for(let r=0;r<k;r++){
    const order=pcs.slice(r).concat(pcs.slice(0,r));
    for(let start=50;start<=71;start++){
      if(start%12!==order[0]) continue;
      const notes=[start];
      for(let j=1;j<k;j++){let m=notes[j-1]+1; while(m%12!==order[j]) m++; notes.push(m);}
      if(ch.q==='5') notes[2]=notes[0]+12;
      uppers.push({n:notes.slice(),v:0});
      if(k===4){const d=notes.slice(); d[2]-=12; d.sort((a,b)=>a-b); uppers.push({n:d,v:0.25});}
      if(k===3&&ch.q!=='5'){const d=notes.slice(); d[1]+=12; d.sort((a,b)=>a-b); uppers.push({n:d,v:0.3});}
    }
  }
  for(const u of uppers){
    const lo=u.n[0], top=u.n[u.n.length-1]; if(top<VOICE_TOP[0]||top>VOICE_TOP[1]||lo<50) continue;
    for(const b of basses){
      if(b>lo-3) continue;
      out.push({bass:b,upper:u.n.slice().sort((a,b)=>b-a),minF:0,cost:Math.abs(top-VOICE_TOP[2])*0.05+u.v+Math.abs(b-43)*0.04});
    }
  }
  return out;
}
export function blockVoicing(ch){
  const iv=upperIntervals(ch.q); let b=36; while(b%12!==ch.bass) b++;
  const r=60+((ch.root-60)%12+12)%12; const up=iv.map(i=>r+i);
  return {bass:b,upper:up.sort((a,b)=>b-a),minF:0,cost:0};
}
export function vlCost(a,b){
  let d=0;
  for(let k=0;k<5;k++){const pa=a.upper[Math.min(k,a.upper.length-1)], pb=b.upper[Math.min(k,b.upper.length-1)]; d+=Math.abs(pa-pb)*(k===0?1.3:1);}
  return d+0.2*Math.abs(a.bass-b.bass);
}
export function chooseVoicings(chords){
  const C=chords.map(ch=>keyboardVoicings(ch)); if(C.some(c=>!c.length)) return null;
  const W=0.6; let dp=C[0].map(v=>v.cost); const back=[];
  for(let i=1;i<C.length;i++){
    const nd=[], bk=[];
    for(const v of C[i]){let best=1e9,bi=0; for(let j=0;j<C[i-1].length;j++){const c=dp[j]+W*vlCost(C[i-1][j],v); if(c<best){best=c;bi=j;}} nd.push(best+v.cost); bk.push(bi);}
    dp=nd; back.push(bk);
  }
  let bi=dp.indexOf(Math.min(...dp)); const pick=new Array(C.length);
  for(let i=C.length-1;i>=0;i--){pick[i]=C[i][bi]; if(i>0) bi=back[i-1][bi];}
  return pick;
}
// ---- key + roman numerals ----
export const MAJ_SCALE=[0,2,4,5,7,9,11];
export function detectKey(chords){
  let best=null;
  for(let k=0;k<12;k++) for(const minor of [false,true]){
    const tonic=minor?(k+9)%12:k; // relative minor shares the scale
    let sc=0;
    chords.forEach((c,i)=>{const tones=Q[c.q][0].map(x=>(c.root+x)%12); sc+=1.5*tones.filter(t=>MAJ_SCALE.includes((t-k+12)%12)).length/tones.length; if(c.root===tonic){sc+=0.6; if(i===0) sc+=2.5; if(i===chords.length-1) sc+=1.5;}
      const nx=chords[i+1]; if(nx&&['7','9','13'].includes(c.q)&&c.root===(tonic+7)%12&&nx.root===tonic) sc+=2.5;
      if(minor&&c.root===tonic&&MINORISH.has(c.q)) sc+=0.8; if(!minor&&c.root===tonic&&!MINORISH.has(c.q)) sc+=0.8;});
    if(!best||sc>best.sc+1e-9) best={sc,root:tonic,minor};
  }
  return best;
}
export const ROMAN=['I','♭II','II','♭III','III','IV','♯IV','V','♭VI','VI','♭VII','VII'];
export const ROMAN_MIN=['i','♭ii','ii','♭iii','iii','iv','♯iv','v','♭vi','vi','♭vii','vii'];
export function romanOf(c,key){
  const deg=(c.root-key.root+12)%12;
  let num=MINORISH.has(c.q)?ROMAN_MIN[deg]:ROMAN[deg];
  if(key.minor){ // natural-minor spellings: ♭III, ♭VI, ♭VII are diatonic
    const mm={3:'III',8:'VI',10:'VII'}; if(mm[deg]) num=MINORISH.has(c.q)?mm[deg].toLowerCase():mm[deg];
    else if(deg===4||deg===9||deg===11) num='♯'+num; // raised III, VI, VII stay apart from the natural ones above
  }
  const suf={'7':'7','maj7':'maj7','m7':'7','6':'6','m6':'6','dim':'°','dim7':'°7','m7b5':'ø7','aug':'+','sus4':'sus4','sus2':'sus2','7sus4':'7sus4','9':'9','maj9':'maj9','m9':'9','13':'13','add9':'add9','madd9':'add9','mmaj7':'maj7','5':'5'}[c.q]||'';
  return num+suf;
}
export function keyName(key,sharps){const n=(sharps?SHARP:FLAT)[key.root]; return n+(key.minor?' minor':' major');}


