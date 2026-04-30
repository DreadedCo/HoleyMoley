const COLORS = ['red','orange','yellow','blue','indigo','violet','pink','cyan','magenta'];

function rand(min, max) {
    return Math.random() * (max - min) + min;
}

function dist(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y);
}

function generatePoint(l, w) {
    return { x: rand(1, l - 1), y: rand(1, w - 1) };
}

function ok(p, pts, md) {
    return pts.every(o => dist(p, o) >= md);
}

function generateLayout(l, w, n) {

    let pts = [];

    let md = Math.max(1, Math.min(l, w) / (n + 3));

    let ball, hole;

    // BALL
    for (let i = 0; i < 1000; i++) {
        let p = generatePoint(l, w);
        if (ok(p, pts, md)) {
            ball = p;
            pts.push(p);
            break;
        }
    }

    // HOLE
    for (let i = 0; i < 1000; i++) {
        let p = generatePoint(l, w);
        if (ok(p, pts, md)) {
            hole = p;
            pts.push(p);
            break;
        }
    }

    let centers = [];
    let gates = [];

    for (let i = 0; i < n; i++) {
        for (let j = 0; j < 1000; j++) {
            let c = generatePoint(l, w);
            if (ok(c, pts, md)) {
                centers.push(c);
                pts.push(c);
                break;
            }
        }
    }

    centers.sort((a, b) => (a.x - ball.x) - (b.x - ball.x));

    centers.forEach((c, i) => {
        let ang = Math.random() * Math.PI;
        let dx = Math.cos(ang) * 0.25;
        let dy = Math.sin(ang) * 0.25;

        gates.push({
            x1: c.x - dx,
            y1: c.y - dy,
            x2: c.x + dx,
            y2: c.y + dy,
            color: COLORS[i % COLORS.length],
            index: i + 1
        });
    });

    return { l, w, ball, hole, gates };
}

function par(n, d) {
    return n + (d === 'easy' ? 3 : d === 'normal' ? 2 : 1);
}

function generate() {

    let l = parseFloat(document.getElementById("length").value);
    let w = parseFloat(document.getElementById("width").value);
    let n = parseInt(document.getElementById("gates").value);
    let d = document.getElementById("difficulty").value;

    l = Math.max(5, Math.min(100, l));
    w = Math.max(5, Math.min(100, w));

    let data = generateLayout(l, w, n);

    document.getElementById("par").innerText = "Par: " + par(n, d);

    draw(data);
}

function draw(data) {

    const canvas = document.getElementById("c");
    const ctx = canvas.getContext("2d");

    const maxW = 950;
    const maxH = 600;

    const aspect = data.l / data.w;

    let cw, ch;

    if (aspect > maxW / maxH) {
        cw = maxW;
        ch = maxW / aspect;
    } else {
        ch = maxH;
        cw = maxH * aspect;
    }

    canvas.width = cw;
    canvas.height = ch;

    const scale = cw / data.l;

    const tx = x => x * scale;
    const ty = y => y * scale;

    function circle(x, y, r, c, stroke=false) {
        ctx.beginPath();
        ctx.arc(x, y, r * scale, 0, Math.PI * 2);

        if (stroke) {
            ctx.strokeStyle = c;
            ctx.stroke();
        } else {
            ctx.fillStyle = c;
            ctx.fill();
        }
    }

    ctx.clearRect(0, 0, cw, ch);

    // path
    ctx.strokeStyle = "rgba(0,0,0,0.15)";
    ctx.beginPath();
    ctx.moveTo(tx(data.ball.x), ty(data.ball.y));

    data.gates.forEach(g => {
        ctx.lineTo(tx((g.x1 + g.x2)/2), ty((g.y1 + g.y2)/2));
    });

    ctx.lineTo(tx(data.hole.x), ty(data.hole.y));
    ctx.stroke();

    // gates
    data.gates.forEach(g => {
        ctx.strokeStyle = g.color;
        ctx.lineWidth = 6;

        ctx.beginPath();
        ctx.moveTo(tx(g.x1), ty(g.y1));
        ctx.lineTo(tx(g.x2), ty(g.y2));
        ctx.stroke();

        ctx.fillStyle = "black";
        ctx.fillText(g.index, tx((g.x1+g.x2)/2), ty((g.y1+g.y2)/2));
    });

    // ball
    circle(tx(data.ball.x), ty(data.ball.y), 0.08, "white");

    // hole
    const hx = tx(data.hole.x);
    const hy = ty(data.hole.y);

    circle(hx, hy, 0.2, "white", true);

    ctx.strokeStyle = "red";
    ctx.beginPath();
    ctx.moveTo(hx, hy);
    ctx.lineTo(hx, hy - 30);
    ctx.stroke();
}