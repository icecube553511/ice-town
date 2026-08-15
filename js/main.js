/* ============================================================
   Ice Town · main.js
   游戏主循环、渲染（地面/建筑/玩家）、摄像机、输入
   ============================================================ */

(() => {
  // 兼容旧浏览器：部分内核不支持 ctx.roundRect，提供回退实现
  if (typeof CanvasRenderingContext2D !== 'undefined' && !CanvasRenderingContext2D.prototype.roundRect) {
    CanvasRenderingContext2D.prototype.roundRect = function (x, y, w, h, radii) {
      const r = typeof radii === 'number' ? [radii, radii, radii, radii] : (radii || [0, 0, 0, 0]);
      const m = Math.min(Math.abs(w), Math.abs(h)) / 2;
      const [tl, tr, br, bl] = r.map((v) => Math.min(v || 0, m));
      this.moveTo(x + tl, y);
      this.lineTo(x + w - tr, y);
      this.arcTo(x + w, y, x + w, y + tr, tr);
      this.lineTo(x + w, y + h - br);
      this.arcTo(x + w, y + h, x + w - br, y + h, br);
      this.lineTo(x + bl, y + h);
      this.arcTo(x, y + h, x, y + h - bl, bl);
      this.lineTo(x, y + tl);
      this.arcTo(x, y, x + tl, y, tl);
      this.closePath();
      return this;
    };
  }

  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');

  // ---------- 尺寸 ----------
  function resize() {
    canvas.width = window.innerWidth * devicePixelRatio;
    canvas.height = window.innerHeight * devicePixelRatio;
    ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
  }
  window.addEventListener('resize', resize);
  resize();

  const player = new Player();
  let cam = { x: 0, y: 0 };
  let targetMarker = null; // 点击移动的目标标记动画 { x, y, t, life }
  let zoom = 1;            // 视野缩放
  const ZOOM_MIN = 0.6;    // 缩放上下限
  const ZOOM_MAX = 2.4;
  let autoEnter = null;    // 点击建筑后待自动进入的建筑

  // ---------- 场景管理 ----------
  // scene.name: 'town' | 'interior'
  // scene.interior: Interior 实例（屋内）
  // scene.building: 当前进入的建筑（用于出门复位）
  const scene = {
    name: 'town',
    interior: null,
    building: null,
  };

  // 当前世界（碰撞 + 边界 + 尺寸）
  function currentWorld() {
    if (scene.name === 'town') {
      return {
        bounds: { x: 0, y: 0, w: town.worldW, h: town.worldH },
        blockers: town.buildings.map((b) => b.rect()),
        isSolid: (r) => {
          for (const b of town.buildings) {
            const br = b.rect();
            if (r.x < br.x + br.w && r.x + r.w > br.x &&
                r.y < br.y + br.h && r.y + r.h > br.y) return true;
          }
          return false;
        },
        width: () => town.worldW,
        height: () => town.worldH,
        isWalkable: (cx, cy) => {
          if (cx < 0 || cy < 0 || cx >= Math.ceil(town.worldW / PF_GRID) || cy >= Math.ceil(town.worldH / PF_GRID)) return false;
          const r = { x: cx * PF_GRID, y: cy * PF_GRID, w: PF_GRID, h: PF_GRID };
          for (const b of town.buildings) {
            const br = b.rect();
            if (r.x < br.x + br.w && r.x + r.w > br.x &&
                r.y < br.y + br.h && r.y + r.h > br.y) return false;
          }
          return true;
        },
      };
    }
    const room = scene.interior;
    return {
      bounds: { x: 0, y: 0, w: room.w, h: room.h },
      blockers: room.solids,
      // 门洞区域：膨胀寻路会堵住门口，这里恢复门洞格子为可行走
      clearCells: (() => {
        const list = [];
        const gx0 = room.doorX - room.doorW / 2;
        const gx1 = room.doorX + room.doorW / 2;
        for (let cy = Math.floor((room.h - 48) / PF_GRID); cy < Math.ceil(room.h / PF_GRID); cy++) {
          for (let cx = 0; cx < Math.ceil(room.w / PF_GRID); cx++) {
            const x0 = cx * PF_GRID, x1 = x0 + PF_GRID;
            if (x0 >= gx0 && x1 <= gx1) list.push([cx, cy]);
          }
        }
        return list;
      })(),
      isSolid: (r) => room.isSolid(r),
      width: () => room.w,
      height: () => room.h,
      isWalkable: (cx, cy) => {
        if (cx < 0 || cy < 0 || cx >= Math.ceil(room.w / PF_GRID) || cy >= Math.ceil(room.h / PF_GRID)) return false;
        const r = { x: cx * PF_GRID, y: cy * PF_GRID, w: PF_GRID, h: PF_GRID };
        for (const s of room.solids) {
          if (r.x < s.x + s.w && r.x + r.w > s.x &&
              r.y < s.y + s.h && r.y + r.h > s.y) return false;
        }
        return true;
      },
    };
  }

  // ---------- 摄像机平滑跟随玩家（画面中心始终在人物身上，拖拽平移时除外） ----------
  function desiredCam(vw, vh) {
    const world = currentWorld();
    const w = world.width();
    const h = world.height();
    // 始终以玩家为画面中心（允许地图边缘露出最多半屏空白）
    const tx = Math.max(-vw / 2, Math.min(w - vw / 2, player.x - vw / 2));
    const ty = Math.max(-vh / 2, Math.min(h - vh / 2, player.y - vh / 2));
    return { x: tx, y: ty };
  }

  function updateCamera(vw, vh, dt) {
    const d = desiredCam(vw, vh);
    const k = 1 - Math.exp(-8 * dt);
    cam.x += (d.x - cam.x) * k;
    cam.y += (d.y - cam.y) * k;
  }

  // 立即把镜头对准当前场景（切换场景时用）
  function snapCamera() {
    const vw = canvas.width / devicePixelRatio / zoom;
    const vh = canvas.height / devicePixelRatio / zoom;
    const d = desiredCam(vw, vh);
    cam.x = d.x;
    cam.y = d.y;
  }

  // ---------- 门交互 ----------
  const ENTERABLE = ['house', 'shop', 'ice', 'tavern', 'bakery', 'library', 'church', 'inn'];
  const doorHint = document.getElementById('door-hint');
  const exitHint = document.getElementById('exit-hint');

  // 小镇：找到离玩家最近、可进入的建筑（看其底部门）
  function buildingDoorNear() {
    if (scene.name !== 'town') return null;
    let best = null, bestD = 52;
    for (const b of town.buildings) {
      if (!ENTERABLE.includes(b.type)) continue;
      const r = b.rect();
      const dx = player.x - r.cx;
      const dy = player.y - (r.y + r.h);
      const d = Math.hypot(dx, dy);
      if (d < bestD) { bestD = d; best = b; }
    }
    return best;
  }

  function updateDoorHint() {
    const ed = Editor.active;
    if (scene.name === 'town') {
      exitHint.classList.add('hidden'); // 出门提示只在屋内显示
      const b = buildingDoorNear();
      if (b && !ed) {
        const r = b.rect();
        const sx = (r.cx - cam.x) * zoom;
        const sy = (r.y + r.h - cam.y) * zoom;
        doorHint.style.left = sx + 'px';
        doorHint.style.top = sy + 'px';
        doorHint.classList.remove('hidden');
      } else {
        doorHint.classList.add('hidden');
      }
    } else {
      doorHint.classList.add('hidden'); // 进门提示只在屋外显示
      const room = scene.interior;
      if (room.atExit(player)) {
        const sx = (room.exitX - cam.x) * zoom;
        const sy = (room.exitY - cam.y) * zoom;
        exitHint.style.left = sx + 'px';
        exitHint.style.top = sy + 'px';
        exitHint.classList.remove('hidden');
      } else {
        exitHint.classList.add('hidden');
      }
    }
  }

  // ---------- 过渡动画（加载） ----------
  const transEl = document.getElementById('transition');
  const transText = document.getElementById('trans-text');
  const OUT_TIME = 0.45, HOLD_TIME = 0.55, IN_TIME = 0.45;
  let transition = null; // { phase: 'out'|'hold'|'in', t, mid }

  function startTransition(text, mid) {
    if (transition) return;
    transition = { phase: 'out', t: 0, mid };
    transText.textContent = text;
    transEl.classList.add('show');
  }

  function updateTransition(dt) {
    if (!transition) return;
    transition.t += dt;
    if (transition.phase === 'out' && transition.t >= OUT_TIME) {
      transition.mid();
      transition.phase = 'hold';
      transition.t = 0;
      keys.clear();
    } else if (transition.phase === 'hold' && transition.t >= HOLD_TIME) {
      transition.phase = 'in';
      transition.t = 0;
    } else if (transition.phase === 'in' && transition.t >= IN_TIME) {
      transEl.classList.remove('show');
      transition = null;
    }
  }

  // 进屋 / 出门
  function enterBuilding(b) {
    if (transition) return;
    startTransition('正在进入…', () => {
      Editor.exit();
      scene.name = 'interior';
      scene.building = b;
      scene.interior = new Interior(b.type);
      player.setPosition(scene.interior.spawnX, scene.interior.spawnY);
      player.frame = 0;
      player.path = null;
      targetMarker = null;
      autoEnter = null;
      snapCamera();
    });
  }

  function exitBuilding() {
    if (transition || !scene.interior) return;
    startTransition('正在离开…', () => {
      const b = scene.building;
      const r = b.rect();
      scene.name = 'town';
      scene.interior = null;
      player.setPosition(r.cx, r.y + r.h + 40);
      player.frame = 0;
      player.path = null;
      targetMarker = null;
      snapCamera();
    });
  }

  // ---------- 渲染：地面 ----------
  function drawGround() {
    const vw = canvas.width / devicePixelRatio / zoom;
    const vh = canvas.height / devicePixelRatio / zoom;

    ctx.save();
    ctx.translate(-cam.x, -cam.y);

    // 雪地底色
    ctx.fillStyle = '#eef6fb';
    ctx.fillRect(cam.x - 10, cam.y - 10, town.worldW + 20, town.worldH + 20);

    // 为节省性能，只绘制可见区域内的瓦片格线
    const x0 = Math.max(0, Math.floor(cam.x / TILE));
    const x1 = Math.min(town.tilesW, Math.ceil((cam.x + vw) / TILE));
    const y0 = Math.max(0, Math.floor(cam.y / TILE));
    const y1 = Math.min(town.tilesH, Math.ceil((cam.y + vh) / TILE));

    // 轻微格纹（雪地微光）
    ctx.strokeStyle = 'rgba(150,190,215,0.18)';
    ctx.lineWidth = 1;
    for (let gx = x0; gx < x1; gx++) {
      for (let gy = y0; gy < y1; gy++) {
        if ((gx + gy) % 2 === 0) {
          ctx.fillStyle = 'rgba(255,255,255,0.5)';
          ctx.fillRect(gx * TILE, gy * TILE, TILE, TILE);
        }
      }
    }

    ctx.restore();

    drawRoads();
    drawSquares();
  }

  // ---------- 渲染：道路 ----------
  function drawRoads() {
    ctx.save();
    ctx.translate(-cam.x, -cam.y);
    for (const rd of town.roads) {
      const x = rd.x * TILE, y = rd.y * TILE, w = rd.w * TILE, h = rd.h * TILE;
      // 路面
      ctx.fillStyle = '#d9cfc0';
      ctx.fillRect(x, y, w, h);
      // 路边线
      ctx.strokeStyle = 'rgba(140,115,90,0.4)';
      ctx.lineWidth = 2;
      ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);
      // 中线（虚线）
      ctx.strokeStyle = 'rgba(255,255,255,0.5)';
      ctx.lineWidth = 2;
      ctx.setLineDash([10, 12]);
      ctx.beginPath();
      if (w >= h) {
        ctx.moveTo(x + 8, y + h / 2);
        ctx.lineTo(x + w - 8, y + h / 2);
      } else {
        ctx.moveTo(x + w / 2, y + 8);
        ctx.lineTo(x + w / 2, y + h - 8);
      }
      ctx.stroke();
      ctx.setLineDash([]);
      // 路边积雪
      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      ctx.fillRect(x + 4, y + 4, w - 8, 6);
      ctx.fillRect(x + 4, y + h - 10, w - 8, 6);
    }
    ctx.restore();
  }

  // ---------- 渲染：广场 / 集市铺装 ----------
  function drawSquares() {
    ctx.save();
    ctx.translate(-cam.x, -cam.y);
    for (const sq of town.squares) {
      const x = sq.x * TILE, y = sq.y * TILE, w = sq.w * TILE, h = sq.h * TILE;
      ctx.fillStyle = 'rgba(210,226,236,0.85)';
      ctx.fillRect(x, y, w, h);
      ctx.strokeStyle = 'rgba(120,170,205,0.45)';
      ctx.lineWidth = 2;
      ctx.setLineDash([8, 8]);
      ctx.strokeRect(x + 2, y + 2, w - 4, h - 4);
      ctx.setLineDash([]);
      if (sq.label) {
        ctx.fillStyle = 'rgba(70,120,155,0.5)';
        ctx.font = 'bold 24px "Microsoft YaHei", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(sq.label, x + w / 2, y + (sq.labelY || 0.5) * TILE + 10);
      }
    }
    ctx.restore();
  }

  // ---------- 渲染：装饰树（固定不可编辑） ----------
  function drawDecorTrees() {
    ctx.save();
    ctx.translate(-cam.x, -cam.y);
    for (const t of town.decorTrees) {
      const x = t.x * TILE, y = t.y * TILE;
      drawTree(ctx, x, y, t.s, 'rgba(255,255,255,0.5)', '#5f96ad');
    }
    ctx.restore();
  }

  // ---------- 渲染：建筑 ----------
  function drawBuildings() {
    ctx.save();
    ctx.translate(-cam.x, -cam.y);
    for (const b of town.buildings) drawBuilding(ctx, b);
    ctx.restore();
  }

  function drawBuilding(ctx, b) {
    const r = b.rect();
    const def = b.def;
    switch (b.type) {
      case 'tree': drawTree(ctx, r.cx, r.cy - r.h / 4, b.size, b.color, shade(b.color)); break;
      case 'lamp': drawLamp(ctx, r.cx, r.cy, b.size, b.color); break;
      case 'fence': drawFence(ctx, r.cx, r.cy, b.size, b.color); break;
      case 'fountain': drawFountain(ctx, r.cx, r.cy, b.size, b.color); break;
      case 'ice': drawIce(ctx, r.cx, r.cy, b.size, b.color); break;
      case 'snowman': drawSnowman(ctx, r.cx, r.cy, b.size, b.color); break;
      case 'stall': drawStall(ctx, r.cx, r.cy, b.size, b.color); break;
      case 'bench': drawBench(ctx, r.cx, r.cy, b.size, b.color); break;
      case 'well': drawWell(ctx, r.cx, r.cy, b.size, b.color); break;
      case 'pond': drawPond(ctx, r.cx, r.cy, b.size, b.color); break;
      case 'church': drawChurch(ctx, b, r); break;
      case 'shop':
      case 'house':
      case 'tavern':
      case 'bakery':
      case 'library':
      case 'inn':
      default:
        drawHouse(ctx, b, r);
    }
  }

  // ---- 绘制 ----
  const HOUSE_ROOFS = { house: '#5b8fae', shop: '#e8645a', tavern: '#8a5a3b', bakery: '#e89b3f', library: '#5b7a9a', inn: '#c96f5c' };
  const HOUSE_SIGNS = { tavern: '🍺', bakery: '🥖', library: '📚', inn: '🛏' };

  function drawHouse(ctx, b, r) {
    const isShop = b.type === 'shop';
    // 阴影
    ctx.fillStyle = 'rgba(30,70,100,0.18)';
    ctx.beginPath();
    ctx.ellipse(r.cx, r.y + r.h - 4, r.w * 0.45, 6, 0, 0, Math.PI * 2);
    ctx.fill();

    // 墙体
    ctx.fillStyle = b.color;
    ctx.beginPath();
    ctx.roundRect(r.x, r.y + r.h * 0.3, r.w, r.h * 0.7, 6);
    ctx.fill();
    ctx.strokeStyle = shade(b.color);
    ctx.lineWidth = 2;
    ctx.stroke();

    // 屋顶
    ctx.fillStyle = HOUSE_ROOFS[b.type] || '#5b8fae';
    ctx.beginPath();
    ctx.moveTo(r.x - 4, r.y + r.h * 0.36);
    ctx.lineTo(r.cx, r.y - r.h * 0.32);
    ctx.lineTo(r.x + r.w + 4, r.y + r.h * 0.36);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // 积雪屋顶
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.beginPath();
    ctx.moveTo(r.x - 2, r.y + r.h * 0.36);
    ctx.lineTo(r.cx, r.y - r.h * 0.26);
    ctx.lineTo(r.x + r.w + 2, r.y + r.h * 0.36);
    ctx.closePath();
    ctx.fill();

    // 门
    ctx.fillStyle = shade(b.color, 0.7);
    ctx.beginPath();
    ctx.roundRect(r.cx - r.w * 0.1, r.y + r.h * 0.72, r.w * 0.2, r.h * 0.28, 3);
    ctx.fill();

    // 窗户（商店为橱窗）
    if (isShop) {
      ctx.fillStyle = '#ffe9a8';
      ctx.beginPath();
      ctx.roundRect(r.x + r.w * 0.15, r.y + r.h * 0.5, r.w * 0.3, r.h * 0.2, 3); ctx.fill();
      ctx.beginPath();
      ctx.roundRect(r.x + r.w * 0.55, r.y + r.h * 0.5, r.w * 0.3, r.h * 0.2, 3); ctx.fill();
    } else {
      ctx.fillStyle = '#bde7f5';
      ctx.beginPath();
      ctx.roundRect(r.x + r.w * 0.18, r.y + r.h * 0.48, r.w * 0.24, r.h * 0.2, 3); ctx.fill();
      ctx.beginPath();
      ctx.roundRect(r.x + r.w * 0.58, r.y + r.h * 0.48, r.w * 0.24, r.h * 0.2, 3); ctx.fill();
    }

    // 招牌（酒馆/面包店/图书馆/旅店）
    const sign = HOUSE_SIGNS[b.type];
    if (sign) {
      ctx.fillStyle = '#7a4a2c';
      ctx.beginPath();
      ctx.roundRect(r.cx - 13, r.y + r.h * 0.55, 26, 15, 4);
      ctx.fill();
      ctx.font = '11px serif';
      ctx.textAlign = 'center';
      ctx.fillText(sign, r.cx, r.y + r.h * 0.55 + 11);
    }

    // 名称牌
    if (b.name) {
      ctx.fillStyle = 'rgba(30,60,90,0.75)';
      ctx.font = 'bold 13px "Microsoft YaHei", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(b.name, r.cx, r.y + r.h + 16);
    }
  }

  function drawTree(ctx, x, y, s, color, shadowColor, trunkColor = '#6d4a32') {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(s, s);
    // 树影
    ctx.fillStyle = 'rgba(20,60,85,0.2)';
    ctx.beginPath(); ctx.ellipse(0, 12, 18, 5, 0, 0, Math.PI * 2); ctx.fill();
    // 树干
    ctx.fillStyle = trunkColor;
    ctx.fillRect(-4, 2, 8, 16);
    // 树冠三色雪松
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(0, -18); ctx.lineTo(17, 6); ctx.lineTo(-17, 6); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#a6d6ea';
    ctx.beginPath(); ctx.arc(-6, -8, 6, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#cce9f5';
    ctx.beginPath(); ctx.arc(5, -2, 5, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  function drawLamp(ctx, x, y, s, color = '#ffd966') {
    ctx.save();
    ctx.translate(x, y + 14);
    ctx.scale(s, s);
    ctx.fillStyle = '#3b4a5c';
    ctx.fillRect(-3, -38, 6, 40);
    // 灯罩
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.roundRect(-12, -50, 24, 16, 6); ctx.fill();
    ctx.fillStyle = '#fff8cf';
    ctx.beginPath(); ctx.arc(0, -44, 6, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,240,180,0.6)';
    ctx.beginPath(); ctx.arc(0, -44, 10, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  function drawFence(ctx, x, y, s, color = '#8a5a3b') {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(s, s);
    ctx.fillStyle = color;
    ctx.fillRect(-20, -8, 40, 5);   // 上横杆
    ctx.fillRect(-20, 4, 40, 5);     // 下横杆
    ctx.fillStyle = shade(color);
    ctx.fillRect(-22, -16, 7, 26);   // 木桩
    ctx.fillRect(-8, -16, 7, 26);
    ctx.fillRect(6, -16, 7, 26);
    ctx.fillRect(20, -16, 7, 26);    // 稍微超出
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.fillRect(-22, -16, 40, 3);   // 顶部积雪
    ctx.restore();
  }

  function drawFountain(ctx, x, y, s, color = '#7ec8e3') {
    ctx.save();
    ctx.translate(x, y + 6);
    ctx.scale(s, s);
    ctx.fillStyle = 'rgba(30,70,100,0.2)';
    ctx.beginPath(); ctx.ellipse(0, 40, 30, 8, 0, 0, Math.PI * 2); ctx.fill();
    // 水池
    ctx.fillStyle = shade(color, 0.75);
    ctx.beginPath(); ctx.ellipse(0, 36, 34, 12, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = shade(color); ctx.lineWidth = 3; ctx.stroke();
    // 水
    ctx.fillStyle = '#bde9f7';
    ctx.beginPath(); ctx.ellipse(0, 36, 28, 8, 0, 0, Math.PI * 2); ctx.fill();
    // 中央喷柱
    ctx.fillStyle = shade(color, 0.6);
    ctx.fillRect(-6, 6, 12, 30);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.arc(0, 2, 10, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(0, 0, 6, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  function drawIce(ctx, x, y, s, color = '#bfe9f5') {
    ctx.save();
    ctx.translate(x, y + 12);
    ctx.scale(s, s);
    ctx.fillStyle = 'rgba(30,70,100,0.2)';
    ctx.beginPath(); ctx.ellipse(0, 22, 20, 5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.moveTo(0, -20); ctx.lineTo(18, 6); ctx.lineTo(0, 26); ctx.lineTo(-18, 6); ctx.closePath();
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.beginPath(); ctx.moveTo(0, -20); ctx.lineTo(8, -2); ctx.lineTo(0, 4); ctx.lineTo(-8, -2); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();
  }

  function drawSnowman(ctx, x, y, s, color = '#ffffff') {
    ctx.save();
    ctx.translate(x, y + 14);
    ctx.scale(s, s);
    ctx.fillStyle = 'rgba(30,70,100,0.2)';
    ctx.beginPath(); ctx.ellipse(0, 18, 16, 5, 0, 0, Math.PI * 2); ctx.fill();
    // 身体三层雪球
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.arc(0, 12, 14, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(0, -8, 11, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(0, -24, 8, 0, Math.PI * 2); ctx.fill();
    // 纽扣
    ctx.fillStyle = '#3a4557';
    for (const by of [-14, -3, 8]) {
      ctx.beginPath(); ctx.arc(0, by, 2.2, 0, Math.PI * 2); ctx.fill();
    }
    // 围巾
    ctx.fillStyle = '#e8645a';
    ctx.beginPath(); ctx.ellipse(0, -15, 8, 4, 0, 0, Math.PI * 2); ctx.fill();
    // 胡萝卜鼻子
    ctx.fillStyle = '#ff9c5a';
    ctx.beginPath(); ctx.moveTo(2, -26); ctx.lineTo(14, -24); ctx.lineTo(2, -22); ctx.closePath(); ctx.fill();
    // 眼睛
    ctx.fillStyle = '#26323f';
    ctx.beginPath(); ctx.arc(-3, -26, 1.6, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(4, -26, 1.6, 0, Math.PI * 2); ctx.fill();
    // 礼帽
    ctx.fillStyle = '#3a4557';
    ctx.fillRect(-9, -38, 18, 7);
    ctx.fillRect(-6, -44, 12, 7);
    ctx.restore();
  }

  function drawStall(ctx, x, y, s, color = '#e8a24a') {
    ctx.save();
    ctx.translate(x, y + 12);
    ctx.scale(s, s);
    ctx.fillStyle = 'rgba(30,70,100,0.2)';
    ctx.beginPath(); ctx.ellipse(0, 18, 21, 5, 0, 0, Math.PI * 2); ctx.fill();
    // 摊位底座
    ctx.fillStyle = '#8a5a3b';
    ctx.fillRect(-16, 2, 32, 16);
    // 台面
    ctx.fillStyle = shade('#8a5a3b', 1.1);
    ctx.fillRect(-18, -2, 36, 6);
    // 台面货物
    ctx.fillStyle = '#e06b6b'; ctx.fillRect(-13, -8, 7, 6);
    ctx.fillStyle = '#6ba85b'; ctx.fillRect(-4, -9, 7, 7);
    ctx.fillStyle = '#ffd966'; ctx.fillRect(5, -7, 7, 5);
    // 顶篷（主色 + 白条纹）
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.moveTo(-20, -2); ctx.lineTo(0, -24); ctx.lineTo(20, -2); ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.beginPath(); ctx.moveTo(-14, -2); ctx.lineTo(-5, -17); ctx.lineTo(-7, -2); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(-2, -2); ctx.lineTo(3, -21); ctx.lineTo(6, -2); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(10, -2); ctx.lineTo(13, -16); ctx.lineTo(15, -2); ctx.closePath(); ctx.fill();
    // 立柱
    ctx.fillStyle = '#7a4a2c';
    ctx.fillRect(-19, -2, 3, 20);
    ctx.fillRect(16, -2, 3, 20);
    ctx.restore();
  }

  function drawBench(ctx, x, y, s, color = '#9a6a45') {
    ctx.save();
    ctx.translate(x, y + 14);
    ctx.scale(s, s);
    ctx.fillStyle = 'rgba(30,70,100,0.2)';
    ctx.beginPath(); ctx.ellipse(0, 11, 16, 4, 0, 0, Math.PI * 2); ctx.fill();
    // 座面
    ctx.fillStyle = color;
    ctx.fillRect(-14, 0, 28, 5);
    // 靠背
    ctx.fillStyle = shade(color, 0.85);
    ctx.fillRect(-14, -9, 28, 4);
    // 扶手 / 靠背立柱
    ctx.fillStyle = shade(color, 1.1);
    ctx.fillRect(-14, -9, 4, 14);
    ctx.fillRect(10, -9, 4, 14);
    // 凳腿
    ctx.fillStyle = shade(color, 0.75);
    ctx.fillRect(-12, 5, 4, 6);
    ctx.fillRect(8, 5, 4, 6);
    ctx.restore();
  }

  function drawWell(ctx, x, y, s, color = '#9fb2bd') {
    ctx.save();
    ctx.translate(x, y + 16);
    ctx.scale(s, s);
    ctx.fillStyle = 'rgba(30,70,100,0.2)';
    ctx.beginPath(); ctx.ellipse(0, 14, 18, 5, 0, 0, Math.PI * 2); ctx.fill();
    // 井壁
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.ellipse(0, 2, 15, 9, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = shade(color, 0.8);
    ctx.beginPath(); ctx.ellipse(0, 0, 12, 6.5, 0, 0, Math.PI * 2); ctx.fill();
    // 井水
    ctx.fillStyle = '#a8d8f0';
    ctx.beginPath(); ctx.ellipse(0, 0, 9, 4.5, 0, 0, Math.PI * 2); ctx.fill();
    // 支架与顶棚
    ctx.fillStyle = '#8a5a3b';
    ctx.fillRect(-14, -24, 4, 26);
    ctx.fillRect(10, -24, 4, 26);
    ctx.beginPath(); ctx.moveTo(-16, -24); ctx.lineTo(0, -34); ctx.lineTo(16, -24); ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.fillRect(-12, -32, 24, 4);
    ctx.restore();
  }

  function drawPond(ctx, x, y, s, color = '#bde9f7') {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(s, s);
    // 岸沿积雪
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.beginPath(); ctx.ellipse(0, 0, 46, 34, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(180,215,235,0.7)';
    ctx.beginPath(); ctx.ellipse(0, 2, 42, 30, 0, 0, Math.PI * 2); ctx.fill();
    // 冰面
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.ellipse(0, 2, 38, 26, 0, 0, Math.PI * 2); ctx.fill();
    // 冰裂纹
    ctx.strokeStyle = 'rgba(255,255,255,0.8)';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(-20, -10); ctx.lineTo(-6, -2); ctx.lineTo(-14, 10); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(8, -14); ctx.lineTo(16, 0); ctx.lineTo(6, 12); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-4, 8); ctx.lineTo(10, 14); ctx.stroke();
    // 反光
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.beginPath(); ctx.ellipse(-10, -6, 10, 5, -0.4, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  function drawChurch(ctx, b, r) {
    // 阴影
    ctx.fillStyle = 'rgba(30,70,100,0.18)';
    ctx.beginPath(); ctx.ellipse(r.cx, r.y + r.h - 4, r.w * 0.45, 6, 0, 0, Math.PI * 2); ctx.fill();
    // 墙体
    ctx.fillStyle = b.color;
    ctx.beginPath(); ctx.roundRect(r.x, r.y + r.h * 0.32, r.w, r.h * 0.68, 6); ctx.fill();
    ctx.strokeStyle = shade(b.color); ctx.lineWidth = 2; ctx.stroke();
    // 拱形大门
    ctx.fillStyle = shade(b.color, 0.7);
    ctx.beginPath(); ctx.roundRect(r.cx - r.w * 0.09, r.y + r.h * 0.55, r.w * 0.18, r.h * 0.45, 6); ctx.fill();
    ctx.beginPath(); ctx.arc(r.cx, r.y + r.h * 0.55, r.w * 0.09, Math.PI, 0); ctx.fill();
    // 圆窗
    ctx.fillStyle = '#bde7f5';
    ctx.beginPath(); ctx.arc(r.cx - r.w * 0.28, r.y + r.h * 0.5, r.h * 0.09, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = shade(b.color, 0.7); ctx.lineWidth = 2; ctx.stroke();
    ctx.beginPath(); ctx.arc(r.cx + r.w * 0.28, r.y + r.h * 0.5, r.h * 0.09, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    // 大屋顶 + 积雪
    ctx.fillStyle = '#5b8fae';
    ctx.beginPath();
    ctx.moveTo(r.x - 5, r.y + r.h * 0.4);
    ctx.lineTo(r.cx, r.y - r.h * 0.62);
    ctx.lineTo(r.x + r.w + 5, r.y + r.h * 0.4);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.beginPath();
    ctx.moveTo(r.x - 3, r.y + r.h * 0.4);
    ctx.lineTo(r.cx, r.y - r.h * 0.56);
    ctx.lineTo(r.x + r.w + 3, r.y + r.h * 0.4);
    ctx.closePath(); ctx.fill();
    // 钟楼 + 十字架
    ctx.fillStyle = '#e8f4fa';
    ctx.fillRect(r.cx - r.w * 0.055, r.y - r.h * 0.62 - r.h * 0.32, r.w * 0.11, r.h * 0.32);
    ctx.fillStyle = '#5b8fae';
    ctx.beginPath();
    ctx.moveTo(r.cx - r.w * 0.08, r.y - r.h * 0.62 - r.h * 0.3);
    ctx.lineTo(r.cx, r.y - r.h * 0.62 - r.h * 0.48);
    ctx.lineTo(r.cx + r.w * 0.08, r.y - r.h * 0.62 - r.h * 0.3);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#e8645a';
    ctx.fillRect(r.cx - 1.5, r.y - r.h * 0.62 - r.h * 0.62, 3, r.h * 0.2);
    ctx.fillRect(r.cx - r.h * 0.06, r.y - r.h * 0.62 - r.h * 0.56, r.h * 0.12, 3);
    // 名称牌
    if (b.name) {
      ctx.fillStyle = 'rgba(30,60,90,0.75)';
      ctx.font = 'bold 13px "Microsoft YaHei", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(b.name, r.cx, r.y + r.h + 16);
    }
  }

  // 颜色变暗/变亮辅助
  function shade(hex, f = 0.8) {
    const c = hex.replace('#', '');
    const r = parseInt(c.slice(0, 2), 16) * f;
    const g = parseInt(c.slice(2, 4), 16) * f;
    const b = parseInt(c.slice(4, 6), 16) * f;
    return `rgb(${r|0},${g|0},${b|0})`;
  }

  // ---------- 编辑器叠加层（预览/选中高亮） ----------
  function drawEditorOverlay() {
    if (!Editor.active) return;
    ctx.save();
    ctx.translate(-cam.x, -cam.y);

    // 放置预览
    const ghost = Editor.previewGhost;
    if (Editor.placingType && ghost) {
      const def = BUILDING_TYPES[Editor.placingType];
      const gx = ghost.nx * TILE, gy = ghost.ny * TILE;
      ctx.fillStyle = ghost.ok ? 'rgba(110,200,120,0.35)' : 'rgba(220,90,90,0.35)';
      ctx.strokeStyle = ghost.ok ? '#3fae54' : '#c44545';
      ctx.lineWidth = 2;
      ctx.fillRect(gx, gy, def.w * TILE, def.h * TILE);
      ctx.strokeRect(gx, gy, def.w * TILE, def.h * TILE);
    }

    // 选中建筑高亮
    const sel = Editor.selected;
    if (sel) {
      const r = sel.rect();
      ctx.strokeStyle = '#ffb833';
      ctx.lineWidth = 3;
      ctx.setLineDash([6, 4]);
      ctx.strokeRect(r.x - 3, r.y - 3, r.w + 6, r.h + 6);
      ctx.setLineDash([]);
      // 锚点
      ctx.fillStyle = '#ffb833';
      for (const [ax, ay] of [[r.x, r.y], [r.x + r.w, r.y], [r.x, r.y + r.h], [r.x + r.w, r.y + r.h]]) {
        ctx.beginPath(); ctx.arc(ax, ay, 4, 0, Math.PI * 2); ctx.fill();
      }
    }

    ctx.restore();
  }

  // ---------- 渲染：寻路路径（可视化） ----------
  function drawPath() {
    if (!player.path || player.path.length === 0) return;
    ctx.save();
    ctx.translate(-cam.x, -cam.y);
    ctx.strokeStyle = 'rgba(255,190,80,0.8)';
    ctx.lineWidth = 3;
    ctx.setLineDash([7, 9]);
    ctx.beginPath();
    ctx.moveTo(player.x, player.y);
    for (const p of player.path) ctx.lineTo(p.x, p.y);
    ctx.stroke();
    ctx.setLineDash([]);
    const last = player.path[player.path.length - 1];
    ctx.fillStyle = 'rgba(255,190,80,0.9)';
    ctx.beginPath(); ctx.arc(last.x, last.y, 6, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  // ---------- 渲染：点击目标标记动画 ----------
  function drawTargetMarker() {
    if (!targetMarker) return;
    const m = targetMarker;
    ctx.save();
    ctx.translate(m.x - cam.x, m.y - cam.y);

    // 扩散回声环
    const er = 12 + ((m.t * 36) % 16);
    ctx.globalAlpha = Math.max(0, m.life) * (1 - (er - 12) / 16);
    ctx.strokeStyle = '#ffbe50';
    ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.arc(0, 0, er, 0, Math.PI * 2); ctx.stroke();

    // 呼吸脉冲环
    ctx.globalAlpha = Math.max(0, m.life);
    const r = 9 + (Math.sin(m.t * 6) + 1) * 3;
    ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.stroke();

    // 中心点
    ctx.fillStyle = '#ffbe50';
    ctx.beginPath(); ctx.arc(0, 0, 4, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  // ---------- 输入 ----------
  const keys = new Set();
  const downKeys = new Set(); // 触发型按键，防止按住重复

  // 统一按键标识：新浏览器用 e.code，老内核（如旧 Edge）没有 code，退回 keyCode 映射
  const KEYCODE_MAP = {
    87: 'KeyW', 65: 'KeyA', 83: 'KeyS', 68: 'KeyD',
    38: 'ArrowUp', 40: 'ArrowDown', 37: 'ArrowLeft', 39: 'ArrowRight',
    70: 'KeyF', 69: 'KeyE', 13: 'Enter', 32: 'Space', 16: 'ShiftLeft',
  };
  function keyName(e) {
    if (e.code) return e.code;
    return KEYCODE_MAP[e.keyCode] || '';
  }

  window.addEventListener('keydown', (e) => {
    // 正在输入表单时（改名等），键盘事件不触发游戏操作
    if (e.target && ['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target.tagName)) return;
    const code = keyName(e);
    if (!code) return;
    panHold = 0;
    if (!downKeys.has(code)) {
      keys.add(code);
      downKeys.add(code);
      if (code === 'KeyE') {
        if (scene.name === 'town') { Editor.toggle(); if (Editor.active) player.path = null; }
      }
      if (code === 'Enter') Editor.save();
      if (code === 'KeyF') {
        if (scene.name === 'town') {
          const b = buildingDoorNear();
          if (b) enterBuilding(b);
        } else if (scene.interior && scene.interior.atExit(player)) {
          exitBuilding();
        } else {
          Editor.toast(scene.name === 'town' ? '附近没有可进入的建筑' : '请先走到门口');
        }
      }
    }
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(code)) e.preventDefault();
  });
  window.addEventListener('keyup', (e) => {
    const code = keyName(e);
    if (!code) return;
    keys.delete(code);
    downKeys.delete(code);
  });
  window.addEventListener('blur', () => {
    keys.clear();
    downKeys.clear();
    panning = false;
    panStart = null;
    canvas.style.cursor = '';
  });

  // 鼠标
  function screenToWorld(e) {
    const rect = canvas.getBoundingClientRect();
    return { x: (e.clientX - rect.left) / zoom + cam.x, y: (e.clientY - rect.top) / zoom + cam.y };
  }

  // ---------- 鼠标滚轮缩放视野 ----------
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    panHold = 0;
    const factor = Math.pow(1.1, -e.deltaY / 100);
    zoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, zoom * factor));
  }, { passive: false });

  // ---------- 按住拖动平移视角 ----------
  let panning = false;
  let panStart = null;      // { mx, my, camX, camY }
  let dragMoved = false;
  let suppressClick = false;
  let panHold = 0;          // 拖动视角后保持不回正的剩余秒数
  const PAN_HOLD_TIME = 10; // 拖动松手后 10 秒内不自动回正
  const PAN_THRESHOLD = 10; // 拖动超过该距离才算平移（避免普通点击被误判）

  canvas.addEventListener('mousemove', (e) => {
    Editor.onMouseMove(e, screenToWorld(e));
    if (!panning) return;
    const dx = e.clientX - panStart.mx;
    const dy = e.clientY - panStart.my;
    if (!dragMoved && Math.hypot(dx, dy) > PAN_THRESHOLD) dragMoved = true;
    if (!dragMoved) return;
    const world = currentWorld();
    const viewW = canvas.width / devicePixelRatio / zoom;
    const viewH = canvas.height / devicePixelRatio / zoom;
    let nx = panStart.camX - dx / zoom;
    let ny = panStart.camY - dy / zoom;
    // 视野限制在世界范围内；世界小于屏幕时镜头固定在居中位置（不可平移）
    const rangeX = Math.max(0, world.width() - viewW);
    const rangeY = Math.max(0, world.height() - viewH);
    const baseX = rangeX > 0 ? 0 : (viewW - world.width()) / 2;
    const baseY = rangeY > 0 ? 0 : (viewH - world.height()) / 2;
    nx = Math.max(baseX, Math.min(baseX + rangeX, nx));
    ny = Math.max(baseY, Math.min(baseY + rangeY, ny));
    cam.x = nx;
    cam.y = ny;
    canvas.style.cursor = 'grabbing';
  });

  canvas.addEventListener('mousedown', (e) => {
    canvas.focus();
    suppressClick = false;
    Editor.onMouseDown(e, screenToWorld(e));
    if (Editor.active || transition || e.button !== 0) return;
    // 世界比屏幕小时（如屋内）无需平移
    const world = currentWorld();
    const viewW = canvas.width / devicePixelRatio / zoom;
    const viewH = canvas.height / devicePixelRatio / zoom;
    if (world.width() <= viewW && world.height() <= viewH) return;
    panning = true;
    dragMoved = false;
    panStart = { mx: e.clientX, my: e.clientY, camX: cam.x, camY: cam.y };
  });

  window.addEventListener('mouseup', () => {
    Editor.onMouseUp();
    if (panning) {
      panning = false;
      panStart = null;
      canvas.style.cursor = '';
      // 拖过视角后：松开产生的 click 不触发移动，且 10 秒内不自动回正
      if (dragMoved) {
        suppressClick = true;
        panHold = PAN_HOLD_TIME;
      }
    }
  });

  // 鼠标点击：非编辑模式下自动寻路移动；点中可进入的建筑则先走到门前再进门
  canvas.addEventListener('click', (e) => {
    if (suppressClick) { suppressClick = false; return; }
    panHold = 0;
    if (Editor.active || transition) return;
    const w = screenToWorld(e);
    if (scene.name === 'town') {
      const b = town.buildingAt(w.x, w.y);
      if (b && ENTERABLE.includes(b.type)) {
        // 已经站在门前：直接进入
        if (buildingDoorNear() === b) {
          autoEnter = null;
          enterBuilding(b);
          return;
        }
        // 否则先走到门前，到达后自动进入
        const r = b.rect();
        const path = findPath(currentWorld(), player.x, player.y, r.cx, r.y + r.h + 30);
        if (path) {
          player.setPath(path);
          autoEnter = b;
          const last = path[path.length - 1];
          targetMarker = { x: last.x, y: last.y, t: 0, life: 1 };
        }
        return;
      }
    }
    const path = findPath(currentWorld(), player.x, player.y, w.x, w.y);
    if (path) {
      player.setPath(path);
      autoEnter = null;
      const last = path[path.length - 1];
      targetMarker = { x: last.x, y: last.y, t: 0, life: 1 };
    }
  });

  // ---------- 定位按钮：立即把画面中心移动到人物 ----------
  const locateBtn = document.getElementById('locate-btn');
  locateBtn.addEventListener('click', () => {
    panHold = 0;
    const vw = canvas.width / devicePixelRatio / zoom;
    const vh = canvas.height / devicePixelRatio / zoom;
    const d = desiredCam(vw, vh);
    cam.x = d.x;
    cam.y = d.y;
    Editor.toast('已定位到人物');
  });

  // ---------- 编辑面板 / 模板按钮 ----------
  const ed = Editor._dom;
  ed.btnSave.addEventListener('click', (e) => { e.stopPropagation(); Editor._applyPanel(); });
  ed.btnDelete.addEventListener('click', (e) => { e.stopPropagation(); Editor._deleteSelected(); });
  ed.panelClose.addEventListener('click', (e) => { e.stopPropagation(); Editor.clearSelection(); });
  // 面板点击不触发底层 canvas 鼠标事件（通过 stopPropagation 已挡）；再兜底：面板上按下时停用画布
  ed.panel.addEventListener('mousedown', (e) => e.stopPropagation());
  ed.palette.addEventListener('mousedown', (e) => e.stopPropagation());
  // 大小滑块实时
  ed.propSize.addEventListener('input', () => {
    ed.propSizeVal.textContent = parseFloat(ed.propSize.value).toFixed(1);
    if (Editor.selected) {
      Editor.selected.size = parseFloat(ed.propSize.value);
      ed.panelTitle.textContent = '编辑 · ' + Editor.selected.name;
    }
  });

  Editor.buildPalette();

  // toast（复用 editor 的 toast）
  function toast(msg) { Editor.toast(msg); }

  // ---------- 主循环 ----------
  let last = performance.now();
  function loop(now) {
    const dt = Math.max(0, Math.min((now - last) / 1000, 0.05));
    last = now;
    const vw = canvas.width / devicePixelRatio;
    const vh = canvas.height / devicePixelRatio;
    const viewW = vw / zoom;   // 可见世界范围（受缩放影响）
    const viewH = vh / zoom;

    // 应用缩放基础变换（世界坐标 → 屏幕 = 坐标 * zoom）
    ctx.setTransform(devicePixelRatio * zoom, 0, 0, devicePixelRatio * zoom, 0, 0);

    updateTransition(dt);

    // 过渡中不移动，也不更新门提示
    if (!transition) {
      if (panHold > 0) panHold -= dt;
      const hadKeys = keys.size > 0;
      player.update(dt, keys, currentWorld());
      if (hadKeys) autoEnter = null; // 手动移动打断后取消自动进门
      // 点击建筑后：走到门前且路径走完，自动进入
      if (autoEnter && (!player.path || player.path.length === 0)) {
        const b = autoEnter;
        autoEnter = null;
        if (scene.name === 'town' && buildingDoorNear() === b) enterBuilding(b);
      }
      if (!panning && panHold <= 0) updateCamera(viewW, viewH, dt);
      updateDoorHint();
    }

    // 目标标记：寻路结束（到达或被打断）后淡出
    if (targetMarker) {
      if (player.path && player.path.length) {
        targetMarker.t += dt;
      } else {
        targetMarker.life -= dt * 2.5;
        if (targetMarker.life <= 0) targetMarker = null;
      }
    }

    // 渲染
    if (scene.name === 'town') {
      drawGround();
      drawDecorTrees();
      drawBuildings();
      drawEditorOverlay();
    } else {
      // 屋内场景
      ctx.fillStyle = '#cfe3ee';
      ctx.fillRect(0, 0, viewW, viewH);
      scene.interior.draw(ctx, cam, player);
    }
    player.draw(ctx, cam);
    drawPath();
    drawTargetMarker();

    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);

  // 启动时尝试加载存档
  if (!Editor.load()) console.log('新建小镇');

  // 调试钩子（测试用）
  window.__icetown = { scene, player, cam, currentWorld, enterBuilding, exitBuilding, buildingDoorNear };
})(window);