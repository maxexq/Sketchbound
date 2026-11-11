// @ts-nocheck
// Pencil art, ported from the prototype (tools/prototype.html). Strings of SVG, drawn by render.ts.
import { rig } from '@sticky/shared';
const { BONES, BMAP, ORDER, HOME, GROUND, GEAR, INK, PAPER, solve, norm, ELEMENTS, REACH, MUZ, WTYPE, wtype, POSES } = rig;
const SK=`stroke="${INK}" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"`;
const LN=`fill="none" stroke="${INK}" stroke-width="1.1" stroke-linecap="round"`;
// pencil tones: 0 paper, 1 light hatch, 2 dense hatch, 3 solid graphite. Template carries fill="@".
function tone(tpl,t){
  if(t===3)return tpl.replace('@',INK);
  const base=tpl.replace('@',PAPER);
  return t===0?base:base+tpl.replace('@',`url(#h${t})`);
}
const RS=(sw,k,px,py,s)=>`<g transform="rotate(${((sw||0)*k).toFixed(1)} ${px} ${py})">${s}</g>`; // secondary motion
const U=s=>`<g transform="rotate(90)">${s}</g>`;               // upright screen coords for spine
const UH=s=>`<g transform="rotate(90) translate(0 -22) scale(.7) translate(0 26)">${s}</g>`; // head-space art
const UW=s=>`<g transform="rotate(150)">${s}</g>`;             // wing art, upright at rest

const CAP=`<path d="M21,-40 Q8,-55 -8,-51 Q-24,-46 -25,-26 Q-14,-40 2,-41 Q12,-41 21,-40Z" fill="@" ${SK}/>`;
const HAIR={
  none:{th:'ไม่มี',f:()=>[]},
  spiky:{th:'ผมชี้',f:()=>[{bone:'head',layer:'over',svg:UH(tone(`<path d="M-22,-28 L-36,-34 L-25,-41 L-37,-55 L-19,-51 L-19,-70 L-5,-55 L4,-72 L9,-54 L24,-63 L19,-44 Q2,-52 -10,-42 Q-18,-36 -22,-28Z" fill="@" ${SK}/>`,3))}]},
  long:{th:'ผมยาว',f:sw=>[
    {bone:'head',layer:'back',svg:UH(RS(sw,.8,-12,-40,tone(`<path d="M-6,-50 Q-32,-48 -30,-18 Q-28,6 -42,34 Q-24,36 -10,20 Q-6,-8 -12,-30Z" fill="@" ${SK}/>`,2)+`<path d="M-22,-30 Q-22,0 -32,26 M-16,-24 Q-14,0 -20,22" ${LN}/>`))},
    {bone:'head',layer:'over',svg:UH(tone(CAP,3))}]},
  pony:{th:'หางม้า',f:sw=>[{bone:'head',layer:'over',svg:UH(
    RS(sw,.9,-22,-36,tone(`<path d="M-22,-40 Q-48,-48 -56,-22 Q-58,-6 -48,8 Q-45,-12 -36,-22 Q-28,-28 -22,-30Z" fill="@" ${SK}/>`,2))+tone(CAP,3)+tone(`<circle cx="-23" cy="-36" r="4.5" fill="@" ${SK}/>`,0))}]},
  kasa:{th:'หมวกงอบ',f:()=>[{bone:'head',layer:'over',svg:UH(tone(`<path d="M-44,-34 L0,-66 L44,-34 Q0,-25 -44,-34Z" fill="@" ${SK}/>`,3)+`<path d="M-3,-60 L-26,-36 M3,-59 L12,-34" fill="none" stroke="${PAPER}" stroke-width="1.6" stroke-linecap="round" opacity=".7"/>`)}]},
  mohawk:{th:'โมฮอว์ก',f:()=>[{bone:'head',layer:'over',svg:UH(tone(`<path d="M-14,-44 L-26,-60 L-10,-57 L-8,-76 L2,-59 L13,-71 L15,-50 Q2,-54 -14,-44Z" fill="@" ${SK}/>`,3))}]},
};

const both=(pat,svg,layer)=>['L','R'].map(s=>({bone:pat.replace('*',s),layer:layer||'over',svg}));
const cuff=(x,w,h,t)=>tone(`<rect x="${x}" y="${-h/2}" width="${w}" height="${h}" rx="2" fill="@" ${SK}/>`,t);
const greave=tone(`<path d="M28,-8 L74,-11.5 L78,-10 L78,9 L74,10 L28,7Z" fill="@" ${SK}/>`,0)+`<path d="M38,-8 L38,7 M30,0 L74,0" ${LN}/>`;
const OUTFIT={
  none:{th:'ไม่มี',f:()=>[]},
  armor:{th:'เกราะ',f:()=>[
    {bone:'spine',layer:'over',svg:U(tone(`<path d="M-18,-85 Q0,-90 18,-85 L14,-50 L7,-22 L-7,-22 L-14,-50Z" fill="@" ${SK}/>`,1)+`<path d="M0,-86 L0,-24 M-13,-62 Q0,-54 13,-62 M-9,-40 L9,-40" ${LN}/>`+tone(`<rect x="-8" y="-22" width="16" height="7" rx="1.5" fill="@" ${SK}/>`,3))},
    ...both('arm*_u',tone(`<ellipse cx="3" cy="0" rx="13" ry="9" fill="@" ${SK}/>`,1)+`<path d="M-6,-5 Q3,-1 -6,5" ${LN}/>`),
    ...both('arm*_l',cuff(20,26,10,0)+`<path d="M28,-5 L28,5 M38,-5 L38,5" ${LN}/>`),
    ...both('leg*_u',cuff(8,30,14,1)),
    ...both('leg*_l',greave),
  ]},
  robe:{th:'ชุดนักเวท',f:()=>[
    {bone:'spine',layer:'over',svg:U(tone(`<path d="M-16,-85 Q0,-89 16,-85 L24,44 Q0,50 -24,44Z" fill="@" ${SK}/>`,1)+`<path d="M0,-86 L0,46 M-10,-20 Q-14,10 -16,42 M10,-20 Q14,10 16,42" ${LN}/>`+tone(`<rect x="-10" y="-26" width="20" height="6" fill="@" ${SK}/>`,3))},
    ...both('arm*_u',cuff(-2,56,10,1)),
    ...both('arm*_l',tone(`<path d="M-2,-5 L44,-14 L44,14 L-2,5Z" fill="@" ${SK}/>`,1)+`<path d="M40,-12 L40,12" ${LN}/>`),
    {bone:'head',layer:'over',svg:UH(tone(`<path d="M-19,-45 Q-6,-74 -18,-106 Q12,-86 19,-45Z" fill="@" ${SK}/>`,2)+tone(`<ellipse cx="0" cy="-44" rx="36" ry="7.5" fill="@" ${SK}/>`,1))},
  ]},
  ninja:{th:'นินจา',f:sw=>[
    {bone:'spine',layer:'back',svg:U(RS(sw,.6,0,-78,tone(`<path d="M0,-84 Q-36,-88 -66,-68 L-60,-54 Q-30,-72 0,-70Z" fill="@" ${SK}/>`,2)))},
    {bone:'spine',layer:'over',svg:U(tone(`<path d="M-15,-84 Q0,-88 15,-84 L4,-52 L0,-30 L-4,-52Z" fill="@" ${SK}/>`,0)+`<path d="M-15,-84 L4,-52 M15,-84 L-4,-52" ${LN}/>`+tone(`<rect x="-7" y="-26" width="14" height="7" fill="@" ${SK}/>`,3))},
    ...both('arm*_l',cuff(22,26,8,0)+`<path d="M27,-4 L31,4 M33,-4 L37,4 M39,-4 L43,4" ${LN}/>`),
    ...both('leg*_l',tone(`<path d="M24,-7 L58,-9.5 L58,8.5 L24,6Z" fill="@" ${SK}/>`,0)+`<path d="M30,-7 L36,6 M40,-8 L46,7 M50,-9 L55,8" ${LN}/>`),
    {bone:'head',layer:'over',svg:UH(RS(sw,.8,-21,-34,`<path d="M-21,-34 Q-40,-36 -54,-18 M-21,-34 Q-36,-26 -42,-6" fill="none" stroke="${INK}" stroke-width="3.4" stroke-linecap="round"/>`)+tone(`<path d="M-22,-38 L22,-38 L22,-30 L-22,-30Z" fill="@" ${SK}/>`,0))},
  ]},
  scarf:{th:'ผ้าพันคอ',f:sw=>[
    {bone:'spine',layer:'back',svg:U(RS(sw,.7,0,-80,tone(`<path d="M0,-80 Q-34,-76 -58,-60 L-71,-66 L-68,-52 L-82,-50 Q-48,-54 0,-70Z" fill="@" ${SK}/>`,1)+tone(`<path d="M0,-87 Q-30,-98 -54,-90 L-64,-101 L-66,-86 L-80,-88 Q-50,-72 0,-77Z" fill="@" ${SK}/>`,0)))},
    {bone:'spine',layer:'over',svg:U(tone(`<path d="M-8,-90 Q0,-83 8,-90 L7,-75 Q0,-70 -7,-75Z" fill="@" ${SK}/>`,0))},
  ]},
  cape:{th:'ผ้าคลุม',f:sw=>[
    {bone:'spine',layer:'back',svg:U(RS(sw,1,2,-80,tone(`<path d="M5,-84 Q-48,-44 -52,40 Q-30,26 -10,34 Q-10,-30 5,-70Z" fill="@" ${SK}/>`,1)+`<path d="M-8,-66 Q-34,-30 -38,26 M-4,-56 Q-22,-20 -24,28" ${LN}/>`))},
    {bone:'spine',layer:'over',svg:U(tone(`<path d="M-16,-88 Q0,-80 16,-88 L14,-78 Q0,-72 -14,-78Z" fill="@" ${SK}/>`,0))},
    ...both('arm*_l',cuff(30,22,9,0)),
    ...both('leg*_l',greave),
  ]},
};

const wingPair=(d,ribs,t)=>{const w=tone(`<path d="${d}" fill="@" ${SK}/>`,t)+`<path d="${ribs}" ${LN}/>`;
  return UW(`<g transform="rotate(-20) scale(.84)" opacity=".8">${w}</g>${w}`);};
const WINGS={
  none:{th:'ไม่มี',f:()=>''},
  angel:{th:'ปีกนก',f:()=>wingPair('M0,0 Q-36,-66 -100,-62 Q-86,-46 -93,-28 Q-77,-24 -82,-5 Q-66,-3 -69,16 Q-52,15 -52,33 Q-30,30 0,13Z','M-20,-20 Q-54,-34 -86,-44 M-18,-7 Q-48,-12 -76,-13 M-14,6 Q-38,8 -60,10 M-30,-34 Q-60,-52 -90,-56',1)},
  bat:{th:'ปีกค้างคาว',f:()=>wingPair('M0,0 Q-26,-56 -96,-70 Q-86,-38 -104,-14 Q-84,-20 -72,0 Q-62,-10 -46,13 Q-36,4 -22,22 L0,13Z','M0,2 L-104,-14 M0,4 L-72,0 M0,6 L-46,13 M0,0 Q-40,-40 -96,-70',2)},
  fairy:{th:'ปีกแมลง',f:()=>wingPair('M0,0 Q-50,-78 -92,-66 Q-104,-40 -60,-14 Q-28,-2 0,6Z M0,6 Q-52,6 -70,26 Q-56,46 -26,30 Q-8,20 0,10Z','M0,2 Q-44,-36 -90,-62 M-4,4 Q-40,-14 -64,-18 M0,8 Q-36,16 -66,28',0)},
};

const shaft=(a,b)=>`<path d="M${a},0 L${b},0" fill="none" stroke="${INK}" stroke-width="2.6" stroke-linecap="round"/>`;
const WEAPON={
  none:{th:'ไม่มี',f:()=>''},
  katana:{th:'คาตานะ',f:()=>tone(`<path d="M13,-2.6 Q64,-5 116,-13 Q66,3 13,2.6Z" fill="@" ${SK}/>`,0)+`<path d="M18,0 Q60,-1 104,-9" ${LN}/>`+tone(`<rect x="-18" y="-2.8" width="27" height="5.6" rx="1.5" fill="@" ${SK}/>`,2)+tone(`<rect x="9" y="-6.5" width="4" height="13" rx="1.5" fill="@" ${SK}/>`,3)},
  spear:{th:'หอก',f:()=>shaft(-78,108)+tone(`<path d="M156,0 L114,-17 L122,-4 L104,-2 L104,2 L122,4 L114,17Z" fill="@" ${SK}/>`,2)+`<path d="M108,0 L150,0" ${LN}/>`+tone(`<rect x="94" y="-3.5" width="8" height="7" fill="@" ${SK}/>`,0)},
  staff:{th:'คทา',f:()=>shaft(-76,94)+`<path d="M94,0 Q98,-14 112,-14 M94,0 Q98,14 112,14" fill="none" stroke="${INK}" stroke-width="2.2" stroke-linecap="round"/>`+tone(`<circle cx="110" cy="0" r="9" fill="@" ${SK}/>`,1)+`<path d="M105,-3 Q110,-7 115,-3" ${LN}/>`},
  axe:{th:'ขวาน',f:()=>`<g transform="scale(1 -1)">`+shaft(-26,94)+tone(`<path d="M66,-2 Q68,-38 106,-42 Q92,-20 108,3 L88,-3Z" fill="@" ${SK}/>`,2)+`<path d="M74,-8 Q84,-24 100,-36" ${LN}/></g>`},
  gun:{th:'ปืน',f:()=>tone(`<path d="M-26,-1 L-26,9 L-18,9 L-8,3 L6,3 L8,9 L13,9 L12,3 L30,3 L30,0 L66,0 L66,-4 L-10,-4Z" fill="@" ${SK}/>`,3)+`<path d="M-4,-1.6 L58,-1.8" fill="none" stroke="${PAPER}" stroke-width="1.2" stroke-linecap="round" opacity=".7"/><path d="M60,-4 L60,-7" ${LN}/>`},
  scythe:{th:'เคียว',f:()=>`<g transform="scale(1 -1)">`+shaft(-46,124)+tone(`<path d="M112,4 Q146,-6 158,-56 Q160,-108 124,-150 Q140,-100 130,-58 Q122,-22 100,-8Z" fill="@" ${SK}/>`,3)+`<path d="M136,-20 Q150,-70 134,-128" fill="none" stroke="${PAPER}" stroke-width="1.6" stroke-linecap="round" opacity=".8"/>`+tone(`<path d="M104,-9 L98,4 L116,6Z" fill="@" ${SK}/>`,3)+`</g>`},
  great:{th:'ดาบยักษ์',f:()=>tone(`<path d="M13,-12 L116,-12 L136,0 L116,12 L13,12Z" fill="@" ${SK}/>`,1)+`<path d="M20,-5 L112,-5" ${LN}/>`+tone(`<circle cx="26" cy="4" r="4" fill="@" ${SK}/>`,0)+tone(`<rect x="-20" y="-2.6" width="28" height="5.2" rx="1.5" fill="@" ${SK}/>`,3)+tone(`<rect x="8" y="-15" width="5" height="30" rx="1.5" fill="@" ${SK}/>`,3)+tone(`<circle cx="-23" cy="0" r="4" fill="@" ${SK}/>`,0)},
  bow:{th:'ธนู',f:()=>`<path d="M0,-60 L0,60" ${LN}/><path d="M0,-60 Q42,0 0,60" fill="none" stroke="${INK}" stroke-width="3" stroke-linecap="round"/><path d="M0,-60 q-5,-3 -4,-8 M0,60 q-5,3 -4,8" ${LN}/>`},
};
const OFFHAND={
  none:{th:'ไม่มี',f:()=>''},
  shield:{th:'โล่',f:()=>tone(`<circle cx="4" cy="0" r="22" fill="@" ${SK}/>`,1)+`<circle cx="4" cy="0" r="16" ${LN}/>`+tone(`<circle cx="4" cy="0" r="6" fill="@" ${SK}/>`,3)},
  dagger:{th:'มีดสั้น',f:()=>tone(`<path d="M9,-3.5 L40,-3 L50,0 L40,3 L9,3.5Z" fill="@" ${SK}/>`,0)+tone(`<rect x="-10" y="-2.4" width="16" height="4.8" rx="1.2" fill="@" ${SK}/>`,2)+tone(`<rect x="6" y="-6" width="3.4" height="12" rx="1" fill="@" ${SK}/>`,3)},
};

function pieces(eq,sw){
  const P=[];
  P.push(...OUTFIT[eq.outfit].f(sw));
  P.push(...HAIR[eq.hair].f(sw));
  const w=WEAPON[eq.weapon].f(), o=OFFHAND[eq.offhand].f(), g=WINGS[eq.wings].f();
  if(g)P.push({bone:'wing',layer:'over',svg:g});
  const gs=x=>`<g transform="scale(${GEAR})">${x}</g>`;
  if(w)P.push({bone:'handR',layer:'under',svg:gs(w)});
  if(o)P.push({bone:'handL',layer:eq.offhand==='shield'?'over':'under',svg:gs(o)});
  return P;
}
// ---- figure: ink stick man ----
const limb=(len,w)=>`<path d="M0,0 L${len},0" fill="none" stroke="${INK}" stroke-width="${w}" stroke-linecap="round"/>`;
const HEADS={solid:{th:'ทึบ'},ring:{th:'โปร่ง'}}, EYES={on:{th:'มี'},off:{th:'ไม่มี'}};
const FG=`fill="none" stroke="${INK}" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"`;
const fingers=a=>`<path d="${a.map(f=>'M'+f.map(q=>q.join(',')).join(' L')).join(' ')}" ${FG}/>`;
const PALM=tone(`<path d="M-1,-3.1 L8.2,-4.3 Q10.6,0 9.6,4 L-1,3Z" fill="@" ${SK}/>`,3);
const FISTB=tone(`<path d="M-1,-3.1 L7,-5 Q12.4,-5.6 12.8,-1.2 L12.8,3 Q12.2,6.2 7,5.6 L-1,3Z" fill="@" ${SK}/>`,3)+`<path d="M9.2,-4.8 L9.4,5.2 M12.6,-1.6 L9.3,-1.6 M12.8,.9 L9.4,.9 M12.6,3.3 L9.4,3.3" ${LN}/>`;
const KN=[[9,-3.6],[9.5,-1.2],[9.6,1.2],[9.3,3.4]], TB=[3,-3.4];
const THUMB_IN=fingers([[TB,[8.5,-6.4],[12,-4]]]);
const HANDS={auto:{th:'อัตโนมัติ'},relax:{th:'ผ่อนคลาย'},open:{th:'กางนิ้ว'},fist:{th:'กำหมัด'},point:{th:'ชี้'},peace:{th:'ชูสองนิ้ว'},chop:{th:'สันมือ'},claw:{th:'กรงเล็บ'},grip:{th:'กำด้าม'}};
const HANDART={
  relax:fingers([[KN[0],[14,-3.8],[17,-1.4]],[KN[1],[14.6,-1],[17.4,1.5]],[KN[2],[14.2,1.9],[16.5,4.1]],[KN[3],[13,4.3],[14.8,6.3]],[TB,[7,-6.6],[11,-6]]])+PALM,
  open:fingers([[KN[0],[14,-6.6],[18.5,-8.8]],[KN[1],[15,-2.1],[20.4,-2.8]],[KN[2],[15,2.1],[19.8,3]],[KN[3],[13.5,5.8],[17,8]],[TB,[7,-8.2],[10,-11.4]]])+PALM,
  fist:FISTB+THUMB_IN,
  point:FISTB+THUMB_IN+fingers([[[9,-4],[15.5,-4.8],[22,-5]]]),
  peace:FISTB+THUMB_IN+fingers([[[9,-4],[15,-7.5],[21.5,-10.5]],[[9.6,-1],[16,-.4],[22.5,1.2]]]),
  chop:tone(`<path d="M-1,-3.1 L9,-4 L20.5,-2.6 Q22.6,0 20.5,2.4 L9.6,4 L-1,3Z" fill="@" ${SK}/>`,3)+`<path d="M9.6,-1.5 L20.4,-.7 M9.7,1 L20.4,.8" ${LN}/>`+fingers([[TB,[8,-6],[11.4,-4.7]]]),
  claw:fingers([[KN[0],[14,-7.6],[17,-4.4]],[KN[1],[15.8,-3.2],[18.6,.2]],[KN[2],[15.6,2.2],[17.8,5.4]],[KN[3],[13.4,6.6],[14.8,9.8]],[TB,[6.4,-8.8],[10.8,-8.2]]])+PALM,
  grip:tone(`<path d="M-3.6,-4.7 Q2,-6.7 7.2,-4.7 L7.2,4.7 Q2,6.7 -3.6,4.7Z" fill="@" ${SK}/>`,3)+`<path d="M-.9,-5.4 L-.9,5.4 M1.9,-5.9 L1.9,5.9 M4.6,-5.4 L4.6,5.4" ${LN}/>`,
};
function handPose(eq,side,auto){
  const v=eq['hand'+side]; if(v&&v!=='auto')return v;
  return eq[side==='R'?'weapon':'offhand']!=='none'?'grip':(auto||'relax');
}
function handArt(id,eq,auto){
  const k=handPose(eq,id==='handR'?'R':'L',auto);
  // free hands follow the forearm; a gripping hand follows the weapon axis
  return k==='grip'?HANDART.grip:`<g transform="rotate(${-BMAP[id].rest})">${HANDART[k]}</g>`;
}
function baseArt(id,eq,auto){
  switch(id){
    case 'root': case 'wing': return '';
    case 'spine': return `<path d="M0,-2.4 L84,-3.2 L84,3.2 L0,2.4Z" fill="${INK}" ${SK}/>`;
    case 'head': {const ring=eq.head==='ring', eye=eq.eyes==='off'?'':`<ellipse cx="20" cy="4.6" rx="2.5" ry="1.5" fill="${ring?INK:PAPER}"/><ellipse cx="20" cy="10" rx="2.5" ry="1.5" fill="${ring?INK:PAPER}"/>`;
      return (ring?`<circle cx="21" cy="0" r="12.8" fill="${PAPER}" stroke="${INK}" stroke-width="2.6"/>`:`<circle cx="21" cy="0" r="14" fill="${INK}" ${SK}/>`)+eye;}
    case 'handR': case 'handL': return handArt(id,eq,auto);
    case 'armL_u': case 'armR_u': return limb(54,4.6);
    case 'armL_l': case 'armR_l': return limb(52,4);
    case 'legL_u': case 'legR_u': return `<path d="M0,-2.6 L72,-3.3 L72,3.3 L0,2.6Z" fill="${INK}" ${SK}/><ellipse rx="4.6" ry="3" fill="${INK}"/>`;
    // shin flares into a wide ink wedge, with one thin highlight
    default: return `<path d="M0,-3.2 C30,-4 56,-7 74,-10 Q77,0 74,9.5 C56,6.5 30,4 0,3.2Z" fill="${INK}" ${SK}/><ellipse rx="5" ry="3.3" fill="${INK}"/>`+
      `<path d="M44,-2.2 L69,-4.6" fill="none" stroke="${PAPER}" stroke-width="1.5" stroke-linecap="round" opacity=".75"/>`;
  }
}
const T=(w,inner)=>`<g transform="translate(${w.x.toFixed(2)} ${w.y.toFixed(2)}) rotate(${w.r.toFixed(2)})">${inner}</g>`;
function rigSvg(eq,W,sw,auto){
  const P=pieces(eq,sw), by=(b,l)=>P.filter(p=>p.bone===b&&p.layer===l).map(p=>p.svg).join('');
  let out='';
  // art is drawn at its authored length, then fitted to the bone
  const fit=(id,x)=>{const b=BMAP[id];return b.art?`<g transform="scale(${(b.len/b.art).toFixed(3)} ${b.sy||1})">${x}</g>`:x;};
  for(const id of ORDER){const s=by(id,'back'); if(s)out+=T(W[id],fit(id,s));}
  for(const id of ORDER)out+=T(W[id],fit(id,by(id,'under')+baseArt(id,eq,auto)+by(id,'over')));
  return out;
}
// ---- pencil motion effects ----
// speed lines: thin strokes that follow the path a moving part swept, fading toward the old end.
// S = samples {t,bx,by,tx,ty} (a short segment per sample); L = lines {u: position across the segment, s/e: which part of the path, w}
const WLINES=[.35,.1,.45,.2,.5,.05,.3,.15,.4,0,.1].map((s,i)=>({u:[.3,.36,.47,.52,.6,.69,.73,.82,.88,.95,1][i],s,e:[.9,1,.85,1,.95,1,.9,1,1,1,.97][i],w:[.8,1,.9,1.3,1,1.6,1.1,1.9,1.4,2.3,1.2][i]}));
const PLINES=[{u:0,s:.2,e:.8,w:1.5},{u:.33,s:0,e:.95,w:2.3},{u:.66,s:.3,e:1,w:1.9},{u:1,s:.1,e:.7,w:1.3}];
function speedLines(S,now,color,uid,L,thr,dash){
  const n=S.length; if(n<4)return '';
  let len=0; for(let i=1;i<n;i++){ if(S[i].t-S[i-1].t>.03)return ''; len+=Math.hypot(S[i].tx-S[i-1].tx,S[i].ty-S[i-1].ty); }
  const al=Math.max(0,Math.min(1,(len/Math.max(.02,S[n-1].t-S[0].t)-thr)/650)); if(al<.05)return '';
  const A=S[0], B=S[n-1], f=v=>v.toFixed(1), pt=(q,u)=>f(q.bx+(q.tx-q.bx)*u)+','+f(q.by+(q.ty-q.by)*u);
  let out=`<defs><linearGradient id="sl${uid}" gradientUnits="userSpaceOnUse" x1="${f(A.tx)}" y1="${f(A.ty)}" x2="${f(B.tx)}" y2="${f(B.ty+.01)}"><stop offset="0" stop-color="${color}" stop-opacity="0"/><stop offset=".45" stop-color="${color}" stop-opacity="${(al*.55).toFixed(2)}"/><stop offset="1" stop-color="${color}" stop-opacity="${al.toFixed(2)}"/></linearGradient></defs>`;
  for(const l of L){
    const i0=Math.floor(l.s*(n-1)), i1=Math.ceil(l.e*(n-1)); if(i1-i0<2)continue;
    let d='M'+pt(S[i0],l.u); for(let i=i0+1;i<=i1;i++)d+=' L'+pt(S[i],l.u);
    out+=`<path d="${d}" fill="none" stroke="url(#sl${uid})" stroke-width="${l.w}" stroke-linecap="round" stroke-linejoin="round"${dash?` stroke-dasharray="${dash}"`:''}/>`;
  }
  return out;
}
// turn a path of points into samples for speedLines: a short segment across the direction of travel
function pointRibbon(P,hw){
  const out=[]; let nx=0, ny=1;
  for(let i=0;i<P.length;i++){
    const a=P[Math.max(0,i-1)], b=P[Math.min(P.length-1,i+1)], dx=b.x-a.x, dy=b.y-a.y, m=Math.hypot(dx,dy);
    if(m>.3){nx=-dy/m; ny=dx/m;}
    out.push({t:P[i].t,bx:P[i].x-nx*hw,by:P[i].y-ny*hw,tx:P[i].x+nx*hw,ty:P[i].y+ny*hw});
  }
  return out;
}
// one brush stroke along a circle: thick in the middle, pointed at both ends
function brushArc(cx,cy,r,a0,a1,w){
  const p=a=>[(cx+r*Math.cos(a*Math.PI/180)).toFixed(1),(cy+r*Math.sin(a*Math.PI/180)).toFixed(1)];
  const th=(a1-a0)*Math.PI/360, c=2*r*Math.sin(th), s2=Math.max(.4,r*(1-Math.cos(th))-w), r2=(c*c/4+s2*s2)/(2*s2);
  return `M${p(a0)} A${r} ${r} 0 0 1 ${p(a1)} A${r2.toFixed(1)} ${r2.toFixed(1)} 0 0 0 ${p(a0)}Z`;
}
const SWIRL=[[19,20,84,3.4],[25,150,52,2.2],[22,252,62,2.8],[30,64,40,1.8],[32,190,72,3.2],[37,318,36,1.6],[28,300,26,1.4],[41,110,30,1.5],[40,238,24,1.2]];
function swirlSvg(cx,cy,age,alpha,scale){
  if(alpha<=.02)return '';
  let d='';
  SWIRL.forEach(([r,a,len,w],i)=>{const rot=age*(300-i*14)*(i%2?1:.8); d+=brushArc(cx,cy,r*scale,a+rot,a+rot+len,w*scale);});
  return `<path d="${d}" fill="${INK}" opacity="${alpha.toFixed(2)}"/>`;
}
// scribbles on the floor where a foot is planted
function groundMarks(W){
  let out='';
  ['legL_l','legR_l'].forEach((id,k)=>{
    const w=W[id], r=w.r*Math.PI/180, x=w.x+Math.cos(r)*BMAP[id].len, y=w.y+Math.sin(r)*BMAP[id].len;
    if(y<GROUND-12)return;
    const g=GROUND+2, o=k?3:-2;
    out+=`<path d="M${(x-17+o).toFixed(1)},${g} L${(x+15+o).toFixed(1)},${g-.6} M${(x-9-o).toFixed(1)},${g+2.4} L${(x+24-o).toFixed(1)},${g+2} M${(x-22).toFixed(1)},${g+1.2} L${(x-13).toFixed(1)},${g+1.4} M${(x+2).toFixed(1)},${g+4.2} L${(x+13).toFixed(1)},${g+4}" fill="none" stroke="${INK}" stroke-width="1.2" stroke-linecap="round" opacity=".8"/>`;
  });
  return out;
}
function dustSvg(D,now){
  let out='';
  for(const d of D){const k=(now-d.t)/.45; if(k<0||k>1)continue;
    let p='';
    for(const sx of [-1,1])for(let j=0;j<3;j++){
      const x=d.x+sx*(9+(24+13*j)*k*1.5), y=d.y-2-j*14*k*(1.3-k), l=9+3*j;
      p+=`M${x.toFixed(1)},${y.toFixed(1)} l${(sx*l).toFixed(1)},${(-j*2.5).toFixed(1)} `;
    }
    out+=`<path d="${p}" fill="none" stroke="${INK}" stroke-width="1.6" stroke-linecap="round" opacity="${((1-k)*.85).toFixed(2)}"/>`;}
  return out;
}
const shown=(id,eq)=>id!=='wing'||eq.wings!=='none';
function overlaySvg(W,sel,color,eq){
  let out='';
  for(const id of ORDER){
    if(!shown(id,eq))continue;
    const b=BMAP[id], on=id===sel, col=on?'#e2521a':color, L=Math.max(b.len,1);
    let s;
    if(id==='root') s=`<path d="M-11,0 L0,-11 L11,0 L0,11Z" fill="${col}" fill-opacity=".3" stroke="${col}" stroke-width="2"/>`;
    else s=`<path d="M0,0 L${(L*.2).toFixed(1)},-5 L${L},0 L${(L*.2).toFixed(1)},5Z" fill="${col}" fill-opacity="${on?.5:.22}" stroke="${col}" stroke-width="${on?2.2:1.3}" stroke-linejoin="round"/>`;
    s+=`<circle r="${on?5:3.4}" fill="#fff" stroke="${col}" stroke-width="2"/>`;
    out+=T(W[id],s);
  }
  return out;
}
function hitSvg(W,eq,fi){
  let out='';
  for(const id of ORDER){
    if(!shown(id,eq))continue;
    const b=BMAP[id];
    const s=id==='root'?`<circle r="15" fill="transparent" data-bone="root" data-f="${fi||0}"><title>${b.th}</title></circle>`
      :id==='head'?`<circle cx="31" r="24" fill="transparent" data-bone="head" data-f="${fi||0}"><title>${b.th}</title></circle>`
      :`<path d="M${b.len<10?0:9},0 L${Math.max(b.len,12)},0" stroke="transparent" stroke-width="22" stroke-linecap="round" data-bone="${id}" data-f="${fi||0}"><title>${b.th}</title></path>`;
    out+=T(W[id],s);
  }
  return out;
}
const DEFS=`<defs>`+
  `<pattern id="h1" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(-58)"><path d="M0,2.5 L5,2.5" stroke="${INK}" stroke-width=".8" opacity=".75"/></pattern>`+
  `<pattern id="h2" width="2.7" height="2.7" patternUnits="userSpaceOnUse" patternTransform="rotate(-52)"><path d="M0,1.35 L2.7,1.35" stroke="${INK}" stroke-width="1.15"/></pattern>`+
  `<filter id="wA" x="-5%" y="-5%" width="110%" height="110%"><feTurbulence type="fractalNoise" baseFrequency=".045" numOctaves="2" seed="4" result="n"/><feDisplacementMap in="SourceGraphic" in2="n" scale="2.4" xChannelSelector="R" yChannelSelector="G"/></filter>`+
  `<filter id="pc" x="-5%" y="-5%" width="110%" height="110%"><feTurbulence type="fractalNoise" baseFrequency=".03" numOctaves="2" seed="19" result="n"/><feDisplacementMap in="SourceGraphic" in2="n" scale="2.6" xChannelSelector="G" yChannelSelector="R" result="d"/>`+
    `<feTurbulence type="fractalNoise" baseFrequency="1.2" numOctaves="2" seed="5" result="g"/><feColorMatrix in="g" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  2.4 0 0 0 -.25" result="ga"/><feComposite in="d" in2="ga" operator="in"/></filter>`+
  `</defs>`;
function sparkSvg(S,now){
  let out='';
  for(const p of S){const k=(now-p.t)/.22; if(k<0||k>1)continue;
    for(let i=0;i<9;i++){const a=(i*40+p.t*977%40)*Math.PI/180, r0=5+30*k, r1=13+(i%2?46:34)*k;
      out+=`<path d="M${(p.x+Math.cos(a)*r0).toFixed(1)},${(p.y+Math.sin(a)*r0).toFixed(1)} L${(p.x+Math.cos(a)*r1).toFixed(1)},${(p.y+Math.sin(a)*r1).toFixed(1)}" stroke="${i%2?INK:p.c[1]}" stroke-width="${(2.6*(1-k)+.4).toFixed(1)}" stroke-linecap="round"/>`;}
    if(p.k)out+=`<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="${(5+22*k).toFixed(1)}" fill="none" stroke="${INK}" stroke-width="1.6" opacity="${(1-k).toFixed(2)}"/>`;}
  return out;
}
function hudSvg(v,hp,sel){
  let out='';
  [0,1].forEach(i=>{const w=200, x=i?v.x+v.w-20-w:v.x+20, y=v.y+16, f=w*Math.max(0,hp[i])/100;
    out+=`<rect x="${x}" y="${y}" width="${w}" height="9" rx="2" fill="${PAPER}" stroke="${INK}" stroke-width="1.6"/>`+
      `<rect x="${i?x+w-f:x}" y="${y}" width="${f.toFixed(1)}" height="9" rx="2" fill="${INK}" opacity=".82"/>`+
      `<text x="${i?x+w:x}" y="${y+26}" text-anchor="${i?'end':'start'}" font-size="13" font-weight="${sel===i?700:400}" fill="${INK}">ตัวที่ ${i+1}${sel===i?' (ควบคุม)':''}</text>`;});
  return out;
}
// one fighter: F = {eq,pose,px,dir,sw,hand,trail,showBones,sel,idx}
function figureSvg(F){
  const pose=F.pose, W=solve(pose), rig=rigSvg(F.eq,W,F.sw||0,F.hand);
  const lines=rig.replace(/fill="[^"]*"/g,'fill="none"');
  const px=pose.x.toFixed(2), py=pose.y.toFixed(2);
  // the filter is anchored to the hips so the pencil wobble travels with the figure instead of boiling
  const anchored=(f,o,x)=>`<g transform="translate(${px} ${py})"><g filter="url(#${f})" opacity="${o}"><g transform="translate(${-px} ${-py})">${x}</g></g></g>`;
  return `<g transform="translate(${F.px.toFixed(2)} 0) scale(${F.dir} 1) translate(${-HOME.x} 0)">`+
    anchored('wA',1,groundMarks(W)+(F.trail||'')+rig)+anchored('pc',.8,lines)+
    (F.showBones?overlaySvg(W,F.sel,'#1f6feb',F.eq):'')+(F.noHit?'':hitSvg(W,F.eq,F.idx))+`</g>`;
}
function sceneSvg(S){
  const v=S.vb, sh=S.shake||[0,0];
  return DEFS+`<g transform="translate(${sh[0].toFixed(1)} ${sh[1].toFixed(1)})">`+
    `<path d="M${v.x+24},${GROUND} L${v.x+v.w-24},${GROUND}" stroke="${INK}" stroke-width="1.4" stroke-dasharray="14 5 3 6" stroke-linecap="round" opacity=".3"/>`+
    (S.under||'')+S.figs.map(figureSvg).join('')+`<g filter="url(#wA)">${S.dust||''}${S.sparks||''}</g></g>`+(S.hud||'');
}
function exportRig(st,pose){
  const used=[...new Set(Object.values(OUTFIT).flatMap(o=>o.f()).map(p=>p.bone))];
  return {
    bones:BONES.map(b=>({name:b.id,parent:b.parent,length:b.len,attachAt:b.at===undefined?1:b.at,offset:[b.ox||0,b.oy||0],restAngle:b.rest})),
    drawOrder:ORDER,
    slots:{hair:['head'],wings:['wing'],weapon:['handR'],offhand:['handL'],outfit:used},
    equipment:{head:st.eq.head,eyes:st.eq.eyes,handR:st.eq.handR,handL:st.eq.handL,hair:st.eq.hair,outfit:st.eq.outfit,wings:st.eq.wings,weapon:st.eq.weapon,offhand:st.eq.offhand,element:st.eq.element},
    pose:{x:Math.round(pose.x),y:Math.round(pose.y),angles:Object.fromEntries(BONES.map(b=>[b.id,Math.round(norm(pose.a[b.id]))]))},
    note:'angles are degrees, local to the parent bone; +x runs along the bone, screen y points down; offset is in the parent bone space'
  };
}
function shotArt(kind,c,age){
  if(kind==='arrow')return `<path d="M-24,0 L5,0" ${LN.replace('1.1','1.7')}/><path d="M4,-3.2 L12,0 L4,3.2Z" fill="${INK}"/><path d="M-24,0 l-5,-3 M-24,0 l-5,3 M-20,0 l-5,-3 M-20,0 l-5,3 M-38,-2.4 l-14,0 M-34,2.4 l-9,0" ${LN}/>`;
  if(kind==='bullet')return `<path d="M-5,0 L3,0" fill="none" stroke="${INK}" stroke-width="3.2" stroke-linecap="round"/><path d="M-12,-2.2 l-24,0 M-10,2.2 l-16,0 M-15,0 l-34,0" ${LN} opacity=".6"/>`;
  const k=kind==='nova'?1.9:1;
  return `<g transform="scale(${k})"><circle r="6.5" fill="${PAPER}" stroke="${c[0]}" stroke-width="1.8"/><circle r="6.5" fill="url(#h2)" opacity=".6"/>${swirlSvg(0,0,age*2.2,1,.42)}<path d="M-13,-3 l-12,0 M-11,3 l-8,0 M-15,0 l-16,0" fill="none" stroke="${c[0]}" stroke-width="1.2" stroke-linecap="round" opacity=".7"/></g>`;
}

const LNK=`fill="none" stroke="${INK}" stroke-linecap="round" stroke-linejoin="round"`;
function treeArt(R){
  const k=.85+R()*.5, c=[[-13,-42,16],[12,-44,15],[0,-60,18],[-2,-46,14]];
  let o=`<ellipse cx="2" cy="0" rx="${20*k}" ry="${5*k}" fill="${INK}" opacity=".13"/>`+
    `<path d="M${-4*k},0 L${-3*k},${-30*k} M${4*k},0 L${3*k},${-30*k} M${-1*k},-3 L0,${-24*k} M${-3*k},${-18*k} l${-7*k},${-8*k}" ${LNK} stroke-width="1.4"/>`;
  for(const [x,y,r] of c){const j=()=>(R()-.5)*3;
    o+=`<circle cx="${(x*k+j()).toFixed(1)}" cy="${(y*k+j()).toFixed(1)}" r="${(r*k).toFixed(1)}" fill="${PAPER}" stroke="${INK}" stroke-width="1.4"/>`;}
  o+=`<path d="M${-22*k},${-36*k} a${17*k},${17*k} 0 0 0 ${20*k},${10*k} a${15*k},${15*k} 0 0 0 ${20*k},${-4*k} l0,${-8*k} q${-20*k},${6*k} ${-40*k},${2*k}Z" fill="url(#h1)"/>`+
     `<path d="M${-8*k},${-58*k} q${5*k},${-5*k} ${10*k},0 M${6*k},${-48*k} q${5*k},${-4*k} ${9*k},1 M${-16*k},${-46*k} q${4*k},${-4*k} ${8*k},0" ${LNK} stroke-width="1"/>`;
  return o;
}
export { figureSvg, shotArt, treeArt, swirlSvg, sparkSvg, DEFS, LNK, SK, LN, tone };
