var GATE_COLORS=['#e53935','#fb8c00','#fdd835','#1e88e5','#3949ab','#8e24aa','#d81b60','#00acc1','#e91e63'];
var DIFFICULTY={easy:{spread:.12,angleRand:.15,parMult:1.3},normal:{spread:.35,angleRand:.5,parMult:1},hard:{spread:.7,angleRand:1,parMult:.75}};
var MIN_DIST=1,MAX_RETRIES=500,GATE_HALF_W=.25,GATE_THICK=.12,BALL_R=.08,NO_HIT=.5,holeCounter=0;

function rand(a,b){return Math.random()*(b-a)+a}
function dst(a,b){return Math.hypot(a.x-b.x,a.y-b.y)}
function clamp(v,a,b){return Math.max(a,Math.min(b,v))}
function randPt(l,w,m){m=m||1;return{x:rand(m,l-m),y:rand(m,w-m)}}
function gc(g){return{x:(g.x1+g.x2)/2,y:(g.y1+g.y2)/2}}
function inB(p,l,w){return p.x>=.5&&p.x<=l-.5&&p.y>=.5&&p.y<=w-.5}

function segsCross(p1,p2,p3,p4){
  var d1x=p2.x-p1.x,d1y=p2.y-p1.y,d2x=p4.x-p3.x,d2y=p4.y-p3.y;
  var cross=d1x*d2y-d1y*d2x;
  if(Math.abs(cross)<1e-10)return false;
  var t=((p3.x-p1.x)*d2y-(p3.y-p1.y)*d2x)/cross;
  var u=((p3.x-p1.x)*d1y-(p3.y-p1.y)*d1x)/cross;
  return t>0&&t<1&&u>0&&u<1;
}

function gateCorners(g){
  var dx=g.x2-g.x1,dy=g.y2-g.y1,l=Math.hypot(dx,dy);
  var px=-dy/l*GATE_THICK,py=dx/l*GATE_THICK;
  return[{x:g.x1-px,y:g.y1-py},{x:g.x2-px,y:g.y2-py},{x:g.x2+px,y:g.y2+py},{x:g.x1+px,y:g.y1+py}];
}

function hitsGatePost(a,b,g){
  var c=gateCorners(g);
  return segsCross(a,b,c[0],c[3])||segsCross(a,b,c[1],c[2]);
}

function segHitsAnyPost(a,b,gates,skipIdx){
  for(var i=0;i<gates.length;i++){if(i===skipIdx)continue;if(hitsGatePost(a,b,gates[i]))return true;}
  return false;
}

function nearAnyGate(p,gates){
  for(var i=0;i<gates.length;i++)if(dst(p,gc(gates[i]))<NO_HIT)return true;return false;
}

function normalTo(g,p){
  var c=gc(g),dx=g.x2-g.x1,dy=g.y2-g.y1,l=Math.hypot(dx,dy);
  var n={x:-dy/l,y:dx/l};
  return(p.x-c.x)*n.x+(p.y-c.y)*n.y>=0?n:{x:-n.x,y:-n.y};
}

function passRatio(g,a){
  var gd=Math.atan2(g.y2-g.y1,g.x2-g.x1)+Math.PI/2;
  var t=Math.abs(a-gd)%(Math.PI*2);if(t>Math.PI)t=Math.PI*2-t;if(t>Math.PI/2)t=Math.PI-t;
  var gap=GATE_HALF_W*2*Math.cos(t)-GATE_THICK*2*Math.sin(t)-BALL_R*2;
  var mx=GATE_HALF_W*2-BALL_R*2;return mx<=0?0:clamp(gap/mx,0,1);
}

// Compute the exit point: 0.5ft past gate center along the travel direction
function exitPoint(prev,gateC){
  var dx=gateC.x-prev.x,dy=gateC.y-prev.y,l=Math.hypot(dx,dy);
  if(l<.001)return{x:gateC.x,y:gateC.y+NO_HIT};
  return{x:gateC.x+dx/l*NO_HIT,y:gateC.y+dy/l*NO_HIT};
}

/*
 * Build shortest path: ball → [setup?] → g1_center → g1_exit → ... → hole
 *
 * For each gate:
 *   1. Try direct line from prev → gate center
 *   2. If it hits posts, insert a setup waypoint on the normal
 *   3. After the gate center, always add an exit point 0.5ft past
 *      the gate along the travel direction (ball continues straight)
 *   4. The NEXT shot starts from that exit point
 *
 * After building, validate all segments against all gates.
 */
function buildPath(data){
  var wp=[data.ball],gates=data.gates,gcs=gates.map(gc);

  for(var i=0;i<gates.length;i++){
    var g=gates[i],c=gcs[i],prev=wp[wp.length-1];

    // Try direct: prev → center
    var direct=!hitsGatePost(prev,c,g)&&!segHitsAnyPost(prev,c,gates,i);

    if(direct){
      // Add center + exit point (0.5ft past gate along same direction)
      var ex=exitPoint(prev,c);
      // Verify center→exit doesn't hit any other gate
      if(!segHitsAnyPost(c,ex,gates,i)&&!hitsGatePost(c,ex,g)){
        wp.push(c);wp.push(ex);continue;
      }
    }

    // Need setup shot — search on both normals
    var eN=normalTo(g,prev),best=null,bestD=1/0,bestEx=null;
    var ns=[eN,{x:-eN.x,y:-eN.y}];

    for(var ni=0;ni<2;ni++){var n=ns[ni];
      for(var d=NO_HIT;d<=5;d+=.1){
        var p={x:c.x+n.x*d,y:c.y+n.y*d};
        if(!inB(p,data.l,data.w)||nearAnyGate(p,gates))continue;
        if(hitsGatePost(p,c,g)||segHitsAnyPost(prev,p,gates,-1)||segHitsAnyPost(p,c,gates,i))continue;
        var ex=exitPoint(p,c);
        if(!inB(ex,data.l,data.w))continue;
        if(hitsGatePost(c,ex,g)||segHitsAnyPost(c,ex,gates,i))continue;
        var t=dst(prev,p)+dst(p,c);
        if(t<bestD){bestD=t;best=p;bestEx=ex;}
        break;
      }
    }

    // Radial fallback
    if(!best){
      for(var ang=0;ang<Math.PI*2;ang+=Math.PI/12){
        for(var d=NO_HIT;d<=5;d+=.2){
          var p={x:c.x+Math.cos(ang)*d,y:c.y+Math.sin(ang)*d};
          if(!inB(p,data.l,data.w)||nearAnyGate(p,gates))continue;
          if(hitsGatePost(p,c,g)||segHitsAnyPost(prev,p,gates,-1)||segHitsAnyPost(p,c,gates,i))continue;
          var ex=exitPoint(p,c);
          if(!inB(ex,data.l,data.w))continue;
          if(hitsGatePost(c,ex,g)||segHitsAnyPost(c,ex,gates,i))continue;
          var t=dst(prev,p)+dst(p,c);
          if(t<bestD){bestD=t;best=p;bestEx=ex;}
          break;
        }
      }
    }

    if(best){wp.push(best);wp.push(c);wp.push(bestEx);}
    else{
      // Fallback: just push center + default normal exit
      wp.push(c);
      var fallN=normalTo(g,prev);
      wp.push({x:c.x-fallN.x*NO_HIT,y:c.y-fallN.y*NO_HIT});
    }
  }

  wp.push(data.hole);

  // Final sweep: check every segment against every gate post
  for(var pass=0;pass<3;pass++){var fixed=false;
    for(var si=0;si<wp.length-1;si++){var a=wp[si],b=wp[si+1];
      for(var gi=0;gi<gates.length;gi++){
        var isEntry=Math.abs(b.x-gcs[gi].x)<.001&&Math.abs(b.y-gcs[gi].y)<.001;
        var isExit=Math.abs(a.x-gcs[gi].x)<.001&&Math.abs(a.y-gcs[gi].y)<.001;
        if(isEntry||isExit)continue;
        if(!hitsGatePost(a,b,gates[gi]))continue;
        var mid={x:(a.x+b.x)/2,y:(a.y+b.y)/2},gc2=gcs[gi];
        var away={x:mid.x-gc2.x,y:mid.y-gc2.y},alen=Math.hypot(away.x,away.y);
        if(alen<.001){away={x:1,y:0};alen=1;}
        for(var d=NO_HIT+.1;d<=5;d+=.2){
          var p={x:gc2.x+away.x/alen*d,y:gc2.y+away.y/alen*d};
          if(!inB(p,data.l,data.w)||nearAnyGate(p,gates))continue;
          if(!segHitsAnyPost(a,p,gates,-1)&&!segHitsAnyPost(p,b,gates,-1)){
            wp.splice(si+1,0,p);fixed=true;break;}
        }if(fixed)break;
      }if(fixed)break;
    }if(!fixed)break;
  }

  // Push stray waypoints out of no-hit zones
  for(var pass=0;pass<5;pass++){var ok=true;
    for(var i=1;i<wp.length-1;i++){
      var isGC=false;for(var j=0;j<gcs.length;j++)if(Math.abs(wp[i].x-gcs[j].x)<.001&&Math.abs(wp[i].y-gcs[j].y)<.001){isGC=true;break;}
      if(isGC)continue;
      for(var j=0;j<gcs.length;j++){var d2=dst(wp[i],gcs[j]);
        if(d2<NO_HIT&&d2>.001){ok=false;var push=NO_HIT-d2+.05,dx=wp[i].x-gcs[j].x,dy=wp[i].y-gcs[j].y,l=Math.hypot(dx,dy);
          wp[i]={x:clamp(wp[i].x+dx/l*push,.5,data.l-.5),y:clamp(wp[i].y+dy/l*push,.5,data.w-.5)};}
      }
    }if(ok)break;
  }

  return wp;
}

function computePar(data,diff){
  if(!data.gates.length)return 1;
  return Math.max(1,Math.round((buildPath(data).length-1)*DIFFICULTY[diff].parMult));
}

function computeRating(data,par){
  var n=data.gates.length;if(!n)return 1;
  var sp=buildPath(data),gcs=data.gates.map(gc);
  var extra=clamp((sp.length-1-(n+1))/Math.max(n,1)*10,0,10);
  var tight=0;
  for(var i=0;i<n;i++){var c=gcs[i];for(var j=1;j<sp.length;j++)
    if(Math.abs(sp[j].x-c.x)<.001&&Math.abs(sp[j].y-c.y)<.001){
      tight+=(1-passRatio(data.gates[i],Math.atan2(c.y-sp[j-1].y,c.x-sp[j-1].x)));break;}}
  tight=clamp(tight/n*10,0,10);
  var bh=dst(data.ball,data.hole),spread=0;
  if(bh>0){var s=0;data.gates.forEach(function(g){var c=gc(g);
    s+=Math.abs((data.hole.x-data.ball.x)*(data.ball.y-c.y)-(data.ball.x-c.x)*(data.hole.y-data.ball.y))/bh;});
    spread=clamp(s/n/(Math.min(data.l,data.w)*.3)*10,0,10);}
  var pt=clamp((1-(par-n)/(n+1))*10,0,10);
  return clamp(Math.round(extra*.3+tight*.3+spread*.2+pt*.2),1,10);
}

function placeBH(l,w,diff){
  if(diff==='easy')return{ball:{x:rand(1,2),y:rand(1,w-1)},hole:{x:rand(l-2,l-1),y:rand(1,w-1)}};
  if(diff==='normal')return{ball:{x:rand(1,l*.25),y:rand(1,w-1)},hole:{x:rand(l*.75,l-1),y:rand(1,w-1)}};
  var b=randPt(l,w),h=randPt(l,w);while(dst(b,h)<Math.max(l,w)*.3)h=randPt(l,w);return{ball:b,hole:h};
}

function placeGates(ball,hole,l,w,n,cfg){
  var pa=Math.atan2(hole.y-ball.y,hole.x-ball.x),placed=[ball,hole],gates=[];
  for(var i=0;i<n;i++){var t=(i+1)/(n+1),bx=ball.x+(hole.x-ball.x)*t,by=ball.y+(hole.y-ball.y)*t,cx,cy,ok=false;
    for(var a=0;a<MAX_RETRIES;a++){var p=rand(-1,1)*cfg.spread*Math.min(l,w),j=a>50?(a/MAX_RETRIES)*2:0;
      var tx=clamp(bx+Math.cos(pa+Math.PI/2)*p+rand(-j,j),1,l-1),ty=clamp(by+Math.sin(pa+Math.PI/2)*p+rand(-j,j),1,w-1);
      if(placed.every(function(q){return dst({x:tx,y:ty},q)>=MIN_DIST})){cx=tx;cy=ty;ok=true;break;}}
    if(!ok)continue;placed.push({x:cx,y:cy});
    var prev=gates.length?gc(gates[gates.length-1]):ball,aA=Math.atan2(cy-prev.y,cx-prev.x);
    var pA=aA+Math.PI/2,rA=rand(0,Math.PI),ang=pA+(rA-pA)*cfg.angleRand;
    var dx=Math.cos(ang)*GATE_HALF_W,dy=Math.sin(ang)*GATE_HALF_W;
    gates.push({x1:cx-dx,y1:cy-dy,x2:cx+dx,y2:cy+dy,color:GATE_COLORS[i%GATE_COLORS.length],index:i+1});}
  return gates;
}

function genLayout(l,w,n,diff){var r=placeBH(l,w,diff);return{l:l,w:w,ball:r.ball,hole:r.hole,gates:placeGates(r.ball,r.hole,l,w,n,DIFFICULTY[diff])};}

function generate(){
  var l=clamp(+document.getElementById('length').value,5,25),w=clamp(+document.getElementById('width').value,5,25);
  var n=+document.getElementById('gates').value,d=document.getElementById('difficulty').value;
  var layout=genLayout(l,w,n,d),par=computePar(layout,d),rating=computeRating(layout,par);
  var sp=buildPath(layout),total=0,longest=0;
  for(var i=1;i<sp.length;i++){var leg=dst(sp[i-1],sp[i]);total+=leg;if(leg>longest)longest=leg;}
  holeCounter++;
  document.getElementById('holeNum').textContent=holeCounter;
  document.getElementById('parText').textContent=par;
  document.getElementById('rating').textContent=rating+'/10';
  document.getElementById('totalDist').textContent=total.toFixed(1)+' ft';
  document.getElementById('longestShot').textContent=longest.toFixed(1)+' ft';
  draw(layout,sp);
}

function gateRect(g,tx,ty){
  var dx=g.x2-g.x1,dy=g.y2-g.y1,l=Math.hypot(dx,dy);
  var px=-dy/l*GATE_THICK,py=dx/l*GATE_THICK;
  return[[tx(g.x1-px),ty(g.y1-py)],[tx(g.x2-px),ty(g.y2-py)],[tx(g.x2+px),ty(g.y2+py)],[tx(g.x1+px),ty(g.y1+py)]];
}
function tracePath(ctx,pts){ctx.beginPath();ctx.moveTo(pts[0][0],pts[0][1]);for(var i=1;i<pts.length;i++)ctx.lineTo(pts[i][0],pts[i][1]);ctx.closePath();}

function draw(data,sp){
  var cv=document.getElementById('c'),ctx=cv.getContext('2d'),card=cv.parentElement;
  var mW=card.clientWidth-48,mH=500,r=data.l/data.w,cw,ch;
  if(r>mW/mH){cw=mW;ch=mW/r}else{ch=mH;cw=mH*r}
  cv.width=cw;cv.height=ch;cv.style.maxWidth='100%';
  var s=cw/data.l,tx=function(x){return x*s},ty=function(y){return y*s};

  var bg=ctx.createLinearGradient(0,0,0,ch);bg.addColorStop(0,'#5cb85c');bg.addColorStop(.5,'#4caf50');bg.addColorStop(1,'#43a047');
  ctx.fillStyle=bg;ctx.fillRect(0,0,cw,ch);
  ctx.fillStyle='rgba(255,255,255,0.04)';for(var i=0;i<300;i++){ctx.beginPath();ctx.arc(rand(0,cw),rand(0,ch),rand(.5,2),0,Math.PI*2);ctx.fill();}
  ctx.strokeStyle='rgba(0,0,0,0.03)';ctx.lineWidth=1;for(var i=0;i<150;i++){var gx=rand(0,cw),gy=rand(0,ch);ctx.beginPath();ctx.moveTo(gx,gy);ctx.lineTo(gx+rand(-3,3),gy-rand(3,8));ctx.stroke();}

  ctx.strokeStyle='rgba(0,0,0,0.15)';ctx.lineWidth=3;ctx.strokeRect(tx(.3),ty(.3),tx(data.l-.6),ty(data.w-.6));

  ctx.setLineDash([8,6]);ctx.strokeStyle='rgba(255,255,255,0.25)';ctx.lineWidth=2;
  ctx.beginPath();ctx.moveTo(tx(sp[0].x),ty(sp[0].y));for(var i=1;i<sp.length;i++)ctx.lineTo(tx(sp[i].x),ty(sp[i].y));ctx.stroke();ctx.setLineDash([]);
  for(var i=1;i<sp.length-1;i++){ctx.beginPath();ctx.arc(tx(sp[i].x),ty(sp[i].y),3,0,Math.PI*2);ctx.fillStyle='rgba(255,255,255,0.4)';ctx.fill();}

  data.gates.forEach(function(g){
    var pts=gateRect(g,tx,ty),cx=tx((g.x1+g.x2)/2),cy=ty((g.y1+g.y2)/2);
    ctx.save();ctx.translate(2,2);tracePath(ctx,pts);ctx.fillStyle='rgba(0,0,0,0.25)';ctx.fill();ctx.restore();
    tracePath(ctx,pts);ctx.fillStyle=g.color;ctx.fill();
    ctx.save();ctx.clip();var hl=ctx.createLinearGradient(pts[0][0],pts[0][1],pts[1][0],pts[1][1]);
    hl.addColorStop(0,'rgba(255,255,255,0.35)');hl.addColorStop(.5,'rgba(255,255,255,0)');hl.addColorStop(1,'rgba(255,255,255,0.15)');
    ctx.fillStyle=hl;ctx.fillRect(Math.min(pts[0][0],pts[2][0])-5,Math.min(pts[0][1],pts[2][1])-5,Math.abs(pts[2][0]-pts[0][0])+10,Math.abs(pts[2][1]-pts[0][1])+10);ctx.restore();
    tracePath(ctx,pts);ctx.strokeStyle='rgba(0,0,0,0.5)';ctx.lineWidth=1;ctx.stroke();
    ctx.beginPath();ctx.arc(cx,cy,8,0,Math.PI*2);ctx.fillStyle='rgba(0,0,0,0.6)';ctx.fill();
    ctx.fillStyle='#fff';ctx.font='bold 10px Inter,sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(g.index,cx,cy);
  });

  var bx=tx(data.ball.x),by=ty(data.ball.y),br=.12*s;
  ctx.beginPath();ctx.arc(bx+2,by+2,br,0,Math.PI*2);ctx.fillStyle='rgba(0,0,0,0.3)';ctx.fill();
  var bbg=ctx.createRadialGradient(bx-br*.3,by-br*.3,br*.1,bx,by,br);bbg.addColorStop(0,'#fff');bbg.addColorStop(.7,'#e0e0e0');bbg.addColorStop(1,'#bdbdbd');
  ctx.beginPath();ctx.arc(bx,by,br,0,Math.PI*2);ctx.fillStyle=bbg;ctx.fill();ctx.strokeStyle='rgba(0,0,0,0.4)';ctx.lineWidth=1;ctx.stroke();
  ctx.beginPath();ctx.arc(bx-br*.25,by-br*.25,br*.3,0,Math.PI*2);ctx.fillStyle='rgba(255,255,255,0.7)';ctx.fill();

  var hx=tx(data.hole.x),hy=ty(data.hole.y),hr=.22*s,pH=35;
  ctx.beginPath();ctx.ellipse(hx,hy+hr*.3,hr*1.1,hr*.5,0,0,Math.PI*2);ctx.fillStyle='rgba(0,0,0,0.15)';ctx.fill();
  var hg=ctx.createRadialGradient(hx,hy,hr*.2,hx,hy,hr);hg.addColorStop(0,'#1a1a1a');hg.addColorStop(.7,'#333');hg.addColorStop(1,'#555');
  ctx.beginPath();ctx.arc(hx,hy,hr,0,Math.PI*2);ctx.fillStyle=hg;ctx.fill();ctx.strokeStyle='rgba(0,0,0,0.5)';ctx.lineWidth=1.5;ctx.stroke();
  ctx.beginPath();ctx.arc(hx,hy,hr*.6,0,Math.PI*2);ctx.strokeStyle='rgba(255,255,255,0.1)';ctx.lineWidth=1;ctx.stroke();
  ctx.strokeStyle='rgba(0,0,0,0.2)';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(hx+2,hy+2);ctx.lineTo(hx+2,hy-pH+2);ctx.stroke();
  var pg=ctx.createLinearGradient(hx,hy,hx,hy-pH);pg.addColorStop(0,'#888');pg.addColorStop(.5,'#ccc');pg.addColorStop(1,'#aaa');
  ctx.strokeStyle=pg;ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(hx,hy);ctx.lineTo(hx,hy-pH);ctx.stroke();
  ctx.beginPath();ctx.moveTo(hx,hy-pH);ctx.lineTo(hx+18,hy-pH+9);ctx.lineTo(hx,hy-pH+18);ctx.closePath();
  var fg=ctx.createLinearGradient(hx,hy-pH,hx+18,hy-pH+9);fg.addColorStop(0,'#f44336');fg.addColorStop(1,'#d32f2f');
  ctx.fillStyle=fg;ctx.fill();ctx.strokeStyle='rgba(0,0,0,0.3)';ctx.lineWidth=1;ctx.stroke();
  ctx.beginPath();ctx.moveTo(hx+1,hy-pH+2);ctx.lineTo(hx+10,hy-pH+7);ctx.lineTo(hx+1,hy-pH+10);ctx.closePath();ctx.fillStyle='rgba(255,255,255,0.2)';ctx.fill();
  ctx.beginPath();ctx.arc(hx,hy-pH,2.5,0,Math.PI*2);ctx.fillStyle='#fdd835';ctx.fill();ctx.strokeStyle='rgba(0,0,0,0.3)';ctx.lineWidth=1;ctx.stroke();
}