/* ============================================================
   Ice Town · pathfinding.js
   网格 A* 寻路：在小镇 / 屋内场景中寻找可行走路径
   world 需提供 width()、height()、isWalkable(cx, cy)
   网格粒度为半瓦片（PF_GRID），便于贴合建筑与门洞
   性能：先一次性构建可行走栅格，再用二叉堆开表跑 A*
   ============================================================ */

const PF_GRID = 24;

// 二叉最小堆（A* 开表）
class PFMinHeap {
  constructor() { this.arr = []; }
  get size() { return this.arr.length; }
  push(node, f) {
    const it = { node, f };
    this.arr.push(it);
    let i = this.arr.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.arr[p].f <= it.f) break;
      this.arr[i] = this.arr[p];
      i = p;
    }
    this.arr[i] = it;
  }
  pop() {
    const top = this.arr[0];
    const last = this.arr.pop();
    if (this.arr.length) {
      let i = 0;
      while (true) {
        const l = i * 2 + 1, r = l + 1;
        let m = i;
        if (l < this.arr.length && this.arr[l].f < this.arr[m].f) m = l;
        if (r < this.arr.length && this.arr[r].f < this.arr[m].f) m = r;
        if (m === i) break;
        this.arr[i] = this.arr[m];
        i = m;
      }
      this.arr[i] = last;
    }
    return top;
  }
}

// 可行走栅格：1 可走 / 0 不可走（越界视为不可走）
// 世界提供 blockers（矩形数组）时直接标记，速度更快
function buildGrid(world, gw, gh) {
  const walk = new Uint8Array(gw * gh);
  walk.fill(1);
  if (world.blockers) {
    for (const bl of world.blockers) {
      const x0 = Math.max(0, Math.floor(bl.x / PF_GRID));
      const y0 = Math.max(0, Math.floor(bl.y / PF_GRID));
      const x1 = Math.min(gw - 1, Math.floor((bl.x + bl.w - 0.01) / PF_GRID));
      const y1 = Math.min(gh - 1, Math.floor((bl.y + bl.h - 0.01) / PF_GRID));
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) walk[y * gw + x] = 0;
      }
    }
  } else {
    for (let y = 0; y < gh; y++) {
      for (let x = 0; x < gw; x++) {
        walk[y * gw + x] = world.isWalkable(x, y) ? 1 : 0;
      }
    }
  }
  return walk;
}

function gridAt(walk, gw, gh, x, y) {
  return (x >= 0 && y >= 0 && x < gw && y < gh) ? walk[y * gw + x] : 0;
}

// 在目标格不可行走时，螺旋向外寻找最近的可走格
function nearestWalkable(walk, gw, gh, gx, gy) {
  for (let r = 0; r < Math.max(gw, gh); r++) {
    let best = null, bestD = Infinity;
    for (let dx = -r; dx <= r; dx++) {
      for (let dy = -r; dy <= r; dy++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const x = gx + dx, y = gy + dy;
        if (!gridAt(walk, gw, gh, x, y)) continue;
        const d = dx * dx + dy * dy;
        if (d < bestD) { bestD = d; best = { x, y }; }
      }
    }
    if (best) return best;
  }
  return null;
}

// 两点间是否存在清晰直线（用于平滑路径）
function losClear(walk, gw, gh, ax, ay, bx, by) {
  const steps = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / (PF_GRID * 0.5)));
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    const x = ax + (bx - ax) * t;
    const y = ay + (by - ay) * t;
    if (!gridAt(walk, gw, gh, Math.floor(x / PF_GRID), Math.floor(y / PF_GRID))) return false;
  }
  return true;
}

// 拉直路径：贪心跳过中间点，保留视线可达的最远点
function smoothPath(walk, gw, gh, points) {
  if (points.length < 3) return points;
  const out = [points[0]];
  let i = 0;
  while (i < points.length - 1) {
    let j = points.length - 1;
    while (j > i + 1 && !losClear(walk, gw, gh, points[i].x, points[i].y, points[j].x, points[j].y)) j--;
    out.push(points[j]);
    i = j;
  }
  return out;
}

// 主入口：返回世界像素坐标路径点数组（格心），无路返回 null
function findPath(world, sx, sy, gx, gy) {
  const gw = Math.ceil(world.width() / PF_GRID);
  const gh = Math.ceil(world.height() / PF_GRID);
  const key = (c) => c.y * gw + c.x;
  const walk = buildGrid(world, gw, gh);

  let start = { x: Math.floor(sx / PF_GRID), y: Math.floor(sy / PF_GRID) };
  let goal = { x: Math.floor(gx / PF_GRID), y: Math.floor(gy / PF_GRID) };

  if (!gridAt(walk, gw, gh, start.x, start.y)) {
    const n = nearestWalkable(walk, gw, gh, start.x, start.y);
    if (!n) return null;
    start = n;
  }
  if (!gridAt(walk, gw, gh, goal.x, goal.y)) {
    const n = nearestWalkable(walk, gw, gh, goal.x, goal.y);
    if (!n) return null;
    goal = n;
  }
  if (start.x === goal.x && start.y === goal.y) return null;

  const cameFrom = new Map();
  const gScore = new Map();
  const startK = key(start);
  gScore.set(startK, 0);
  const h = (c) => Math.abs(c.x - goal.x) + Math.abs(c.y - goal.y);
  const open = new PFMinHeap();
  open.push(start, h(start));
  const openSet = new Set([startK]);
  const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];

  while (open.size) {
    const cur = open.pop().node;
    const curK = key(cur);
    openSet.delete(curK);

    if (cur.x === goal.x && cur.y === goal.y) {
      const cells = [cur];
      let c = cur;
      while (cameFrom.has(key(c))) { c = cameFrom.get(key(c)); cells.push(c); }
      cells.reverse();
      const raw = cells.map(c => ({ x: (c.x + 0.5) * PF_GRID, y: (c.y + 0.5) * PF_GRID }));
      return smoothPath(walk, gw, gh, raw);
    }

    for (const [dx, dy] of dirs) {
      const nx = cur.x + dx, ny = cur.y + dy;
      if (!gridAt(walk, gw, gh, nx, ny)) continue;
      const nK = key({ x: nx, y: ny });
      const tent = gScore.get(curK) + 1;
      if (tent < (gScore.has(nK) ? gScore.get(nK) : Infinity)) {
        cameFrom.set(nK, cur);
        gScore.set(nK, tent);
        if (!openSet.has(nK)) {
          openSet.add(nK);
          open.push({ x: nx, y: ny }, tent + h({ x: nx, y: ny }));
        }
      }
    }
  }
  return null;
}
