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
    // 中心广场区域（瓦片）
    this.plaza = { x: 26, y: 18, w: 14, h: 14 };
    this.buildings = [];
    // 纯装饰树（固定、不可编辑），用于填充地块
    this.decorTrees = [];
    this._buildDefaultTown();
    this._fillDecorTrees();
  }

  get worldW() { return this.tilesW * TILE; }
  get worldH() { return this.tilesH * TILE; }

  _rand(n) { return Math.floor(Math.random() * n); }

  // 地块填充装饰树（避开广场与建筑）
  _fillDecorTrees() {
    for (let i = 0; i < 300; i++) {
      const tx = 1 + this._rand(this.tilesW - 2);
      const ty = 1 + this._rand(this.tilesH - 2);
      // 避开中心广场
      if (tx > 25 && tx < 41 && ty > 17 && ty < 33) continue;
      // 避开建筑
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

    // ---- 中心广场 ----
    this.addBuilding('fountain', 32, 23, { name: '中央喷泉', color: '#7ec8e3', size: 1.2 });
    for (const [lx, ly] of [[27, 19], [39, 19], [27, 31], [39, 31]]) {
      this.addBuilding('lamp', lx, ly, { color: '#ffd966', size: 1 });
    }
    for (let x = 26; x <= 40; x += 2) {
      this.addBuilding('fence', x, 33, { color: '#8a5a3b', size: 1 });
    }
    this.addBuilding('ice', 25, 21, { name: '冰雕·天鹅', color: '#bfe9f5', size: 1 });
    this.addBuilding('ice', 41, 21, { name: '冰雕·小熊', color: '#a8dcef', size: 1.1 });
    this.addBuilding('ice', 25, 29, { name: '冰雕·驯鹿', color: '#cfeefb', size: 1 });
    this.addBuilding('ice', 41, 29, { name: '冰雕·企鹅', color: '#bfe9f5', size: 0.9 });

    // ---- 商业街（西侧） ----
    const street = [
      [6, 21, 'shop', '冰晶杂货铺'],
      [10, 21, 'bakery', '暖炉面包坊'],
      [14, 21, 'tavern', '霜火酒馆'],
      [18, 21, 'shop', '雪绒服饰店'],
      [22, 21, 'library', '冰雪图书馆'],
    ];
    street.forEach(([x, y, type, name], i) => {
      this.addBuilding(type, x, y, { name, color: colors[i % colors.length], size: 0.95 });
    });

    // ---- 住宅区（东北，两排小屋，共 10 间） ----
    let n = 1;
    for (const x of [34, 38, 42, 46, 50]) {
      this.addBuilding('house', x, 6, { name: '小屋 ' + (n++), color: colors[(x / 4) % colors.length], size: 0.8 + Math.random() * 0.4 });
    }
    for (const x of [36, 40, 44, 48, 52]) {
      this.addBuilding('house', x, 11, { name: '小屋 ' + (n++), color: colors[(x / 4 + 1) % colors.length], size: 0.8 + Math.random() * 0.4 });
    }
    this.addBuilding('snowman', 33, 9, { color: '#ffffff', size: 1 });
    this.addBuilding('snowman', 37, 14, { color: '#ffffff', size: 0.9 });
    this.addBuilding('snowman', 59, 8, { color: '#ffffff', size: 1.1 });

    // ---- 教堂（广场东侧） ----
    this.addBuilding('church', 44, 20, { name: '冰雪大教堂', color: '#e8f4fa', size: 1 });
    this.addBuilding('snowman', 44, 18, { color: '#ffffff', size: 1 });

    // ---- 旅店（广场北侧） ----
    this.addBuilding('inn', 30, 13, { name: '极光旅店', color: '#f2c9a0', size: 1 });
    this.addBuilding('snowman', 34, 15, { color: '#ffffff', size: 0.9 });

    // ---- 冰雕公园（西南） ----
    const park = [[14, 32], [18, 32], [16, 36], [20, 36], [12, 36]];
    park.forEach(([x, y], i) => {
      this.addBuilding('ice', x, y, { name: '冰雕 ' + (i + 1), color: '#bfe9f5', size: 0.9 });
    });

    // ---- 街道路灯 ----
    for (let x = 8; x <= 24; x += 4) {
      this.addBuilding('lamp', x, 25, { color: '#ffd966', size: 1 });
    }
    for (let x = 24; x <= 40; x += 4) {
      this.addBuilding('lamp', x, 35, { color: '#ffd966', size: 1 });
    }
    for (const y of [16, 20, 24, 28]) {
      this.addBuilding('lamp', 35, y, { color: '#ffd966', size: 1 });
    }
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