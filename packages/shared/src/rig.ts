// @ts-nocheck
// Ported verbatim from the single-file prototype (tools/prototype.html, CORE block).
// Pure data + math: bones, poses, keyframe tracks. No drawing here, so the server can run it.
import skills from './data/skills.json';
const ATTACKS=Object.fromEntries(Object.entries(skills.attacks).map(([k,th])=>[k,{th}]));
const ATKSET=skills.byWeaponType, RANGED=skills.rangedReach, SPCOST=skills.spCost;
const PAPER='#ededee', INK='#1b1b1d';
const BONES=[
  {id:'root',  th:'สะโพก (root)', parent:null,    len:0,  rest:0,   d:0},
  {id:'spine', th:'ลำตัว',         parent:'root',  len:30, art:84, rest:-90, d:1},
  {id:'wing',  th:'ปีก',           parent:'spine', len:52, art:90, sy:.58, rest:-60, d:2, at:.8, oy:-4},
  {id:'head',  th:'หัว',           parent:'spine', len:54, art:36, sy:1.5, rest:0, d:2, ox:-12},
  {id:'armL_u',th:'ต้นแขนซ้าย',    parent:'spine', len:21, art:54, rest:200, d:2, at:.9, oy:-2},
  {id:'armL_l',th:'ปลายแขนซ้าย',   parent:'armL_u',len:19, art:52, rest:-14, d:3},
  {id:'handL', th:'มือซ้าย',       parent:'armL_l',len:8,  rest:-60, d:4},
  {id:'armR_u',th:'ต้นแขนขวา',     parent:'spine', len:21, art:54, rest:160, d:2, at:.9, oy:2},
  {id:'armR_l',th:'ปลายแขนขวา',    parent:'armR_u',len:19, art:52, rest:-16, d:3},
  {id:'handR', th:'มือขวา',        parent:'armR_l',len:8,  rest:-70, d:4},
  {id:'legL_u',th:'ต้นขาซ้าย',     parent:'root',  len:23, art:72, sy:.9, rest:110, d:1, ox:-3},
  {id:'legL_l',th:'แข้งซ้าย',      parent:'legL_u',len:25, art:74, sy:.85, rest:2,   d:2},
  {id:'legR_u',th:'ต้นขาขวา',      parent:'root',  len:23, art:72, sy:.9, rest:70,  d:1, ox:3},
  {id:'legR_l',th:'แข้งขวา',       parent:'legR_u',len:25, art:74, sy:.85, rest:10,  d:2},
];
const BMAP=Object.fromEntries(BONES.map(b=>[b.id,b]));
// back → front
const ORDER=['wing','root','armL_u','armL_l','handL','legL_u','legL_l','legR_u','legR_l','spine','head','armR_u','armR_l','handR'];
const HOME={x:300,y:292}, GROUND=HOME.y+50, GEAR=.68;

function mkPose(def){
  const a={}; for(const b of BONES) a[b.id]=(def&&def.a&&def.a[b.id]!==undefined)?def.a[b.id]:b.rest;
  return {x:HOME.x+((def&&def.dx)||0), y:HOME.y+((def&&def.dy)||0), a};
}
function solve(pose){
  const W={};
  for(const b of BONES){
    if(!b.parent){W[b.id]={x:pose.x,y:pose.y,r:pose.a[b.id]};continue;}
    const p=W[b.parent], d=BMAP[b.parent].len*(b.at===undefined?1:b.at)+(b.ox||0), o=b.oy||0, pr=p.r*Math.PI/180;
    W[b.id]={x:p.x+Math.cos(pr)*d-Math.sin(pr)*o, y:p.y+Math.sin(pr)*d+Math.cos(pr)*o, r:p.r+pose.a[b.id]};
  }
  return W;
}
function norm(a){a=((a+180)%360+360)%360-180;return a;}
function lerpPose(A,B,k){
  const a={}; for(const b of BONES){a[b.id]=A.a[b.id]+norm(B.a[b.id]-A.a[b.id])*k;}
  return {x:A.x+(B.x-A.x)*k, y:A.y+(B.y-A.y)*k, a};
}

const POSES={
  idle:{th:'ยืน',g:'act',hand:'relax',def:{}},
  lunge:{th:'พุ่งแทง',g:'act',hand:'open',def:{dy:9,a:{footR:-108,spine:-55,head:12,wing:-40,armR_u:50,armR_l:-5,handR:-10,armL_u:215,armL_l:-60,legR_u:40,legR_l:70,legL_u:135,legL_l:10}}},
  guard:{th:'ตั้งการ์ด',g:'act',hand:'fist',def:{dy:3,a:{footR:-98,footL:-125,spine:-84,armR_u:120,armR_l:-75,handR:-60,armL_u:130,armL_l:-90,legR_u:60,legR_l:40,legL_u:115,legL_l:15}}},
  jump:{th:'กระโดด',g:'act',hand:'open',def:{dy:-30,a:{footR:-60,footL:-60,spine:-84,head:-8,wing:-88,armR_u:25,armR_l:-15,handR:-30,armL_u:-35,armL_l:-15,legR_u:50,legR_l:75,legL_u:120,legL_l:50}}},
  // sitting and resting: dy lowers the hips to the floor
  sit:{th:'นั่งเหยียดขา',g:'sit',hand:'relax',def:{dy:45,a:{spine:-99,head:4,wing:-70,armL_u:239,armL_l:0,armR_u:190,armR_l:-25,legR_u:2,legR_l:6,legL_u:-8,legL_l:22}}},
  sitknee:{th:'นั่งชันเข่า',g:'sit',hand:'relax',def:{dy:44,a:{spine:-101,head:6,wing:-70,armL_u:241,armL_l:0,armR_u:112,armR_l:-22,handR:-80,legR_u:-40,legR_l:100,legL_u:5,legL_l:5}}},
  lotus:{th:'ขัดสมาธิ',g:'sit',hand:'open',def:{dy:44,a:{spine:-90,head:0,wing:-75,armR_u:132,armR_l:-34,handR:-50,armL_u:142,armL_l:-42,legR_u:-6,legR_l:150,legL_u:4,legL_l:160}}},
  squat:{th:'นั่งยอง',g:'sit',hand:'relax',def:{dy:31,a:{spine:-75,head:8,wing:-55,armR_u:112,armR_l:-42,handR:-40,armL_u:126,armL_l:-46,legR_u:-20,legR_l:125,legL_u:-15,legL_l:122}}},
  kneel:{th:'คุกเข่า',g:'sit',hand:'fist',def:{dy:23,a:{spine:-87,head:10,wing:-50,armR_u:152,armR_l:-42,handR:-110,armL_u:112,armL_l:-32,legR_u:0,legR_l:90,legL_u:100,legL_l:80}}},
  lie:{th:'นอน',g:'sit',hand:'relax',def:{dy:44,a:{root:-90,spine:-88,head:6,wing:-70,armR_u:205,armR_l:-10,handR:-20,armL_u:150,armL_l:-120,legR_u:84,legR_l:6,legL_u:64,legL_l:48}}},
  // show-off poses
  cheer:{th:'ชูสองมือ',g:'show',hand:'open',def:{dy:-3,a:{spine:-92,head:-10,wing:-95,armR_u:26,armR_l:-10,handR:-20,armL_u:-32,armL_l:10,legR_u:64,legL_u:116}}},
  wavehi:{th:'ทักทาย',g:'show',hand:'open',def:{a:{spine:-93,head:-6,armL_u:18,armL_l:-52}}},
  peace:{th:'ชูสองนิ้ว',g:'show',hand:'peace',def:{a:{spine:-95,head:-8,armL_u:42,armL_l:-46,armR_u:176,legL_u:122,legL_l:62,legR_u:80,legR_l:4}}},
  point:{th:'ชี้',g:'show',hand:'point',def:{dy:2,a:{spine:-84,head:4,armL_u:93,armL_l:-6,armR_u:178,armR_l:-30,legR_u:58,legR_l:22,legL_u:120,legL_l:6}}},
  think:{th:'ครุ่นคิด',g:'show',hand:'relax',def:{a:{spine:-86,head:12,armL_u:122,armL_l:-134,armR_u:170,armR_l:-60,handR:-30,legR_u:76,legL_u:104}}},
  hips:{th:'เท้าเอว',g:'show',hand:'fist',def:{a:{spine:-94,head:-6,wing:-80,armR_u:132,armR_l:108,handR:-60,armL_u:232,armL_l:-104,legR_u:60,legR_l:12,legL_u:120,legL_l:2}}},
  bow:{th:'โค้งคำนับ',g:'show',hand:'relax',def:{a:{spine:-38,head:22,wing:-30,armR_u:132,armR_l:-6,armL_u:146,armL_l:-6,legR_u:84,legR_l:6,legL_u:96,legL_l:0}}},
  win:{th:'ชูอาวุธ',g:'show',hand:'fist',def:{a:{spine:-94,head:-8,armR_u:10,armR_l:-8,handR:-80,armL_u:232,armL_l:-104,legR_u:62,legL_u:118}}},
};
// keyframes: d = seconds to reach the key, e = easing, hit = impact on arrival
const P_WIND={dx:-10,dy:2,h:'fist',a:{spine:-100,head:-6,wing:-82,armR_u:-5,armR_l:-45,handR:-50,armL_u:150,armL_l:-40,legR_u:70,legR_l:20,legL_u:105,legL_l:10}};
const A_STRIKE={footR:-108,spine:-55,head:12,wing:-38,armR_u:80,armR_l:-8,handR:10,armL_u:215,armL_l:-60,legR_u:40,legR_l:70,legL_u:135,legL_l:10};
const A_SETTLE=Object.assign({},A_STRIKE,{spine:-52,armR_u:90,handR:18});
const A_LOW={footR:-103,spine:-66,head:10,wing:-50,armR_u:185,armR_l:-10,handR:40,armL_u:120,armL_l:-70,legR_u:45,legR_l:60,legL_u:125,legL_l:15};
const A_UP={spine:-94,head:-10,wing:-95,armR_u:10,armR_l:-10,handR:-30,armL_u:215,armL_l:-30,legR_u:72,legR_l:12,legL_u:112,legL_l:25};
const A_PULL={spine:-78,head:6,wing:-60,armR_u:200,armR_l:-110,handR:-10,armL_u:110,armL_l:-30,legR_u:55,legR_l:50,legL_u:115,legL_l:20};
const A_THRUST={footR:-108,spine:-52,head:14,wing:-36,armR_u:48,armR_l:-4,handR:6,armL_u:215,armL_l:-60,legR_u:38,legR_l:72,legL_u:138,legL_l:8};
const A_HOP={footR:-60,footL:-60,spine:-88,wing:-92,armR_u:120,armR_l:-60,handR:-50,armL_u:200,armL_l:-40,legR_u:60,legR_l:60,legL_u:100,legL_l:60};
const A_PULL2=Object.assign({},A_PULL,{armR_u:185,armR_l:-95,spine:-72});
const A_CHAMB={spine:-100,head:-4,armR_u:120,armR_l:-80,handR:-60,armL_u:132,armL_l:-92,legR_u:-8,legR_l:112,legL_u:96,legL_l:4};
const A_KICK=Object.assign({},A_CHAMB,{spine:-110,legR_u:-4,legR_l:6});
const A_CHAMB2=Object.assign({},A_CHAMB,{spine:-112,legR_u:-42,legR_l:105});
const A_KICK2=Object.assign({},A_CHAMB2,{spine:-118,legR_u:-36,legR_l:6});
const A_CROUCH=Object.assign({},P_WIND.a,{spine:-78,legR_u:52,legR_l:62,legL_u:112,legL_l:42});
const A_TUCK={spine:-70,head:20,wing:-100,armR_u:-10,armR_l:-30,handR:-60,armL_u:140,armL_l:-90,legR_u:20,legR_l:115,legL_u:45,legL_l:115};
const A_RISE=Object.assign({},A_UP,{armR_u:-5,armR_l:-45,handR:-50,legR_u:50,legR_l:70,legL_u:110,legL_l:50});
// reactions: the attacker stands in front (+x), so getting hit moves the body toward -x
const A_HITHI={spine:-114,head:-28,wing:-100,armR_u:150,armR_l:-30,handR:-40,armL_u:230,armL_l:-25,legR_u:74,legR_l:8,legL_u:120,legL_l:14};
const A_HITHI2=Object.assign({},A_HITHI,{spine:-103,head:-12});
const A_HITLO={spine:-58,head:28,wing:-45,armR_u:125,armR_l:-105,handR:-20,armL_u:150,armL_l:-100,legR_u:60,legR_l:38,legL_u:104,legL_l:28};
const A_AIR={root:-35,spine:-100,head:-22,wing:-110,armR_u:95,armR_l:-20,armL_u:255,armL_l:-20,legR_u:48,legR_l:34,legL_u:98,legL_l:44};
const A_AIR2=Object.assign({},A_AIR,{root:-75});
const A_DOWN={root:-90,spine:-88,head:6,wing:-70,armR_u:205,armR_l:-10,handR:-20,armL_u:165,armL_l:-12,legR_u:84,legR_l:6,legL_u:96,legL_l:4};
const A_SIT={root:-40,spine:-75,head:10,armR_u:215,armR_l:-20,armL_u:200,armL_l:-15,legR_u:10,legR_l:105,legL_u:50,legL_l:95};
const A_BLOCK={spine:-96,head:-4,armR_u:118,armR_l:-78,handR:-75,armL_u:128,armL_l:-92,legR_u:58,legR_l:36,legL_u:118,legL_l:14};
const A_WIN={spine:-94,head:-8,armR_u:10,armR_l:-8,handR:-80,armL_u:200,armL_l:-30};
const EASE={io:k=>k*k*(3-2*k), out:k=>1-Math.pow(1-k,4), lin:k=>k};
const REST=mkPose({});
// key: d = seconds to reach it, e = easing, hit = what it does to the opponent on arrival, thud = body hits the floor
// shift = how far the fighter has really moved by the end of the track
function mkTrack(keys,shift){let t=0;const tr=keys.map(k=>{t+=k.d;return {t0:t-k.d,t1:t,e:k.e,p:mkPose(k.def),hit:k.hit||null,shoot:k.shoot||null,thud:!!k.thud,h:k.h||k.def.h||'relax'};});tr.shift=shift||0;return tr;}
const K=(d,e,def,x)=>Object.assign({d,e,def},x||{});
const FALL=[K(.10,'out',{dx:-18,dy:-26,a:A_AIR},{h:'open'}),K(.20,'io',{dx:-41,dy:-10,a:A_AIR2},{h:'open'}),K(.13,'lin',{dx:-57,dy:46,a:A_DOWN},{thud:true,h:'open'}),K(.07,'out',{dx:-62,dy:42,a:A_DOWN}),K(.09,'io',{dx:-64,dy:46,a:A_DOWN})];
const TRACKS={
  slash:mkTrack([K(.30,'io',P_WIND),K(.07,'lin',P_WIND),
    K(.09,'out',{dx:21,dy:9,a:A_STRIKE},{h:'open',hit:{t:'high',push:24,dmg:10}}),K(.14,'io',{dx:24,dy:10,a:A_SETTLE},{h:'open'}),K(.22,'lin',{dx:24,dy:10,a:A_SETTLE},{h:'open'}),
    K(.40,'io',{}),K(.30,'lin',{})]),
  combo:mkTrack([K(.26,'io',Object.assign({},P_WIND,{dx:-14})),
    K(.08,'out',{dx:6,dy:9,a:A_STRIKE},{h:'open',hit:{t:'high',push:12,dmg:8}}),K(.10,'io',{dx:7,dy:10,a:A_SETTLE},{h:'open'}),
    K(.16,'io',{dx:10,dy:7,a:A_LOW},{h:'fist'}),
    K(.10,'out',{dx:24,dy:-8,a:A_UP},{h:'claw',hit:{t:'high',push:12,dmg:8}}),K(.14,'io',{dx:27,dy:-11,a:Object.assign({},A_UP,{armR_u:0,handR:-40})},{h:'claw'}),
    K(.18,'io',{dx:21,dy:6,a:A_PULL},{h:'chop'}),
    K(.08,'out',{dx:39,dy:9,a:A_THRUST},{h:'open',hit:{t:'low',push:46,dmg:12}}),K(.12,'io',{dx:42,dy:10,a:Object.assign({},A_THRUST,{spine:-50})},{h:'open'}),K(.24,'lin',{dx:42,dy:10,a:Object.assign({},A_THRUST,{spine:-50})},{h:'open'}),
    K(.20,'io',{dx:21,dy:-13,a:A_HOP}),K(.20,'io',{}),K(.30,'lin',{})]),
  flurry:mkTrack([K(.18,'io',{dx:0,dy:6,a:A_PULL},{h:'chop'}),
    K(.06,'out',{dx:13,dy:8,a:A_THRUST},{h:'chop',hit:{t:'low',push:6,dmg:5}}),K(.08,'io',{dx:10,dy:7,a:A_PULL2},{h:'chop'}),
    K(.06,'out',{dx:15,dy:8,a:Object.assign({},A_THRUST,{armR_u:36,spine:-60})},{h:'chop',hit:{t:'high',push:6,dmg:5}}),K(.08,'io',{dx:13,dy:7,a:A_PULL2},{h:'chop'}),
    K(.06,'out',{dx:18,dy:8,a:A_THRUST},{h:'chop',hit:{t:'low',push:6,dmg:5}}),K(.14,'io',{dx:11,dy:6,a:A_PULL},{h:'fist'}),
    K(.08,'out',{dx:35,dy:9,a:A_THRUST},{h:'open',hit:{t:'low',push:56,dmg:11}}),K(.26,'lin',{dx:36,dy:10,a:A_THRUST},{h:'open'}),
    K(.20,'io',{dx:17,dy:-12,a:A_HOP}),K(.20,'io',{}),K(.30,'lin',{})]),
  kick:mkTrack([K(.16,'io',{dx:4,dy:-2,a:A_CHAMB},{h:'fist'}),
    K(.06,'out',{dx:11,dy:-2,a:A_KICK},{h:'fist',hit:{t:'low',push:30,dmg:8,kick:true}}),K(.10,'io',{dx:8,dy:-2,a:A_CHAMB},{h:'fist'}),
    K(.10,'io',{dx:13,dy:1,a:{}},{h:'fist'}),K(.12,'io',{dx:15,dy:-2,a:A_CHAMB2},{h:'fist'}),
    K(.07,'out',{dx:22,dy:-2,a:A_KICK2},{h:'open',hit:{t:'launch',push:20,dmg:14,kick:true}}),K(.14,'lin',{dx:22,dy:-2,a:A_KICK2},{h:'open'}),
    K(.14,'io',{dx:14,dy:-2,a:A_CHAMB},{h:'fist'}),K(.22,'io',{}),K(.30,'lin',{})]),
  flip:mkTrack([K(.18,'io',{dx:-4,dy:10,a:A_CROUCH},{h:'fist'}),
    K(.11,'out',{dx:14,dy:-33,a:Object.assign({},A_TUCK,{root:110})},{h:'fist'}),K(.11,'lin',{dx:32,dy:-40,a:Object.assign({},A_TUCK,{root:230})},{h:'fist'}),
    K(.09,'out',{dx:49,dy:9,a:Object.assign({},A_STRIKE,{root:360})},{h:'open',hit:{t:'launch',push:30,dmg:16}}),
    K(.14,'io',{dx:50,dy:10,a:Object.assign({},A_SETTLE,{root:360})},{h:'open'}),K(.20,'lin',{dx:50,dy:10,a:Object.assign({},A_SETTLE,{root:360})},{h:'open'}),
    K(.30,'io',{dx:28,a:{root:360}}),K(.30,'lin',{dx:28,a:{root:360}})],28),
  rise:mkTrack([K(.20,'io',{dx:0,dy:7,a:A_LOW},{h:'fist'}),
    K(.09,'out',{dx:15,dy:-8,a:A_UP},{h:'claw',hit:{t:'launch',push:10,dmg:9}}),
    K(.12,'io',{dx:25,dy:-38,a:A_RISE},{h:'fist'}),K(.10,'lin',{dx:38,dy:-39,a:A_RISE},{h:'fist'}),
    K(.08,'out',{dx:48,dy:9,a:A_STRIKE},{h:'open',hit:{t:'launch',push:30,dmg:13}}),K(.14,'io',{dx:49,dy:10,a:A_SETTLE},{h:'open'}),K(.22,'lin',{dx:49,dy:10,a:A_SETTLE},{h:'open'}),
    K(.20,'io',{dx:24,dy:-12,a:A_HOP}),K(.20,'io',{}),K(.30,'lin',{})]),
  hitHigh:mkTrack([K(.06,'out',{dx:-6,dy:1,a:A_HITHI},{h:'open'}),K(.16,'io',{dx:-8,a:A_HITHI2},{h:'open'}),K(.22,'io',{})]),
  hitLow:mkTrack([K(.06,'out',{dx:-4,dy:4,a:A_HITLO},{h:'fist'}),K(.20,'lin',{dx:-6,dy:4,a:A_HITLO},{h:'fist'}),K(.24,'io',{})]),
  launch:mkTrack(FALL.concat([K(.42,'lin',{dx:-64,dy:46,a:A_DOWN}),K(.26,'io',{dx:-59,dy:27,a:A_SIT},{h:'open'}),K(.24,'io',{dx:-53})]),-53),
  ko:mkTrack(FALL.concat([K(4,'lin',{dx:-64,dy:46,a:A_DOWN})]),-64),
  block:mkTrack([K(.05,'out',{dx:-6,dy:3,a:A_BLOCK},{h:'fist'}),K(.18,'lin',{dx:-7,dy:3,a:A_BLOCK},{h:'fist'}),K(.20,'io',{})]),
  dodge:mkTrack([K(.08,'io',{dy:5,a:{spine:-80,legR_u:55,legR_l:50,legL_u:110,legL_l:30}}),K(.14,'out',{dx:-36,dy:-10,a:A_HOP}),K(.14,'io',{dx:-46,dy:2,a:{spine:-84,legR_u:60,legR_l:30,legL_u:112,legL_l:20}}),K(.12,'io',{dx:-46})],-46),
  victory:mkTrack([K(.30,'io',{a:A_WIN},{h:'fist'}),K(1.4,'lin',{a:A_WIN},{h:'fist'}),K(.30,'io',{})]),
};
const animLen=n=>TRACKS[n]?TRACKS[n][TRACKS[n].length-1].t1:0;
function evalTrack(tr,t){
  const total=tr[tr.length-1].t1, u=t%total; let i=0; while(i<tr.length-1&&u>=tr[i].t1)i++;
  const B=tr[i], P=i?tr[i-1]:null, A=P?P.p:REST, k=(u-B.t0)/(B.t1-B.t0), L=B.e==='out'?.35:B.e==='io'?.2:0, f=EASE[B.e];
  // overlapping action: bones further down the chain start later, so limbs whip instead of moving as one block
  const kk=d=>f(Math.max(0,Math.min(1,k*(1+L)-L*d/4)));
  const a={}; for(const b of BONES)a[b.id]=A.a[b.id]+norm(B.p.a[b.id]-A.a[b.id])*kk(b.d);
  const k0=kk(0);
  return {pose:{x:A.x+(B.p.x-A.x)*k0,y:A.y+(B.p.y-A.y)*k0,a},key:i,prev:P,wind:0,hand:k>.4?B.h:(P?P.h:'relax')};
}
const LOOPS={idle:{th:'หายใจ'},run:{th:'วิ่ง'},wave:{th:'โบกมือ'},hype:{th:'กระโดดดีใจ'}};
// ---- attacks that depend on what the weapon is ----
const A_AIM={spine:-92,head:0,armR_u:87,armR_l:-2,handR:7,armL_u:262,armL_l:-165,handL:-20,legR_u:62,legR_l:14,legL_u:118,legL_l:4};
const A_LOOSE=Object.assign({},A_AIM,{spine:-95,armL_u:250,armL_l:-70});
const A_AIRAIM=Object.assign({},A_AIM,{legR_u:50,legR_l:60,legL_u:105,legL_l:50});
const A_GUN={spine:-90,armR_u:88,armR_l:-2,handR:4,armL_u:128,armL_l:-52,legR_u:64,legR_l:12,legL_u:116,legL_l:4};
const A_RECOIL=Object.assign({},A_GUN,{spine:-97,head:-6,armR_u:72,handR:-8});
const A_CHARGE={spine:-95,head:-8,wing:-85,armR_u:28,armR_l:-10,handR:-13,armL_u:112,armL_l:-22,handL:-10,legR_u:66,legR_l:12,legL_u:114,legL_l:6};
const A_CASTOUT={spine:-80,head:6,wing:-45,armR_u:78,armR_l:-8,handR:-2,armL_u:215,armL_l:-30,legR_u:52,legR_l:40,legL_u:124,legL_l:10};
const A_BIG=Object.assign({},A_CHARGE,{spine:-100,armL_u:40,armL_l:-10});
const A_SLAM={spine:-62,head:14,wing:-40,armR_u:95,armR_l:-5,handR:20,armL_u:215,armL_l:-50,legR_u:45,legR_l:62,legL_u:128,legL_l:14};
const A_JAB={spine:-84,armL_u:92,armL_l:-4,handL:0,armR_u:118,armR_l:-80,handR:-60,legR_u:60,legR_l:30,legL_u:118,legL_l:10};
const A_CROSS={spine:-72,head:8,armR_u:86,armR_l:-4,handR:0,armL_u:140,armL_l:-100,legR_u:50,legR_l:44,legL_u:128,legL_l:8};
const S_ARROW={kind:'arrow',hit:{t:'high',push:14,dmg:9}}, S_ARROW2={kind:'arrow',hit:{t:'high',push:8,dmg:6}}, S_BULLET={kind:'bullet',hit:{t:'high',push:10,dmg:8}}, S_BULLET2={kind:'bullet',hit:{t:'high',push:6,dmg:5}};
Object.assign(TRACKS,{
  thrust:mkTrack([K(.20,'io',{dy:6,a:A_PULL},{h:'chop'}),K(.08,'out',{dx:30,dy:9,a:A_THRUST},{h:'open',hit:{t:'low',push:40,dmg:10}}),K(.22,'lin',{dx:31,dy:9,a:A_THRUST},{h:'open'}),K(.25,'io',{}),K(.2,'lin',{})]),
  punch:mkTrack([K(.12,'io',{dy:3,a:A_BLOCK},{h:'fist'}),K(.06,'out',{dx:8,dy:3,a:A_JAB},{h:'fist',hit:{t:'high',push:8,dmg:5,kick:true}}),K(.08,'io',{dx:6,dy:3,a:A_BLOCK},{h:'fist'}),
    K(.07,'out',{dx:18,dy:5,a:A_CROSS},{h:'fist',hit:{t:'high',push:26,dmg:9,kick:true}}),K(.16,'lin',{dx:18,dy:5,a:A_CROSS},{h:'fist'}),K(.22,'io',{}),K(.2,'lin',{})]),
  // an arrow, bullet or spell leaves when its key is reached
  shoot:mkTrack([K(.26,'io',{a:A_AIM},{h:'fist'}),K(.12,'lin',{a:A_AIM},{h:'fist',shoot:S_ARROW}),K(.05,'out',{dx:-2,a:A_LOOSE},{h:'open'}),K(.18,'lin',{dx:-2,a:A_LOOSE},{h:'open'}),K(.24,'io',{}),K(.2,'lin',{})]),
  volley:mkTrack([K(.24,'io',{a:A_AIM},{h:'fist'}),K(.08,'lin',{a:A_AIM},{h:'fist',shoot:S_ARROW2}),K(.05,'out',{a:A_LOOSE},{h:'open'}),K(.12,'io',{a:A_AIM},{h:'fist',shoot:S_ARROW2}),K(.05,'out',{a:A_LOOSE},{h:'open'}),
    K(.12,'io',{a:A_AIM},{h:'fist',shoot:S_ARROW2}),K(.05,'out',{a:A_LOOSE},{h:'open'}),K(.16,'lin',{a:A_LOOSE},{h:'open'}),K(.24,'io',{}),K(.2,'lin',{})]),
  backshot:mkTrack([K(.10,'io',{dy:5,a:{spine:-80,legR_u:55,legR_l:50,legL_u:110,legL_l:30}}),K(.16,'out',{dx:-36,dy:-14,a:A_AIRAIM},{h:'fist',shoot:S_ARROW}),
    K(.05,'out',{dx:-40,dy:-12,a:Object.assign({},A_AIRAIM,{armL_u:250,armL_l:-70})},{h:'open'}),K(.14,'io',{dx:-46,dy:3,a:A_LOOSE},{h:'open'}),K(.2,'io',{dx:-46}),K(.15,'lin',{dx:-46})],-46),
  fire:mkTrack([K(.16,'io',{a:A_GUN},{h:'fist',shoot:S_BULLET}),K(.04,'out',{dx:-3,a:A_RECOIL},{h:'fist'}),K(.14,'io',{a:A_GUN},{h:'fist'}),K(.22,'io',{}),K(.2,'lin',{})]),
  rapid:mkTrack([K(.16,'io',{a:A_GUN},{h:'fist',shoot:S_BULLET2}),K(.04,'out',{dx:-2,a:A_RECOIL},{h:'fist'}),K(.09,'io',{a:A_GUN},{h:'fist',shoot:S_BULLET2}),K(.04,'out',{dx:-4,a:A_RECOIL},{h:'fist'}),
    K(.09,'io',{dx:-2,a:A_GUN},{h:'fist',shoot:S_BULLET2}),K(.05,'out',{dx:-6,a:A_RECOIL},{h:'fist'}),K(.14,'io',{dx:-4,a:A_GUN},{h:'fist'}),K(.22,'io',{}),K(.2,'lin',{})]),
  cast:mkTrack([K(.28,'io',{a:A_CHARGE},{h:'open'}),K(.14,'lin',{a:A_CHARGE},{h:'open'}),K(.07,'out',{dx:6,dy:4,a:A_CASTOUT},{h:'open',shoot:{kind:'orb',hit:{t:'low',push:22,dmg:12}}}),
    K(.2,'lin',{dx:6,dy:4,a:A_CASTOUT},{h:'open'}),K(.28,'io',{}),K(.2,'lin',{})]),
  burst:mkTrack([K(.36,'io',{dy:-8,a:A_BIG},{h:'open'}),K(.18,'lin',{dy:-9,a:A_BIG},{h:'open'}),K(.08,'out',{dx:10,dy:9,a:A_SLAM},{h:'fist',thud:true,shoot:{kind:'nova',hit:{t:'launch',push:20,dmg:16}}}),
    K(.26,'lin',{dx:10,dy:9,a:A_SLAM},{h:'fist'}),K(.3,'io',{}),K(.2,'lin',{})]),
});
const SHOT={arrow:{v:640},bullet:{v:1150},orb:{v:400},nova:{v:330}};
const REACTS={hitHigh:{th:'โดนบน'},hitLow:{th:'โดนท้อง'},launch:{th:'ลอยล้ม'},block:{th:'กัน'},dodge:{th:'ถอยหลบ'}};
function animate(name,t){
  if(name==='idle'){
    const p=mkPose({}), s=Math.sin(t*1.9);
    p.y+=1.6*s; p.a.spine+=1.5*s; p.a.head-=1.5*s; p.a.wing+=6*Math.sin(t*1.9-.6); p.a.armR_u+=2.5*Math.sin(t*1.9+1); p.a.armL_u-=2.5*Math.sin(t*1.9+1);
    p.a.legR_u-=.8*s; p.a.legR_l+=1.6*s; p.a.legL_u-=.8*s; p.a.legL_l+=1.6*s;
    return {pose:p,key:0,prev:null,wind:0,hand:'relax'};
  }
  if(name==='run'){
    const q=t*10, s=Math.sin(q), c=Math.cos(q), sm=v=>{v=Math.max(0,v);return v*v*(3-2*v);};
    const p=mkPose({dy:3-6*Math.abs(c),a:{spine:-72+2*Math.sin(q*2),head:10,wing:-48+14*Math.sin(q*2),
      legR_u:88-46*s, legR_l:14+74*sm(Math.cos(q+.35)), legL_u:88+46*s, legL_l:14+74*sm(-Math.cos(q+.35)),
      armR_u:166+42*s, armR_l:-82-10*s, handR:-25, armL_u:176-42*s, armL_l:-82+10*s, handL:-40}});
    return {pose:p,key:0,prev:null,wind:24,hand:'fist'};
  }
  if(name==='wave'){
    const p=mkPose(POSES.wavehi.def); p.y+=Math.sin(t*1.9); p.a.armL_l+=26*Math.sin(t*9); p.a.head+=3*Math.sin(t*4.5);
    return {pose:p,key:0,prev:null,wind:0,hand:'open'};
  }
  if(name==='hype'){
    const p=mkPose(POSES.cheer.def), u=(t*2.2)%1, j=Math.sin(Math.PI*Math.min(1,u*1.4)); p.y-=18*j; 
    const b=1-j; p.a.legR_u-=18*b; p.a.legR_l+=36*b; p.a.legL_u-=14*b; p.a.legL_l+=30*b; p.y+=7*b; p.a.armR_u+=10*Math.sin(t*13.8); p.a.armL_u-=10*Math.sin(t*13.8);
    return {pose:p,key:0,prev:null,wind:0,hand:'open'};
  }
  return evalTrack(TRACKS[name],t);
}

const ELEMENTS={mono:{th:'ดินสอดำ',c:['#1b1b1d','#77777a','#c9c9cc']},fire:{th:'ไฟ',c:['#e23d28','#f58a1f','#ffd23f']},ice:{th:'น้ำแข็ง',c:['#2563ae','#4fb3e8','#d9f4ff']},bolt:{th:'สายฟ้า',c:['#6a3bd1','#b08cff','#fff27a']}};
const WTYPE={none:'fist',katana:'blade',great:'blade',axe:'blade',scythe:'blade',spear:'pole',staff:'magic',bow:'bow',gun:'gun'};
const wtype=eq=>WTYPE[eq.weapon]||'blade';
const MUZ={bow:14*GEAR,gun:66*GEAR,staff:112*GEAR};
const REACH={gun:0,scythe:140*GEAR,great:134*GEAR,none:0,katana:116*GEAR,spear:156*GEAR,staff:119*GEAR,axe:106*GEAR,bow:0};
export { ATKSET,ATTACKS,A_AIM,A_AIR,A_AIR2,A_AIRAIM,A_BIG,A_BLOCK,A_CASTOUT,A_CHAMB,A_CHAMB2,A_CHARGE,A_CROSS,A_CROUCH,A_DOWN,A_GUN,A_HITHI,A_HITHI2,A_HITLO,A_HOP,A_JAB,A_KICK,A_KICK2,A_LOOSE,A_LOW,A_PULL,A_PULL2,A_RECOIL,A_RISE,A_SETTLE,A_SIT,A_SLAM,A_STRIKE,A_THRUST,A_TUCK,A_UP,A_WIN,BMAP,BONES,EASE,ELEMENTS,FALL,HOME,LOOPS,MUZ,ORDER,PAPER,POSES,P_WIND,REACH,REACTS,REST,SHOT,S_ARROW,TRACKS,WTYPE,animLen,animate,evalTrack,lerpPose,mkPose,mkTrack,norm,solve,wtype,INK, GROUND, GEAR, S_ARROW2, S_BULLET, S_BULLET2, K, RANGED, SPCOST };
