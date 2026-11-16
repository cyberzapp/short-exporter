(function(){
"use strict";
var TEST=false,HOSTED=false;
var $=function(i){return document.getElementById(i)};
var code=$('code'),frame=$('frame'),phone=$('phone'),status=$('status'),bar=$('bar'),barI=bar.firstElementChild;
var btnPrev=$('prev'),btnExp=$('exp'),btnCancel=$('cancel'),btnRt=$('rt'),lenIn=$('len'),sizeSel=$('size');
var info=null, errors=[], busy=false, lenTouched=false, loadId=0, cancelled=false, pending=null;
var FPS=30;

function say(msg,cls){status.className=cls||'';status.textContent=msg}
function progress(p){bar.style.display=p==null?'none':'block';if(p!=null)barI.style.width=Math.round(p*100)+'%'}
function layout(h){var w=Math.round(h*9/16);phone.style.width=w+'px';phone.style.height=h+'px';frame.style.transform='scale('+(w/1080)+')';return w}
layout(480);
lenIn.addEventListener('input',function(){lenTouched=true});
function setBusy(b){busy=b;btnExp.disabled=btnPrev.disabled=btnRt.disabled=b}

// ---------- errors reported by the pasted page ----------
function jsErrs(){return errors.filter(function(e){return (e.kind==='js'||e.kind==='step')&&!/ResizeObserver loop/.test(e.msg)})}
function animates(){return !!(info&&(info.det||info.raf>0))}
function hideFix(){$('fix').style.display='none';$('note').style.display='none';$('hostnote').style.display='none';lastResult=null}
function warnNote(m){var n=$('note');n.textContent=m;n.style.display='block'}
function showCrash(raw){
  var m=String(raw).replace(/\s+/g,' ').slice(0,200);
  say("Your animation's code has an error, so it can't play: \u00AB"+m+"\u00BB. That is the AI's mistake, not yours. Click the button below, paste the message to the same AI, and it will send you a fixed file.",'err');
  $('fixtext').value='The page crashes with this error and nothing is drawn: "'+m+'". Fix it, check the whole script for other mistakes, and return the complete single HTML file again. Output only the code.';
  $('fix').style.display='block';
}
function showError(e){if(e&&e.crash)showCrash(e.crash);else say((e&&e.message)||String(e),'err')}
function crashError(msg){var e=new Error(msg);e.crash=msg;return e}
$('copyfix').onclick=function(event){
  var b=event.currentTarget,t=$('fixtext');
  function done(){b.textContent='Copied';setTimeout(function(){b.textContent='Copy fix message for the AI'},2000)}
  function fallback(){t.focus();t.select();try{if(document.execCommand('copy'))done()}catch{}}
  try{if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(t.value).then(done,fallback);return}}catch{}
  fallback();
};

// ---------- code that runs INSIDE the preview iframe (injected into the pasted page) ----------
// Runs INSIDE the preview iframe, injected before the page's own scripts (it is stringified and inlined).
function bootstrap(EXPORT){
  var P=parent,FPS=30,V0=1000,XH='http://www.w3.org/1999/xhtml',SV='http://www.w3.org/2000/svg';
  function send(m,tr){try{m.src='se';P.postMessage(m,'*',tr||[])}catch{}}
  addEventListener('error',function(e){
    var t=e.target;
    if(t&&t!==window&&t.tagName)send({type:'error',kind:'resource',msg:(t.tagName+' '+(t.src||t.href||'')).trim()});
    else send({type:'error',kind:'js',msg:String(e.message||'')});
  },true);
  addEventListener('unhandledrejection',function(e){send({type:'error',kind:'js',msg:String(e.reason)})});

  // --- always: draw at 1x, and keep WebGL pictures readable so they can be copied later
  try{Object.defineProperty(window,'devicePixelRatio',{get:function(){return 1},configurable:true})}catch{}
  var oGC=HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext=function(type,attrs){
    if(typeof type==='string'&&/^(experimental-)?webgl2?$/.test(type))attrs=Object.assign({},attrs||{},{preserveDrawingBuffer:true});
    return oGC.call(this,type,attrs);
  };

  // --- virtual clock (export only): time only moves when the exporter steps a frame
  var rafCalls=0,RP=performance.now.bind(performance),vnow=V0,rafQ=[],rafN=0,hasR=false,animBorn=new WeakMap();
  if(!EXPORT){var oRAF=window.requestAnimationFrame;window.requestAnimationFrame=function(cb){rafCalls++;return oRAF.call(window,cb)}}
  if(EXPORT){
    var RD=Date,E0=RD.now();
    var VD=function(){
      if(!new.target)return RD();
      if(!arguments.length)return new RD(E0+vnow-V0);
      return new (Function.prototype.bind.apply(RD,[null].concat([].slice.call(arguments))))();
    };
    VD.prototype=RD.prototype;VD.now=function(){return E0+vnow-V0};VD.parse=RD.parse;VD.UTC=RD.UTC;
    try{window.Date=VD}catch{}
    try{performance.now=function(){return vnow}}catch{}
    window.requestAnimationFrame=function(cb){rafCalls++;rafQ.push({id:++rafN,cb:cb});return rafN};
    window.cancelAnimationFrame=function(id){rafQ=rafQ.filter(function(x){return x.id!==id})};
  }
  function stepAnims(tms){
    if(!document.getAnimations)return;
    var as=document.getAnimations();
    for(var k=0;k<as.length;k++){
      var a=as[k],b=animBorn.get(a);
      if(b===undefined){b=tms;animBorn.set(a,b)}
      try{if(a.playState==='running')a.pause();a.currentTime=tms-b}catch{}
    }
  }

  // --- info for the parent page (same as v1)
  setInterval(function(){
    var cs=document.querySelectorAll('canvas'),best=null,a=0;
    for(var i=0;i<cs.length;i++){var r=cs[i].getBoundingClientRect(),s=r.width*r.height;if(s>a){a=s;best=r}}
    send({type:'info',canvases:cs.length,area:a,w:best?best.width:0,h:best?best.height:0,
      det:typeof window.renderAt==='function',raf:rafCalls,dur:+window.DURATION||0,ready:document.readyState==='complete'});
  },250);

  // --- DOM -> picture: clone with computed styles inlined, wrap in SVG foreignObject, load from a data: URL
  var SKIPTAG={script:1,style:1,link:1,meta:1,noscript:1,template:1,title:1,head:1,base:1,audio:1,source:1,track:1,datalist:1};
  var PLACE={canvas:1,video:1,iframe:1,object:1,embed:1};
  var SKIPP=/^(animation|transition|--|scroll|overscroll|view-|timeline|container|will-change|cursor|pointer-events|user-select|resize|caret|speak|interactivity|app-region|-webkit-(app-region|user|tap|locale|rtl-ordering|highlight))/;
  var INH=/^(color$|direction|font|letter-spacing|line-height|list-style|text-(align|indent|shadow|transform|rendering|wrap|justify|size-adjust|orientation|underline|emphasis|spacing)|visibility|white-space|word-|overflow-wrap|tab-size|-webkit-text-(fill|stroke)|-webkit-font-smoothing|hyphens|quotes|border-collapse|border-spacing|caption-side|empty-cells|writing-mode|fill|stroke|paint-order|text-anchor|dominant-baseline|shape-rendering|image-rendering|color-interpolation|marker|accent-color|color-scheme)/;
  var ALWAYS={width:1,height:1,'inline-size':1,'block-size':1,'perspective-origin':1,'transform-origin':1};
  var SVGP={};('opacity fill fill-opacity fill-rule stroke stroke-width stroke-opacity stroke-dasharray stroke-dashoffset stroke-linecap stroke-linejoin stroke-miterlimit visibility display transform transform-origin transform-box filter clip-path clip-rule mask mix-blend-mode font-family font-size font-weight font-style font-variant-numeric letter-spacing word-spacing text-anchor dominant-baseline alignment-baseline stop-color stop-opacity marker-start marker-mid marker-end paint-order vector-effect shape-rendering text-decoration-line white-space color').split(' ').forEach(function(p){SVGP[p]=1});
  var LAYOUTP=/^(display|position|float|clear|width|height|min-|max-|margin|padding|border-[a-z]+-(width|style)|box-sizing|flex|order|align-|justify-|grid|gap|row-gap|column-gap|top|right|bottom|left|inset|overflow|line-height|font-size|white-space)/;
  var BGP=['background-color','background-image','background-position-x','background-position-y','background-size','background-repeat','background-origin','background-clip'];
  var scratch=null,defCache={},imgCache={},ctxState=null;
  function ensureScratch(){ // an isolated spot (shadow DOM) where fresh elements show the browser's default styles
    if(scratch)return;
    var h=document.createElement('div');h.setAttribute('data-se-skip','1');
    h.style.cssText='all:initial;display:block;position:fixed;left:-99999px;top:0;width:300px;height:300px';
    (document.body||document.documentElement).appendChild(h);
    scratch=h.attachShadow({mode:'open'});
  }
  function defs(ns,tag){
    var key=ns+'|'+tag,r=defCache[key];if(r)return r;
    ensureScratch();r={};
    var n=document.createElementNS(ns,tag);scratch.appendChild(n);
    var cs=getComputedStyle(n);
    for(var k=0;k<cs.length;k++)r[cs[k]]=cs.getPropertyValue(cs[k]);
    scratch.removeChild(n);defCache[key]=r;return r;
  }
  function styleOf(cs,pv,df,svg,only){
    var s='',cur={},n=cs.length;
    for(var k=0;k<n;k++){
      var p=cs[k];
      if(SKIPP.test(p)||(svg&&!SVGP[p]))continue;
      if(only&&!only.test(p))continue;
      var v=cs.getPropertyValue(p);cur[p]=v;
      if(ALWAYS[p]){if(!svg)s+=p+':'+v+';';continue}
      if(pv&&INH.test(p)){if(v===pv[p])continue}
      else if(v===df[p]&&(!pv||v===pv[p]))continue;
      s+=p+':'+v+';';
    }
    return {s:s,cur:cur};
  }
  function oneLine(el){
    var top=null,any=false;
    for(var c=el.firstChild;c;c=c.nextSibling){
      if(c.nodeType!==3||!/\S/.test(c.nodeValue))continue;
      var r=document.createRange();r.selectNodeContents(c);var rs=r.getClientRects();
      for(var i=0;i<rs.length;i++){if(!rs[i].width)continue;any=true;if(top===null)top=rs[i].top;else if(Math.abs(rs[i].top-top)>3&&Math.abs(rs[i].bottom-top)>3&&rs[i].top>top+3)return false}
    }
    return any;
  }
  function imgData(el){
    var src=el.currentSrc||el.src;if(!src)return null;
    if(/^data:/.test(src))return src;
    if(imgCache[src]!==undefined)return imgCache[src];
    var out=null;
    try{if(el.complete&&el.naturalWidth>0){var c=document.createElement('canvas');c.width=el.naturalWidth;c.height=el.naturalHeight;c.getContext('2d').drawImage(el,0,0);out=c.toDataURL('image/png')}}catch(e){out=null}
    if(el.complete)imgCache[src]=out;
    return out;
  }
  function pseudo(el,which,cur){
    var ps=getComputedStyle(el,which),c=ps.content;
    if(!c||c==='none'||c==='normal'||ps.display==='none')return null;
    var m=/^"([\s\S]*)"$/.exec(c)||/^'([\s\S]*)'$/.exec(c),txt='';
    if(m)txt=m[1].replace(/\\([0-9a-fA-F]{1,6})\s?|\\([\s\S])/g,function(a,h,ch){return h?String.fromCodePoint(parseInt(h,16)):ch});
    var s=document.createElementNS(XH,'span'),r=styleOf(ps,cur,defs(XH,'span'),false);
    s.setAttribute('style',r.s+(ps.opacity==='0'?'visibility:hidden;':''));
    if(txt)s.appendChild(document.createTextNode(txt));
    return s;
  }
  // mode 'above' = everything painted over the canvases; 'below' = only the boxes that contain a canvas (their backgrounds)
  function cloneEl(el,pv,mode,inSvg){
    var tag=el.localName,ns=el.namespaceURI,S=ctxState;
    if(SKIPTAG[tag]||(el.hasAttribute&&el.hasAttribute('data-se-skip')))return null;
    var cs=getComputedStyle(el);
    if(cs.display==='none')return null;
    var svg=ns===SV,isPath=S.path.has(el),isBody=el===document.body,ctag=tag,node;
    var belowHide=mode==='below'&&!isPath;
    if(belowHide&&(cs.position==='absolute'||cs.position==='fixed'))return null;
    var hide=belowHide||(!svg&&PLACE[tag])||cs.opacity==='0';
    if(!svg&&(isBody||PLACE[tag]))ctag='div';
    try{node=document.createElementNS(svg?SV:XH,ctag)}catch(e){node=document.createElementNS(XH,'div');ctag='div'}
    var df=defs(svg?SV:XH,ctag),r=styleOf(cs,pv,df,svg&&inSvg,belowHide?LAYOUTP:null),st=r.s;
    if(svg){
      for(var a=0;a<el.attributes.length;a++){var at=el.attributes[a];if(at.name==='style'||at.name==='class')continue;try{node.setAttributeNS(at.namespaceURI,at.name,at.value)}catch{}}
    }else{
      if(tag==='img'&&!hide&&mode==='above'){var u=imgData(el);if(u)node.setAttribute('src',u);else hide=true}
      if(tag==='br'||tag==='wbr'){if(cs.display==='inline')st=''}
      if(!hide&&cs.whiteSpace==='normal'&&oneLine(el))st+='white-space:nowrap;';
      if((isPath&&mode==='above')||(isBody&&S.bodyProp))st+='background:none;box-shadow:none;border-color:transparent;outline:none;';
    }
    if(hide)st+='visibility:hidden;';
    node.setAttribute('style',st);
    if(hide||(tag==='img'))return node;
    var inS=svg&&(inSvg||tag==='svg');
    if(!svg&&mode==='above'){var b=pseudo(el,'::before',r.cur);if(b)node.appendChild(b)}
    for(var c=el.firstChild;c;c=c.nextSibling){
      if(c.nodeType===3){if(mode==='above')node.appendChild(document.createTextNode(c.nodeValue))}
      else if(c.nodeType===1){var k=cloneEl(c,r.cur,mode,inS);if(k)node.appendChild(k)}
    }
    if(!svg&&mode==='above'){var a2=pseudo(el,'::after',r.cur);if(a2)node.appendChild(a2)}
    return node;
  }
  function visAlpha(el){
    var a=1;
    for(var e=el;e&&e.nodeType===1;e=e.parentElement){
      var cs=getComputedStyle(e);if(cs.display==='none')return 0;
      if(e===el&&cs.visibility==='hidden')return 0;
      a*=parseFloat(cs.opacity);if(!(a>0))return 0;
    }
    return a;
  }
  function markup(mode,state,W,H){
    ctxState=state;
    var hcs=getComputedStyle(document.documentElement),bcs=getComputedStyle(document.body);
    var root=document.createElementNS(XH,'div'),bg='';
    if(mode==='below'){
      var src=hcs;
      if(hcs.backgroundImage==='none'&&/^rgba\(\d+, \d+, \d+, 0\)$|^transparent$/.test(hcs.backgroundColor))src=bcs;
      BGP.forEach(function(p){bg+=p+':'+src.getPropertyValue(p)+';'});
    }
    root.setAttribute('style','all:initial;display:block;position:relative;overflow:hidden;transform:translate(0,0);width:'+W+'px;height:'+H+'px;'+bg);
    var bodyNode=cloneEl(document.body,defs(XH,'div'),mode,false);
    if(bodyNode)root.appendChild(bodyNode);
    var x=new XMLSerializer().serializeToString(root).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g,'');
    return '<svg xmlns="'+SV+'" width="'+W+'" height="'+H+'"><foreignObject x="0" y="0" width="'+W+'" height="'+H+'">'+x+'</foreignObject></svg>';
  }
  function bodyPropagates(){
    var hcs=getComputedStyle(document.documentElement);
    return hcs.backgroundImage==='none'&&/^rgba\(\d+, \d+, \d+, 0\)$|^transparent$/.test(hcs.backgroundColor);
  }

  var cvM=null,cvF=null,cvO=null,slots={below:{s:null,img:null},above:{s:null,img:null}},stat={dA:0,rA:0,dB:0,rB:0,errs:0,lastErr:'',msRender:0,msCopy:0,msMarkup:0,msDecode:0,msConvert:0};
  function loadSvg(str){
    return new Promise(function(res,rej){
      var im=new Image();
      im.onload=function(){res(im)};im.onerror=function(){rej(new Error('picture of the page could not be decoded'))};
      im.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(str);
    });
  }
  async function layerImg(slot,str,isAbove){
    if(str===slot.s){if(isAbove)stat.rA++;else stat.rB++;return slot.img}
    var img=null;
    try{img=await loadSvg(str);try{await img.decode()}catch{}}catch(e){stat.errs++;stat.lastErr=String(e.message||e)}
    slot.s=str;slot.img=img;if(isAbove)stat.dA++;else stat.dB++;return img;
  }
  async function doStep(d){
    var i=d.i,W=1080,H=1920,tms=i*1000/FPS,tt=i/FPS;
    var T0=RP();vnow=V0+tms;
    if(i===0)hasR=typeof window.renderAt==='function';
    if(hasR)window.renderAt(tt);
    else{var q=rafQ;rafQ=[];for(var k=0;k<q.length;k++){try{q[k].cb(vnow)}catch(x){send({type:'error',kind:'js',msg:String(x)})}}}
    stepAnims(tms);var T1=RP();stat.msRender+=T1-T0;
    // 1) copy the canvases right now (synchronously)
    if(!cvM){cvM=document.createElement('canvas');cvM.width=W;cvM.height=H;cvF=document.createElement('canvas');cvF.width=W;cvF.height=H;cvF.getContext('2d',{willReadFrequently:true,alpha:false})}
    var m=cvM.getContext('2d');m.setTransform(1,0,0,1,0,0);m.globalAlpha=1;m.clearRect(0,0,W,H);
    var path=new Set();path.add(document.body);
    var cs=document.getElementsByTagName('canvas');
    for(var j=0;j<cs.length;j++){
      var c=cs[j];if(c.hasAttribute('data-se-skip')||!c.width||!c.height)continue;
      var al=visAlpha(c);if(!(al>0))continue;
      var r=c.getBoundingClientRect();if(r.width<=0||r.height<=0)continue;
      m.globalAlpha=al;try{m.drawImage(c,r.left,r.top,r.width,r.height)}catch(e){stat.errs++;stat.lastErr='canvas copy: '+e.message}
      for(var e=c.parentElement;e;e=e.parentElement)path.add(e);
    }
    var T2=RP();stat.msCopy+=T2-T1;
    // 2) describe the rest of the page (also synchronously, same moment)
    var state={path:path,bodyProp:bodyPropagates()};
    var sBelow=markup('below',state,W,H),sAbove=markup('above',state,W,H);
    var T3=RP();stat.msMarkup+=T3-T2;
    // 3) now it is safe to wait
    var imgs=await Promise.all([layerImg(slots.below,sBelow,false),layerImg(slots.above,sAbove,true)]);
    var T4=RP();stat.msDecode+=T4-T3;
    var f=cvF.getContext('2d');f.globalAlpha=1;f.fillStyle='#fff';f.fillRect(0,0,W,H);
    if(imgs[0])f.drawImage(imgs[0],0,0,W,H);
    f.drawImage(cvM,0,0);
    if(imgs[1])f.drawImage(imgs[1],0,0,W,H);
    var OW=d.W||W,OH=d.H||H;
    if(d.fmt!=='i420'){
      var opt=(OW!==W)?{resizeWidth:OW,resizeHeight:OH,resizeQuality:'high'}:undefined;
      var bmp=await createImageBitmap(cvF,opt);
      send({type:'frame',i:i,bmp:bmp,stat:stat},[bmp]);
      return;
    }
    // limited-range BT.709 I420 (what players expect from a normal yuv420p H.264 file)
    var src=cvF;
    if(OW!==W){
      if(!cvO){cvO=document.createElement('canvas')}
      cvO.width=OW;cvO.height=OH;var o=cvO.getContext('2d',{willReadFrequently:true,alpha:false});
      o.imageSmoothingEnabled=true;o.imageSmoothingQuality='high';o.drawImage(cvF,0,0,OW,OH);src=cvO;
    }
    var px=src.getContext('2d').getImageData(0,0,OW,OH).data;
    var out=new Uint8Array(OW*OH*3/2),U=OW*OH,V=U+(U>>2),hw=OW>>1;
    for(var y=0;y<OH;y+=2){
      var r0=y*OW*4,r1=r0+OW*4,y0=y*OW,y1=y0+OW,co=(y>>1)*hw;
      for(var x=0;x<OW;x+=2){
        var a=r0+x*4,b=a+4,c=r1+x*4,e2=c+4;
        var R0=px[a],G0=px[a+1],B0=px[a+2],R1=px[b],G1=px[b+1],B1=px[b+2],R2=px[c],G2=px[c+1],B2=px[c+2],R3=px[e2],G3=px[e2+1],B3=px[e2+2];
        out[y0+x]=((47*R0+157*G0+16*B0+128)>>8)+16;out[y0+x+1]=((47*R1+157*G1+16*B1+128)>>8)+16;
        out[y1+x]=((47*R2+157*G2+16*B2+128)>>8)+16;out[y1+x+1]=((47*R3+157*G3+16*B3+128)>>8)+16;
        var R=R0+R1+R2+R3,G=G0+G1+G2+G3,B=B0+B1+B2+B3,o2=co+(x>>1);
        out[U+o2]=((-26*R-87*G+113*B+512)>>10)+128;
        out[V+o2]=((113*R-102*G-11*B+512)>>10)+128;
      }
    }
    stat.msConvert+=RP()-T4;
    send({type:'frame',i:i,buf:out.buffer,stat:stat},[out.buffer]);
  }
  addEventListener('message',function(e){
    var d=e.data;if(!d||d.src!=='se-cmd'||e.source!==P)return;
    if(d.type==='drive'&&typeof window.renderAt==='function'&&!EXPORT){
      var t0=performance.now(),D=+window.DURATION||d.len;
      (function loop(){var t=(performance.now()-t0)/1000;try{window.renderAt(Math.min(t,D))}catch(x){send({type:'error',kind:'js',fatal:true,msg:String(x)});return}
        if(t<d.len+1)requestAnimationFrame(loop)})();
    }else if(d.type==='step'&&EXPORT){
      doStep(d).catch(function(x){send({type:'error',kind:'step',msg:String(x&&x.stack||x)})});
    }
  });
}


function inject(html,exportMode){
  var tag='<script>('+bootstrap.toString()+')('+(exportMode?'true':'false')+')<\/script>';
  var m=/<head[^>]*>/i.exec(html);
  if(m)return html.slice(0,m.index+m[0].length)+tag+html.slice(m.index+m[0].length);
  m=/<html[^>]*>/i.exec(html);
  if(m)return html.slice(0,m.index+m[0].length)+tag+html.slice(m.index+m[0].length);
  return tag+html;
}
function clean(t){ // strip markdown fences the AI chat may add
  t=t.trim().replace(/^```[a-z]*\s*\n/i,'').replace(/\n```\s*$/,'');
  return t;
}
window.addEventListener('message',function(e){
  var d=e.data;if(!d||d.src!=='se'||e.source!==frame.contentWindow)return;
  if(d.type==='info'){info=d;if(d.det&&d.dur>0&&!lenTouched)lenIn.value=d.dur}
  else if(d.type==='error'){
    errors.push(d);
    if(d.fatal&&!busy&&!pending&&info)showCrash(d.msg);
    if(pending&&d.kind==='step'){var p=pending;pending=null;p.rej(new Error("The animation stopped working while I was drawing frame "+p.i+". ("+d.msg.slice(0,200)+")"))}
  }
  else if(d.type==='frame'&&pending&&pending.i===d.i){var p2=pending;pending=null;p2.res(d)}
  else if(d.type==='frame'&&d.bmp)d.bmp.close();
});

function loadPage(html,exportMode){
  info=null;errors=[];loadId++;
  frame.srcdoc=inject(html,!!exportMode);
}
function LIBMSG(){return "The animation page couldn't load a library it needs (usually three.js, which is downloaded from the internet). Check your internet connection and try again. If it keeps failing, ask the AI to use three.js from cdnjs.cloudflare.com."+(errors[0]?" (Details: "+errors[0].msg.slice(0,120)+")":"")}
function waitReady(timeoutMs){
  return new Promise(function(res,rej){
    var t0=Date.now();
    (function poll(){
      if(errors.some(function(e){return e.kind==='resource'&&/^SCRIPT/.test(e.msg)}))return rej(new Error(LIBMSG()));
      if(info&&info.ready&&info.canvases>0&&info.area>0){
        return setTimeout(res,400);
      }
      if(Date.now()-t0>timeoutMs){
        var fe=jsErrs().filter(function(e){return !/module|import|fetch|network|resolve/i.test(e.msg)});
        if(fe.length)return rej(crashError(fe[0].msg));
        var lib=errors.some(function(e){return e.kind==='resource'||/import|module|three|fetch|undefined|not defined|network/i.test(e.msg)});
        return rej(new Error(lib?LIBMSG():
          "I couldn't find a <canvas> (the drawing area) in that page, so there is nothing to record. Make sure you pasted the whole HTML file the AI gave you, from <!DOCTYPE html> to </html>."+(errors[0]?" (Page error: "+errors[0].msg.slice(0,120)+")":"")));
      }
      setTimeout(poll,200);
    })();
  });
}
function getHtml(){
  var h=clean(code.value);
  if(!h)throw new Error("There is no code yet. Paste the code the AI gave you into the big box (or choose the .html file).");
  if(h.indexOf('<')<0)throw new Error("That doesn't look like HTML code. Paste the whole file the AI gave you, starting with <!DOCTYPE html>.");
  return h;
}

// ---------- file picker + example ----------
$('pick').onclick=function(){$('file').click()};
$('file').onchange=function(){
  var f=this.files[0];if(!f)return;
  var r=new FileReader();r.onload=function(){hideFix();code.value=r.result;lenTouched=false;say("Loaded "+f.name+". Click Preview.")};
  r.onerror=function(){say("I couldn't read that file.","err")};
  r.readAsText(f);this.value='';
};
$('example').onclick=function(){
  if(busy)return;
  hideFix();code.value=JSON.parse($('example-data').textContent);lenTouched=false;
  say(TEST?"Loaded the test animation. Click Preview.":"Loaded a small example animation (6 seconds). Click Preview.");
};

// ---------- preview ----------
btnPrev.onclick=function(){
  if(busy)return;
  $('result').style.display='none';hideFix();
  try{var html=getHtml()}catch(e){return say(e.message,'err')}
  say("Loading your animation...");progress(null);
  loadPage(html,false);
  waitReady(20000).then(function(){
    var fe=jsErrs();
    if(fe.length&&!animates())return showCrash(fe[0].msg);
    var len=Math.max(1,+lenIn.value||20);
    frame.contentWindow.postMessage({src:'se-cmd',type:'drive',len:len},'*');
    say("Playing"+(info.det?" (frame-stepped animation)":"")+". If it looks right, click Export MP4.","ok");
    if(fe.length)warnNote("Heads up: the page reported an error (\u00AB"+fe[0].msg.slice(0,160)+"\u00BB) but it still animates. Parts of it may be missing in the video.");
    var id=loadId;setTimeout(function(){var f=errors.filter(function(e){return e.fatal})[0];if(f&&!busy&&id===loadId)showCrash(f.msg)},1500);
  }).catch(showError);
};

// ---------- result ----------
var lastResult=null,lastNote='',autoTried=false,dlApi=null,hostP=null;
var dlState=(HOSTED&&window.claude&&typeof window.claude.use==='function')?'pending':'off'; // off | pending | api | none
if(HOSTED)btnRt.parentNode.style.display='none';
if(dlState==='pending'){
  hostP=new Promise(function(res){
    var p,timer;
    try{p=Promise.resolve(window.claude.use('downloads'))}catch(e){p=Promise.resolve(null)}
    timer=setTimeout(function(){if(dlState==='pending'){dlState='none';refreshHost()}res()},10000);
    p.then(function(api){clearTimeout(timer);if(api&&typeof api.save==='function'){dlApi=api;dlState='api'}else dlState='none';refreshHost();res()},
           function(){clearTimeout(timer);dlState='none';refreshHost();res()});
  });
}
function autoDownload(){var tmp=document.createElement('a');tmp.href=$('dl').href;tmp.download=lastResult.name;document.body.appendChild(tmp);tmp.click();tmp.remove()}
function refreshHost(){
  if(!lastResult)return;
  if(dlState==='none'){
    $('hostnote').style.display='block';say(lastNote,'ok');
    if(!autoTried){autoTried=true;try{autoDownload()}catch{}}
  }else{
    $('hostnote').style.display='none';
    say("Done! Click the green button to save your "+(/mp4$/.test(lastResult.name)?"MP4":"video")+".","ok");
  }
}
$('dl').addEventListener('click',function(ev){
  if(dlState==='off'||dlState==='none'||!lastResult)return;
  ev.preventDefault();
  var r=lastResult;
  hostP.then(function(){
    if(!dlApi)return;
    var p;try{p=Promise.resolve(dlApi.save({filename:r.name,data:r.blob}))}catch(x){p=Promise.reject(x)}
    p.then(function(){say("Saved. Look in your Downloads folder.","ok")},function(err){
      var code=err&&(err.code||err.message);
      if(code==='declined')say("Save cancelled. Click the green button to try again.");
      else say("Couldn't save the file here ("+(code||'unknown')+"). Try right-clicking the video above and choosing 'Save video as...'.","err");
    });
  });
});
function showResult(blob,name,note){
  var url=URL.createObjectURL(blob);
  lastResult={blob:blob,name:name};lastNote=note;autoTried=false;
  var a=$('dl');a.href=url;a.download=name;a.textContent='Download '+name+' ('+(blob.size/1048576).toFixed(1)+' MB)';
  $('resv').src=url;$('result').style.display='block';progress(null);
  if(dlState==='off'){say(note,"ok");autoDownload()}
  else refreshHost();
}

// ---------- export (default): frame-exact, offline ----------
function webCodecsPresent(){return typeof VideoEncoder!=='undefined'&&typeof VideoFrame!=='undefined'&&typeof createImageBitmap!=='undefined'&&typeof Mp4Muxer!=='undefined'}
async function pickEncoder(W,H){
  var codecs=['avc1.640028','avc1.4d0028','avc1.42E028'],hws=['no-preference','prefer-software'];
  var bitrate=W>=1000?12000000:8000000;
  for(var i=0;i<codecs.length;i++)for(var j=0;j<hws.length;j++){
    var cfg={codec:codecs[i],width:W,height:H,bitrate:bitrate,framerate:FPS,latencyMode:'quality',avc:{format:'avc'},hardwareAcceleration:hws[j]};
    try{var s=await VideoEncoder.isConfigSupported(cfg);if(s&&s.supported)return cfg}catch{}
  }
  return null;
}
function askFrame(i,W,H,fmt){
  return new Promise(function(res,rej){
    pending={i:i,res:res,rej:rej};
    frame.contentWindow.postMessage({src:'se-cmd',type:'step',i:i,W:W,H:H,fmt:fmt},'*');
  });
}
function waitQueue(enc,max){
  return new Promise(function(res){
    if(enc.encodeQueueSize<=max)return res();
    var h=function(){if(enc.encodeQueueSize<=max){enc.removeEventListener('dequeue',h);res()}};
    enc.addEventListener('dequeue',h);
  });
}
var I420CS={primaries:'bt709',transfer:'bt709',matrix:'bt709',fullRange:false};
function i420Ok(W,H){try{var f=new VideoFrame(new Uint8Array(W*H*3/2),{format:'I420',codedWidth:W,codedHeight:H,timestamp:0,colorSpace:I420CS});f.close();return true}catch(e){return false}}
function CancelError(){this.message='Export cancelled.';this.cancelled=true}

async function exportFrames(html,len,W,H,cfg){
  var fmt=i420Ok(W,H)?'i420':'bitmap',N=Math.round(len*FPS),enc=null,encErr=null,muxer=null,t0=performance.now();
  setBusy(true);cancelled=false;btnCancel.style.display='';btnCancel.disabled=false;$('result').style.display='none';
  try{
    say("Loading your animation...");progress(0);
    loadPage(html,true);
    await waitReady(20000);
    if(cancelled)throw new CancelError();
    var fe0=jsErrs();
    if(fe0.length&&!animates())throw crashError(fe0[0].msg);
    if(fe0.length)warnNote("Heads up: the page reported an error (\u00AB"+fe0[0].msg.slice(0,160)+"\u00BB) but it still animates. Parts of it may be missing in the video.");
    muxer=new Mp4Muxer.Muxer({target:new Mp4Muxer.ArrayBufferTarget(),video:{codec:'avc',width:W,height:H,frameRate:FPS},fastStart:'in-memory'});
    enc=new VideoEncoder({
      output:function(chunk,meta){try{muxer.addVideoChunk(chunk,meta)}catch(e){encErr=encErr||e}},
      error:function(e){encErr=e}
    });
    enc.configure(cfg);
    var st={};
    for(var i=0;i<N;i++){
      if(cancelled)throw new CancelError();
      if(encErr)throw new Error("The video encoder stopped: "+(encErr.message||encErr)+" Try the 720 x 1280 size, or use 'Record the screen instead'.");
            var fr=await askFrame(i,W,H,fmt);
      st=fr.stat;
      var vf,fi={timestamp:Math.round(i*1e6/FPS),duration:Math.round(1e6/FPS)};
      if(fr.buf){fi.format='I420';fi.codedWidth=W;fi.codedHeight=H;fi.colorSpace=I420CS;vf=new VideoFrame(new Uint8Array(fr.buf),fi)}
      else{vf=new VideoFrame(fr.bmp,fi);fr.bmp.close()}
      await waitQueue(enc,4);
      enc.encode(vf,{keyFrame:i%60===0});vf.close();
      var el=(performance.now()-t0)/1000,left=Math.max(0,Math.round(el/(i+1)*(N-i-1)));
      progress((i+1)/N);
      say("Rendering frame "+(i+1)+" of "+N+(i>4?" (about "+(left>=90?Math.round(left/60)+" min":left+" s")+" left)":""));
    }
    say("Finishing the MP4 file...");
    await enc.flush();
    if(encErr)throw new Error("The video encoder stopped: "+(encErr.message||encErr));
    enc.close();enc=null;
    muxer.finalize();
    var blob=new Blob([muxer.target.buffer],{type:'video/mp4'});
    var secs=(performance.now()-t0)/1000;
    var stats={frames:N,seconds:+secs.toFixed(1),codec:cfg.codec,hardwareAcceleration:cfg.hardwareAcceleration,msPerFrame:+(secs*1000/N).toFixed(1),
      overlayDecoded:st.dA,overlayReused:st.rA,backgroundDecoded:st.dB,backgroundReused:st.rB,drawErrors:st.errs,lastDrawError:st.lastErr,pixelFormat:fmt,msPerFrameIn:{render:Math.round(st.msRender/N),copyCanvas:Math.round(st.msCopy/N),markup:Math.round(st.msMarkup/N),decode:Math.round(st.msDecode/N),convert:Math.round(st.msConvert/N)},width:W,height:H,bytes:blob.size};
    window.__SE.lastBlob=blob;window.__SE.stats=stats;
    showResult(blob,'my-short.mp4',"Done! Your MP4 is ready. If the download didn't start by itself, click the green button."+(st.errs?" (Heads up: "+st.errs+" times a part of the page could not be drawn, so check the video.)":""));
    $('teststats').textContent=TEST?JSON.stringify(stats):'';
    if(!TEST)$('teststats').textContent='';
    setBusy(false);btnCancel.style.display='none';
    loadPage(html,false);
  }catch(e){
    try{if(enc&&enc.state!=='closed')enc.close()}catch{}
    pending=null;
    progress(null);
    if(e.cancelled)say("Export cancelled.");else showError(e);
    setBusy(false);btnCancel.style.display='none';
    try{loadPage(html,false)}catch{}
  }
}
btnCancel.onclick=function(){cancelled=true;btnCancel.disabled=true;if(pending){var p=pending;pending=null;p.rej(new CancelError())}};

btnExp.onclick=async function(){
  if(busy)return;hideFix();
  var html;try{html=getHtml()}catch(e){return say(e.message,'err')}
  var len=+lenIn.value;if(!(len>=1&&len<=120))return say("Length must be between 1 and 120 seconds.","err");
  var wh=sizeSel.value.split('x'),W=+wh[0],H=+wh[1];
  var cfg=null;
  if(webCodecsPresent())cfg=await pickEncoder(W,H);
  if(!cfg){
    say("This browser can't make the MP4 by itself, so I'll record the screen instead.");
    return exportRealtime(html,len,W,H);
  }
  exportFrames(html,len,W,H,cfg);
};
btnRt.onclick=function(){
  if(busy)return;hideFix();
  var html;try{html=getHtml()}catch(e){return say(e.message,'err')}
  var len=+lenIn.value;if(!(len>=1&&len<=120))return say("Length must be between 1 and 120 seconds.","err");
  var wh=sizeSel.value.split('x');
  exportRealtime(html,len,+wh[0],+wh[1]);
};

// ---------- FALLBACK: record the screen in real time (the v1 method) ----------
function pickMime(){
  if(typeof MediaRecorder==='undefined')return null;
  var c=['video/mp4;codecs=avc1.640028','video/mp4;codecs=avc1.4d0028','video/mp4;codecs=avc1.42E01E','video/mp4;codecs=avc1','video/mp4',
         'video/webm;codecs=vp9','video/webm;codecs=vp8','video/webm'];
  for(var i=0;i<c.length;i++)if(MediaRecorder.isTypeSupported(c[i]))return c[i];
  return null;
}
function sleep(ms){return new Promise(function(r){setTimeout(r,ms)})}
function isBlack(ctx,W,H){
  var d=ctx.getImageData(0,0,W,H);var n=0,lum=0,p=d.data;
  for(var y=0;y<H;y+=Math.max(1,H>>5))for(var x=0;x<W;x+=Math.max(1,W>>5)){var i=(y*W+x)*4;lum+=p[i]+p[i+1]+p[i+2];n++}
  return lum/n/3<6;
}
async function exportRealtime(html,len,W,H){
  if(busy)return;
  var md=navigator.mediaDevices;
  if(!md||!md.getDisplayMedia||typeof MediaRecorder==='undefined'||typeof CropTarget==='undefined'){
    return say("This browser can't record the animation. Please use desktop Chrome or Edge (up to date).","err");
  }
  var mime=pickMime();
  if(!mime)return say("This browser can't make video files. Please use desktop Chrome or Edge.","err");
  var isMp4=/^video\/mp4/.test(mime);

  setBusy(true);$('result').style.display='none';
  var stream=null,rec=null,raf=0,video=null,timer=0;
  var vh=Math.max(300,window.innerHeight),pw=layout(vh);
  document.body.classList.add('exporting');
  document.querySelector('main').style.paddingLeft=Math.max(20,pw+24)+'px';
  function cleanup(){
    cancelAnimationFrame(raf);clearInterval(timer);
    if(stream)stream.getTracks().forEach(function(t){t.stop()});
    document.body.classList.remove('exporting');document.querySelector('main').style.paddingLeft='';layout(480);
    setBusy(false);
  }
  try{
    say("Chrome will now ask what to share. Choose THIS TAB (the one with this page) and click Share.");
    try{
      stream=await md.getDisplayMedia({video:{frameRate:30},audio:false,preferCurrentTab:true,selfBrowserSurface:'include',surfaceSwitching:'exclude',monitorTypeSurfaces:'exclude'});
    }catch(e){
      var m=e&&e.name==='NotAllowedError'?
        "Screen sharing wasn't allowed. Click Export MP4 again and choose 'This tab', then Share. (If you are viewing this page inside another website or app, screen sharing is usually blocked there: download the page and open the saved file in Chrome.)":
        "Couldn't start screen sharing: "+(e&&e.message||e);
      throw new Error(m);
    }
    var vt=stream.getVideoTracks()[0];
    if(!vt||typeof vt.cropTo!=='function')throw new Error("You shared something other than this tab. Click Export MP4 again and choose 'This tab'.");
    try{await vt.cropTo(await CropTarget.fromElement(phone))}
    catch(e){throw new Error("You shared something other than this tab. Click Export MP4 again and choose 'This tab'. ("+(e&&e.name||'')+")")}

    video=document.createElement('video');video.muted=true;video.playsInline=true;video.srcObject=stream;
    await video.play();
    var t0=Date.now();
    while(!(video.videoWidth>0)){if(Date.now()-t0>8000)throw new Error("The screen capture didn't deliver any picture. Try again.");await sleep(100)}

    var cv=document.createElement('canvas');cv.width=W;cv.height=H;
    var ctx=cv.getContext('2d',{willReadFrequently:true});
    ctx.fillStyle='#000';ctx.fillRect(0,0,W,H);
    (function draw(){ctx.drawImage(video,0,0,W,H);raf=requestAnimationFrame(draw)})();

    say("Restarting your animation...");
    loadPage(html,false);
    await waitReady(20000);
    await sleep(300);
    var tb=Date.now();
    while(isBlack(ctx,W,H)&&Date.now()-tb<5000)await sleep(100);

    var out=cv.captureStream(30);
    var chunks=[];
    rec=new MediaRecorder(out,{mimeType:mime,videoBitsPerSecond:W>=1000?8000000:5000000});
    rec.ondataavailable=function(e){if(e.data&&e.data.size)chunks.push(e.data)};
    var stopped=new Promise(function(r){rec.onstop=r});
    frame.contentWindow.postMessage({src:'se-cmd',type:'drive',len:len},'*');
    var tStart=performance.now();
    rec.start(1000);
    say("Recording... "+len+" s. Keep this tab in front.");progress(0);
    await new Promise(function(res){
      timer=setInterval(function(){
        var el=(performance.now()-tStart)/1000;
        progress(Math.min(1,el/len));
        say("Recording... "+Math.min(len,Math.floor(el))+" / "+len+" s. Keep this tab in front.");
        if(el>=len){clearInterval(timer);res()}
      },200);
    });
    rec.stop();await stopped;
    cleanup();stream=null;
    var blob=new Blob(chunks,{type:isMp4?'video/mp4':'video/webm'});
    var name=isMp4?'my-short.mp4':'my-short.webm';
    showResult(blob,name,isMp4?"Done! Your MP4 is ready. If the download didn't start by itself, click the green button.":
      "Done, but this browser can only save WebM (not MP4). The file is "+name+": TikTok/Instagram/Shorts usually accept it, or convert it to MP4 with a free converter. If the download didn't start, click the green button.");
  }catch(e){
    try{if(rec&&rec.state!=='inactive')rec.stop()}catch{}
    cleanup();progress(null);showError(e);
  }
}
/* extras: saved draft, drag & drop, shortcuts, leave warning, wake lock, browser notice */
(function(){
  var ta=document.getElementById('code'),sz=document.getElementById('size'),KEY='short-exporter:v1',tm=0,wl=null,wlBusy=false;
  try{var s=JSON.parse(localStorage.getItem(KEY)||'null');if(s){if(s.code&&!ta.value)ta.value=s.code;if(s.size)sz.value=s.size}}catch{}
  function save(){clearTimeout(tm);tm=setTimeout(function(){try{localStorage.setItem(KEY,JSON.stringify({code:ta.value.slice(0,2000000),size:sz.value}))}catch{}},500)}
  ta.addEventListener('input',save);sz.addEventListener('change',save);
  document.getElementById('clear').addEventListener('click',function(){ta.value='';save();ta.focus()});
  ta.addEventListener('dragover',function(e){e.preventDefault();ta.classList.add('drag')});
  ta.addEventListener('dragleave',function(){ta.classList.remove('drag')});
  ta.addEventListener('drop',function(e){
    e.preventDefault();ta.classList.remove('drag');
    var f=e.dataTransfer&&e.dataTransfer.files&&e.dataTransfer.files[0];
    if(f)f.text().then(function(t){ta.value=t;save()});
  });
  document.addEventListener('keydown',function(e){
    if((e.ctrlKey||e.metaKey)&&e.key==='Enter'){e.preventDefault();document.getElementById('prev').click()}
    else if(e.key==='Escape'&&busy&&btnCancel.style.display!=='none'&&!btnCancel.disabled)btnCancel.click();
  });
  addEventListener('beforeunload',function(e){if(busy){e.preventDefault();e.returnValue=''}});
  setInterval(function(){
    if(!navigator.wakeLock||wlBusy)return;
    if(busy&&!wl){wlBusy=true;navigator.wakeLock.request('screen').then(function(l){wl=l;l.addEventListener('release',function(){wl=null})}).catch(function(){}).then(function(){wlBusy=false})}
    else if(!busy&&wl){wl.release().catch(function(){});wl=null}
  },1000);
  if(typeof VideoEncoder==='undefined'){var st=document.getElementById('status');st.textContent="This browser can't export video. Please open this page in desktop Chrome or Edge.";st.className='err'}
})();
window.__SE={getInfo:function(){return info},errors:function(){return errors},lastBlob:null,stats:null};

})();
