/* ============================================================
   Ice Town 路 player.js
   鐜╁灏忎汉锛氱Щ鍔ㄣ€佺鎾炪€佽璧板姩鐢?
   ============================================================ */

class Player {
  constructor() {
    // 鍑虹敓鍦ㄥ箍鍦洪檮杩戠殑绌哄湴锛堥伩鍏嶄笌寤虹瓚閲嶅彔锛?
    const t = town.findFreeTile(1, 1) || { tx: 1, ty: 1 };
    this.x = (t.tx + 0.5) * TILE;
    this.y = (t.ty + 0.5) * TILE;
    this.w = 26;
    this.h = 30;
    this.speed = 220;            // 鍍忕礌/绉?
    this.frame = 0;
    this._walked = false;
    this._sprinting = false;
    this.path = null;            // 瀵昏矾璺緞鐐癸紙涓栫晫鍍忕礌鍧愭爣鏁扮粍锛?
  }

  rect() {
    return {
      x: this.x - this.w / 2,
      y: this.y - this.h / 2,
      w: this.w,
      h: this.h * 0.7,   // 鑴氬簳鍙崰韬綋涓嬪崐閮紝渚夸簬纰版挒涓?璐磋繎"寤虹瓚
    };
  }

  update(dt, keys, world) {
    const hasKey = keys.has('KeyW') || keys.has('ArrowUp') || keys.has('KeyS') || keys.has('ArrowDown') ||
                   keys.has('KeyA') || keys.has('ArrowLeft') || keys.has('KeyD') || keys.has('ArrowRight');
    // Shift 鐤捐窇锛氶€熷害鎻愬崌锛屽姩鐢诲姞蹇?
    const sprinting = keys.has('ShiftLeft') || keys.has('ShiftRight');
    const speed = sprinting ? this.speed * 1.8 : this.speed;
    const animRate = sprinting ? 16 : 9;
    this._sprinting = sprinting;

    if (hasKey) {
      // WASD / 鏂瑰悜閿墜鍔ㄧЩ鍔紝鎵撴柇瀵昏矾
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
      // 娌垮璺矾寰勭Щ鍔紙鐤捐窇鍚屾牱鐢熸晥锛?
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

    // 涓栫晫杈圭晫
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
    if (world.isSolid(r)) return; // 鎾炲埌闅滅锛屼繚鎸佸師浣嶇疆
    this.x = nx;
    this.y = ny;
  }

  setPosition(x, y) { this.x = x; this.y = y; }

  setPath(points) { this.path = points; }

  // 缁樺埗鍍忕礌椋庡皬浜猴紙鐧借壊鍐濂崇敓锛?
  // 甯э細0 寰呮満 / 1-2 璧拌矾 / 3-4 璺戞
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

    // 褰卞瓙
    ctx.fillStyle = 'rgba(30,60,90,0.25)';
    ctx.beginPath();
    ctx.ellipse(this.x, this.y + this.h / 2 - 2, this.w / 2, 6, 0, 0, Math.PI * 2);
    ctx.fill();

    // 鍍忕礌绮剧伒锛堝潡鐘跺儚绱狅紝搴曢儴瀵归綈鑴氬簳锛?
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
   像素精灵数据：12 列 × 20 行（白色幽灵）
   W 白色幽灵身体 / w 白色阴影 / E 眼睛 / F 眼睛高光
   C 腮红 / M 嘴巴
   ============================================================ */
const SPRITE_PX = 2;
const SPRITE_W = 12;
const SPRITE_H = 20;

const SPRITE_PALETTE = {
  W: '#ffffff',  // 幽灵身体
  w: '#dbe4ec',  // 白色阴影
  E: '#33414f',  // 眼睛
  F: '#ffffff',  // 眼睛高光
  C: '#ffb1a0',  // 腮红
  M: '#4a5568',  // 嘴巴
};

const SPRITE_FRAMES = [
  // ---- 0 待机 ----
  [
    '...WWWWWW...',
    '..WWWWWWWW..',
    '.WWWWWWWWWW.',
    '.WWWWWWWWWW.',
    '.WWEEWWEEWW.',
    '.WWEFWWEFWW.',
    '.WWCWWWWCWW.',
    '.WWWWMMWWWW.',
    '.WWWWWWWWWW.',
    '.WWWWWWWWWW.',
    '.wwwwwwwwww.',
    '.WWWWWWWWWW.',
    '.WWWWWWWWWW.',
    '.WWWWWWWWWW.',
    '.WWW.WWW.WWW',
    '.WWW.WWW.WWW',
    '..W...W...W.',
    '............',
    '............',
    '............',
  ],
  // ---- 1 走路·尾摆右 ----
  [
    '...WWWWWW...',
    '..WWWWWWWW..',
    '.WWWWWWWWWW.',
    '.WWWWWWWWWW.',
    '.WWEEWWEEWW.',
    '.WWEFWWEFWW.',
    '.WWCWWWWCWW.',
    '.WWWWMMWWWW.',
    '.WWWWWWWWWW.',
    '.WWWWWWWWWW.',
    '.wwwwwwwwww.',
    '.WWWWWWWWWW.',
    '.WWWWWWWWWW.',
    '.WWWWWWWWWW.',
    '.WWW.WWW.WWW',
    '.WWW.WWW.WWW',
    '.W...W...W..',
    '............',
    '............',
    '............',
  ],
  // ---- 2 走路·尾摆左 ----
  [
    '...WWWWWW...',
    '..WWWWWWWW..',
    '.WWWWWWWWWW.',
    '.WWWWWWWWWW.',
    '.WWEEWWEEWW.',
    '.WWEFWWEFWW.',
    '.WWCWWWWCWW.',
    '.WWWWMMWWWW.',
    '.WWWWWWWWWW.',
    '.WWWWWWWWWW.',
    '.wwwwwwwwww.',
    '.WWWWWWWWWW.',
    '.WWWWWWWWWW.',
    '.WWWWWWWWWW.',
    '.WWW.WWW.WWW',
    '.WWW.WWW.WWW',
    '..W...W...W.',
    '............',
    '............',
    '............',
  ],
  // ---- 3 跑步·冲刺 ----
  [
    '...WWWWWW...',
    '..WWWWWWWW..',
    '.WWWWWWWWWW.',
    '.WWWWWWWWWW.',
    '.WWEEWWEEWW.',
    '.WWWWWWWWWW.',
    '.WWCWWWWCWW.',
    '.WWWMMMWWWW.',
    '.WWWWWWWWWW.',
    '.WWWWWWWWWW.',
    '.wwwwwwwwww.',
    '.WWWWWWWWWW.',
    '.WWWWWWWWWW.',
    '..WWWWWWWW..',
    '.WWW.WWW.WWW',
    '..W...W...W.',
    '............',
    '............',
    '............',
    '............',
  ],
  // ---- 4 跑步·冲刺2 ----
  [
    '...WWWWWW...',
    '..WWWWWWWW..',
    '.WWWWWWWWWW.',
    '.WWWWWWWWWW.',
    '.WWEEWWEEWW.',
    '.WWWWWWWWWW.',
    '.WWCWWWWCWW.',
    '.WWWMMMWWWW.',
    '.WWWWWWWWWW.',
    '.WWWWWWWWWW.',
    '.wwwwwwwwww.',
    '.WWWWWWWWWW.',
    '.WWWWWWWWWW.',
    '...WWWWWW...',
    '.WWW.WWW.WWW',
    '.W...W...W..',
    '............',
    '............',
    '............',
    '............',
  ],
];