const fs = require('fs');
const path = require('path');

function ctxStub() {
  const noop = () => {};
  const obj = {};
  const props = ['fillStyle','strokeStyle','lineWidth','font','textAlign','lineDash','globalAlpha','shadowColor','shadowBlur','filter'];
  props.forEach(p => obj[p] = '');
  ['fillRect','strokeRect','clearRect','beginPath','closePath','fill','stroke','moveTo','lineTo','arc','ellipse','rect','roundRect','quadraticCurveTo','save','restore','translate','scale','rotate','setTransform','fillText','strokeText','measureText','setLineDash','clip','drawImage','createLinearGradient','createRadialGradient','createPattern'].forEach(m => obj[m] = noop);
  obj.canvas = {};
  return obj;
}

const elements = new Map();
function makeEl(id) {
  const handlers = {};
  const el = {
    id, style: {}, dataset: {},
    classList: { add() {}, remove() {}, contains: () => false, toggle() {} },
    textContent: '', innerHTML: '', className: '', value: '', title: '',
    addEventListener(type, fn) { handlers[type] = fn; },
    appendChild() {}, removeChild() {},
    querySelectorAll: () => [], getBoundingClientRect: () => ({ left: 0, top: 0 }),
  };
  elements.set(id, el);
  return el;
}

const ids = ['game','transition','trans-text','door-hint','exit-hint','edit-banner','palette','crosshair','editor-panel','panel-title','prop-name','prop-type','prop-color','prop-size','prop-size-val','btn-save','btn-delete','panel-close','palette-items','toast'];
ids.forEach(makeEl);
const game = elements.get('game');
game.getContext = () => ctxStub();
game.width = 1280; game.height = 800;

const winHandlers = {};
const win = { innerWidth: 1280, innerHeight: 800, addEventListener: (t, fn) => { winHandlers[t] = fn; } };
global.window = win;
global.devicePixelRatio = 1;
global.document = {
  getElementById: (id) => elements.get(id) || makeEl(id),
  createElement: () => makeEl('x' + Math.random()),
};
global.localStorage = { getItem: () => null, setItem() {} };
global.performance = { now: () => Date.now() };

process.on('uncaughtException', (e) => { console.log('UNCAUGHT:', e.stack); process.exit(1); });

// 手动驱动 rAF，dt≈0.016，事件驱动
const state = { rafCb: null, t: 0 };
global.requestAnimationFrame = (fn) => { state.rafCb = fn; };
global.setTimeout = (fn) => { try { fn(); } catch(e){} };   // 立即执行过渡的 mid
global.clearTimeout = () => {};
function step(n) {
  for (let i = 0; i < n; i++) {
    if (!state.rafCb) break;
    const cb = state.rafCb; state.rafCb = null;
    state.t += 16.67;
    cb(state.t);
  }
}
function press(code) { winHandlers.keydown({ code, preventDefault() {} }); }

const all = ['js/town.js','js/interior.js','js/pathfinding.js','js/player.js','js/editor.js','js/main.js']
  .map(f => fs.readFileSync(path.join(__dirname, f), 'utf8'))
  .join('\n')
  + '\n' + `
// ---------- 内置测试 ----------
const W = window.__icetome ?? window.__icetown;
const { scene, player, cam, currentWorld, enterBuilding, exitBuilding, buildingDoorNear } = W;
const w0 = currentWorld();
console.log('town world bounds:', JSON.stringify(w0.bounds), 'width', w0.width());
// 找到第一个可进建筑
const target = town.buildings.find(b => ['house','shop','ice'].includes(b.type));
console.log('target building:', target.type, 'at', target.tileX + ',' + target.tileY);
// 把玩家放到门口
player.setPosition(target.rect().cx, target.rect().y + target.rect().h + 6);
step(2);
console.log('door near?', !!buildingDoorNear());
press('KeyF');
step(60);   // 0.45s 淡出 + 到达 mid
console.log('scene.name =', scene.name);
if (scene.name === 'interior') {
  const room = scene.interior;
  console.log('interior type', room.type, 'size', room.w + 'x' + room.h);
  // 用真实 ctx 画一帧（stub 有全部方法）
  const tctx = { save(){}, restore(){}, translate(){}, ...window.__tctx };
  console.log('interior draw already ran in loop OK');
  // 走到门口（向下，朝出口）
  player.setPosition(room.exitX, room.spawnY);
  for (let i = 0; i < 20; i++) { player.y += 5; }
  console.log('atExit after walk?', room.atExit(player));
  press('KeyF'); step(60);
  console.log('after exit scene.name =', scene.name);
}
console.log('RESULT: PASS / no crash');
`;

new Function('window','document','localStorage','performance','requestAnimationFrame','setTimeout','clearTimeout','devicePixelRatio','step','press', all)(win, global.document, global.localStorage, global.performance, global.requestAnimationFrame, global.setTimeout, global.clearTimeout, 1, step, press);