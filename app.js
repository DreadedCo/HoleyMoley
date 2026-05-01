/* ── Constants ── */

var GATE_COLORS = [
  '#e53935','#fb8c00','#fdd835','#1e88e5',
  '#3949ab','#8e24aa','#d81b60','#00acc1','#e91e63'
];

var DIFFICULTY = {
  easy:   { spread: 0.12, angleRand: 0.15, parMult: 1.4 },
  normal: { spread: 0.35, angleRand: 0.50, parMult: 1.0 },
  hard:   { spread: 0.70, angleRand: 1.00, parMult: 0.7 },
};

var MIN_DIST    = 1;
var MAX_RETRIES = 500;
var GATE_HALF_W = 0.25;
var GATE_THICK  = 0.12;

var holeCounter = 0;

/* ── Utilities ── */

function rand(lo, hi) { return Math.random() * (hi - lo) + lo; }
function dist(a, b)   { return Math.hypot(a.x - b.x, a.y - b.y); }
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

function randPoint(l, w, margin) {
  margin = margin || 1;
  return { x: rand(margin, l - margin), y: rand(margin, w - margin) };
}

function gateCenter(g) {
  return { x: (g.x1 + g.x2) / 2, y: (g.y1 + g.y2) / 2 };
}

function getPoints(data) {
  var pts = [data.ball];
  data.gates.forEach(function(g) { pts.push(gateCenter(g)); });
  pts.push(data.hole);
  return pts;
}

function getLegDistances(points) {
  var legs = [];
  for (var i = 1; i < points.length; i++)
    legs.push(dist(points[i - 1], points[i]));
  return legs;
}

/* Normalize an angle difference to [0, PI/2] */
function angleMisalignment(a, b) {
  var d = Math.abs(a - b) % (Math.PI * 2);
  if (d > Math.PI) d = Math.PI * 2 - d;
  if (d > Math.PI / 2) d = Math.PI - d;
  return d;
}

/* Sum of turn angles at each gate */
function turnPenalty(points) {
  var penalty = 0;
  for (var i = 1; i < points.length - 1; i++) {
    var a1 = Math.atan2(points[i].y - points[i-1].y, points[i].x - points[i-1].x);
    var a2 = Math.atan2(points[i+1].y - points[i].y, points[i+1].x - points[i].x);
    var turn = Math.abs(a2 - a1);
    if (turn > Math.PI) turn = 2 * Math.PI - turn;
    penalty += turn / Math.PI;
  }
  return penalty;
}

/*
 * Gate angle difficulty — how misaligned each gate is relative to
 * its approach and exit directions. A gate perpendicular to the
 * ball's travel is easy (0). A gate angled away is hard (up to 1).
 */
function gateAnglePenalty(points, gates) {
  if (gates.length === 0) return 0;

  var total = 0;

  for (var i = 0; i < gates.length; i++) {
    var g      = gates[i];
    var prev   = points[i];
    var center = points[i + 1];
    var next   = points[i + 2];

    var gateDir    = Math.atan2(g.y2 - g.y1, g.x2 - g.x1);
    var gateNormal = gateDir + Math.PI / 2;

    var approachDir = Math.atan2(center.y - prev.y, center.x - prev.x);
    var exitDir     = Math.atan2(next.y - center.y, next.x - center.x);

    var approachMis = angleMisalignment(approachDir, gateNormal);
    var exitMis     = angleMisalignment(exitDir, gateNormal);

    total += (approachMis + exitMis) / Math.PI;
  }

  return total / gates.length;
}

/* ── Par Calculation ── */

function computePar(data, diff) {
  var n = data.gates.length;
  if (n === 0) return 1;

  var points    = getPoints(data);
  var legs      = getLegDistances(points);
  var total     = legs.reduce(function(s, v) { return s + v; }, 0);
  var avgLeg    = total / legs.length;
  var avgTurn   = turnPenalty(points) / n;
  var gateAngle = gateAnglePenalty(points, data.gates);

  var baseShots = n + 1;
  var rawPar = baseShots * DIFFICULTY[diff].parMult
    + avgTurn * 1.5
    + (avgLeg / 5) * 0.5
    + gateAngle * 2.0;

  return Math.max(1, Math.round(rawPar));
}

/* ── Difficulty Rating (1-10) ── */

function computeRating(data, par) {
  var n = data.gates.length;
  if (n === 0) return 1;

  var points = getPoints(data);

  var turnScore = clamp(turnPenalty(points) / n * 10, 0, 10);

  var bh = dist(data.ball, data.hole);
  var spreadScore = 0;
  if (bh > 0) {
    var totalSpread = 0;
    data.gates.forEach(function(g) {
      var c = gateCenter(g);
      var cross = Math.abs(
        (data.hole.x - data.ball.x) * (data.ball.y - c.y) -
        (data.ball.x - c.x) * (data.hole.y - data.ball.y)
      );
      totalSpread += cross / bh;
    });
    spreadScore = clamp((totalSpread / n) / (Math.min(data.l, data.w) * 0.3) * 10, 0, 10);
  }

  var angleScore   = clamp(gateAnglePenalty(points, data.gates) * 10, 0, 10);
  var parTightness = clamp((1 - (par - n) / (n + 1)) * 10, 0, 10);

  var raw = turnScore * 0.25
    + spreadScore * 0.25
    + angleScore * 0.25
    + parTightness * 0.25;

  return clamp(Math.round(raw), 1, 10);
}

/* ── Layout Generation ── */

function placeBallAndHole(l, w, diff) {
  var ball, hole;
  if (diff === 'easy') {
    ball = { x: rand(1, 2),         y: rand(1, w - 1) };
    hole = { x: rand(l - 2, l - 1), y: rand(1, w - 1) };
  } else if (diff === 'normal') {
    ball = { x: rand(1, l * 0.25),     y: rand(1, w - 1) };
    hole = { x: rand(l * 0.75, l - 1), y: rand(1, w - 1) };
  } else {
    ball = randPoint(l, w);
    hole = randPoint(l, w);
    while (dist(ball, hole) < Math.max(l, w) * 0.3)
      hole = randPoint(l, w);
  }
  return { ball: ball, hole: hole };
}

function placeGates(ball, hole, l, w, n, config) {
  var pathAng = Math.atan2(hole.y - ball.y, hole.x - ball.x);
  var placed  = [ball, hole];
  var gates   = [];

  for (var i = 0; i < n; i++) {
    var t     = (i + 1) / (n + 1);
    var baseX = ball.x + (hole.x - ball.x) * t;
    var baseY = ball.y + (hole.y - ball.y) * t;
    var cx, cy, found = false;

    for (var a = 0; a < MAX_RETRIES; a++) {
      var perp   = rand(-1, 1) * config.spread * Math.min(l, w);
      var jitter = a > 50 ? (a / MAX_RETRIES) * 2 : 0;
      var tryX = clamp(baseX + Math.cos(pathAng + Math.PI / 2) * perp + rand(-jitter, jitter), 1, l - 1);
      var tryY = clamp(baseY + Math.sin(pathAng + Math.PI / 2) * perp + rand(-jitter, jitter), 1, w - 1);

      if (placed.every(function(p) { return dist({ x: tryX, y: tryY }, p) >= MIN_DIST; })) {
        cx = tryX; cy = tryY; found = true; break;
      }
    }
    if (!found) continue;
    placed.push({ x: cx, y: cy });

    var prev        = gates.length ? gateCenter(gates[gates.length - 1]) : ball;
    var approachAng = Math.atan2(cy - prev.y, cx - prev.x);
    var perpAng     = approachAng + Math.PI / 2;
    var randomAng   = rand(0, Math.PI);
    var ang         = perpAng + (randomAng - perpAng) * config.angleRand;

    var dx = Math.cos(ang) * GATE_HALF_W;
    var dy = Math.sin(ang) * GATE_HALF_W;

    gates.push({
      x1: cx - dx, y1: cy - dy, x2: cx + dx, y2: cy + dy,
      color: GATE_COLORS[i % GATE_COLORS.length], index: i + 1,
    });
  }
  return gates;
}

function generateLayout(l, w, n, diff) {
  var result = placeBallAndHole(l, w, diff);
  var gates  = placeGates(result.ball, result.hole, l, w, n, DIFFICULTY[diff]);
  return { l: l, w: w, ball: result.ball, hole: result.hole, gates: gates };
}

/* ── Main Entry ── */

function generate() {
  var l = clamp(parseFloat(document.getElementById('length').value), 5, 25);
  var w = clamp(parseFloat(document.getElementById('width').value),  5, 25);
  var n = parseInt(document.getElementById('gates').value);
  var d = document.getElementById('difficulty').value;

  var layout  = generateLayout(l, w, n, d);
  var par     = computePar(layout, d);
  var rating  = computeRating(layout, par);
  var points  = getPoints(layout);
  var legs    = getLegDistances(points);
  var total   = legs.reduce(function(s, v) { return s + v; }, 0);
  var longest = legs.length ? Math.max.apply(null, legs) : 0;

  holeCounter++;

  document.getElementById('holeNum').textContent    = holeCounter;
  document.getElementById('parText').textContent     = par;
  document.getElementById('rating').textContent      = rating + '/10';
  document.getElementById('totalDist').textContent   = total.toFixed(1) + ' ft';
  document.getElementById('longestShot').textContent = longest.toFixed(1) + ' ft';

  draw(layout);
}

/* ── Drawing ── */

function draw(data) {
  var canvas = document.getElementById('c');
  var ctx    = canvas.getContext('2d');
  var card   = canvas.parentElement;
  var maxW   = card.clientWidth - 48;
  var maxH   = 500;
  var ratio  = data.l / data.w;

  var cw, ch;
  if (ratio > maxW / maxH) { cw = maxW; ch = maxW / ratio; }
  else                      { ch = maxH; cw = maxH * ratio; }

  canvas.width  = cw;
  canvas.height = ch;
  canvas.style.maxWidth = '100%';

  var scale = cw / data.l;
  var tx = function(x) { return x * scale; };
  var ty = function(y) { return y * scale; };

  drawGrass(ctx, cw, ch);
  drawBorder(ctx, tx, ty, data);
  drawPath(ctx, data, tx, ty);
  drawGates(ctx, data.gates, tx, ty, scale);
  drawBall(ctx, data.ball, tx, ty, scale);
  drawHole(ctx, data.hole, tx, ty, scale);
}

/* ── Grass Background ── */

function drawGrass(ctx, cw, ch) {
  var bg = ctx.createLinearGradient(0, 0, 0, ch);
  bg.addColorStop(0, '#5cb85c');
  bg.addColorStop(0.5, '#4caf50');
  bg.addColorStop(1, '#43a047');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, cw, ch);

  ctx.fillStyle = 'rgba(255,255,255,0.04)';
  for (var i = 0; i < 300; i++) {
    ctx.beginPath();
    ctx.arc(rand(0, cw), rand(0, ch), rand(0.5, 2), 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.strokeStyle = 'rgba(0,0,0,0.03)';
  ctx.lineWidth = 1;
  for (var i = 0; i < 150; i++) {
    var gx = rand(0, cw), gy = rand(0, ch);
    ctx.beginPath();
    ctx.moveTo(gx, gy);
    ctx.lineTo(gx + rand(-3, 3), gy - rand(3, 8));
    ctx.stroke();
  }
}

/* ── Course Border ── */

function drawBorder(ctx, tx, ty, data) {
  ctx.strokeStyle = 'rgba(0,0,0,0.15)';
  ctx.lineWidth = 3;
  ctx.strokeRect(tx(0.3), ty(0.3), tx(data.l - 0.6), ty(data.w - 0.6));
}

/* ── Dashed Path ── */

function drawPath(ctx, data, tx, ty) {
  ctx.setLineDash([8, 6]);
  ctx.strokeStyle = 'rgba(255,255,255,0.2)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(tx(data.ball.x), ty(data.ball.y));
  data.gates.forEach(function(g) {
    ctx.lineTo(tx((g.x1 + g.x2) / 2), ty((g.y1 + g.y2) / 2));
  });
  ctx.lineTo(tx(data.hole.x), ty(data.hole.y));
  ctx.stroke();
  ctx.setLineDash([]);
}

/* ── Gates ── */

function drawGates(ctx, gates, tx, ty, scale) {
  gates.forEach(function(g) {
    var dx  = g.x2 - g.x1;
    var dy  = g.y2 - g.y1;
    var len = Math.hypot(dx, dy);
    var px  = (-dy / len) * GATE_THICK;
    var py  = ( dx / len) * GATE_THICK;
    var cx  = tx((g.x1 + g.x2) / 2);
    var cy  = ty((g.y1 + g.y2) / 2);

    // Shadow
    ctx.save();
    ctx.translate(2, 2);
    ctx.beginPath();
    ctx.moveTo(tx(g.x1 - px), ty(g.y1 - py));
    ctx.lineTo(tx(g.x2 - px), ty(g.y2 - py));
    ctx.lineTo(tx(g.x2 + px), ty(g.y2 + py));
    ctx.lineTo(tx(g.x1 + px), ty(g.y1 + py));
    ctx.closePath();
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fill();
    ctx.restore();

    // Body
    ctx.beginPath();
    ctx.moveTo(tx(g.x1 - px), ty(g.y1 - py));
    ctx.lineTo(tx(g.x2 - px), ty(g.y2 - py));
    ctx.lineTo(tx(g.x2 + px), ty(g.y2 + py));
    ctx.lineTo(tx(g.x1 + px), ty(g.y1 + py));
    ctx.closePath();
    ctx.fillStyle = g.color;
    ctx.fill();

    // Glossy highlight
    ctx.save();
    ctx.clip();
    var hl = ctx.createLinearGradient(tx(g.x1), ty(g.y1), tx(g.x2), ty(g.y2));
    hl.addColorStop(0, 'rgba(255,255,255,0.35)');
    hl.addColorStop(0.5, 'rgba(255,255,255,0)');
    hl.addColorStop(1, 'rgba(255,255,255,0.15)');
    ctx.fillStyle = hl;
    ctx.fillRect(
      tx(Math.min(g.x1, g.x2) - GATE_THICK) - 5,
      ty(Math.min(g.y1, g.y2) - GATE_THICK) - 5,
      tx(Math.abs(dx) + GATE_THICK * 2) + 10,
      ty(Math.abs(dy) + GATE_THICK * 2) + 10
    );
    ctx.restore();

    // Border
    ctx.beginPath();
    ctx.moveTo(tx(g.x1 - px), ty(g.y1 - py));
    ctx.lineTo(tx(g.x2 - px), ty(g.y2 - py));
    ctx.lineTo(tx(g.x2 + px), ty(g.y2 + py));
    ctx.lineTo(tx(g.x1 + px), ty(g.y1 + py));
    ctx.closePath();
    ctx.strokeStyle = 'rgba(0,0,0,0.5)';
    ctx.lineWidth = 1;
    ctx.stroke();

    // Number badge
    ctx.beginPath();
    ctx.arc(cx, cy, 8, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 10px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(g.index, cx, cy);
  });
}

/* ── Golf Ball ── */

function drawBall(ctx, ball, tx, ty, scale) {
  var bx = tx(ball.x);
  var by = ty(ball.y);
  var r  = 0.12 * scale;

  // Shadow
  ctx.beginPath();
  ctx.arc(bx + 2, by + 2, r, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.fill();

  // Ball with radial gradient
  var bg = ctx.createRadialGradient(bx - r * 0.3, by - r * 0.3, r * 0.1, bx, by, r);
  bg.addColorStop(0, '#ffffff');
  bg.addColorStop(0.7, '#e0e0e0');
  bg.addColorStop(1, '#bdbdbd');
  ctx.beginPath();
  ctx.arc(bx, by, r, 0, Math.PI * 2);
  ctx.fillStyle = bg;
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.4)';
  ctx.lineWidth = 1;
  ctx.stroke();

  // Shine highlight
  ctx.beginPath();
  ctx.arc(bx - r * 0.25, by - r * 0.25, r * 0.3, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.fill();
}

/* ── Hole & Flag ── */

function drawHole(ctx, hole, tx, ty, scale) {
  var hx = tx(hole.x);
  var hy = ty(hole.y);
  var hr = 0.22 * scale;
  var poleH = 35;

  // Ground shadow
  ctx.beginPath();
  ctx.ellipse(hx, hy + hr * 0.3, hr * 1.1, hr * 0.5, 0, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(0,0,0,0.15)';
  ctx.fill();

  // Hole with radial gradient
  var hg = ctx.createRadialGradient(hx, hy, hr * 0.2, hx, hy, hr);
  hg.addColorStop(0, '#1a1a1a');
  hg.addColorStop(0.7, '#333');
  hg.addColorStop(1, '#555');
  ctx.beginPath();
  ctx.arc(hx, hy, hr, 0, Math.PI * 2);
  ctx.fillStyle = hg;
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.5)';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Inner ring
  ctx.beginPath();
  ctx.arc(hx, hy, hr * 0.6, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(255,255,255,0.1)';
  ctx.lineWidth = 1;
  ctx.stroke();

  // Pole shadow
  ctx.strokeStyle = 'rgba(0,0,0,0.2)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(hx + 2, hy + 2);
  ctx.lineTo(hx + 2, hy - poleH + 2);
  ctx.stroke();

  // Pole with metallic gradient
  var pg = ctx.createLinearGradient(hx, hy, hx, hy - poleH);
  pg.addColorStop(0, '#888');
  pg.addColorStop(0.5, '#ccc');
  pg.addColorStop(1, '#aaa');
  ctx.strokeStyle = pg;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(hx, hy);
  ctx.lineTo(hx, hy - poleH);
  ctx.stroke();

  // Flag with gradient
  ctx.beginPath();
  ctx.moveTo(hx, hy - poleH);
  ctx.lineTo(hx + 18, hy - poleH + 9);
  ctx.lineTo(hx, hy - poleH + 18);
  ctx.closePath();
  var fg = ctx.createLinearGradient(hx, hy - poleH, hx + 18, hy - poleH + 9);
  fg.addColorStop(0, '#f44336');
  fg.addColorStop(1, '#d32f2f');
  ctx.fillStyle = fg;
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.3)';
  ctx.lineWidth = 1;
  ctx.stroke();

  // Flag shine
  ctx.beginPath();
  ctx.moveTo(hx + 1, hy - poleH + 2);
  ctx.lineTo(hx + 10, hy - poleH + 7);
  ctx.lineTo(hx + 1, hy - poleH + 10);
  ctx.closePath();
  ctx.fillStyle = 'rgba(255,255,255,0.2)';
  ctx.fill();

  // Gold pole cap
  ctx.beginPath();
  ctx.arc(hx, hy - poleH, 2.5, 0, Math.PI * 2);
  ctx.fillStyle = '#fdd835';
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.3)';
  ctx.lineWidth = 1;
  ctx.stroke();
}