/* ============================================================
   Ice Town · interior.js
   屋内独立场景：房间布局、家具、墙体碰撞与渲染
   ============================================================ */

const ROOM_TILE = 48;

// 每种房屋类型的房间尺寸（瓦片）
const ROOM_SIZES = {
  house:   { w: 14, h: 10 },
  shop:    { w: 14, h: 10 },
  ice:     { w: 14, h: 10 },
  tavern:  { w: 16, h: 12 },
  bakery:  { w: 14, h: 10 },
  library: { w: 16, h: 11 },
  church:  { w: 18, h: 14 },
  inn:     { w: 16, h: 12 },
  palace:  { w: 18, h: 14 },
};

// 每种房屋类型的墙/地板配色
const ROOM_STYLE = {
  house:   { wall: '#f2d9b8', floor: '#d9b47e' },
  shop:    { wall: '#f7e2c0', floor: '#e8c896' },
  ice:     { wall: '#cfe8f7', floor: '#d9eefb' },
  tavern:  { wall: '#d8a97e', floor: '#b98a5f' },
  bakery:  { wall: '#f7e3c8', floor: '#e8c896' },
  library: { wall: '#d9c8a8', floor: '#b8a284' },
  church:  { wall: '#dcd8ea', floor: '#b0a8c0' },
  inn:     { wall: '#e8c9a8', floor: '#c9a27a' },
  palace:  { wall: '#f5e6d0', floor: '#d9c4a2' },
};

// 家具绘制辅助：给定中心点与半宽/半高画矩形
function rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.roundRect(x - w / 2, y - h / 2, w, h, r);
}

function shade2(hex, f = 0.8) {
  const c = hex.replace('#', '');
  const r = Math.min(255, parseInt(c.slice(0, 2), 16) * f);
  const g = Math.min(255, parseInt(c.slice(2, 4), 16) * f);
  const b = Math.min(255, parseInt(c.slice(4, 6), 16) * f);
  return `rgb(${r|0},${g|0},${b|0})`;
}

class Interior {
  constructor(type) {
    this.type = type;             // 'house' | 'shop' | 'ice' | 'tavern' | 'bakery' | 'library' | 'church' | 'inn'
    const size = ROOM_SIZES[type] || ROOM_SIZES.house;
    this.tilesW = size.w;
    this.tilesH = size.h;
    this.w = this.tilesW * ROOM_TILE;
    this.h = this.tilesH * ROOM_TILE;

    // 墙厚（碰撞用），单位像素；门洞在底部墙中央
    this.wall = 14;
    this.doorW = 64;
    this.doorX = this.w / 2;      // 门的中心
    this.exitX = this.doorX;
    this.exitY = this.h;          // 出口点（底部中央）
    this.spawnX = this.doorX;
    this.spawnY = this.h - 56;

    this.solids = [];             // 固体矩形（墙 + 家具）
    this.furniture = [];          // 可绘制家具（含固体信息）
    this.decor = [];              // 纯装饰（墙纸、窗户、地毯等，不可碰撞）
    this.wallColor = this._wallColor();
    this.floorColor = this._floorColor();
    this._buildWalls();
    this._buildFurniture();
  }

  _wallColor() {
    return (ROOM_STYLE[this.type] || ROOM_STYLE.house).wall;
  }
  _floorColor() {
    return (ROOM_STYLE[this.type] || ROOM_STYLE.house).floor;
  }

  // ---------- 墙体（底部留门洞） ----------
  _buildWalls() {
    const w = this.wall;
    // 上墙
    this.solids.push({ x: 0, y: 0, w: this.w, h: w });
    // 左墙
    this.solids.push({ x: 0, y: 0, w: w, h: this.h });
    // 右墙
    this.solids.push({ x: this.w - w, y: 0, w: w, h: this.h });
    // 底墙：两段，中间留门洞
    const half = this.doorW / 2;
    this.solids.push({ x: 0, y: this.h - w, w: this.doorX - half, h: w });
    this.solids.push({ x: this.doorX + half, y: this.h - w, w: this.w - (this.doorX + half), h: w });
    this.doorLeft = this.doorX - half;
    this.doorRight = this.doorX + half;
  }

  _addSolid(x, y, w, h, furniture) {
    this.solids.push({ x, y, w, h });
    if (furniture) furniture._solid = { x, y, w, h };
  }

  // ---------- 家具布局（每种房屋不同） ----------
  _buildFurniture() {
    const T = ROOM_TILE;
    const add = (f) => this.furniture.push(f);
    const solid = (f) => this._addSolid(f.cx - f.w / 2, f.cy - f.h / 2, f.w, f.h, f);

    switch (this.type) {
      case 'shop': {
        // 柜台（后墙前）
        const counter = this._f('counter', this.w / 2, 4.2 * T, 3.2 * T, 0.9 * T, { color: '#8a5a3b' });
        add(counter); solid(counter);
        // 两列货架
        for (const x of [1.1 * T, this.w - 1.1 * T]) {
          const s = this._f('shelf', x, 6.2 * T, 1.0 * T, 2.2 * T, { color: '#7a4a2c' });
          add(s); solid(s);
        }
        // 收银台（门口右侧）
        const reg = this._f('register', this.doorX + 1.6 * T, this.h - 2.2 * T, 1.4 * T, 0.8 * T, {});
        add(reg); solid(reg);
        // 地毯
        this.decor.push(this._f('rug', this.w / 2, this.h - 3 * T, 3.6 * T, 1.8 * T, { color: '#c96f5c' }));
        // 盆栽
        add(this._f('plant', 2.6 * T, 1.6 * T, 0.9 * T, 0.9 * T, {}));
        break;
      }

      case 'ice': {
        // 冰块桌与冰凳
        const table = this._f('icetable', this.w / 2, 4.6 * T, 2.2 * T, 0.8 * T, { color: '#bfe9f5' });
        add(table); solid(table);
        for (const x of [this.w / 2 - 2 * T, this.w / 2 + 2 * T]) {
          const s = this._f('icestool', x, 5.8 * T, 0.9 * T, 0.9 * T, { color: '#cfeefb' });
          add(s); solid(s);
        }
        // 冰床
        const bed = this._f('icebed', this.w / 2, 2.2 * T, 3.0 * T, 1.5 * T, { color: '#d7f1fc' });
        add(bed); solid(bed);
        // 冰柜
        const cab = this._f('icecabinet', this.w - 1.6 * T, 7.8 * T, 1.3 * T, 1.1 * T, { color: '#a8dcef' });
        add(cab); solid(cab);
        this.decor.push(this._f('rug', this.w / 2, this.h - 3 * T, 3.4 * T, 1.6 * T, { color: '#7fc6e8' }));
        break;
      }

      case 'house': {
        // 双人床（右上）
        const bed = this._f('bed', this.w - 2.6 * T, 3.4 * T, 2.6 * T, 1.7 * T, { color: '#c98a5a' });
        add(bed); solid(bed);
        // 书桌+椅子（左上）
        const desk = this._f('desk', 2.4 * T, 3.6 * T, 1.8 * T, 0.9 * T, { color: '#7a4a2c' });
        add(desk); solid(desk);
        const chair = this._f('chair', 2.4 * T, 4.9 * T, 0.9 * T, 0.9 * T, { color: '#8a5a3b' });
        add(chair); solid(chair);
        // 餐桌（中央）+ 两把椅子
        const table = this._f('table', this.w / 2, 4.2 * T, 1.8 * T, 1.0 * T, { color: '#8a5a3b' });
        add(table); solid(table);
        for (const x of [this.w / 2 - 1.6 * T, this.w / 2 + 1.6 * T]) {
          const c = this._f('chair', x, 4.2 * T, 0.9 * T, 0.9 * T, { color: '#9a6a45' });
          add(c); solid(c);
        }
        // 炉灶（左下）
        const stove = this._f('stove', 2.2 * T, this.h - 2.2 * T, 1.6 * T, 1.0 * T, { color: '#5f6b78' });
        add(stove); solid(stove);
        // 书架（右下）
        const shelf = this._f('shelf', this.w - 2.4 * T, this.h - 2.4 * T, 1.4 * T, 1.6 * T, { color: '#6b4226' });
        add(shelf); solid(shelf);
        // 地毯
        this.decor.push(this._f('rug', this.w / 2, 4.2 * T, 4.2 * T, 2.4 * T, { color: '#c9b06a' }));
        // 盆栽
        add(this._f('plant', 1.5 * T, 1.5 * T, 0.9 * T, 0.9 * T, {}));
        break;
      }

      case 'tavern': {
        // 吧台 + 酒架（后墙前）
        const bar = this._f('bar', this.w / 2, 3.6 * T, 4.6 * T, 1.0 * T, { color: '#7a4a2c' });
        add(bar); solid(bar);
        const wineShelf = this._f('shelf', this.w / 2, 2.2 * T, 2.2 * T, 1.4 * T, { color: '#6b4226' });
        add(wineShelf); solid(wineShelf);
        // 三张圆桌 + 圆凳
        for (const [x, y] of [[4 * T, 6.6 * T], [8 * T, 6.0 * T], [12 * T, 6.6 * T]]) {
          const t = this._f('roundtable', x, y, 1.1 * T, 0.9 * T, { color: '#8a5a3b' });
          add(t); solid(t);
          for (const ox of [-0.9 * T, 0.9 * T]) {
            const s = this._f('stool', x + ox, y, 0.7 * T, 0.6 * T, { color: '#9a6a45' });
            add(s); solid(s);
          }
        }
        // 壁炉（左墙）
        const fp = this._f('fireplace', 2.2 * T, 3.4 * T, 1.6 * T, 2.2 * T, {});
        add(fp); solid(fp);
        // 酒桶
        for (const [x, y] of [[this.w - 1.7 * T, 2.2 * T], [this.w - 1.7 * T, 8.8 * T], [1.7 * T, 9.4 * T]]) {
          const k = this._f('keg', x, y, 0.9 * T, 1.0 * T, {});
          add(k); solid(k);
        }
        this.decor.push(this._f('rug', this.w / 2, this.h - 3 * T, 4 * T, 2 * T, { color: '#a86a4a' }));
        add(this._f('plant', 1.8 * T, 1.7 * T, 0.9 * T, 0.9 * T, {}));
        break;
      }

      case 'bakery': {
        // 展示柜 + 烤炉 + 柜台（后墙前）
        const disp = this._f('display', 3.2 * T, 3.8 * T, 1.7 * T, 1.0 * T, { color: '#7a4a2c' });
        add(disp); solid(disp);
        const oven = this._f('oven', 7.2 * T, 4.0 * T, 1.8 * T, 1.6 * T, {});
        add(oven); solid(oven);
        const counter = this._f('counter', 11.0 * T, 3.8 * T, 2.2 * T, 0.9 * T, { color: '#8a5a3b' });
        add(counter); solid(counter);
        // 面包架（左墙）
        const shelf = this._f('shelf', 1.6 * T, 6.4 * T, 1.0 * T, 2.0 * T, { color: '#7a4a2c' });
        add(shelf); solid(shelf);
        // 品尝区圆桌 + 圆凳
        const table = this._f('roundtable', 7.0 * T, 7.6 * T, 1.2 * T, 1.0 * T, { color: '#8a5a3b' });
        add(table); solid(table);
        for (const ox of [-1.2 * T, 1.2 * T]) {
          const s = this._f('stool', 7.0 * T + ox, 7.6 * T, 0.7 * T, 0.6 * T, { color: '#9a6a45' });
          add(s); solid(s);
        }
        this.decor.push(this._f('rug', this.w / 2, this.h - 3 * T, 3.4 * T, 1.6 * T, { color: '#d9a06a' }));
        add(this._f('plant', 12.6 * T, 1.6 * T, 0.9 * T, 0.9 * T, {}));
        break;
      }

      case 'library': {
        // 左右两侧书墙
        for (const y of [3.2 * T, 5.4 * T, 7.6 * T]) {
          const sl = this._f('shelf', 1.7 * T, y, 1.2 * T, 1.8 * T, { color: '#6b4226' });
          add(sl); solid(sl);
          const sr = this._f('shelf', this.w - 1.7 * T, y, 1.2 * T, 1.8 * T, { color: '#6b4226' });
          add(sr); solid(sr);
        }
        // 服务台（后墙前）
        const desk = this._f('counter', this.w / 2, 3.4 * T, 3.0 * T, 1.0 * T, { color: '#7a4a2c' });
        add(desk); solid(desk);
        // 阅读长桌 + 椅子
        for (const x of [5.6 * T, 10.4 * T]) {
          const t = this._f('table', x, 7.2 * T, 2.0 * T, 1.0 * T, { color: '#8a5a3b' });
          add(t); solid(t);
          const c = this._f('chair', x, 8.3 * T, 0.8 * T, 0.8 * T, { color: '#9a6a45' });
          add(c); solid(c);
        }
        this.decor.push(this._f('rug', this.w / 2, this.h - 3 * T, 3.6 * T, 1.6 * T, { color: '#7a8a9a' }));
        this.decor.push(this._f('window', this.w / 2 - 3 * T, 1.0 * T, 1.6 * T, 1.2 * T, {}));
        this.decor.push(this._f('window', this.w / 2 + 3 * T, 1.0 * T, 1.6 * T, 1.2 * T, {}));
        add(this._f('plant', this.w - 1.8 * T, 1.7 * T, 0.9 * T, 0.9 * T, {}));
        break;
      }

      case 'church': {
        // 圣坛（后墙前）
        const altar = this._f('altar', this.w / 2, 4.4 * T, 2.8 * T, 1.3 * T, { color: '#e8e4ef' });
        add(altar); solid(altar);
        // 两列长凳
        for (const y of [6.6 * T, 8.8 * T, 11.0 * T]) {
          for (const x of [5.2 * T, 12.8 * T]) {
            const pew = this._f('pew', x, y, 3.4 * T, 1.0 * T, { color: '#8a6a4a' });
            add(pew); solid(pew);
          }
        }
        // 立柱
        for (const [x, y] of [[4.0 * T, 4.6 * T], [14.0 * T, 4.6 * T], [3.0 * T, 12.8 * T], [15.0 * T, 12.8 * T]]) {
          const p = this._f('pillar', x, y, 0.9 * T, 2.4 * T, {});
          add(p); solid(p);
        }
        // 中央长地毯 + 两侧窗户
        this.decor.push(this._f('rug', this.w / 2, 9.0 * T, 3.0 * T, 6.6 * T, { color: '#8a7ab0' }));
        this.decor.push(this._f('window', this.w / 2 - 2.6 * T, 1.2 * T, 1.8 * T, 1.6 * T, {}));
        this.decor.push(this._f('window', this.w / 2 + 2.6 * T, 1.2 * T, 1.8 * T, 1.6 * T, {}));
        break;
      }

      case 'palace': {
        // 王座（后墙前）
        const throne = this._f('throne', this.w / 2, 4.4 * T, 1.6 * T, 1.6 * T, {});
        add(throne); solid(throne);
        // 两侧立柱
        for (const [x, y] of [[4 * T, 6.6 * T], [14 * T, 6.6 * T], [4 * T, 10.2 * T], [14 * T, 10.2 * T]]) {
          const p = this._f('pillar', x, y, 0.9 * T, 2.4 * T, {});
          add(p); solid(p);
        }
        // 两侧案台
        const ct1 = this._f('counter', 3.4 * T, 3.6 * T, 2.2 * T, 0.9 * T, { color: '#7a4a2c' });
        add(ct1); solid(ct1);
        const ct2 = this._f('counter', this.w - 3.4 * T, 3.6 * T, 2.2 * T, 0.9 * T, { color: '#7a4a2c' });
        add(ct2); solid(ct2);
        // 中央红毯
        this.decor.push(this._f('rug', this.w / 2, 9.2 * T, 3.0 * T, 8.4 * T, { color: '#b03a3a' }));
        this.decor.push(this._f('window', this.w / 2 - 3 * T, 1.2 * T, 1.8 * T, 1.6 * T, {}));
        this.decor.push(this._f('window', this.w / 2 + 3 * T, 1.2 * T, 1.8 * T, 1.6 * T, {}));
        add(this._f('plant', 2.2 * T, 6.4 * T, 0.9 * T, 0.9 * T, {}));
        add(this._f('plant', this.w - 2.2 * T, 6.4 * T, 0.9 * T, 0.9 * T, {}));
        break;
      }

      case 'inn': {
        // 前台（后墙前）
        const front = this._f('counter', this.w / 2, 3.6 * T, 3.2 * T, 1.0 * T, { color: '#8a5a3b' });
        add(front); solid(front);
        // 壁炉（左墙）
        const fp = this._f('fireplace', 2.0 * T, 3.4 * T, 1.5 * T, 2.0 * T, {});
        add(fp); solid(fp);
        // 一排床铺
        for (const x of [3.2 * T, 6.8 * T, 9.2 * T, 12.8 * T]) {
          const bed = this._f('bed', x, 7.8 * T, 2.2 * T, 1.7 * T, { color: '#c98a5a' });
          add(bed); solid(bed);
        }
        // 床头椅
        for (const [x, y] of [[4.6 * T, 6.4 * T], [11.4 * T, 6.4 * T]]) {
          const c = this._f('chair', x, y, 0.8 * T, 0.8 * T, { color: '#9a6a45' });
          add(c); solid(c);
        }
        this.decor.push(this._f('rug', this.w / 2, this.h - 3 * T, 4.0 * T, 2.0 * T, { color: '#c9a06a' }));
        add(this._f('plant', this.w - 1.8 * T, 1.7 * T, 0.9 * T, 0.9 * T, {}));
        break;
      }
    }

    // 门口地垫
    this.decor.push(this._f('mat', this.doorX, this.h - 0.7 * T, 1.4 * T, 0.4 * T, { color: '#9a6a45' }));
    // 顶部装饰：窗户（非碰撞）
    this.decor.push(this._f('window', this.w / 2, 0.8 * T, 2.4 * T, 1.4 * T, {}));
  }

  _f(type, cx, cy, w, h, opts = {}) {
    return { type, cx, cy, w, h, color: opts.color || '#ccc', _solid: null };
  }

  // ---------- 碰撞 ----------
  isSolid(r) {
    for (const s of this.solids) {
      if (r.x < s.x + s.w && r.x + r.w > s.x &&
          r.y < s.y + s.h && r.y + r.h > s.y) return true;
    }
    return false;
  }

  // 玩家是否站在出口处（返回 true 表示可离开）
  atExit(player) {
    return Math.abs(player.x - this.exitX) < 34 && (this.h - player.y) < 30;
  }

  // ---------- 渲染 ----------
  draw(ctx, cam, player) {
    ctx.save();
    ctx.translate(-cam.x, -cam.y);

    // 地板
    ctx.fillStyle = this.floorColor;
    ctx.fillRect(0, 0, this.w, this.h);
    // 地板纹理：木板线
    ctx.strokeStyle = 'rgba(0,0,0,0.07)';
    ctx.lineWidth = 1;
    for (let gy = 0; gy < this.h; gy += 28) {
      ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(this.w, gy); ctx.stroke();
    }

    // 后墙（视觉）
    ctx.fillStyle = this.wallColor;
    ctx.fillRect(0, 0, this.w, 24);
    // 墙裙
    ctx.fillStyle = shade2(this.wallColor, 0.85);
    ctx.fillRect(0, 24, this.w, 18);
    // 踢脚线
    ctx.fillStyle = shade2(this.wallColor, 0.7);
    ctx.fillRect(0, 42, this.w, 6);

    // 装饰（地毯、窗户等）铺在地板层
    for (const d of this.decor) this._drawItem(ctx, d);

    // 家具按 Y 排序，与玩家一起做深度排序
    const items = this.furniture.map(f => ({ f, y: f.cy }));
    items.sort((a, b) => a.y - b.y);

    for (const { f } of items) this._drawItem(ctx, f);

    ctx.restore();
  }

  _drawItem(ctx, d) {
    ctx.save();
    switch (d.type) {
      case 'rug':
        ctx.fillStyle = d.color;
        rr(ctx, d.cx, d.cy, d.w, d.h, 8); ctx.fill();
        ctx.strokeStyle = shade2(d.color, 0.85); ctx.lineWidth = 2; ctx.stroke();
        // 花纹
        ctx.strokeStyle = 'rgba(255,255,255,0.4)';
        ctx.strokeRect(d.cx - d.w/4, d.cy - d.h/4, d.w/2, d.h/2);
        break;
      case 'mat':
        ctx.fillStyle = d.color;
        rr(ctx, d.cx, d.cy, d.w, d.h, 3); ctx.fill();
        break;
      case 'window':
        // 窗（后墙上的窗户）
        ctx.fillStyle = '#bde7f5';
        rr(ctx, d.cx, d.cy, d.w, d.h, 4); ctx.fill();
        ctx.strokeStyle = '#7a4a2c'; ctx.lineWidth = 3; ctx.stroke();
        ctx.beginPath(); ctx.moveTo(d.cx - d.w/2, d.cy); ctx.lineTo(d.cx + d.w/2, d.cy); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(d.cx, d.cy - d.h/2); ctx.lineTo(d.cx, d.cy + d.h/2); ctx.stroke();
        // 窗外雪景
        ctx.fillStyle = 'rgba(255,255,255,0.6)';
        ctx.beginPath(); ctx.arc(d.cx - d.w/4, d.cy + d.h/4, 4, 0, Math.PI*2); ctx.fill();
        break;
      case 'plant':
        // 盆栽
        ctx.fillStyle = '#8a5a3b'; rr(ctx, d.cx, d.cy + d.h*0.3, d.w*0.7, d.h*0.5, 4); ctx.fill();
        ctx.fillStyle = '#4e9a51';
        ctx.beginPath(); ctx.arc(d.cx - d.w*0.2, d.cy - d.h*0.2, d.w*0.28, 0, Math.PI*2); ctx.fill();
        ctx.beginPath(); ctx.arc(d.cx + d.w*0.2, d.cy - d.h*0.25, d.w*0.22, 0, Math.PI*2); ctx.fill();
        break;
      case 'bed':
        // 床
        ctx.fillStyle = '#6b4226'; rr(ctx, d.cx, d.cy + 4, d.w, d.h - 6, 6); ctx.fill();
        ctx.fillStyle = d.color; rr(ctx, d.cx, d.cy - 6, d.w - 8, d.h - 12, 6); ctx.fill();
        // 枕头
        ctx.fillStyle = '#f5efe2'; rr(ctx, d.cx - d.w*0.28, d.cy - d.h*0.28, d.w*0.3, d.h*0.3, 6); ctx.fill();
        // 被子纹
        ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(d.cx - d.w/2 + 4, d.cy + 2); ctx.lineTo(d.cx + d.w/2 - 4, d.cy + 2); ctx.stroke();
        // 床头板
        ctx.fillStyle = shade2('#6b4226', 0.85); rr(ctx, d.cx - d.w*0.32, d.cy - d.h*0.42, d.w*0.2, d.h*0.3, 4); ctx.fill();
        break;
      case 'icebed':
        ctx.fillStyle = 'rgba(120,190,225,0.5)'; rr(ctx, d.cx, d.cy + 4, d.w, d.h - 6, 8); ctx.fill();
        ctx.fillStyle = d.color; rr(ctx, d.cx, d.cy - 6, d.w - 8, d.h - 12, 8); ctx.fill();
        ctx.fillStyle = '#ffffff'; rr(ctx, d.cx - d.w*0.28, d.cy - d.h*0.28, d.w*0.3, d.h*0.3, 6); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.6)'; rr(ctx, d.cx - d.w/2 + 4, d.cy + 2, d.w - 8, 4, 2); ctx.fill();
        break;
      case 'desk':
        ctx.fillStyle = d.color; rr(ctx, d.cx, d.cy, d.w, d.h, 5); ctx.fill();
        ctx.fillStyle = shade2(d.color, 1.1); rr(ctx, d.cx, d.cy - d.h*0.55, d.w + 8, d.h*0.5, 5); ctx.fill();
        // 台灯
        ctx.fillStyle = '#ffd966'; ctx.beginPath(); ctx.arc(d.cx + d.w*0.28, d.cy - d.h*0.6, 5, 0, Math.PI*2); ctx.fill();
        break;
      case 'chair':
        ctx.fillStyle = d.color; rr(ctx, d.cx, d.cy, d.w, d.h, 6); ctx.fill();
        ctx.fillStyle = shade2(d.color, 1.15); rr(ctx, d.cx, d.cy - d.h*0.35, d.w, d.h*0.4, 6); ctx.fill();
        break;
      case 'table':
      case 'counter':
        ctx.fillStyle = d.color; rr(ctx, d.cx, d.cy, d.w, d.h, 6); ctx.fill();
        ctx.fillStyle = shade2(d.color, 1.1); rr(ctx, d.cx, d.cy - d.h*0.5, d.w + 6, d.h*0.55, 6); ctx.fill();
        break;
      case 'icetable':
        ctx.fillStyle = 'rgba(140,200,230,0.6)'; rr(ctx, d.cx, d.cy, d.w, d.h, 6); ctx.fill();
        ctx.fillStyle = d.color; rr(ctx, d.cx, d.cy - d.h*0.5, d.w + 4, d.h*0.55, 6); ctx.fill();
        break;
      case 'icestool':
        ctx.fillStyle = d.color; rr(ctx, d.cx, d.cy, d.w, d.h, 8); ctx.fill();
        break;
      case 'stove':
        ctx.fillStyle = d.color; rr(ctx, d.cx, d.cy, d.w, d.h, 5); ctx.fill();
        ctx.fillStyle = '#333'; rr(ctx, d.cx - d.w*0.25, d.cy - d.h*0.3, d.w*0.2, 4, 2); ctx.fill();
        ctx.fillStyle = '#ff8c42'; rr(ctx, d.cx + d.w*0.2, d.cy - d.h*0.3, d.w*0.18, 4, 2); ctx.fill();
        // 烟囱
        ctx.fillStyle = '#5f6b78'; rr(ctx, d.cx, d.cy - d.h*0.8, 6, d.h*0.6, 2); ctx.fill();
        break;
      case 'register':
        ctx.fillStyle = '#6b4226'; rr(ctx, d.cx, d.cy, d.w, d.h*0.7, 4); ctx.fill();
        ctx.fillStyle = '#3a4557'; rr(ctx, d.cx, d.cy - d.h*0.3, d.w*0.6, d.h*0.5, 3); ctx.fill();
        ctx.fillStyle = '#8fd694'; rr(ctx, d.cx, d.cy - d.h*0.42, d.w*0.4, d.h*0.16, 2); ctx.fill();
        break;
      case 'icecabinet':
        ctx.fillStyle = d.color; rr(ctx, d.cx, d.cy, d.w, d.h, 6); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.7)'; rr(ctx, d.cx, d.cy - d.h*0.2, d.w*0.7, d.h*0.4, 3); ctx.fill();
        break;
      case 'shelf':
        ctx.fillStyle = d.color; rr(ctx, d.cx, d.cy, d.w, d.h, 5); ctx.fill();
        ctx.fillStyle = shade2(d.color, 1.15);
        for (let i = 0; i < 3; i++) {
          rr(ctx, d.cx, d.cy - d.h*0.5 + i * d.h*0.5, d.w*0.86, 4, 2); ctx.fill();
        }
        // 书
        ctx.fillStyle = '#e06b6b'; rr(ctx, d.cx - d.w*0.3, d.cy - d.h*0.3, 5, d.h*0.24, 1); ctx.fill();
        ctx.fillStyle = '#5b8fae'; rr(ctx, d.cx - d.w*0.15, d.cy - d.h*0.32, 5, d.h*0.26, 1); ctx.fill();
        ctx.fillStyle = '#6ba85b'; rr(ctx, d.cx + d.w*0.05, d.cy - d.h*0.28, 5, d.h*0.22, 1); ctx.fill();
        break;
      case 'bar':
        ctx.fillStyle = d.color; rr(ctx, d.cx, d.cy, d.w, d.h, 6); ctx.fill();
        ctx.fillStyle = shade2(d.color, 1.12); rr(ctx, d.cx, d.cy - d.h * 0.55, d.w + 6, d.h * 0.5, 5); ctx.fill();
        // 吧台上的酒瓶
        ctx.fillStyle = '#7a4a2c'; rr(ctx, d.cx - d.w * 0.3, d.cy - d.h * 0.6, 6, 8, 2); ctx.fill();
        ctx.fillStyle = '#5b8fae'; rr(ctx, d.cx - d.w * 0.15, d.cy - d.h * 0.62, 6, 9, 2); ctx.fill();
        ctx.fillStyle = '#6ba85b'; rr(ctx, d.cx, d.cy - d.h * 0.58, 6, 7, 2); ctx.fill();
        ctx.fillStyle = '#e06b6b'; rr(ctx, d.cx + d.w * 0.15, d.cy - d.h * 0.6, 6, 8, 2); ctx.fill();
        break;
      case 'roundtable':
        ctx.fillStyle = d.color;
        ctx.beginPath(); ctx.ellipse(d.cx, d.cy, d.w / 2, d.h / 2, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = shade2(d.color, 1.1);
        ctx.beginPath(); ctx.ellipse(d.cx, d.cy - d.h * 0.12, d.w * 0.45, d.h * 0.4, 0, 0, Math.PI * 2); ctx.fill();
        break;
      case 'stool':
        ctx.fillStyle = d.color;
        ctx.beginPath(); ctx.ellipse(d.cx, d.cy, d.w / 2, d.h / 2, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = shade2(d.color, 1.12);
        ctx.beginPath(); ctx.ellipse(d.cx, d.cy - d.h * 0.15, d.w * 0.4, d.h * 0.35, 0, 0, Math.PI * 2); ctx.fill();
        break;
      case 'keg':
        ctx.fillStyle = '#8a5a3b'; rr(ctx, d.cx, d.cy, d.w, d.h, 6); ctx.fill();
        ctx.fillStyle = shade2('#8a5a3b', 1.15);
        rr(ctx, d.cx, d.cy - d.h * 0.28, d.w * 0.82, 4, 2); ctx.fill();
        rr(ctx, d.cx, d.cy + d.h * 0.28, d.w * 0.82, 4, 2); ctx.fill();
        ctx.fillStyle = shade2('#8a5a3b', 0.8);
        ctx.beginPath(); ctx.ellipse(d.cx, d.cy - d.h / 2 + 2, d.w * 0.36, 4, 0, 0, Math.PI * 2); ctx.fill();
        break;
      case 'fireplace':
        ctx.fillStyle = '#8a5a3b'; rr(ctx, d.cx, d.cy - d.h * 0.05, d.w, d.h, 6); ctx.fill();
        ctx.fillStyle = shade2('#8a5a3b', 0.7); rr(ctx, d.cx, d.cy - d.h * 0.3, d.w * 1.15, d.h * 0.18, 3); ctx.fill();
        ctx.fillStyle = '#3a2a1e'; rr(ctx, d.cx, d.cy + d.h * 0.2, d.w * 0.6, d.h * 0.55, 4); ctx.fill();
        ctx.fillStyle = '#ff8c42';
        ctx.beginPath(); ctx.ellipse(d.cx, d.cy + d.h * 0.24, d.w * 0.2, d.h * 0.18, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#ffd966';
        ctx.beginPath(); ctx.ellipse(d.cx, d.cy + d.h * 0.2, d.w * 0.12, d.h * 0.12, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#8a5a3b'; rr(ctx, d.cx, d.cy - d.h * 0.55, d.w * 0.5, d.h * 0.45, 2); ctx.fill();
        break;
      case 'oven':
        ctx.fillStyle = '#b06a45'; rr(ctx, d.cx, d.cy, d.w, d.h, 10); ctx.fill();
        ctx.fillStyle = '#7a4a2c'; rr(ctx, d.cx, d.cy + d.h * 0.32, d.w * 0.5, d.h * 0.3, 3); ctx.fill();
        ctx.fillStyle = '#ff9c5a'; rr(ctx, d.cx, d.cy + d.h * 0.32, d.w * 0.3, d.h * 0.18, 2); ctx.fill();
        ctx.fillStyle = '#8a5a3b'; rr(ctx, d.cx + d.w * 0.3, d.cy - d.h * 0.7, d.w * 0.2, d.h * 0.4, 2); ctx.fill();
        break;
      case 'display':
        ctx.fillStyle = d.color; rr(ctx, d.cx, d.cy, d.w, d.h, 4); ctx.fill();
        ctx.fillStyle = '#e8f4fa'; rr(ctx, d.cx, d.cy - d.h * 0.7, d.w * 0.9, d.h * 0.7, 4); ctx.fill();
        ctx.strokeStyle = '#8a5a3b'; ctx.lineWidth = 2; ctx.stroke();
        ctx.fillStyle = '#f2c9a0'; rr(ctx, d.cx - d.w * 0.2, d.cy - d.h * 0.72, 8, 6, 3); ctx.fill();
        ctx.fillStyle = '#e8b877'; rr(ctx, d.cx + d.w * 0.15, d.cy - d.h * 0.72, 7, 6, 3); ctx.fill();
        break;
      case 'pew':
        ctx.fillStyle = d.color; rr(ctx, d.cx, d.cy, d.w, d.h, 4); ctx.fill();
        ctx.fillStyle = shade2(d.color, 0.85); rr(ctx, d.cx, d.cy - d.h * 0.8, d.w, d.h * 0.6, 3); ctx.fill();
        ctx.fillStyle = shade2(d.color, 0.7);
        rr(ctx, d.cx - d.w * 0.38, d.cy + d.h * 0.7, d.w * 0.08, d.h * 0.5, 2); ctx.fill();
        rr(ctx, d.cx + d.w * 0.38, d.cy + d.h * 0.7, d.w * 0.08, d.h * 0.5, 2); ctx.fill();
        break;
      case 'altar':
        ctx.fillStyle = d.color; rr(ctx, d.cx, d.cy, d.w, d.h, 4); ctx.fill();
        ctx.fillStyle = '#ffffff'; rr(ctx, d.cx, d.cy - d.h * 0.35, d.w * 0.8, d.h * 0.4, 3); ctx.fill();
        for (const off of [-0.28, 0, 0.28]) {
          ctx.fillStyle = '#ffd966'; rr(ctx, d.cx + d.w * off, d.cy - d.h * 0.62, 4, 7, 1); ctx.fill();
          ctx.fillStyle = '#fff3c4';
          ctx.beginPath(); ctx.arc(d.cx + d.w * off, d.cy - d.h * 0.7, 2.5, 0, Math.PI * 2); ctx.fill();
        }
        break;
      case 'pillar':
        ctx.fillStyle = d.color; rr(ctx, d.cx, d.cy, d.w, d.h, 3); ctx.fill();
        ctx.fillStyle = shade2(d.color, 0.85);
        rr(ctx, d.cx, d.cy - d.h * 0.48, d.w * 1.15, d.h * 0.12, 2); ctx.fill();
        rr(ctx, d.cx, d.cy + d.h * 0.48, d.w * 1.15, d.h * 0.12, 2); ctx.fill();
        break;
      case 'throne':
        // 台座
        ctx.fillStyle = '#c9b99a'; rr(ctx, d.cx, d.cy + d.h * 0.3, d.w, d.h * 0.5, 4); ctx.fill();
        // 高背座椅
        ctx.fillStyle = '#b8860b'; rr(ctx, d.cx, d.cy - d.h * 0.45, d.w * 0.6, d.h * 0.95, 8); ctx.fill();
        ctx.fillStyle = '#d4a843'; rr(ctx, d.cx, d.cy - d.h * 0.42, d.w * 0.48, d.h * 0.8, 6); ctx.fill();
        // 红色坐垫
        ctx.fillStyle = '#a03030'; rr(ctx, d.cx, d.cy, d.w * 0.5, d.h * 0.25, 4); ctx.fill();
        // 扶手
        ctx.fillStyle = '#d4a843';
        rr(ctx, d.cx - d.w * 0.36, d.cy - d.h * 0.05, d.w * 0.12, d.h * 0.5, 4); ctx.fill();
        rr(ctx, d.cx + d.w * 0.36, d.cy - d.h * 0.05, d.w * 0.12, d.h * 0.5, 4); ctx.fill();
        // 皇冠装饰
        ctx.fillStyle = '#ffd700';
        ctx.beginPath();
        ctx.moveTo(d.cx - d.w * 0.2, d.cy - d.h * 0.55);
        ctx.lineTo(d.cx - d.w * 0.12, d.cy - d.h * 0.75);
        ctx.lineTo(d.cx, d.cy - d.h * 0.62);
        ctx.lineTo(d.cx + d.w * 0.12, d.cy - d.h * 0.78);
        ctx.lineTo(d.cx + d.w * 0.2, d.cy - d.h * 0.55);
        ctx.closePath(); ctx.fill();
        break;
      default:
        break;
    }
    ctx.restore();
  }
}