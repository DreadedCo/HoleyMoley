from flask import Flask, render_template, request
import random
import math

app = Flask(__name__)

COLORS = ['red','orange','yellow','blue','indigo','violet','pink','cyan','magenta']
MAX_ATTEMPTS = 900


def dist(a, b):
    return math.dist(a, b)


def random_point(l, w):
    return (random.uniform(1, l - 1), random.uniform(1, w - 1))


def generate_layout(l, w, n):
    pts = []

    def ok(p, md):
        return all(dist(p, o) >= md for o in pts)

    md = max(1.0, min(l, w) / (n + 3))

    for _ in range(MAX_ATTEMPTS):
        ball = random_point(l, w)
        if ok(ball, md):
            pts.append(ball)
            break

    for _ in range(MAX_ATTEMPTS):
        hole = random_point(l, w)
        if ok(hole, md):
            pts.append(hole)
            break

    gates = []
    centers = []

    for _ in range(n):
        for _ in range(MAX_ATTEMPTS):
            c = random_point(l, w)
            if ok(c, md):
                centers.append(c)
                pts.append(c)
                break

    vx = hole[0] - ball[0]
    vy = hole[1] - ball[1]

    def proj(p):
        return (p[0] - ball[0]) * vx + (p[1] - ball[1]) * vy

    centers.sort(key=proj)

    for i, c in enumerate(centers):
        ang = random.uniform(0, math.pi)
        dx = math.cos(ang) * 0.25
        dy = math.sin(ang) * 0.25

        gates.append({
            'x1': c[0] - dx,
            'y1': c[1] - dy,
            'x2': c[0] + dx,
            'y2': c[1] + dy,
            'color': COLORS[i % len(COLORS)],
            'index': i + 1
        })

    return {
        'length': l,
        'width': w,
        'ball': {'x': ball[0], 'y': ball[1]},
        'hole': {'x': hole[0], 'y': hole[1]},
        'gates': gates
    }


def par(n, d):
    return n + (3 if d == 'easy' else 2 if d == 'normal' else 1)


@app.route('/', methods=['GET', 'POST'])
def index():
    data = None
    par_value = None

    form = {
        'length': 11,
        'width': 5,
        'gates': 3,
        'difficulty': 'normal'
    }

    if request.method == 'POST':
        form['length'] = float(request.form['length'])
        form['width'] = float(request.form['width'])
        form['gates'] = int(request.form['gates'])
        form['difficulty'] = request.form['difficulty']

        data = generate_layout(form['length'], form['width'], form['gates'])
        par_value = par(form['gates'], form['difficulty'])

    return render_template('index.html', data=data, par=par_value, form=form)


if __name__ == '__main__':
    app.run(debug=True)
