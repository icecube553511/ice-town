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
    this.scarfColor = '#ff5b6e';
    this.beanieColor = '#3aa0d1';
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
    const animRate = sprinting ? 13 : 8;

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

  // 绘制小人（身体朝向根据移动方向）
  draw(ctx, cam) {
    ctx.save();
    ctx.translate(-cam.x, -cam.y);
    const sx = this.x;
    const sy = this.y;
    const bob = this._walked ? Math.sin(this.frame) * 2 : 0;

    // 影子
    ctx.save();
    ctx.fillStyle = 'rgba(30,60,90,0.25)';
    ctx.beginPath();
    ctx.ellipse(sx, sy + this.h / 2 - 2, this.w / 2, 6, 0, 0, Math.PI * 2);
    ctx.fill();

    const feet = sy + this.h / 2 + bob;

    // 双脚
    ctx.fillStyle = '#3a4557';
    ctx.beginPath();
    ctx.roundRect(sx - 10, feet - 6, 7, 6, 3); ctx.fill();
    ctx.beginPath();
    ctx.roundRect(sx + 3, feet - 6, 7, 6, 3); ctx.fill();

    // 身体（围巾外衣）
    ctx.fillStyle = this.scarfColor;
    ctx.beginPath();
    ctx.roundRect(sx - this.w / 2 + 3, feet - 20, this.w - 6, 14, 6); ctx.fill();

    // 围巾
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.roundRect(sx - this.w / 2 + 3, feet - 21, this.w - 6, 4, 3); ctx.fill();

    // 头
    ctx.fillStyle = '#ffe3c4';
    ctx.beginPath();
    ctx.arc(sx, feet - 27, 8, 0, Math.PI * 2);
    ctx.fill();

    // 帽子（绒线帽）
    ctx.fillStyle = this.beanieColor;
    ctx.beginPath();
    ctx.arc(sx, feet - 30, 8.5, Math.PI, 0); ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(sx, feet - 30, 8.5, Math.PI, 0);
    ctx.closePath();
    // 帽沿
    ctx.fillStyle = this.beanieColor;
    ctx.beginPath();
    ctx.roundRect(sx - 9, feet - 32, 18, 4, 2); ctx.fill();
    // 帽顶小球
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(sx, feet - 36, 2.5, 0, Math.PI * 2); ctx.fill();

    // 脸颊
    ctx.fillStyle = 'rgba(255,150,130,0.4)';
    ctx.beginPath(); ctx.arc(sx - 4.5, feet - 25, 1.6, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(sx + 4.5, feet - 25, 1.6, 0, Math.PI * 2); ctx.fill();

    // 眼睛
    ctx.fillStyle = '#26323f';
    ctx.beginPath(); ctx.arc(sx - 3, feet - 28, 1.2, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(sx + 3, feet - 28, 1.2, 0, Math.PI * 2); ctx.fill();

    ctx.restore();
    ctx.restore();
  }
}