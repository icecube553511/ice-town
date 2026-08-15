/* ============================================================
   Ice Town · town.js
   小镇地图数据：地面、树木装饰、建筑（可编辑内容物）
   ============================================================ */

const TILE = 48;

// 建筑类型定义：名称、图标、尺寸、固定偏移
const BUILDING_TYPES = {
  house:   { name: '住宅', icon: '🏠', w: 2, h: 2 },
  shop:    { name: '商店', icon: '🛍', w: 2, h: 2 },
  tavern:  { name: '酒馆', icon: '🍺', w: 2, h: 2 },
  bakery:  { name: '面包店', icon: '🥖', w: 2, h: 2 },
  library: { name: '图书馆', icon: '📚', w: 2, h: 2 },
  church:  { name: '教堂', icon: '⛪', w: 3, h: 2 },
  inn:     { name: '旅店', icon: '🛏', w: 2, h: 2 },
  stall:   { name: '集市摊位', icon: '⛺', w: 1, h: 1 },
  bench:   { name: '长椅', icon: '🪑', w: 1, h: 1 },
  well:    { name: '水井', icon: '🪣', w: 1, h: 1 },
  pond:    { name: '池塘', icon: '💧', w: 2, h: 2 },
  tree:    { name: '树木', icon: '🌲', w: 1, h: 1 },
  snowman: { name: '雪人', icon: '⛄', w: 1, h: 1 },
  lamp:    { name: '路灯', icon: '💡', w: 1, h: 1 },
  fence:   { name: '栅栏', icon: '🚧', w: 1, h: 1 },
  fountain:{ name: '喷泉', icon: '⛲', w: 2, h: 2 },
  ice:     { name: '冰雕', icon: '🧊', w: 1, h: 1 },
};

class Building {
  constructor(type, tileX, tileY, opts = {}) {
    this.id = opts.id || (++Building._seq);
    this.type = type;
    this.tileX = tileX;      // 建筑左上角所在的瓦片坐标
    this.tileY = tileY;
    this.name = opts.name || BUILDING_TYPES[type].name;
    this.color = opts.color || '#7ec8e3';
    this.size = opts.size || 1;   // 缩放 0.5 ~ 2
  }
  get def() { return BUILDING_TYPES[this.type]; }
  get px() { return this.tileX * TILE; }
  get py() { return this.tileY * TILE; }
  get wpx() { return this.def.w * TILE; }
  get hpx() { return this.def.h * TILE; }
  // 世界矩形（含缩放）
  rect() {
    const cx = this.px + this.wpx / 2;
    const cy = this.py + this.hpx / 2;
    return {
      x: cx - (this.wpx * this.size) / 2,
      y: cy - (this.hpx * this.size) / 2,
      w: this.wpx * this.size,
      h: this.hpx * this.size,
      cx, cy,
    };
  }
}
Building._seq = 0;

class Town {
  constructor() {
    // 世界范围（瓦片）
    this.tilesW = 64;
    this.tilesH = 48;
    // 道路规划（装饰地面，非碰撞）：{ x, y, w, h } 瓦片矩形
    // 所有道路必须与主街/大道连通，不允许出现孤立的道路段
    this.roads = [
      { x: 31, y: 0, w: 2, h: 48 },   // 南北主街
      { x: 0, y: 23, w: 64, h: 2 },   // 东西大道
      { x: 8, y: 16, w: 24, h: 1 },   // 集市后巷（东端接主街）
      { x: 31, y: 13, w: 30, h: 1 },  // 生活区小路（西端接主街）
      { x: 58, y: 8, w: 1, h: 6 },    // 生活区岔路（通池塘，南端接生活区小路）
      { x: 17, y: 25, w: 1, h: 16 },  // 冰雕公园小径（北端接大道）
    ];
    // 广场/集市铺装区：{ x, y, w, h, label, labelY }（labelY 为标签相对顶部的瓦片偏移）
    this.squares = [
      { x: 27, y: 19, w: 7, h: 7, label: '冰 雪 广 场', labelY: 0.5 },
      { x: 8, y: 17, w: 16, h: 6, label: '周 末 集 市', labelY: 2.8 },
      { x: 34, y: 21, w: 5, h: 2, label: '' },
    ];
    this.buildings = [];
    // 纯装饰树（固定、不可编辑），用于填充地块
    this.decorTrees = [];
    this._buildDefaultTown();
    this._fillDecorTrees();
  }

  get worldW() { return this.tilesW * TILE; }
  get worldH() { return this.tilesH * TILE; }

  _rand(n) { return Math.floor(Math.random() * n); }

  _inSquare(tx, ty) {
    return this.squares.some((s) => tx >= s.x && tx < s.x + s.w && ty >= s.y && ty < s.y + s.h);
  }
  _inRoad(tx, ty) {
    return this.roads.some((r) => tx >= r.x && tx < r.x + r.w && ty >= r.y && ty < r.y + r.h);
  }

  // 地块填充装饰树（避开道路、广场与建筑）
  _fillDecorTrees() {
    for (let i = 0; i < 320; i++) {
      const tx = 1 + this._rand(this.tilesW - 2);
      const ty = 1 + this._rand(this.tilesH - 2);
      if (this._inSquare(tx, ty) || this._inRoad(tx, ty)) continue;
      if (this.isOccupied(tx, ty, 1, 1)) continue;
      this.decorTrees.push({ x: tx, y: ty, s: 0.6 + Math.random() * 0.5 });
    }
  }

  // 检查某个矩形（瓦片）区域是否被建筑占用
  isOccupied(tx, ty, w, h) {
    for (const b of this.buildings) {
      if (tx < b.tileX + b.def.w && tx + w > b.tileX &&
          ty < b.tileY + b.def.h && ty + h > b.tileY) return true;
    }
    return false;
  }

  // 检查是否被占用（排除某个建筑本身，用于拖动校验）
  isOccupiedExcluding(tx, ty, w, h, exclude) {
    for (const b of this.buildings) {
      if (b === exclude) continue;
      if (tx < b.tileX + b.def.w && tx + w > b.tileX &&
          ty < b.tileY + b.def.h && ty + h > b.tileY) return true;
    }
    return false;
  }

  // 在世界像素坐标处，是否有建筑（返回最上层那个）
  buildingAt(px, py) {
    for (let i = this.buildings.length - 1; i >= 0; i--) {
      const r = this.buildings[i].rect();
      if (px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h) {
        return this.buildings[i];
      }
    }
    return null;
  }

  addBuilding(type, tileX, tileY, opts = {}) {
    const b = new Building(type, tileX, tileY, opts);
    this.buildings.push(b);
    return b;
  }

  removeBuilding(b) {
    const i = this.buildings.indexOf(b);
    if (i >= 0) this.buildings.splice(i, 1);
  }

  // 找到可放置的瓦片坐标（避开占用与越界），从中心向外螺旋搜索
  findFreeTile(w = 2, h = 2) {
    const cx = Math.floor(this.tilesW / 2);
    const cy = Math.floor(this.tilesH / 2);
    for (let radius = 0; radius < Math.max(this.tilesW, this.tilesH); radius++) {
      for (let dx = -radius; dx <= radius; dx++) {
        for (let dy = -radius; dy <= radius; dy++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== radius) continue;
          const tx = cx + dx, ty = cy + dy;
          if (tx < 0 || ty < 0 || tx + w > this.tilesW || ty + h > this.tilesH) continue;
          if (!this.isOccupied(tx, ty, w, h)) return { tx, ty };
        }
      }
    }
    return null;
  }

  _buildDefaultTown() {
    const colors = ['#7ec8e3', '#a9d8f0', '#e8f4fa', '#9ac8dc', '#b8dff0', '#f2c9a0', '#c9e6f2'];

    // ---- 中心广场（主街 × 大道交叉口，建筑避开道路） ----
    this.addBuilding('fountain', 29, 21, { name: '中央喷泉', color: '#7ec8e3', size: 1.2 });
    this.addBuilding('ice', 28, 20, { name: '冰雕·天鹅', color: '#bfe9f5' });
    this.addBuilding('ice', 30, 19, { name: '冰雕·小熊', color: '#a8dcef', size: 1.1 });
    this.addBuilding('ice', 33, 20, { name: '冰雕·驯鹿', color: '#cfeefb' });
    this.addBuilding('ice', 28, 25, { name: '冰雕·企鹅', color: '#bfe9f5', size: 0.9 });
    for (const [lx, ly] of [[27, 19], [33, 19], [27, 25], [33, 25]]) {
      this.addBuilding('lamp', lx, ly, { color: '#ffd966' });
    }
    this.addBuilding('bench', 27, 22, { color: '#9a6a45' });
    this.addBuilding('bench', 33, 22, { color: '#9a6a45' });

    // ---- 周末集市（广场西侧，两排摊位） ----
    for (const x of [10, 12, 14, 16, 18, 20, 22]) {
      this.addBuilding('stall', x, 17, { name: '集市摊位', color: colors[(x / 2) % colors.length] });
    }
    for (const x of [9, 11, 13, 15, 17, 19, 21]) {
      this.addBuilding('stall', x, 21, { name: '集市摊位', color: colors[(x / 2 + 1) % colors.length] });
    }
    for (const [lx, ly] of [[8, 17], [23, 17], [8, 22], [23, 22]]) {
      this.addBuilding('lamp', lx, ly, { color: '#ffd966' });
    }
    this.addBuilding('bench', 11, 19, { color: '#9a6a45' });
    this.addBuilding('bench', 20, 19, { color: '#9a6a45' });

    // ---- 商业街（东西大道南侧） ----
    const street = [
      [6, 25, 'shop', '冰晶杂货铺'],
      [10, 25, 'bakery', '暖炉面包坊'],
      [14, 25, 'tavern', '霜火酒馆'],
      [18, 25, 'shop', '雪绒服饰店'],
      [22, 25, 'library', '冰雪图书馆'],
    ];
    street.forEach(([x, y, type, name], i) => {
      this.addBuilding(type, x, y, { name, color: colors[i % colors.length], size: 0.95 });
    });
    for (const x of [8, 12, 16, 20, 24]) {
      this.addBuilding('lamp', x, 27, { color: '#ffd966' });
    }

    // ---- 旅店（集市与广场之间） ----
    this.addBuilding('inn', 24, 18, { name: '极光旅店', color: '#f2c9a0' });
    this.addBuilding('snowman', 24, 20, { color: '#ffffff', size: 0.9 });

    // ---- 教堂（广场东侧，带门前小广场） ----
    this.addBuilding('church', 35, 19, { name: '冰雪大教堂', color: '#e8f4fa' });
    this.addBuilding('bench', 34, 21, { color: '#9a6a45' });
    this.addBuilding('bench', 38, 21, { color: '#9a6a45' });

    // ---- 生活区（东北，围绕小路的两排小屋） ----
    let n = 1;
    for (const x of [42, 46, 50, 54, 58]) {
      this.addBuilding('house', x, 6, { name: '小屋 ' + (n++), color: colors[(x / 4) % colors.length], size: 0.8 + Math.random() * 0.4 });
    }
    for (const x of [44, 48, 52, 56, 60]) {
      this.addBuilding('house', x, 14, { name: '小屋 ' + (n++), color: colors[(x / 4 + 1) % colors.length], size: 0.8 + Math.random() * 0.4 });
    }
    this.addBuilding('pond', 61, 7, { name: '结冰小池塘', color: '#bde9f7' });
    this.addBuilding('well', 45, 9, { name: '水井', color: '#9fb2bd' });
    this.addBuilding('bench', 40, 12, { color: '#9a6a45' });
    this.addBuilding('bench', 59, 12, { color: '#9a6a45' });
    for (const x of [44, 50, 56]) {
      this.addBuilding('lamp', x, 12, { color: '#ffd966' });
    }
    this.addBuilding('snowman', 43, 10, { color: '#ffffff' });
    this.addBuilding('snowman', 52, 11, { color: '#ffffff', size: 0.9 });
    this.addBuilding('snowman', 57, 9, { color: '#ffffff', size: 1.1 });

    // ---- 冰雕公园（西南，沿小径分布） ----
    for (const [x, y] of [[8, 32], [12, 32], [9, 36], [15, 36], [11, 40], [20, 33], [22, 37]]) {
      this.addBuilding('ice', x, y, { name: '冰雕', color: '#bfe9f5', size: 0.9 });
    }
    this.addBuilding('bench', 14, 34, { color: '#9a6a45' });
    this.addBuilding('bench', 21, 36, { color: '#9a6a45' });
    this.addBuilding('well', 7, 38, { name: '水井', color: '#9fb2bd' });
    for (const y of [29, 33, 36, 39]) {
      this.addBuilding('lamp', 16, y, { color: '#ffd966' });
    }
    this.addBuilding('snowman', 10, 30, { color: '#ffffff' });
    this.addBuilding('snowman', 22, 30, { color: '#ffffff', size: 0.9 });
  }

  toJSON() {
    return JSON.stringify(this.buildings.map(b => ({
      id: b.id, type: b.type, tileX: b.tileX, tileY: b.tileY,
      name: b.name, color: b.color, size: b.size,
    })));
  }

  fromJSON(str) {
    try {
      const arr = JSON.parse(str);
      if (!Array.isArray(arr)) return false;
      this.buildings = arr.map(d => {
        const b = new Building(d.type, d.tileX, d.tileY, d);
        Building._seq = Math.max(Building._seq, d.id);
        return b;
      });
      return true;
    } catch (e) {
      return false;
    }
  }
}

const town = new Town();