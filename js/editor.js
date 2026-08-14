/* ============================================================
   Ice Town · editor.js
   编辑模式：选择/拖动/新建/删除建筑，属性面板
   ============================================================ */

const Editor = (() => {
  const dom = {
    banner: document.getElementById('edit-banner'),
    crosshair: document.getElementById('crosshair'),
    panel: document.getElementById('editor-panel'),
    panelTitle: document.getElementById('panel-title'),
    palette: document.getElementById('palette'),
    paletteItems: document.getElementById('palette-items'),
    toast: document.getElementById('toast'),
    // 属性
    propName: document.getElementById('prop-name'),
    propType: document.getElementById('prop-type'),
    propColor: document.getElementById('prop-color'),
    propSize: document.getElementById('prop-size'),
    propSizeVal: document.getElementById('prop-size-val'),
    btnSave: document.getElementById('btn-save'),
    btnDelete: document.getElementById('btn-delete'),
    panelClose: document.getElementById('panel-close'),
  };

  let active = false;           // 是否处于编辑模式
  let selected = null;          // 选中建筑
  let placingType = null;       // 待放置的新建筑类型
  let dragging = false;         // 拖动选中建筑
  let dragOffset = null;        // 鼠标到建筑左上角的像素偏移
  let previewGhost = null;      // 放置时的预览
  let toastTimer = null;

  // 自己的 toast（editor 内直接使用，避免依赖 main 的闭包）
  function toast(msg) {
    const el = dom.toast;
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 1600);
  }

  // ---------- 模板面板 ----------
  function buildPalette() {
    dom.paletteItems.innerHTML = '';
    for (const key of Object.keys(BUILDING_TYPES)) {
      const el = document.createElement('div');
      el.className = 'palette-item';
      el.title = BUILDING_TYPES[key].name;
      el.textContent = BUILDING_TYPES[key].icon;
      el.addEventListener('click', (e) => { e.stopPropagation(); selectTemplate(key, el); });
      el.dataset.type = key;
      dom.paletteItems.appendChild(el);
    }
  }

  function selectTemplate(type, el) {
    placingType = type;
    dom.paletteItems.querySelectorAll('.palette-item').forEach(i => i.classList.remove('selected'));
    el.classList.add('selected');
    toast('选择 ' + BUILDING_TYPES[type].name + '，在地面点击放置');
  }

  // ---------- 进入/退出编辑模式 ----------
  function enter() {
    active = true;
    dom.banner.classList.remove('hidden');
    dom.palette.classList.remove('hidden');
    dom.crosshair.classList.add('on');
    closePanel();
  }

  function exit() {
    active = false;
    dom.banner.classList.add('hidden');
    dom.palette.classList.add('hidden');
    dom.crosshair.classList.remove('on');
    dom.crosshair.classList.remove('active');
    closePanel();
    placingType = null;
    selected = null;
    previewGhost = null;
  }

  function toggle() { active ? exit() : enter(); }

  // ---------- 选择 / 取消选择 ----------
  function select(b) {
    selected = b;
    dragging = false;
    openPanelFor(b);
  }

  function clearSelection() {
    selected = null;
    dragging = false;
    closePanel();
  }

  // ---------- 属性面板 ----------
  function openPanelFor(b) {
    dom.panel.classList.remove('hidden');
    dom.panelTitle.textContent = '编辑 · ' + b.name;
    dom.propName.value = b.name;
    dom.propType.value = b.type;
    dom.propColor.value = b.color;
    dom.propSize.value = b.size;
    dom.propSizeVal.textContent = b.size.toFixed(1);
  }

  function closePanel() {
    dom.panel.classList.add('hidden');
  }

  function applyPanelToSelected() {
    if (!selected) return;
    // 更改建筑类型（需校验新尺寸不越界、不与其他建筑重叠）
    const newType = dom.propType.value;
    if (newType !== selected.type) {
      const def = BUILDING_TYPES[newType];
      if (selected.tileX + def.w <= town.tilesW && selected.tileY + def.h <= town.tilesH &&
          !town.isOccupiedExcluding(selected.tileX, selected.tileY, def.w, def.h, selected)) {
        selected.type = newType;
      } else {
        toast('这里放不下 ' + BUILDING_TYPES[newType].name + '，类型未更改');
        dom.propType.value = selected.type;
      }
    }
    selected.name = dom.propName.value.trim() || BUILDING_TYPES[selected.type].name;
    selected.color = dom.propColor.value;
    selected.size = parseFloat(dom.propSize.value);
    dom.panelTitle.textContent = '编辑 · ' + selected.name;
    toast('已更新建筑');
  }

  // ---------- 鼠标交互 ----------
  function onMouseMove(e, world) {
    const { x, y } = world;
    // 准星跟随
    dom.crosshair.style.left = e.clientX + 'px';
    dom.crosshair.style.top = e.clientY + 'px';

    if (selected && dragging && dragOffset) {
      // 拖动建筑，吸附到网格
      const nx = Math.round((x - dragOffset.x) / TILE);
      const ny = Math.round((y - dragOffset.y) / TILE);
      const def = selected.def;
      if (nx >= 0 && ny >= 0 && nx + def.w <= town.tilesW && ny + def.h <= town.tilesH) {
        if (!town.isOccupiedExcluding(nx, ny, def.w, def.h, selected)) {
          selected.tileX = nx;
          selected.tileY = ny;
        }
      }
    }

    if (placingType) {
      // 预览放置
      const def = BUILDING_TYPES[placingType];
      const nx = Math.floor(x / TILE - (def.w - 1) / 2);
      const ny = Math.floor(y / TILE - (def.h - 1) / 2);
      const ok = nx >= 0 && ny >= 0 && nx + def.w <= town.tilesW && ny + def.h <= town.tilesH &&
                 !town.isOccupied(nx, ny, def.w, def.h);
      previewGhost = { nx, ny, ok };
    }

    // 当前指向
    const under = town.buildingAt(x, y);
    if (under && under !== selected) {
      dom.crosshair.classList.add('active');
    } else if (!placingType) {
      dom.crosshair.classList.remove('active');
    }
  }

  function onMouseDown(e, world) {
    if (!active) return;
    const { x, y } = world;

    // 放置新建筑
    if (placingType) {
      if (previewGhost && previewGhost.ok) {
        const b = town.addBuilding(placingType, previewGhost.nx, previewGhost.ny, {
          color: '#7ec8e3', size: 1.0,
        });
        toast('已放置 ' + b.name);
        placingType = null;
        dom.paletteItems.querySelectorAll('.palette-item').forEach(i => i.classList.remove('selected'));
      } else {
        toast('这里不能放置');
      }
      return;
    }

    // 选择建筑 / 开始拖动
    const under = town.buildingAt(x, y);
    if (under) {
      select(under);
      dragging = true;
      dragOffset = { x: x - under.px, y: y - under.py };
      dom.crosshair.classList.add('active');
    } else {
      clearSelection();
      dom.crosshair.classList.remove('active');
    }
  }

  function onMouseUp() { dragging = false; dragOffset = null; }

  // ---------- 删除 ----------
  function deleteSelected() {
    if (!selected) return;
    const name = selected.name;
    town.removeBuilding(selected);
    clearSelection();
    toast('已删除 ' + name);
  }

  // ---------- 保存 / 加载 ----------
  // file:// 或隐私模式下 localStorage 可能被浏览器限制，访问都包一层 try/catch
  const SAVE_KEY = 'icetown_save_v1';
  const store = {
    get(k) {
      try { return localStorage.getItem(k); } catch (e) { return null; }
    },
    set(k, v) {
      try { localStorage.setItem(k, v); } catch (e) { /* 忽略：存储不可用时仅本次会话生效 */ }
    },
  };
  function save() {
    store.set(SAVE_KEY, town.toJSON());
    toast('已保存到本地');
  }
  function load() {
    const d = store.get(SAVE_KEY);
    if (d && town.fromJSON(d)) {
      toast('已加载存档');
      return true;
    }
    return false;
  }

  // ---------- API ----------
  return {
    get active() { return active; },
    get selected() { return selected; },
    get placingType() { return placingType; },
    get previewGhost() { return previewGhost; },
    buildPalette, enter, exit, toggle,
    select, clearSelection,
    onMouseMove, onMouseDown, onMouseUp,
    save, load, toast,
    _applyPanel: applyPanelToSelected,
    _deleteSelected: deleteSelected,
    _dom: dom,
  };
})();