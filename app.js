/* ══ Constants & State ══ */

var GATE_COLORS = ['#e53935','#fb8c00','#fdd835','#1e88e5','#3949ab','#8e24aa','#d81b60','#00acc1','#e91e63'];
var DIFFICULTY = {
  easy:       { spread: 0.12, angleRand: 0.15, parMult: 1.3, detour: 0.0  },
  normal:     { spread: 0.35, angleRand: 0.50, parMult: 1.0, detour: 0.15 },
  hard:       { spread: 0.70, angleRand: 1.00, parMult: 0.75, detour: 0.35 },
  impossible: { spread: 0.90, angleRand: 1.00, parMult: 0.60, detour: 0.55 }
};
var MIN_DIST = 1, MAX_RETRIES = 500;
var GATE_HALF_W = 0.25, GATE_THICK = 0.12, BALL_R = 0.08;
var NO_HIT = 0.5, BALL_SPEED = 2;
var holeCounter = 0;
var animFrame = null, animPath = null, animData = null, animStart = 0;

/* ══ Utilities ══ */

function rand(a, b) { return Math.random() * (b - a) + a; }
function dst(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
function randPt(l, w, m) { m = m || 1; return { x: rand(m, l - m), y: rand(m, w - m) }; }
function gc(g) { return { x: (g.x1 + g.x2) / 2, y: (g.y1 + g.y2) / 2 }; }
function inB(p, l, w) { return p.x >= 0.5 && p.x <= l - 0.5 && p.y >= 0.5 && p.y <= w - 0.5; }

function sameDirection(a, b, c) {
  var d1x = b.x - a.x, d1y = b.y - a.y, d2x = c.x - b.x, d2y = c.y - b.y;
  var l1 = Math.hypot(d1x, d1y), l2 = Math.hypot(d2x, d2y);
  if (l1 < 0.001 || l2 < 0.001) return true;
  return (d1x * d2x + d1y * d2y) / (l1 * l2) > 0.9999;
}

/* ══ Geometry ══ */

function segsCross(p1, p2, p3, p4) {
  var d1x = p2.x - p1.x, d1y = p2.y - p1.y, d2x = p4.x - p3.x, d2y = p4.y - p3.y;
  var cross = d1x * d2y - d1y * d2x;
  if (Math.abs(cross) < 1e-10) return false;
  var t = ((p3.x - p1.x) * d2y - (p3.y - p1.y) * d2x) / cross;
  var u = ((p3.x - p1.x) * d1y - (p3.y - p1.y) * d1x) / cross;
  return t > 0 && t < 1 && u > 0 && u < 1;
}

function gateCorners(g) {
  var dx = g.x2 - g.x1, dy = g.y2 - g.y1, l = Math.hypot(dx, dy);
  var px = -dy / l * GATE_THICK, py = dx / l * GATE_THICK;
  return [
    { x: g.x1 - px, y: g.y1 - py }, { x: g.x2 - px, y: g.y2 - py },
    { x: g.x2 + px, y: g.y2 + py }, { x: g.x1 + px, y: g.y1 + py }
  ];
}

/* ══ Gate Physics ══ */

function hitsGatePost(a, b, g) {
  var c = gateCorners(g);
  return segsCross(a, b, c[0], c[3]) || segsCross(a, b, c[1], c[2]);
}

function segHitsAnyPost(a, b, gates, skipIdx) {
  for (var i = 0; i < gates.length; i++) {
    if (i === skipIdx) continue;
    if (hitsGatePost(a, b, gates[i])) return true;
  }
  return false;
}

function nearAnyGate(p, gates) {
  for (var i = 0; i < gates.length; i++)
    if (dst(p, gc(gates[i])) < NO_HIT) return true;
  return false;
}

function normalTo(g, p) {
  var c = gc(g), dx = g.x2 - g.x1, dy = g.y2 - g.y1, l = Math.hypot(dx, dy);
  var n = { x: -dy / l, y: dx / l };
  return (p.x - c.x) * n.x + (p.y - c.y) * n.y >= 0 ? n : { x: -n.x, y: -n.y };
}

function passRatio(g, angle) {
  var gd = Math.atan2(g.y2 - g.y1, g.x2 - g.x1) + Math.PI / 2;
  var t = Math.abs(angle - gd) % (Math.PI * 2);
  if (t > Math.PI) t = Math.PI * 2 - t;
  if (t > Math.PI / 2) t = Math.PI - t;
  var gap = GATE_HALF_W * 2 * Math.cos(t) - GATE_THICK * 2 * Math.sin(t) - BALL_R * 2;
  var mx = GATE_HALF_W * 2 - BALL_R * 2;
  return mx <= 0 ? 0 : clamp(gap / mx, 0, 1);
}

function exitPoint(prev, gateC) {
  var dx = gateC.x - prev.x, dy = gateC.y - prev.y, l = Math.hypot(dx, dy);
  if (l < 0.001) return { x: gateC.x, y: gateC.y + NO_HIT };
  return { x: gateC.x + dx / l * NO_HIT, y: gateC.y + dy / l * NO_HIT };
}

/* ══ Path Builder ══ */

function findSetup(prev, c, g, gates, i, data) {
  var eN = normalTo(g, prev), best = null, bestD = Infinity, bestEx = null;
  var ns = [eN, { x: -eN.x, y: -eN.y }];
  for (var ni = 0; ni < 2; ni++) {
    var n = ns[ni];
    for (var d = NO_HIT; d <= 5; d += 0.1) {
      var p = { x: c.x + n.x * d, y: c.y + n.y * d };
      if (!inB(p, data.l, data.w) || nearAnyGate(p, gates)) continue;
      if (hitsGatePost(p, c, g) || segHitsAnyPost(prev, p, gates, -1) || segHitsAnyPost(p, c, gates, i)) continue;
      var ex = exitPoint(p, c);
      if (!inB(ex, data.l, data.w) || hitsGatePost(c, ex, g) || segHitsAnyPost(c, ex, gates, i)) continue;
      var t = dst(prev, p) + dst(p, c);
      if (t < bestD) { bestD = t; best = p; bestEx = ex; }
      break;
    }
  }
  if (!best) {
    for (var ang = 0; ang < Math.PI * 2; ang += Math.PI / 12) {
      for (var d = NO_HIT; d <= 5; d += 0.2) {
        var p = { x: c.x + Math.cos(ang) * d, y: c.y + Math.sin(ang) * d };
        if (!inB(p, data.l, data.w) || nearAnyGate(p, gates)) continue;
        if (hitsGatePost(p, c, g) || segHitsAnyPost(prev, p, gates, -1) || segHitsAnyPost(p, c, gates, i)) continue;
        var ex = exitPoint(p, c);
        if (!inB(ex, data.l, data.w) || hitsGatePost(c, ex, g) || segHitsAnyPost(c, ex, gates, i)) continue;
        var t = dst(prev, p) + dst(p, c);
        if (t < bestD) { bestD = t; best = p; bestEx = ex; }
        break;
      }
    }
  }
  return { pt: best, ex: bestEx };
}

function buildPath(data) {
  var wp = [data.ball], gates = data.gates, gcs = gates.map(gc);

  for (var i = 0; i < gates.length; i++) {
    var g = gates[i], c = gcs[i], prev = wp[wp.length - 1];
    var direct = !hitsGatePost(prev, c, g) && !segHitsAnyPost(prev, c, gates, i);
    if (direct) {
      var ex = exitPoint(prev, c);
      if (inB(ex, data.l, data.w) && !segHitsAnyPost(c, ex, gates, i) && !hitsGatePost(c, ex, g)) {
        wp.push(c); wp.push(ex); continue;
      }
    }
    var setup = findSetup(prev, c, g, gates, i, data);
    if (setup.pt) { wp.push(setup.pt); wp.push(c); wp.push(setup.ex); }
    else { wp.push(c); var fn = normalTo(g, prev); wp.push({ x: c.x - fn.x * NO_HIT, y: c.y - fn.y * NO_HIT }); }
  }
  wp.push(data.hole);

  // Fix collisions
  for (var pass = 0; pass < 3; pass++) {
    var fixed = false;
    for (var si = 0; si < wp.length - 1; si++) {
      var a = wp[si], b = wp[si + 1];
      for (var gi = 0; gi < gates.length; gi++) {
        var isGate = (Math.abs(b.x - gcs[gi].x) < 0.001 && Math.abs(b.y - gcs[gi].y) < 0.001)
                  || (Math.abs(a.x - gcs[gi].x) < 0.001 && Math.abs(a.y - gcs[gi].y) < 0.001);
        if (isGate || !hitsGatePost(a, b, gates[gi])) continue;
        var mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, gc2 = gcs[gi];
        var away = { x: mid.x - gc2.x, y: mid.y - gc2.y }, alen = Math.hypot(away.x, away.y);
        if (alen < 0.001) { away = { x: 1, y: 0 }; alen = 1; }
        for (var d = NO_HIT + 0.1; d <= 5; d += 0.2) {
          var p = { x: gc2.x + away.x / alen * d, y: gc2.y + away.y / alen * d };
          if (!inB(p, data.l, data.w) || nearAnyGate(p, gates)) continue;
          if (!segHitsAnyPost(a, p, gates, -1) && !segHitsAnyPost(p, b, gates, -1)) {
            wp.splice(si + 1, 0, p); fixed = true; break;
          }
        }
        if (fixed) break;
      }
      if (fixed) break;
    }
    if (!fixed) break;
  }

  // Push waypoints out of no-hit zones
  for (var pass = 0; pass < 5; pass++) {
    var ok = true;
    for (var i = 1; i < wp.length - 1; i++) {
      var isGC = false;
      for (var j = 0; j < gcs.length; j++)
        if (Math.abs(wp[i].x - gcs[j].x) < 0.001 && Math.abs(wp[i].y - gcs[j].y) < 0.001) { isGC = true; break; }
      if (isGC) continue;
      for (var j = 0; j < gcs.length; j++) {
        var d2 = dst(wp[i], gcs[j]);
        if (d2 < NO_HIT && d2 > 0.001) {
          ok = false;
          var push = NO_HIT - d2 + 0.05, dx = wp[i].x - gcs[j].x, dy = wp[i].y - gcs[j].y, l = Math.hypot(dx, dy);
          wp[i] = { x: clamp(wp[i].x + dx / l * push, 0.5, data.l - 0.5), y: clamp(wp[i].y + dy / l * push, 0.5, data.w - 0.5) };
        }
      }
    }
    if (ok) break;
  }
  return wp;
}

/* ══ Scoring ══ */

function countShots(wp) {
  if (wp.length <= 1) return 0;
  var shots = 1;
  for (var i = 1; i < wp.length - 1; i++)
    if (!sameDirection(wp[i - 1], wp[i], wp[i + 1])) shots++;
  return shots;
}

function computeRating(data, par, diff) {
  var n = data.gates.length;
  if (!n) return { easy: 1, normal: 3, hard: 6, impossible: 9 }[diff] || 1;
  var sp = buildPath(data), gcs = data.gates.map(gc), shots = countShots(sp);
  var extra = clamp((shots - (n + 1)) / Math.max(n, 1) * 10, 0, 10);
  var tight = 0;
  for (var i = 0; i < n; i++) {
    var c = gcs[i];
    for (var j = 1; j < sp.length; j++)
      if (Math.abs(sp[j].x - c.x) < 0.001 && Math.abs(sp[j].y - c.y) < 0.001) {
        tight += (1 - passRatio(data.gates[i], Math.atan2(c.y - sp[j - 1].y, c.x - sp[j - 1].x))); break;
      }
  }
  tight = clamp(tight / n * 10, 0, 10);
  var bh = dst(data.ball, data.hole), spread = 0;
  if (bh > 0) {
    var s = 0;
    data.gates.forEach(function(g) { var c = gc(g);
      s += Math.abs((data.hole.x - data.ball.x) * (data.ball.y - c.y) - (data.ball.x - c.x) * (data.hole.y - data.ball.y)) / bh; });
    spread = clamp(s / n / (Math.min(data.l, data.w) * 0.3) * 10, 0, 10);
  }
  var pt = shots > 0 ? clamp((1 - (par - shots) / Math.max(shots, 1)) * 10, 0, 10) : 5;
  var raw = extra * 0.25 + tight * 0.25 + spread * 0.25 + pt * 0.25;
  var anchor = { easy: 2, normal: 4.5, hard: 7.5, impossible: 9.5 }[diff];
  return clamp(Math.round(anchor + (raw - 5) * 0.3), 1, 10);
}

/* ══ Layout Generation ══ */

function placeBH(l, w, diff) {
  if (diff === 'easy') return { ball: { x: rand(1, 2), y: rand(1, w - 1) }, hole: { x: rand(l - 2, l - 1), y: rand(1, w - 1) } };
  if (diff === 'normal') return { ball: { x: rand(1, l * 0.25), y: rand(1, w - 1) }, hole: { x: rand(l * 0.75, l - 1), y: rand(1, w - 1) } };
  var b = randPt(l, w), h = randPt(l, w);
  var minD = diff === 'impossible' ? Math.max(l, w) * 0.5 : Math.max(l, w) * 0.3;
  while (dst(b, h) < minD) h = randPt(l, w);
  return { ball: b, hole: h };
}

function placeGates(ball, hole, l, w, n, cfg) {
  var pa = Math.atan2(hole.y - ball.y, hole.x - ball.x), placed = [ball, hole], gates = [];
  var fieldSize = Math.min(l, w);                          // ← new
  for (var i = 0; i < n; i++) {
    var t = (i + 1) / (n + 1), bx = ball.x + (hole.x - ball.x) * t, by = ball.y + (hole.y - ball.y) * t;
    var cx, cy, ok = false;
    var side = (i % 2 === 0) ? 1 : -1;                    // ← new: alternate sides
    var minOffset = cfg.detour * fieldSize;                // ← new: minimum perpendicular distance
    for (var a = 0; a < MAX_RETRIES; a++) {
      var p = rand(-1, 1) * cfg.spread * fieldSize;       // ← was: * Math.min(l, w)
      if (cfg.detour > 0) {                               // ← new block start
        p = side * (minOffset + Math.abs(p));              //   force to one side with floor
      }                                                    // ← new block end
      var j = a > 50 ? (a / MAX_RETRIES) * 2 : 0;
      var tx = clamp(bx + Math.cos(pa + Math.PI / 2) * p + rand(-j, j), 1, l - 1);
      var ty = clamp(by + Math.sin(pa + Math.PI / 2) * p + rand(-j, j), 1, w - 1);
      if (placed.every(function(q) { return dst({ x: tx, y: ty }, q) >= MIN_DIST; })) { cx = tx; cy = ty; ok = true; break; }
    }
    if (!ok) continue;
    placed.push({ x: cx, y: cy });
    var prev = gates.length ? gc(gates[gates.length - 1]) : ball;
    var aA = Math.atan2(cy - prev.y, cx - prev.x), pA = aA + Math.PI / 2, rA = rand(0, Math.PI);
    var ang = pA + (rA - pA) * cfg.angleRand;
    var dx = Math.cos(ang) * GATE_HALF_W, dy = Math.sin(ang) * GATE_HALF_W;
    gates.push({ x1: cx - dx, y1: cy - dy, x2: cx + dx, y2: cy + dy, color: GATE_COLORS[i % GATE_COLORS.length], index: i + 1 });
  }
  return gates;
}

function genLayout(l, w, n, diff) {
  var r = placeBH(l, w, diff);
  return { l: l, w: w, ball: r.ball, hole: r.hole, gates: placeGates(r.ball, r.hole, l, w, n, DIFFICULTY[diff]) };
}

/* ══ Main Entry & Animation ══ */

function generate() {
  if (animFrame) { cancelAnimationFrame(animFrame); animFrame = null; }
  var l = clamp(+document.getElementById('length').value, 5, 25);
  var w = clamp(+document.getElementById('width').value, 5, 25);
  var n = +document.getElementById('gates').value;
  var d = document.getElementById('difficulty').value;
  var layout = genLayout(l, w, n, d), sp = buildPath(layout);
  var shots = countShots(sp);
  var par = Math.max(shots, Math.round(shots * DIFFICULTY[d].parMult));
  if (n === 0 && d === 'easy') par = Math.max(2, par);
  var rating = computeRating(layout, par, d);
  var total = 0, longest = 0;
  for (var i = 1; i < sp.length; i++) { var leg = dst(sp[i - 1], sp[i]); total += leg; if (leg > longest) longest = leg; }
  holeCounter++;
  document.getElementById('holeNum').textContent = holeCounter;
  document.getElementById('parText').textContent = par;
  document.getElementById('rating').textContent = rating + '/10';
  document.getElementById('totalDist').textContent = total.toFixed(1) + ' ft';
  document.getElementById('longestShot').textContent = longest.toFixed(1) + ' ft';
  var cumDist = [0];
  for (var i = 1; i < sp.length; i++) cumDist.push(cumDist[i - 1] + dst(sp[i - 1], sp[i]));
  animData = layout; animPath = sp;
  animData._cumDist = cumDist;
  animData._totalDist = cumDist[cumDist.length - 1];
  animStart = performance.now();
  animFrame = requestAnimationFrame(animate);
}

function getBallPos(path, cumDist, traveled) {
  for (var i = 1; i < path.length; i++) {
    if (traveled <= cumDist[i]) {
      var segLen = cumDist[i] - cumDist[i - 1];
      var t = segLen > 0 ? (traveled - cumDist[i - 1]) / segLen : 0;
      return { x: path[i - 1].x + (path[i].x - path[i - 1].x) * t, y: path[i - 1].y + (path[i].y - path[i - 1].y) * t };
    }
  }
  return path[path.length - 1];
}

function animate(now) {
  var elapsed = (now - animStart) / 1000;
  var duration = animData._totalDist / BALL_SPEED;
  var t = elapsed % (duration + 1);
  var traveled = Math.min(t * BALL_SPEED, animData._totalDist);
  drawFrame(animData, animPath, getBallPos(animPath, animData._cumDist, traveled), traveled >= animData._totalDist);
  animFrame = requestAnimationFrame(animate);
}

/* ══ Drawing Helpers ══ */

function gateRect(g, tx, ty) {
  var dx = g.x2 - g.x1, dy = g.y2 - g.y1, l = Math.hypot(dx, dy);
  var px = -dy / l * GATE_THICK, py = dx / l * GATE_THICK;
  return [[tx(g.x1 - px), ty(g.y1 - py)], [tx(g.x2 - px), ty(g.y2 - py)], [tx(g.x2 + px), ty(g.y2 + py)], [tx(g.x1 + px), ty(g.y1 + py)]];
}

function tracePath(ctx, pts) {
  ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
  for (var i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.closePath();
}

function drawArrow(ctx, x, y, ux, uy, size, fill, stroke) {
  ctx.beginPath();
  ctx.moveTo(x + ux * size, y + uy * size);
  ctx.lineTo(x - ux * size * 0.4 + uy * size * 0.5, y - uy * size * 0.4 - ux * size * 0.5);
  ctx.lineTo(x - ux * size * 0.4 - uy * size * 0.5, y - uy * size * 0.4 + ux * size * 0.5);
  ctx.closePath();
  ctx.fillStyle = fill; ctx.fill();
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1; ctx.stroke(); }
}

/* ══ Main Draw Frame ══ */

function drawFrame(data, sp, ballPos, atHole) {
  var cv = document.getElementById('c'), ctx = cv.getContext('2d'), card = cv.parentElement;
  var mW = card.clientWidth - 48, mH = 500, r = data.l / data.w, cw, ch;
  if (r > mW / mH) { cw = mW; ch = mW / r; } else { ch = mH; cw = mH * r; }
  cv.width = cw; cv.height = ch; cv.style.maxWidth = '100%';
  var s = cw / data.l, tx = function(x) { return x * s; }, ty = function(y) { return y * s; };

  // Grass
  var bg = ctx.createLinearGradient(0, 0, 0, ch);
  bg.addColorStop(0, '#5cb85c'); bg.addColorStop(0.5, '#4caf50'); bg.addColorStop(1, '#43a047');
  ctx.fillStyle = bg; ctx.fillRect(0, 0, cw, ch);
  if (!data._grass) {
    data._grass = []; data._blades = [];
    for (var i = 0; i < 300; i++) data._grass.push({ x: rand(0, 1), y: rand(0, 1), r: rand(0.5, 2) });
    for (var i = 0; i < 150; i++) data._blades.push({ x: rand(0, 1), y: rand(0, 1), dx: rand(-3, 3), dy: rand(3, 8) });
  }
  ctx.fillStyle = 'rgba(255,255,255,0.04)';
  for (var i = 0; i < data._grass.length; i++) {
    var g = data._grass[i]; ctx.beginPath(); ctx.arc(g.x * cw, g.y * ch, g.r, 0, Math.PI * 2); ctx.fill();
  }
  ctx.strokeStyle = 'rgba(0,0,0,0.03)'; ctx.lineWidth = 1;
  for (var i = 0; i < data._blades.length; i++) {
    var b = data._blades[i]; ctx.beginPath(); ctx.moveTo(b.x * cw, b.y * ch); ctx.lineTo(b.x * cw + b.dx, b.y * ch - b.dy); ctx.stroke();
  }

  // Border
  ctx.strokeStyle = 'rgba(0,0,0,0.15)'; ctx.lineWidth = 3;
  ctx.strokeRect(tx(0.3), ty(0.3), tx(data.l - 0.6), ty(data.w - 0.6));

  // Shot path
  ctx.setLineDash([8, 6]); ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(tx(sp[0].x), ty(sp[0].y));
  for (var i = 1; i < sp.length; i++) ctx.lineTo(tx(sp[i].x), ty(sp[i].y));
  ctx.stroke(); ctx.setLineDash([]);

  // Arrows
  var asz = 6;
  for (var i = 0; i < sp.length - 1; i++) {
    var ax = tx(sp[i].x), ay = ty(sp[i].y), bx = tx(sp[i + 1].x), by = ty(sp[i + 1].y);
    var adx = bx - ax, ady = by - ay, alen = Math.hypot(adx, ady);
    if (alen < 1) continue;
    drawArrow(ctx, ax + adx * 0.5, ay + ady * 0.5, adx / alen, ady / alen, asz, 'rgba(255,255,255,0.4)', null);
  }
  for (var i = 1; i < sp.length - 1; i++) {
    if (sameDirection(sp[i - 1], sp[i], sp[i + 1])) continue;
    var px = tx(sp[i].x), py = ty(sp[i].y);
    var nx = tx(sp[i + 1].x) - px, ny = ty(sp[i + 1].y) - py, nl = Math.hypot(nx, ny);
    if (nl < 1) continue;
    drawArrow(ctx, px, py, nx / nl, ny / nl, asz * 1.4, 'rgba(255,255,255,0.7)', 'rgba(0,0,0,0.2)');
  }

  // Gates
  data.gates.forEach(function(g) {
    var pts = gateRect(g, tx, ty), cx = tx((g.x1 + g.x2) / 2), cy = ty((g.y1 + g.y2) / 2);
    ctx.save(); ctx.translate(2, 2); tracePath(ctx, pts); ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fill(); ctx.restore();
    tracePath(ctx, pts); ctx.fillStyle = g.color; ctx.fill();
    ctx.save(); ctx.clip();
    var hl = ctx.createLinearGradient(pts[0][0], pts[0][1], pts[1][0], pts[1][1]);
    hl.addColorStop(0, 'rgba(255,255,255,0.35)'); hl.addColorStop(0.5, 'rgba(255,255,255,0)'); hl.addColorStop(1, 'rgba(255,255,255,0.15)');
    ctx.fillStyle = hl;
    ctx.fillRect(Math.min(pts[0][0], pts[2][0]) - 5, Math.min(pts[0][1], pts[2][1]) - 5, Math.abs(pts[2][0] - pts[0][0]) + 10, Math.abs(pts[2][1] - pts[0][1]) + 10);
    ctx.restore();
    tracePath(ctx, pts); ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 1; ctx.stroke();
    ctx.beginPath(); ctx.arc(cx, cy, 8, 0, Math.PI * 2); ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fill();
    ctx.fillStyle = '#fff'; ctx.font = 'bold 10px Inter,sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(g.index, cx, cy);
  });

  // Ball spawn marker (small red X)
  var sx = tx(data.ball.x), sy = ty(data.ball.y);
  var br = 0.12 * s;           // same as ball radius
  var size = br * 0.8;         // slightly smaller than the ball

  ctx.strokeStyle = '#e53935'; // red
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(sx - size, sy - size);
  ctx.lineTo(sx + size, sy + size);
  ctx.moveTo(sx + size, sy - size);
  ctx.lineTo(sx - size, sy + size);
  ctx.stroke();

  // Hole & Flag
  var hx = tx(data.hole.x), hy = ty(data.hole.y), hr = 0.22 * s, pH = 35;
  ctx.beginPath(); ctx.ellipse(hx, hy + hr * 0.3, hr * 1.1, hr * 0.5, 0, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(0,0,0,0.15)'; ctx.fill();
  var hg = ctx.createRadialGradient(hx, hy, hr * 0.2, hx, hy, hr);
  hg.addColorStop(0, '#1a1a1a'); hg.addColorStop(0.7, '#333'); hg.addColorStop(1, '#555');
  ctx.beginPath(); ctx.arc(hx, hy, hr, 0, Math.PI * 2);
  ctx.fillStyle = hg; ctx.fill(); ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 1.5; ctx.stroke();
  ctx.beginPath(); ctx.arc(hx, hy, hr * 0.6, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(255,255,255,0.1)'; ctx.lineWidth = 1; ctx.stroke();
  ctx.strokeStyle = 'rgba(0,0,0,0.2)'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(hx + 2, hy + 2); ctx.lineTo(hx + 2, hy - pH + 2); ctx.stroke();
  var pg = ctx.createLinearGradient(hx, hy, hx, hy - pH);
  pg.addColorStop(0, '#888'); pg.addColorStop(0.5, '#ccc'); pg.addColorStop(1, '#aaa');
  ctx.strokeStyle = pg; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(hx, hy - pH); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(hx, hy - pH); ctx.lineTo(hx + 18, hy - pH + 9); ctx.lineTo(hx, hy - pH + 18); ctx.closePath();
  var fg = ctx.createLinearGradient(hx, hy - pH, hx + 18, hy - pH + 9);
  fg.addColorStop(0, '#f44336'); fg.addColorStop(1, '#d32f2f');
  ctx.fillStyle = fg; ctx.fill(); ctx.strokeStyle = 'rgba(0,0,0,0.3)'; ctx.lineWidth = 1; ctx.stroke();
  ctx.beginPath(); ctx.moveTo(hx + 1, hy - pH + 2); ctx.lineTo(hx + 10, hy - pH + 7); ctx.lineTo(hx + 1, hy - pH + 10);
  ctx.closePath(); ctx.fillStyle = 'rgba(255,255,255,0.2)'; ctx.fill();
  ctx.beginPath(); ctx.arc(hx, hy - pH, 2.5, 0, Math.PI * 2);
  ctx.fillStyle = '#fdd835'; ctx.fill(); ctx.strokeStyle = 'rgba(0,0,0,0.3)'; ctx.lineWidth = 1; ctx.stroke();

  // Animated ball
  if (!atHole) {
    var bx = tx(ballPos.x), by = ty(ballPos.y), br = 0.12 * s;
    ctx.beginPath(); ctx.arc(bx + 2, by + 2, br, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fill();
    var bbg = ctx.createRadialGradient(bx - br * 0.3, by - br * 0.3, br * 0.1, bx, by, br);
    bbg.addColorStop(0, '#fff'); bbg.addColorStop(0.7, '#e0e0e0'); bbg.addColorStop(1, '#bdbdbd');
    ctx.beginPath(); ctx.arc(bx, by, br, 0, Math.PI * 2);
    ctx.fillStyle = bbg; ctx.fill(); ctx.strokeStyle = 'rgba(0,0,0,0.4)'; ctx.lineWidth = 1; ctx.stroke();
    ctx.beginPath(); ctx.arc(bx - br * 0.25, by - br * 0.25, br * 0.3, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.fill();
  }
}