(function(){
"use strict";

var TEST=false,HOSTED=false,FPS=30,SPEEDS=[0.5,1,1.5,2];

// ---------- code that runs INSIDE the preview iframe (injected into the pasted page) ----------
// Kept self-contained with zero outer closures so bootstrap.toString() can be inlined cleanly.
function bootstrap(EXPORT,OPTS){
  OPTS=OPTS||{};
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

  // --- virtual clock (both export and controllable preview)
  var RD=Date,E0=RD.now(),RP=performance.now.bind(performance);
  var oRAF=window.requestAnimationFrame.bind(window);
  var rafCalls=0,vnow=V0,rafQ=[],rafN=0,hasR=false,animBorn=new WeakMap();

  var VD=function(){
    if(!new.target)return RD();
    if(!arguments.length)return new RD(E0+vnow-V0);
    return new (Function.prototype.bind.apply(RD,[null].concat([].slice.call(arguments))))();
  };
  VD.prototype=RD.prototype;VD.now=function(){return E0+vnow-V0};VD.parse=RD.parse;VD.UTC=RD.UTC;
  try{window.Date=VD}catch{}
  try{performance.now=function(){return vnow}}catch{}

  function stepAnims(tms){
    if(!document.getAnimations)return;
    var as=document.getAnimations();
    for(var k=0;k<as.length;k++){
      var a=as[k],b=animBorn.get(a);
      if(b===undefined){b=tms;animBorn.set(a,b)}
      try{if(a.playState==='running')a.pause();a.currentTime=tms-b}catch{}
    }
  }

  var pState={
    active:false,
    playing:true,
    loop:OPTS.loop!==false,
    speed:Number(OPTS.speed)||1,
    len:Number(OPTS.len)||20,
    curT:0,
    ended:false,
    det:false,
    fastForwardMs:0,
    pauseAfterFF:false,
    pumpScheduled:false,
    detScheduled:false
  };
  var lastReal=RP(),firstRafVnow=null,lastSentMs=0;

  function syncCssAnims(){
    if(!document.getAnimations||pState.det)return;
    var as=document.getAnimations();
    for(var k=0;k<as.length;k++){
      var a=as[k];
      try{
        a.playbackRate=pState.speed;
        if(pState.playing&&!pState.ended){if(a.playState==='paused')a.play()}
        else{if(a.playState==='running')a.pause()}
      }catch{}
    }
  }

  function setCssTime(tms){
    if(!document.getAnimations)return;
    var as=document.getAnimations();
    for(var k=0;k<as.length;k++){
      try{as[k].currentTime=tms}catch{}
    }
  }

  function effectiveDur(){
    var wd=+window.DURATION;
    return (wd>0&&isFinite(wd))?wd:pState.len;
  }

  function sendPlayer(force){
    if(EXPORT||!pState.active)return;
    var now=RP();
    if(!force&&now-lastSentMs<55)return;
    lastSentMs=now;
    send({
      type:'player',
      t:pState.curT,
      dur:effectiveDur(),
      playing:pState.playing,
      ended:pState.ended,
      det:pState.det,
      loop:pState.loop,
      speed:pState.speed,
      seeking:pState.fastForwardMs>0
    });
  }

  function renderDet(t){
    try{
      window.renderAt(t);
      stepAnims(t*1000);
    }catch(x){
      send({type:'error',kind:'js',fatal:true,msg:String(x)});
      return false;
    }
    return true;
  }

  function detTick(){
    pState.detScheduled=false;
    if(!pState.active||!pState.det)return;
    var now=RP();
    var dt=Math.max(0,Math.min(0.1,(now-lastReal)/1000))*pState.speed;
    lastReal=now;
    var D=effectiveDur();
    if(pState.playing&&!pState.ended){
      pState.curT+=dt;
      if(pState.curT>=D){
        if(pState.loop){pState.curT=D>0?(pState.curT%D):0}
        else{pState.curT=D;pState.ended=true;pState.playing=false}
      }
      if(!renderDet(pState.curT))return;
    }
    sendPlayer(false);
    if(pState.playing&&!pState.ended&&!pState.detScheduled){
      pState.detScheduled=true;
      oRAF(detTick);
    }
  }

  function scheduleDet(){
    if(!pState.detScheduled&&pState.active&&pState.det&&pState.playing&&!pState.ended){
      pState.detScheduled=true;
      lastReal=RP();
      oRAF(detTick);
    }
  }

  function runRafBatch(){
    var q=rafQ;rafQ=[];
    for(var k=0;k<q.length;k++){
      try{q[k].cb(vnow)}
      catch(x){send({type:'error',kind:'js',msg:String(x)})}
    }
  }

  function pumpFrame(){
    pState.pumpScheduled=false;
    if(EXPORT||pState.det)return;
    var stepMs=1000/FPS;
    if(pState.fastForwardMs>0){
      var budgetStart=RP();
      var baseRef=firstRafVnow!==null?firstRafVnow:V0;
      while(pState.fastForwardMs>0&&(RP()-budgetStart)<12){
        var inc=Math.min(stepMs,pState.fastForwardMs);
        pState.fastForwardMs-=inc;
        vnow+=inc;
        runRafBatch();
        stepAnims(vnow-baseRef);
      }
      pState.curT=Math.max(0,(vnow-baseRef)/1000);
      if(pState.fastForwardMs<=0){
        pState.fastForwardMs=0;
        if(pState.pauseAfterFF){pState.pauseAfterFF=false;pState.playing=false}
        lastReal=RP();
        syncCssAnims();
        sendPlayer(true);
        send({type:'seekDone'});
      }else{
        sendPlayer(false);
      }
      if(pState.fastForwardMs>0||(pState.playing&&!pState.ended&&(rafQ.length>0||pState.active))){
        schedulePump();
      }
      return;
    }

    var nowReal=RP();
    var dtReal=Math.max(0,Math.min(100,nowReal-lastReal));
    lastReal=nowReal;

    if(pState.playing&&!pState.ended){
      vnow+=dtReal*pState.speed;
      if(pState.active){
        if(firstRafVnow===null)firstRafVnow=vnow;
        var D=effectiveDur();
        pState.curT=Math.max(0,(vnow-firstRafVnow)/1000);
        if(pState.curT>=D){
          if(pState.loop){
            if(rafCalls===0){
              firstRafVnow=vnow;
              pState.curT=0;
              setCssTime(0);
            }else{
              pState.ended=true;
              pState.playing=false;
              syncCssAnims();
              sendPlayer(true);
              send({type:'loopRestart'});
              return;
            }
          }else{
            pState.curT=D;
            pState.ended=true;
            pState.playing=false;
            syncCssAnims();
            sendPlayer(true);
            return;
          }
        }
      }
      runRafBatch();
      syncCssAnims();
      sendPlayer(false);
    }

    if(pState.playing&&!pState.ended&&(rafQ.length>0||pState.active)){
      schedulePump();
    }
  }

  function schedulePump(){
    if(EXPORT||pState.det||pState.pumpScheduled)return;
    if(pState.fastForwardMs>0||(pState.playing&&!pState.ended&&(rafQ.length>0||pState.active))){
      pState.pumpScheduled=true;
      oRAF(pumpFrame);
    }
  }

  if(EXPORT){
    window.requestAnimationFrame=function(cb){rafCalls++;rafQ.push({id:++rafN,cb:cb});return rafN};
    window.cancelAnimationFrame=function(id){rafQ=rafQ.filter(function(x){return x.id!==id})};
  }else{
    window.requestAnimationFrame=function(cb){
      rafCalls++;
      if(firstRafVnow===null)firstRafVnow=vnow;
      rafQ.push({id:++rafN,cb:cb});
      schedulePump();
      return rafN;
    };
    window.cancelAnimationFrame=function(id){
      rafQ=rafQ.filter(function(x){return x.id!==id});
    };
  }

  // --- info for the parent page
  setInterval(function(){
    var cs=document.querySelectorAll('canvas'),best=null,a=0;
    for(var i=0;i<cs.length;i++){var r=cs[i].getBoundingClientRect(),s=r.width*r.height;if(s>a){a=s;best=r}}
    var anims=document.getAnimations?document.getAnimations().length:0;
    send({type:'info',canvases:cs.length,area:a,w:best?best.width:0,h:best?best.height:0,
      det:typeof window.renderAt==='function',raf:rafCalls,anims:anims,dur:+window.DURATION||0,ready:document.readyState==='complete'});
  },200);

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
  function ensureScratch(){
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
    try{if(el.complete&&el.naturalWidth>0){var c=document.createElement('canvas');c.width=el.naturalWidth;c.height=el.naturalHeight;c.getContext('2d').drawImage(el,0,0);out=c.toDataURL('image/png')}}catch{out=null}
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
    try{node=document.createElementNS(svg?SV:XH,ctag)}catch{node=document.createElementNS(XH,'div');ctag='div'}
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
    var x=new XMLSerializer().serializeToString(root).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFD]/g,'');
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
    var state={path:path,bodyProp:bodyPropagates()};
    var sBelow=markup('below',state,W,H),sAbove=markup('above',state,W,H);
    var T3=RP();stat.msMarkup+=T3-T2;
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
    if(d.type==='step'&&EXPORT){
      doStep(d).catch(function(x){send({type:'error',kind:'step',msg:String(x&&x.stack||x)})});
      return;
    }
    if(EXPORT)return;

    if(d.type==='drive'){
      hasR=typeof window.renderAt==='function';
      pState.len=Number(d.len)||pState.len||20;
      pState.loop=d.loop!==false;
      pState.speed=Number(d.speed)||1;
      pState.active=true;
      if(hasR){
        pState.det=true;
        var D=effectiveDur();
        pState.curT=Math.max(0,Math.min(D,(Number(OPTS.seekMs)||0)/1000));
        pState.ended=!pState.loop&&pState.curT>=D;
        pState.playing=!(OPTS.pauseAfterFF||d.startPaused)&&!pState.ended;
        lastReal=RP();
        if(!renderDet(pState.curT))return;
        sendPlayer(true);
        scheduleDet();
      }else{
        pState.det=false;
        if(firstRafVnow===null)firstRafVnow=vnow;
        var seekMs=Number(OPTS.seekMs)||0;
        if(seekMs>0){
          pState.fastForwardMs=seekMs;
          pState.pauseAfterFF=!!OPTS.pauseAfterFF;
          pState.playing=true;
          pState.ended=false;
          sendPlayer(true);
          schedulePump();
        }else{
          pState.curT=Math.max(0,(vnow-firstRafVnow)/1000);
          pState.ended=false;
          pState.playing=!d.startPaused;
          lastReal=RP();
          syncCssAnims();
          sendPlayer(true);
          schedulePump();
        }
      }
      return;
    }

    if(!pState.active)return;
    var dur=effectiveDur();

    if(d.type==='play'){
      if(pState.ended){
        if(pState.det){pState.curT=0;pState.ended=false;renderDet(0)}
        else if(rafCalls===0){pState.curT=0;pState.ended=false;firstRafVnow=vnow;setCssTime(0)}
        else{send({type:'loopRestart',pause:false});return}
      }
      pState.playing=true;
      lastReal=RP();
      syncCssAnims();
      sendPlayer(true);
      if(pState.det)scheduleDet();else schedulePump();
    }else if(d.type==='pause'){
      pState.playing=false;
      syncCssAnims();
      sendPlayer(true);
    }else if(d.type==='restart'){
      pState.ended=false;
      pState.playing=true;
      lastReal=RP();
      if(pState.det){
        pState.curT=0;
        renderDet(0);
        sendPlayer(true);
        scheduleDet();
      }else if(rafCalls===0){
        pState.curT=0;
        firstRafVnow=vnow;
        setCssTime(0);
        syncCssAnims();
        sendPlayer(true);
        schedulePump();
      }else{
        send({type:'loopRestart',pause:false});
      }
    }else if(d.type==='seek'){
      var t=Math.max(0,Math.min(dur,Number(d.t)||0));
      if(pState.det){
        pState.curT=t;
        pState.ended=!pState.loop&&t>=dur;
        if(pState.ended)pState.playing=false;
        lastReal=RP();
        renderDet(t);
        sendPlayer(true);
      }else if(rafCalls===0){
        pState.curT=t;
        pState.ended=!pState.loop&&t>=dur;
        if(pState.ended)pState.playing=false;
        firstRafVnow=vnow-t*1000;
        setCssTime(t*1000);
        syncCssAnims();
        sendPlayer(true);
      }else if(t>=pState.curT){
        pState.fastForwardMs=Math.max(0,Math.round((t-pState.curT)*1000));
        pState.pauseAfterFF=!pState.playing;
        pState.ended=false;
        pState.playing=true;
        schedulePump();
      }
    }else if(d.type==='stepFrame'){
      var delta=(Number(d.delta)||1)/FPS;
      pState.playing=false;
      if(pState.det){
        pState.curT=Math.max(0,Math.min(dur,pState.curT+delta));
        pState.ended=!pState.loop&&pState.curT>=dur;
        renderDet(pState.curT);
        sendPlayer(true);
      }else if(rafCalls===0){
        pState.curT=Math.max(0,Math.min(dur,pState.curT+delta));
        pState.ended=!pState.loop&&pState.curT>=dur;
        firstRafVnow=vnow-pState.curT*1000;
        setCssTime(pState.curT*1000);
        syncCssAnims();
        sendPlayer(true);
      }else if(delta>0){
        pState.fastForwardMs=Math.round(delta*1000);
        pState.pauseAfterFF=true;
        pState.playing=true;
        schedulePump();
      }
    }else if(d.type==='setLoop'){
      pState.loop=!!d.loop;
      if(pState.loop&&pState.ended){
        pState.ended=false;
      }
      sendPlayer(true);
    }else if(d.type==='setSpeed'){
      pState.speed=Number(d.speed)||1;
      syncCssAnims();
      sendPlayer(true);
    }
  });
}

// ---------- shared helpers ----------
function inject(html,exportMode,opts){
  var optsJson=opts?JSON.stringify(opts).replace(/</g,'\\u003c'):'undefined';
  var tag='<script>('+bootstrap.toString()+')('+(exportMode?'true':'false')+','+optsJson+')<\/script>';
  var m=/<head[^>]*>/i.exec(html);
  if(m)return html.slice(0,m.index+m[0].length)+tag+html.slice(m.index+m[0].length);
  m=/<html[^>]*>/i.exec(html);
  if(m)return html.slice(0,m.index+m[0].length)+tag+html.slice(m.index+m[0].length);
  return tag+html;
}

function clean(t){
  return String(t||'').trim().replace(/^```[a-z]*\s*\n/i,'').replace(/\n```\s*$/,'');
}

function extractTitle(html){
  var m=/<title[^>]*>([\s\S]*?)<\/title>/i.exec(html||'');
  if(m){
    var txt=m[1].replace(/\s+/g,' ').trim();
    if(txt)return txt.slice(0,160);
  }
  return 'Animation preview';
}

function formatTime(sec){
  var s=Math.max(0,Number(sec)||0);
  var mins=Math.floor(s/60);
  var rem=s-mins*60;
  var whole=Math.floor(rem);
  var tenths=Math.floor((rem-whole+0.0001)*10)%10;
  return mins+':'+(whole<10?'0':'')+whole+'.'+tenths;
}

function SupersededError(){this.message='Superseded';this.superseded=true}
function CancelError(){this.message='Export cancelled.';this.cancelled=true}
function crashError(msg){var e=new Error(msg);e.crash=msg;return e}

var activeCleanup=null;
var externalState={
  html:'',
  len:20,
  size:'1080x1920',
  title:'Animation preview',
  info:null,
  errors:[]
};

function mount(mountOpts){
  if(activeCleanup){try{activeCleanup()}catch{}activeCleanup=null}
  mountOpts=mountOpts||{};
  var mode=mountOpts.mode==='share'?'share':'studio';
  var $=function(i){return document.getElementById(i)};

  var code=$('code'),frame=$('frame'),phone=$('phone'),previewShell=$('preview-shell');
  var previewPlaceholder=$('preview-placeholder'),previewPlaceholderText=$('preview-placeholder-text');
  var status=$('status'),bar=$('bar'),barI=bar?bar.firstElementChild:null;
  var btnPrev=$('prev'),btnExp=$('exp'),btnCancel=$('cancel'),btnRt=$('rt'),lenIn=$('len'),sizeSel=$('size');
  var seek=$('seek'),timeReadout=$('time-readout'),playerToolbar=$('player-toolbar');
  var ctlPlay=$('ctl-play'),ctlRestart=$('ctl-restart'),ctlPrevF=$('ctl-prev-frame'),ctlNextF=$('ctl-next-frame');
  var ctlLoop=$('ctl-loop'),ctlSpeed=$('ctl-speed'),ctlSpeedLabel=$('ctl-speed-label'),ctlFs=$('ctl-fs'),ctlFsClose=$('ctl-fs-close');
  var fsTitle=$('fs-title');

  if(!frame||!phone||!previewShell)return function(){};

  var info=null,errors=[],busy=false,lenTouched=false,loadId=0,cancelled=false,pending=null;
  var currentHtml=externalState.html||'',currentLen=externalState.len||20,currentSize=externalState.size||'1080x1920';
  var lastResult=null,lastNote='',autoTried=false,dlApi=null,hostP=null,lastPasteHandledAt=0;
  var dlState=(HOSTED&&window.claude&&typeof window.claude.use==='function')?'pending':'off';
  var player={active:false,playing:false,ended:false,det:false,t:0,dur:20,loop:true,speedIndex:1,scrubbing:false};
  var unsubs=[],intervals=[];

  function listen(target,type,fn,opts){
    if(!target)return;
    target.addEventListener(type,fn,opts);
    unsubs.push(function(){target.removeEventListener(type,fn,opts)});
  }

  function defaultPreviewHeight(){
    if(mountOpts.defaultHeight)return mountOpts.defaultHeight;
    if(mode==='share'){
      return Math.max(360,Math.min(620,Math.round(window.innerHeight*0.6)));
    }
    var maxW=Math.max(220,Math.min(300,window.innerWidth-40));
    return Math.round(maxW*16/9);
  }

  function isFullscreen(){
    return document.fullscreenElement===previewShell||previewShell.classList.contains('is-css-fullscreen');
  }

  function layout(h){
    var w=Math.round(h*9/16);
    phone.style.width=w+'px';
    phone.style.height=h+'px';
    frame.style.transform='scale('+(w/1080)+')';
    return w;
  }

  function refreshLayout(){
    if(document.body.classList.contains('exporting'))return;
    if(isFullscreen()){
      var topH=56,barH=96;
      var topEl=previewShell.querySelector('.fs-topbar'),barEl=$('player-bar');
      if(topEl)topH=topEl.offsetHeight||44;
      if(barEl)barH=barEl.offsetHeight||88;
      var availH=Math.max(220,window.innerHeight-topH-barH-36);
      var availW=Math.max(180,window.innerWidth-32);
      var h=Math.min(availH,Math.floor(availW*16/9));
      layout(h);
    }else{
      layout(defaultPreviewHeight());
    }
  }

  function say(msg,cls){
    if(!status)return;
    status.className=cls||'';
    status.textContent=msg;
  }

  function progress(p){
    if(!bar||!barI)return;
    bar.style.display=p==null?'none':'block';
    if(p!=null)barI.style.width=Math.round(p*100)+'%';
  }

  function setBusy(b){
    busy=b;
    if(btnExp)btnExp.disabled=b;
    if(btnPrev)btnPrev.disabled=b;
    if(btnRt)btnRt.disabled=b;
    var sb=$('share-btn');
    if(sb)sb.disabled=b;
  }

  function jsErrs(){return errors.filter(function(e){return (e.kind==='js'||e.kind==='step')&&!/ResizeObserver loop/.test(e.msg)})}
  function animates(){return !!(info&&(info.det||info.raf>0||info.anims>0))}

  function hideFix(){
    if($('fix'))$('fix').style.display='none';
    if($('note'))$('note').style.display='none';
    if($('hostnote'))$('hostnote').style.display='none';
    lastResult=null;
  }

  function warnNote(m){
    var n=$('note');
    if(!n)return;
    n.textContent=m;
    n.style.display='block';
  }

  function showCrash(raw){
    var m=String(raw).replace(/\s+/g,' ').slice(0,200);
    say("Your animation's code has an error, so it can't play: \u00AB"+m+"\u00BB. That is the AI's mistake, not yours. Click the button below, paste the message to the same AI, and it will send you a fixed file.",'err');
    if($('fixtext'))$('fixtext').value='The page crashes with this error and nothing is drawn: "'+m+'". Fix it, check the whole script for other mistakes, and return the complete single HTML file again. Output only the code.';
    if($('fix'))$('fix').style.display='block';
  }

  function showError(e){
    if(e&&e.superseded)return;
    if(e&&e.crash)showCrash(e.crash);
    else say((e&&e.message)||String(e),'err');
  }

  function syncSliderVisual(){
    if(!seek)return;
    seek.style.setProperty('--attr-min',seek.min||'0');
    seek.style.setProperty('--attr-max',seek.max||'20');
    seek.style.setProperty('--control-value',seek.value||'0');
  }

  function syncPlayerUI(){
    var speed=SPEEDS[player.speedIndex]||1;
    var fs=isFullscreen();
    previewShell.setAttribute('data-active',player.active?'true':'false');
    previewShell.setAttribute('data-playing',player.playing?'true':'false');
    previewShell.setAttribute('data-fullscreen',fs?'true':'false');

    if(previewPlaceholder){
      previewPlaceholder.hidden=player.active||!!currentHtml;
    }

    if(seek){
      seek.min='0';
      seek.max=String(player.dur||20);
      seek.disabled=!player.active;
      if(!player.scrubbing){
        seek.value=String(Math.min(player.dur||20,Math.max(0,player.t)));
      }
      seek.setAttribute('aria-valuetext',Number(seek.value).toFixed(1)+' seconds of '+Number(player.dur||20).toFixed(1)+' seconds');
      syncSliderVisual();
    }

    if(timeReadout){
      var dispT=player.scrubbing&&seek?Number(seek.value):player.t;
      timeReadout.textContent=formatTime(dispT)+' / '+formatTime(player.dur||20);
    }

    var disabledVal=player.active?'false':'true';
    if(ctlPlay){
      ctlPlay.setAttribute('aria-disabled',disabledVal);
      ctlPlay.setAttribute('aria-label',player.playing?'Pause':(player.ended?'Replay':'Play'));
    }
    if(ctlRestart)ctlRestart.setAttribute('aria-disabled',disabledVal);
    if(ctlPrevF)ctlPrevF.setAttribute('aria-disabled',disabledVal);
    if(ctlNextF)ctlNextF.setAttribute('aria-disabled',disabledVal);
    if(ctlLoop)ctlLoop.setAttribute('aria-pressed',player.loop?'true':'false');
    if(ctlSpeed){
      ctlSpeed.setAttribute('aria-label',speed+'x speed');
      if(ctlSpeedLabel)ctlSpeedLabel.textContent=speed+'x';
    }
    if(ctlFs)ctlFs.setAttribute('aria-pressed',fs?'true':'false');
  }

  function resetPlayerUI(){
    player.active=false;
    player.playing=false;
    player.ended=false;
    player.t=0;
    player.dur=Math.max(1,Number(lenIn?lenIn.value:currentLen)||20);
    if(previewPlaceholder){
      previewPlaceholder.hidden=false;
      if(previewPlaceholderText)previewPlaceholderText.textContent='Paste HTML code or drop a file to start playing.';
    }
    syncPlayerUI();
  }

  function postCmd(msg){
    if(!frame.contentWindow)return;
    frame.contentWindow.postMessage(Object.assign({src:'se-cmd'},msg),'*');
  }

  function loadPage(html,exportMode,opts){
    info=null;errors=[];loadId++;
    frame.srcdoc=inject(html,!!exportMode,opts);
    return loadId;
  }

  function LIBMSG(){return "The animation page couldn't load a library it needs (usually three.js, which is downloaded from the internet). Check your internet connection and try again. If it keeps failing, ask the AI to use three.js from cdnjs.cloudflare.com."+(errors[0]?" (Details: "+errors[0].msg.slice(0,120)+")":"")}

  function waitReady(timeoutMs,expectedLoadId){
    return new Promise(function(res,rej){
      var t0=Date.now();
      (function poll(){
        if(expectedLoadId!=null&&expectedLoadId!==loadId)return rej(new SupersededError());
        if(errors.some(function(e){return e.kind==='resource'&&/^SCRIPT/.test(e.msg)}))return rej(new Error(LIBMSG()));
        if(info&&info.ready&&((info.canvases>0&&info.area>0)||info.det||(Date.now()-t0>1000&&(info.anims>0||info.raf>0)))){
          return setTimeout(function(){
            if(expectedLoadId!=null&&expectedLoadId!==loadId)return rej(new SupersededError());
            res();
          },400);
        }
        if(Date.now()-t0>timeoutMs){
          var fe=jsErrs().filter(function(e){return !/module|import|fetch|network|resolve/i.test(e.msg)});
          if(fe.length)return rej(crashError(fe[0].msg));
          var lib=errors.some(function(e){return e.kind==='resource'||/import|module|three|fetch|undefined|not defined|network/i.test(e.msg)});
          return rej(new Error(lib?LIBMSG():
            "I couldn't find a <canvas> (the drawing area) in that page, so there is nothing to record. Make sure you pasted the whole HTML file the AI gave you, from <!DOCTYPE html> to </html>."+(errors[0]?" (Page error: "+errors[0].msg.slice(0,120)+")":"")));
        }
        setTimeout(poll,150);
      })();
    });
  }

  function getHtml(){
    var raw=code?code.value:currentHtml;
    var h=clean(raw);
    if(!h)throw new Error("There is no code yet. Paste the code the AI gave you into the big box (or choose the .html file).");
    if(h.indexOf('<')<0)throw new Error("That doesn't look like HTML code. Paste the whole file the AI gave you, starting with <!DOCTYPE html>.");
    return h;
  }

  function runPreview(opts){
    if(busy)return;
    opts=opts||{};
    if($('result'))$('result').style.display='none';
    hideFix();
    var html;
    try{html=opts.htmlOverride?clean(opts.htmlOverride):getHtml()}catch(e){return say(e.message,'err')}

    currentHtml=html;
    if(opts.lenOverride!=null&&lenIn){lenIn.value=String(opts.lenOverride)}
    if(opts.sizeOverride&&sizeSel){sizeSel.value=opts.sizeOverride}
    currentLen=Math.max(1,Math.min(120,+(lenIn?lenIn.value:opts.lenOverride)||currentLen||20));
    currentSize=sizeSel?sizeSel.value:currentSize;

    externalState.html=currentHtml;
    externalState.len=currentLen;
    externalState.size=currentSize;
    externalState.title=opts.titleOverride||extractTitle(currentHtml);
    if(fsTitle)fsTitle.textContent=externalState.title;

    if(previewPlaceholder){
      previewPlaceholder.hidden=false;
      if(previewPlaceholderText)previewPlaceholderText.textContent='Loading preview...';
    }
    say("Loading your animation...");
    progress(null);

    var speed=SPEEDS[player.speedIndex]||1;
    var myId=loadPage(html,false,{
      len:currentLen,
      loop:player.loop,
      speed:speed,
      seekMs:opts.seekMs||0,
      pauseAfterFF:!!opts.pauseAfterFF
    });

    waitReady(20000,myId).then(function(){
      if(myId!==loadId)return;
      var fe=jsErrs();
      if(fe.length&&!animates()){
        resetPlayerUI();
        return showCrash(fe[0].msg);
      }
      var len=Math.max(1,Math.min(120,+(lenIn?lenIn.value:currentLen)||20));
      currentLen=len;
      externalState.len=len;
      player.active=true;
      player.dur=(info&&info.det&&info.dur>0)?info.dur:len;
      player.t=opts.seekMs?(opts.seekMs/1000):0;
      player.playing=!opts.pauseAfterFF&&!opts.startPaused;
      player.ended=false;
      if(previewPlaceholder)previewPlaceholder.hidden=true;
      syncPlayerUI();

      postCmd({
        type:'drive',
        len:len,
        loop:player.loop,
        speed:speed,
        startPaused:!!opts.startPaused
      });

      if(mode==='share'){
        say("Playing"+(info&&info.det?" (frame-stepped animation)":"")+". Use controls below to scrub, pause, or go fullscreen.","ok");
      }else{
        say("Playing"+(info&&info.det?" (frame-stepped animation)":"")+". Share a public link or click Export MP4.","ok");
      }
      if(fe.length)warnNote("Heads up: the page reported an error (\u00AB"+fe[0].msg.slice(0,160)+"\u00BB) but it still animates. Parts of it may be missing in the video.");
      setTimeout(function(){
        var f=errors.filter(function(e){return e.fatal})[0];
        if(f&&!busy&&myId===loadId)showCrash(f.msg);
      },1500);
    }).catch(function(err){
      if(err&&err.superseded)return;
      resetPlayerUI();
      showError(err);
    });
  }

  // ---------- fullscreen ----------
  async function exitFullscreenIfActive(){
    if(document.fullscreenElement===previewShell){
      try{await document.exitFullscreen()}catch{}
    }
    previewShell.classList.remove('is-css-fullscreen');
    refreshLayout();
    syncPlayerUI();
  }

  async function toggleFullscreen(){
    if(isFullscreen()){
      await exitFullscreenIfActive();
      return;
    }
    if(document.fullscreenEnabled!==false&&typeof previewShell.requestFullscreen==='function'){
      try{
        await previewShell.requestFullscreen();
        if(document.fullscreenElement===previewShell){
          refreshLayout();
          syncPlayerUI();
          return;
        }
      }catch{
        // Fall through to CSS fullscreen overlay fallback
      }
    }
    previewShell.classList.add('is-css-fullscreen');
    refreshLayout();
    syncPlayerUI();
  }

  // ---------- incoming messages from iframe ----------
  listen(window,'message',function(e){
    var d=e.data;
    if(!d||d.src!=='se'||e.source!==frame.contentWindow)return;
    if(d.type==='info'){
      info=d;
      externalState.info=d;
      if(d.dur>0&&!lenTouched&&lenIn){
        lenIn.value=String(d.dur);
        currentLen=d.dur;
        externalState.len=d.dur;
      }
    }else if(d.type==='player'){
      player.det=!!d.det;
      player.dur=Number(d.dur)||player.dur||20;
      if(!player.scrubbing)player.t=Number(d.t)||0;
      player.playing=!!d.playing;
      player.ended=!!d.ended;
      syncPlayerUI();
    }else if(d.type==='loopRestart'){
      if(currentHtml&&!busy){
        runPreview({htmlOverride:currentHtml,lenOverride:currentLen,startPaused:!!d.pause});
      }
    }else if(d.type==='seekDone'){
      syncPlayerUI();
    }else if(d.type==='error'){
      errors.push(d);
      externalState.errors=errors;
      if(d.fatal&&!busy&&!pending&&info)showCrash(d.msg);
      if(pending&&d.kind==='step'){
        var p=pending;pending=null;
        p.rej(new Error("The animation stopped working while I was drawing frame "+p.i+". ("+d.msg.slice(0,200)+")"));
      }
    }else if(d.type==='frame'&&pending&&pending.i===d.i){
      var p2=pending;pending=null;p2.res(d);
    }else if(d.type==='frame'&&d.bmp){
      d.bmp.close();
    }
  });

  // ---------- player controls ----------
  function seekTo(targetT){
    if(!player.active||busy)return;
    var dur=player.dur||20;
    var clamped=Math.max(0,Math.min(dur,targetT));
    if(player.det||(info&&info.raf===0)){
      player.t=clamped;
      postCmd({type:'seek',t:clamped});
      syncPlayerUI();
      return;
    }
    if(clamped>=player.t){
      postCmd({type:'seek',t:clamped});
      player.t=clamped;
      syncPlayerUI();
    }else{
      var wasPlaying=player.playing;
      runPreview({
        htmlOverride:currentHtml,
        lenOverride:currentLen,
        seekMs:Math.round(clamped*1000),
        pauseAfterFF:!wasPlaying
      });
    }
  }

  function stepFrame(delta){
    if(!player.active||busy)return;
    if(player.det||(info&&info.raf===0)||delta>0){
      player.playing=false;
      postCmd({type:'stepFrame',delta:delta});
      syncPlayerUI();
    }else{
      player.playing=false;
      seekTo(Math.max(0,player.t+delta/FPS));
    }
  }

  function restartPreview(){
    if(!player.active||busy)return;
    if(player.det||(info&&info.raf===0)){
      postCmd({type:'restart'});
    }else{
      runPreview({htmlOverride:currentHtml,lenOverride:currentLen});
    }
  }

  function togglePlayPause(){
    if(!player.active||busy)return;
    if(player.playing)postCmd({type:'pause'});
    else postCmd({type:'play'});
  }

  listen(ctlPlay,'click',function(){
    if(ctlPlay.getAttribute('aria-disabled')==='true')return;
    togglePlayPause();
  });
  listen(ctlRestart,'click',function(){
    if(ctlRestart.getAttribute('aria-disabled')==='true')return;
    restartPreview();
  });
  listen(ctlPrevF,'click',function(){
    if(ctlPrevF.getAttribute('aria-disabled')==='true')return;
    stepFrame(-1);
  });
  listen(ctlNextF,'click',function(){
    if(ctlNextF.getAttribute('aria-disabled')==='true')return;
    stepFrame(1);
  });
  listen(ctlLoop,'click',function(){
    player.loop=!player.loop;
    postCmd({type:'setLoop',loop:player.loop});
    syncPlayerUI();
  });
  listen(ctlSpeed,'click',function(){
    player.speedIndex=(player.speedIndex+1)%SPEEDS.length;
    var speed=SPEEDS[player.speedIndex];
    postCmd({type:'setSpeed',speed:speed});
    syncPlayerUI();
  });
  listen(ctlFs,'click',function(){toggleFullscreen()});
  listen(ctlFsClose,'click',function(){exitFullscreenIfActive()});
  listen(document,'fullscreenchange',function(){refreshLayout();syncPlayerUI()});
  listen(window,'resize',function(){refreshLayout()});

  if(seek){
    var startScrub=function(){if(player.active)player.scrubbing=true};
    listen(seek,'pointerdown',startScrub);
    listen(seek,'mousedown',startScrub);
    listen(seek,'touchstart',startScrub,{passive:true});
    listen(seek,'input',function(){
      syncSliderVisual();
      var val=Number(seek.value)||0;
      seek.setAttribute('aria-valuetext',val.toFixed(1)+' seconds of '+Number(player.dur||20).toFixed(1)+' seconds');
      if(timeReadout)timeReadout.textContent=formatTime(val)+' / '+formatTime(player.dur||20);
      if(player.det||(info&&info.raf===0)){
        player.t=val;
        postCmd({type:'seek',t:val});
      }
    });
    listen(seek,'change',function(){
      var val=Number(seek.value)||0;
      player.scrubbing=false;
      seekTo(val);
    });
    listen(seek,'pointerup',function(){
      if(player.scrubbing){
        player.scrubbing=false;
        seekTo(Number(seek.value)||0);
      }
    });
  }

  // Toolbar roving-tabindex fallback when native focusgroup is unsupported
  if(playerToolbar&&!('focusGroup' in HTMLElement.prototype)){
    var tbItems=[].slice.call(playerToolbar.querySelectorAll('button'));
    tbItems.forEach(function(b,idx){b.tabIndex=idx===0?0:-1});
    listen(playerToolbar,'focusin',function(ev){
      if(tbItems.indexOf(ev.target)>=0){
        tbItems.forEach(function(b){b.tabIndex=b===ev.target?0:-1});
      }
    });
    listen(playerToolbar,'keydown',function(ev){
      var idx=tbItems.indexOf(document.activeElement);
      if(idx<0)return;
      var rtl=getComputedStyle(playerToolbar).direction==='rtl';
      var next=-1;
      if(ev.key==='ArrowRight')next=(idx+(rtl?-1:1)+tbItems.length)%tbItems.length;
      else if(ev.key==='ArrowLeft')next=(idx+(rtl?1:-1)+tbItems.length)%tbItems.length;
      else if(ev.key==='Home')next=0;
      else if(ev.key==='End')next=tbItems.length-1;
      if(next>=0){ev.preventDefault();tbItems[next].focus()}
    });
  }

  // ---------- studio copy fix message ----------
  listen($('copyfix'),'click',function(event){
    var b=event.currentTarget,t=$('fixtext');
    if(!t)return;
    function done(){b.textContent='Copied';setTimeout(function(){b.textContent='Copy fix message for the AI'},2000)}
    function fallback(){t.focus();t.select();try{if(document.execCommand('copy'))done()}catch{}}
    try{if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(t.value).then(done,fallback);return}}catch{}
    fallback();
  });

  // ---------- studio draft, paste auto-play, file picker, drag & drop ----------
  var KEY='short-exporter:v1',tm=0;
  function notifyCodeChanged(){
    try{window.dispatchEvent(new CustomEvent('se-code-changed'))}catch{}
  }
  function saveDraft(){
    if(!code)return;
    clearTimeout(tm);
    tm=setTimeout(function(){
      try{
        localStorage.setItem(KEY,JSON.stringify({
          code:code.value.slice(0,2000000),
          size:sizeSel?sizeSel.value:'1080x1920',
          len:lenIn?lenIn.value:'20'
        }));
      }catch{}
    },400);
  }

  if(mode==='studio'&&code){
    try{
      var saved=JSON.parse(localStorage.getItem(KEY)||'null');
      if(saved){
        if(saved.code&&!code.value)code.value=saved.code;
        if(saved.size&&sizeSel)sizeSel.value=saved.size;
        if(saved.len&&lenIn)lenIn.value=saved.len;
      }
    }catch{}

    listen(code,'paste',function(){
      setTimeout(function(){
        lastPasteHandledAt=Date.now();
        notifyCodeChanged();
        saveDraft();
        var h=clean(code.value);
        if(h&&/<[a-z!]/i.test(h)){
          lenTouched=false;
          if(!busy)runPreview();
        }
      },0);
    });

    listen(code,'input',function(ev){
      notifyCodeChanged();
      saveDraft();
      var it=ev&&ev.inputType;
      if((it==='insertFromPaste'||it==='insertFromDrop')&&Date.now()-lastPasteHandledAt>120){
        var h=clean(code.value);
        if(h&&/<[a-z!]/i.test(h)){
          lenTouched=false;
          if(!busy)runPreview();
        }
      }
    });

    listen(code,'dragover',function(e){e.preventDefault();code.classList.add('drag')});
    listen(code,'dragleave',function(){code.classList.remove('drag')});
    listen(code,'drop',function(e){
      e.preventDefault();code.classList.remove('drag');
      var f=e.dataTransfer&&e.dataTransfer.files&&e.dataTransfer.files[0];
      if(f)f.text().then(function(t){
        hideFix();
        code.value=t;
        lenTouched=false;
        notifyCodeChanged();
        saveDraft();
        if(!busy)runPreview();
      });
    });
  }

  listen(lenIn,'input',function(){
    lenTouched=true;
    currentLen=Math.max(1,Math.min(120,+(lenIn?lenIn.value:20)||20));
    externalState.len=currentLen;
    notifyCodeChanged();
    saveDraft();
  });
  listen(sizeSel,'change',function(){
    currentSize=sizeSel.value;
    externalState.size=currentSize;
    notifyCodeChanged();
    saveDraft();
  });

  listen($('pick'),'click',function(){if($('file'))$('file').click()});
  listen($('file'),'change',function(){
    var f=this.files&&this.files[0];if(!f)return;
    var r=new FileReader();
    r.onload=function(){
      hideFix();
      if(code)code.value=String(r.result||'');
      lenTouched=false;
      notifyCodeChanged();
      saveDraft();
      if(!busy)runPreview();
    };
    r.onerror=function(){say("I couldn't read that file.","err")};
    r.readAsText(f);
    this.value='';
  });

  listen($('example'),'click',function(){
    if(busy)return;
    var ex=$('example-data');
    if(!ex||!code)return;
    hideFix();
    code.value=JSON.parse(ex.textContent);
    lenTouched=false;
    notifyCodeChanged();
    saveDraft();
    runPreview();
  });

  listen($('clear'),'click',function(){
    if(busy||!code)return;
    hideFix();
    code.value='';
    currentHtml='';
    externalState.html='';
    lenTouched=false;
    loadId++;
    frame.srcdoc='';
    notifyCodeChanged();
    saveDraft();
    resetPlayerUI();
    say("Cleared. Paste HTML code or drop an .html file to automatically start playing.");
    code.focus();
  });

  listen(btnPrev,'click',function(){runPreview()});

  // ---------- export result ----------
  if(HOSTED)if(btnRt&&btnRt.parentNode)btnRt.parentNode.style.display='none';
  if(dlState==='pending'){
    hostP=new Promise(function(res){
      var p,timer;
      try{p=Promise.resolve(window.claude.use('downloads'))}catch{p=Promise.resolve(null)}
      timer=setTimeout(function(){if(dlState==='pending'){dlState='none';refreshHost()}res()},10000);
      p.then(function(api){clearTimeout(timer);if(api&&typeof api.save==='function'){dlApi=api;dlState='api'}else dlState='none';refreshHost();res()},
             function(){clearTimeout(timer);dlState='none';refreshHost();res()});
    });
  }
  function autoDownload(){
    var dl=$('dl');if(!dl||!lastResult)return;
    var tmp=document.createElement('a');tmp.href=dl.href;tmp.download=lastResult.name;document.body.appendChild(tmp);tmp.click();tmp.remove();
  }
  function refreshHost(){
    if(!lastResult)return;
    if(dlState==='none'){
      if($('hostnote'))$('hostnote').style.display='block';
      say(lastNote,'ok');
      if(!autoTried){autoTried=true;try{autoDownload()}catch{}}
    }else{
      if($('hostnote'))$('hostnote').style.display='none';
      say("Done! Click the green button to save your "+(/mp4$/.test(lastResult.name)?"MP4":"video")+".","ok");
    }
  }
  listen($('dl'),'click',function(ev){
    if(dlState==='off'||dlState==='none'||!lastResult)return;
    ev.preventDefault();
    var r=lastResult;
    hostP.then(function(){
      if(!dlApi)return;
      var p;try{p=Promise.resolve(dlApi.save({filename:r.name,data:r.blob}))}catch(x){p=Promise.reject(x)}
      p.then(function(){say("Saved. Look in your Downloads folder.","ok")},function(err){
        var errCode=err&&(err.code||err.message);
        if(errCode==='declined')say("Save cancelled. Click the green button to try again.");
        else say("Couldn't save the file here ("+(errCode||'unknown')+"). Try right-clicking the video above and choosing 'Save video as...'.","err");
      });
    });
  });

  function showResult(blob,name,note){
    var url=URL.createObjectURL(blob);
    lastResult={blob:blob,name:name};lastNote=note;autoTried=false;
    var a=$('dl');
    if(a){a.href=url;a.download=name;a.textContent='Download '+name+' ('+(blob.size/1048576).toFixed(1)+' MB)'}
    if($('resv'))$('resv').src=url;
    if($('result'))$('result').style.display='block';
    progress(null);
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
  function i420Ok(W,H){try{var f=new VideoFrame(new Uint8Array(W*H*3/2),{format:'I420',codedWidth:W,codedHeight:H,timestamp:0,colorSpace:I420CS});f.close();return true}catch{return false}}

  async function exportFrames(html,len,W,H,cfg){
    await exitFullscreenIfActive();
    var fmt=i420Ok(W,H)?'i420':'bitmap',N=Math.round(len*FPS),enc=null,encErr=null,muxer=null,t0=performance.now();
    setBusy(true);cancelled=false;
    if(btnCancel){btnCancel.style.display='';btnCancel.disabled=false}
    if($('result'))$('result').style.display='none';
    try{
      say("Loading your animation...");progress(0);
      var myId=loadPage(html,true);
      await waitReady(20000,myId);
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
      if($('teststats'))$('teststats').textContent=TEST?JSON.stringify(stats):'';
      setBusy(false);if(btnCancel)btnCancel.style.display='none';
      runPreview({htmlOverride:html,lenOverride:len});
    }catch(e){
      try{if(enc&&enc.state!=='closed')enc.close()}catch{}
      pending=null;
      progress(null);
      if(e&&e.cancelled)say("Export cancelled.");else showError(e);
      setBusy(false);if(btnCancel)btnCancel.style.display='none';
      try{runPreview({htmlOverride:html,lenOverride:len})}catch{}
    }
  }

  listen(btnCancel,'click',function(){
    cancelled=true;
    if(btnCancel)btnCancel.disabled=true;
    if(pending){var p=pending;pending=null;p.rej(new CancelError())}
  });

  listen(btnExp,'click',async function(){
    if(busy)return;hideFix();
    var html;try{html=getHtml()}catch(e){return say(e.message,'err')}
    var len=+(lenIn?lenIn.value:currentLen);
    if(!(len>=1&&len<=120))return say("Length must be between 1 and 120 seconds.","err");
    var wh=(sizeSel?sizeSel.value:currentSize).split('x'),W=+wh[0],H=+wh[1];
    var cfg=null;
    if(webCodecsPresent())cfg=await pickEncoder(W,H);
    if(!cfg){
      say("This browser can't make the MP4 by itself, so I'll record the screen instead.");
      return exportRealtime(html,len,W,H);
    }
    exportFrames(html,len,W,H,cfg);
  });

  listen(btnRt,'click',function(){
    if(busy)return;hideFix();
    var html;try{html=getHtml()}catch(e){return say(e.message,'err')}
    var len=+(lenIn?lenIn.value:currentLen);
    if(!(len>=1&&len<=120))return say("Length must be between 1 and 120 seconds.","err");
    var wh=(sizeSel?sizeSel.value:currentSize).split('x');
    exportRealtime(html,len,+wh[0],+wh[1]);
  });

  // ---------- FALLBACK: record the screen in real time ----------
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
    await exitFullscreenIfActive();
    var md=navigator.mediaDevices;
    if(!md||!md.getDisplayMedia||typeof MediaRecorder==='undefined'||typeof CropTarget==='undefined'){
      return say("This browser can't record the animation. Please use desktop Chrome or Edge (up to date).","err");
    }
    var mime=pickMime();
    if(!mime)return say("This browser can't make video files. Please use desktop Chrome or Edge.","err");
    var isMp4=/^video\/mp4/.test(mime);

    setBusy(true);if($('result'))$('result').style.display='none';
    var stream=null,rec=null,raf=0,video=null,timer=0;
    var vh=Math.max(300,window.innerHeight),pw=layout(vh);
    document.body.classList.add('exporting');
    var mainEl=document.querySelector('main');
    if(mainEl)mainEl.style.paddingLeft=Math.max(20,pw+24)+'px';
    function cleanup(){
      cancelAnimationFrame(raf);clearInterval(timer);
      if(stream)stream.getTracks().forEach(function(t){t.stop()});
      document.body.classList.remove('exporting');
      if(mainEl)mainEl.style.paddingLeft='';
      refreshLayout();
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
      var myId=loadPage(html,false,{len:len,loop:false,speed:1});
      await waitReady(20000,myId);
      await sleep(300);
      var tb=Date.now();
      while(isBlack(ctx,W,H)&&Date.now()-tb<5000)await sleep(100);

      var out=cv.captureStream(30);
      var chunks=[];
      rec=new MediaRecorder(out,{mimeType:mime,videoBitsPerSecond:W>=1000?8000000:5000000});
      rec.ondataavailable=function(e){if(e.data&&e.data.size)chunks.push(e.data)};
      var stopped=new Promise(function(r){rec.onstop=r});
      postCmd({type:'drive',len:len,loop:false,speed:1});
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

  // ---------- keyboard shortcuts, leave guard, wake lock ----------
  listen(document,'keydown',function(e){
    var target=e.target;
    var tag=target&&target.tagName?target.tagName.toLowerCase():'';
    var inEditable=tag==='textarea'||tag==='select'||(tag==='input'&&target.type!=='range'&&target.type!=='button')||(target&&target.isContentEditable);

    if((e.ctrlKey||e.metaKey)&&e.key==='Enter'){
      if(mode==='studio'){e.preventDefault();runPreview()}
      return;
    }
    if(e.key==='Escape'){
      if(busy&&btnCancel&&btnCancel.style.display!=='none'&&!btnCancel.disabled){btnCancel.click();return}
      if(previewShell.classList.contains('is-css-fullscreen')){exitFullscreenIfActive();return}
    }
    if(inEditable||e.ctrlKey||e.metaKey||e.altKey)return;

    var inToolbar=playerToolbar&&playerToolbar.contains(target);
    var onButton=tag==='button'||tag==='a';
    var onRange=tag==='input'&&target.type==='range';

    if((e.key===' '||e.key==='k'||e.key==='K')&&!(e.key===' '&&(onButton||onRange))){
      if(player.active){e.preventDefault();togglePlayPause()}
    }else if(e.key==='f'||e.key==='F'){
      e.preventDefault();toggleFullscreen();
    }else if(e.key==='r'||e.key==='R'){
      if(player.active){e.preventDefault();restartPreview()}
    }else if(e.key==='l'||e.key==='L'){
      e.preventDefault();
      player.loop=!player.loop;
      postCmd({type:'setLoop',loop:player.loop});
      syncPlayerUI();
    }else if((e.key==='ArrowLeft'||e.key==='ArrowRight')&&!inToolbar&&!onRange&&player.active){
      e.preventDefault();
      stepFrame(e.key==='ArrowRight'?1:-1);
    }
  });

  listen(window,'beforeunload',function(e){if(busy){e.preventDefault();e.returnValue=''}});

  var wl=null,wlBusy=false;
  var wlTimer=setInterval(function(){
    if(!navigator.wakeLock||wlBusy)return;
    if(busy&&!wl){
      wlBusy=true;
      navigator.wakeLock.request('screen').then(function(l){wl=l;l.addEventListener('release',function(){wl=null})}).catch(function(){}).then(function(){wlBusy=false});
    }else if(!busy&&wl){
      wl.release().catch(function(){});wl=null;
    }
  },1000);
  intervals.push(wlTimer);

  if(typeof VideoEncoder==='undefined'&&status){
    status.textContent="This browser can't export video. Preview works here; open in desktop Chrome or Edge to export MP4.";
  }

  refreshLayout();
  syncPlayerUI();

  if(mode==='studio'&&code&&clean(code.value)){
    var savedHtml=clean(code.value);
    if(/<[a-z!]/i.test(savedHtml))runPreview();
  }

  window.__SE.loadHtml=function(html,opts){
    opts=opts||{};
    if(code){
      code.value=html;
      saveDraft();
    }
    lenTouched=false;
    runPreview({
      htmlOverride:html,
      lenOverride:opts.len,
      sizeOverride:opts.size,
      titleOverride:opts.title,
      startPaused:opts.autoplay===false
    });
  };
  window.__SE.preview=function(){runPreview()};
  window.__SE.getHtml=getHtml;
  window.__SE.getState=function(){
    var html='';
    try{html=getHtml()}catch{html=currentHtml||''}
    return {
      html:html,
      len:Math.max(1,Math.min(120,+(lenIn?lenIn.value:currentLen)||20)),
      size:sizeSel?sizeSel.value:currentSize,
      title:extractTitle(html)
    };
  };

  activeCleanup=function(){
    loadId++;
    unsubs.forEach(function(fn){try{fn()}catch{}});
    intervals.forEach(function(id){clearInterval(id)});
    if(wl){wl.release().catch(function(){});wl=null}
  };
  return activeCleanup;
}

window.__SE={
  mount:mount,
  loadHtml:function(){},
  preview:function(){},
  getHtml:function(){return externalState.html},
  getState:function(){return {html:externalState.html,len:externalState.len,size:externalState.size,title:externalState.title}},
  getInfo:function(){return externalState.info},
  errors:function(){return externalState.errors},
  lastBlob:null,
  stats:null
};

})();
