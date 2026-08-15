/* ============================================================
   Ice Town · player.js
   玩家小人：移动、碰撞、行走动画
   ============================================================ */

class Player {
  constructor() {
    // 出生在广场附近的空地（避免与建筑重叠）
    const t = town.findFreeTile(1, 1) || { tx: 1, ty: 1 };
    this.x = (t.tx + 0.5) * TILE;
    this.y = (t.ty + 0.5) * TILE;
    this.w = 26;
    this.h = 30;
    this.speed = 220;            // 像素/秒
    this.frame = 0;
    this._walked = false;
    this._sprinting = false;
    this.path = null;            // 寻路路径点（世界像素坐标数组）
  }

  rect() {
    return {
      x: this.x - this.w / 2,
      y: this.y - this.h / 2,
      w: this.w,
      h: this.h * 0.7,   // 脚底只占身体下半部，便于碰撞与"贴近"建筑
    };
  }

  update(dt, keys, world) {
    const hasKey = keys.has('KeyW') || keys.has('ArrowUp') || keys.has('KeyS') || keys.has('ArrowDown') ||
                   keys.has('KeyA') || keys.has('ArrowLeft') || keys.has('KeyD') || keys.has('ArrowRight');
    // Shift 疾跑：速度提升，动画加快
    const sprinting = keys.has('ShiftLeft') || keys.has('ShiftRight');
    const speed = sprinting ? this.speed * 1.8 : this.speed;
    const animRate = sprinting ? 16 : 9;
    this._sprinting = sprinting;

    if (hasKey) {
      // WASD / 方向键手动移动，打断寻路
      this.path = null;
      let dx = 0, dy = 0;
      if (keys.has('KeyW') || keys.has('ArrowUp')) dy -= 1;
      if (keys.has('KeyS') || keys.has('ArrowDown')) dy += 1;
      if (keys.has('KeyA') || keys.has('ArrowLeft')) dx -= 1;
      if (keys.has('KeyD') || keys.has('ArrowRight')) dx += 1;
      const len = Math.hypot(dx, dy);
      dx = (dx / len) * speed;
      dy = (dy / len) * speed;
      this._tryMove(dx * dt, 0, world);
      this._tryMove(0, dy * dt, world);
      this.frame += dt * animRate;
      this._walked = true;
    } else if (this.path && this.path.length) {
      // 沿寻路路径移动（疾跑同样生效）
      const t = this.path[0];
      const dx = t.x - this.x;
      const dy = t.y - this.y;
      const d = Math.hypot(dx, dy);
      if (d < 6) {
        this.path.shift();
      } else {
        const mx = (dx / d) * speed * dt;
        const my = (dy / d) * speed * dt;
        this._tryMove(mx, 0, world);
        this._tryMove(0, my, world);
        this.frame += dt * animRate;
        this._walked = true;
      }
    } else {
      this._walked = false;
      this._sprinting = false;
      this.frame = 0;
    }

    // 世界边界
    const r = this.rect();
    const b = world.bounds;
    this.x = Math.max(b.x, Math.min(b.x + b.w - r.w, this.x));
    this.y = Math.max(b.y, Math.min(b.y + b.h - r.h, this.y));
  }

  _tryMove(dx, dy, world) {
    const nx = this.x + dx;
    const ny = this.y + dy;
    const r = {
      x: nx - this.w / 2,
      y: ny - this.h / 2,
      w: this.w,
      h: this.h * 0.7,
    };
    if (world.isSolid(r)) return; // 撞到障碍，保持原位置
    this.x = nx;
    this.y = ny;
  }

  setPosition(x, y) { this.x = x; this.y = y; }

  setPath(points) { this.path = points; }

  // 绘制像素风小人（白色冬装女生）
  // 帧：0 待机 / 1-2 走路 / 3-4 跑步
  draw(ctx, cam) {
    let fi = 0;
    let bob = 0;
    if (this._walked) {
      const alt = Math.floor(this.frame) % 2;
      if (this._sprinting) {
        fi = alt ? 4 : 3;
        bob = Math.sin(this.frame * Math.PI) * 2;
      } else {
        fi = alt ? 2 : 1;
        bob = Math.sin(this.frame * Math.PI) * 1.5;
      }
    }

    ctx.save();
    ctx.translate(-cam.x, -cam.y);

    // 影子
    ctx.fillStyle = 'rgba(30,60,90,0.25)';
    ctx.beginPath();
    ctx.ellipse(this.x, this.y + this.h / 2 - 2, this.w / 2, 6, 0, 0, Math.PI * 2);
    ctx.fill();

    // 像素精灵（块状像素，底部对齐脚底）
    const P = SPRITE_PX;
    const feetY = this.y + this.h / 2 + bob;
    const ox = Math.round(this.x - (SPRITE_W * P) / 2);
    const oy = Math.round(feetY - SPRITE_H * P);
    const frame = SPRITE_FRAMES[fi];
    for (let r = 0; r < frame.length; r++) {
      const row = frame[r];
      for (let c = 0; c < row.length; c++) {
        const ch = row[c];
        if (ch === '.') continue;
        ctx.fillStyle = SPRITE_PALETTE[ch] || '#ff00ff';
        ctx.fillRect(ox + c * P, oy + r * P, P, P);
      }
    }

    ctx.restore();
  }
}

/* ============================================================
   像素精灵数据：12 列 × 20 行
   F 白色猫耳/眼睛高光 / P 粉色内耳 / H 金发 / S 皮肤 / E 眼睛 / C 脸颊
   W 白色斗篷主体 / w 白色阴影 / R 红色围巾 / Y 金色搭扣
   B 白色靴子 / b 靴子阴影
   ============================================================ */
const SPRITE_PX = 2;
const SPRITE_W = 12;
const SPRITE_H = 20;

const SPRITE_PALETTE = {
  F: '#ffffff',  // 白色猫耳 / 眼睛高光
  P: '#ffb3c8',  // 粉色内耳
  H: '#f0c07f',  // 金发
  S: '#ffe6cc',  // 皮肤
  E: '#33414f',  // 眼睛
  C: '#ffb1a0',  // 脸颊
  W: '#ffffff',  // 白色斗篷
  w: '#dbe4ec',  // 白色阴影
  R: '#e8635a',  // 红色围巾
  Y: '#ffd700',  // 金色搭扣
  B: '#e6edf4',  // 白色靴子
  b: '#c9d5e0',  // 靴子阴影
};

const SPRITE_FRAMES = [
  // ---- 0 待机 ----
  [
    '..F..HH..F..',
    '.FF.HHHH.FF.',
    '.FFPHHHHPFF.',
    '..HSEESSEH..',
    '..HSEFSSFEH..',
    '..HSCSSCSH..',
    '...HSSSSH...',
    '..HHRYRRHH..',
    '..RRWWWWWW..',
    '.RRWWWWWWWW.',
    '.RWWWWWWWWW.',
    '..WWWWWWWW..',
    '.WWWWWWWWWW.',
    '.WWWWWWWWWW.',
    'WWWWWWWWWWWW',
    'WwwWWWWWWwwW',
    '.wwwwwwwwww.',
    '..BBBBBBBB..',
    '..bBBBBBBb..',
    '............',
  ],
  // ---- 1 走路·右脚 ----
  [
    '..F..HH..F..',
    '.FF.HHHH.FF.',
    '.FFPHHHHPFF.',
    '..HSEESSEH..',
    '..HSEFSSFEH..',
    '..HSCSSCSH..',
    '...HSSSSH...',
    '..HHRYRRHH..',
    '..RRWWWWWW..',
    '.RRWWWWWWWW.',
    '.RWWWWWWWWW.',
    '..WWWWWWWW..',
    '.WWWWWWWWWW.',
    '.WWWWWWWWWW.',
    'WWWWWWWWWWWW',
    'WwwWWWWWWwwW',
    '.wwwwwwwwww.',
    '...BBBBB....',
    '..bBBBBBb...',
    '............',
  ],
  // ---- 2 走路·左脚 ----
  [
    '..F..HH..F..',
    '.FF.HHHH.FF.',
    '.FFPHHHHPFF.',
    '..HSEESSEH..',
    '..HSEFSSFEH..',
    '..HSCSSCSH..',
    '...HSSSSH...',
    '..HHRYRRHH..',
    '..RRWWWWWW..',
    '.RRWWWWWWWW.',
    '.RWWWWWWWWW.',
    '..WWWWWWWW..',
    '.WWWWWWWWWW.',
    '.WWWWWWWWWW.',
    'WWWWWWWWWWWW',
    'WwwWWWWWWwwW',
    '.wwwwwwwwww.',
    '....BBBBB...',
    '...bBBBBBb..',
    '............',
  ],
  // ---- 3 跑步·跨步 ----
  [
    '..F..HH..F..',
    '.FF.HHHH.FF.',
    '.FFPHHHHPFF.',
    '..HSEESSEH..',
    '..HSEFSSFEH..',
    '..HSCSSCSH..',
    '...HSSSSH...',
    '..HHRYRRHH..',
    '..RRWWWWWW..',
    '.RRWWWWWWWW.',
    '.RWWWWWWWWW.',
    '..WWWWWWWW..',
    '.WWWWWWWWWW.',
    '.WWWWWWWWWW.',
    '..wwwwwwww..',
    '..wwwwwwww..',
    '.BBBB..BBBB.',
    '.bBBb..BBbb.',
    '............',
    '............',
  ],
  // ---- 4 跑步·并步 ----
  [
    '..F..HH..F..',
    '.FF.HHHH.FF.',
    '.FFPHHHHPFF.',
    '..HSEESSEH..',
    '..HSEFSSFEH..',
    '..HSCSSCSH..',
    '...HSSSSH...',
    '..HHRYRRHH..',
    '..RRWWWWWW..',
    '.RRWWWWWWWW.',
    '.RWWWWWWWWW.',
    '..WWWWWWWW..',
    '.WWWWWWWWWW.',
    '.WWWWWWWWWW.',
    '..wwwwwwww..',
    '..wwwwwwww..',
    '...BBBBBB...',
    '..bBBBBBBb..',
    '............',
    '............',
  ],
];