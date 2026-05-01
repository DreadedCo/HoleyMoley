/* ── Constants ── */

var GATE_COLORS = [
  'red','orange','yellow','blue','indigo','violet','pink','cyan','magenta'
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

function anglePenalty(points) {
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

/* ── Par Calculation ── */

function computePar(data, diff) {
  var n = data.gates.length;
  if (n === 0) return 1;

  var points  = getPoints(data);
  var legs    = getLegDistances(points);
  var total   = legs.reduce(function(s, v) { return s + v; }, 0);
  var avgLeg  = total / legs.length;
  var avgTurn = anglePenalty(points) / n;

  var baseShots = n + 1;
  var rawPar = baseShots * DIFFICULTY[diff].parMult + avgTurn * 1.5 + (avgLeg / 5) * 0.5;

  return Math.max(1, Math.round(rawPar));
}

/* ── Difficulty Rating (1-10) ── */

function computeRating(data, par) {
  var n = data.gates.length;
  if (n === 0) return 1;

  var points = getPoints(data);

  var angleScore = clamp(anglePenalty(points) / n * 10, 0, 10);

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

  var parTightness = clamp((1 - (par - n) / (n + 1)) * 10, 0, 10);

  var raw = angleScore * 0.35 + spreadScore * 0.35 + parTightness * 0.3;
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
    var ang         = perpAng + (rand(0, Math.PI) - perpAng) * config.angleRand;
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

  var layout = generateLayout(l, w, n, d);
  var par    = computePar(layout, d);
  var rating = computeRating(layout, par);

  var points = getPoints(layout);
  var legs   = getLegDistances(points);
  var total  = legs.reduce(function(s, v) { return s + v; }, 0);
  var longest = Math.max.apply(null, legs);

  holeCounter++;

  document.getElementById('holeNum').textContent     = holeCounter;
  document.getElementById('parText').textContent      = par;
  document.getElementById('rating').textContent       = rating + '/10';
  document.getElementById('totalDist').textContent    = total.toFixed(1) + ' ft';
  document.getElementById('longestShot').textContent  = longest.toFixed(1) + ' ft';

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

  ctx.clearRect(0, 0, cw, ch);
  drawPath(ctx, data, tx, ty);
  drawGates(ctx, data.gates, tx, ty);
  drawBall(ctx, data.ball, tx, ty, scale);
  drawHole(ctx, data.hole, tx, ty, scale);
}

function drawPath(ctx, data, tx, ty) {
  ctx.strokeStyle = 'rgba(0,0,0,0.15)';
  ctx.lineWidth   = 1;
  ctx.beginPath();
  ctx.moveTo(tx(data.ball.x), ty(data.ball.y));
  data.gates.forEach(function(g) {
    ctx.lineTo(tx((g.x1 + g.x2) / 2), ty((g.y1 + g.y2) / 2));
  });
  ctx.lineTo(tx(data.hole.x), ty(data.hole.y));
  ctx.stroke();
}

function drawGates(ctx, gates, tx, ty) {
  gates.forEach(function(g) {
    var dx  = g.x2 - g.x1;
    var dy  = g.y2 - g.y1;
    var len = Math.hypot(dx, dy);
    var px  = (-dy / len) * GATE_THICK;
    var py  = ( dx / len) * GATE_THICK;

    ctx.beginPath();
    ctx.moveTo(tx(g.x1 - px), ty(g.y1 - py));
    ctx.lineTo(tx(g.x2 - px), ty(g.y2 - py));
    ctx.lineTo(tx(g.x2 + px), ty(g.y2 + py));
    ctx.lineTo(tx(g.x1 + px), ty(g.y1 + py));
    ctx.closePath();
    ctx.fillStyle   = g.color; ctx.fill();
    ctx.strokeStyle = 'black'; ctx.lineWidth = 1; ctx.stroke();

    ctx.fillStyle    = 'black';
    ctx.font         = 'bold 12px Inter, sans-serif';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(g.index, tx((g.x1 + g.x2) / 2), ty((g.y1 + g.y2) / 2));
  });
}

function drawCircle(ctx, x, y, r, fill, stroke) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  if (fill)   { ctx.fillStyle   = fill;   ctx.fill();   }
  if (stroke) { ctx.strokeStyle = stroke;  ctx.lineWidth = 1; ctx.stroke(); }
}

function drawBall(ctx, ball, tx, ty, scale) {
  drawCircle(ctx, tx(ball.x), ty(ball.y), 0.08 * scale, 'white', 'black');
}

function drawHole(ctx, hole, tx, ty, scale) {
  var hx = tx(hole.x);
  var hy = ty(hole.y);

  drawCircle(ctx, hx, hy, 0.2 * scale, 'white', 'black');

  ctx.strokeStyle = 'red';
  ctx.lineWidth   = 1;
  ctx.beginPath();
  ctx.moveTo(hx, hy);
  ctx.lineTo(hx, hy - 30);
  ctx.stroke();

  ctx.fillStyle = 'red';
  ctx.beginPath();
  ctx.moveTo(hx, hy - 30);
  ctx.lineTo(hx + 15, hy - 22);
  ctx.lineTo(hx, hy - 15);
  ctx.closePath();
  ctx.fill();
}