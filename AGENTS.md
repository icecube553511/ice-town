# Ice Town 冰雪小镇

纯前端 2D Canvas 冰雪小镇沙盒游戏。直接双击 `index.html` 运行（无需构建工具）。

## 项目结构

- `index.html` — 页面入口（HUD、提示、编辑面板、定位按钮）
- `css/style.css` — UI 样式
- `js/town.js` — 小镇地图数据与建筑类型
- `js/interior.js` — 屋内场景（8 种房间布局）
- `js/pathfinding.js` — 网格 A* 寻路
- `js/player.js` — 玩家移动/碰撞/绘制
- `js/editor.js` — 编辑模式
- `js/main.js` — 主循环、摄像机、输入、渲染
- `harness.js` — Node 无浏览器测试

## 测试

```powershell
node harness.js
```

## Git 工作流（必须遵守）

每次更新都必须走 PR 流程，创建后自动合并到 `main`：

```powershell
git checkout main
git pull
git checkout -b <分支名>          # 例如 update/xxx 或 feat/xxx
git add -A
git commit -m "更新说明"
git push -u origin <分支名>
gh pr create --fill               # 或带 --title/--body
gh pr merge --merge --delete-branch
git checkout main
git pull
```

注意：本仓库已配置了仅限本仓库的代理（`http://127.0.0.1:7897`），
直连 GitHub 不通时不要移除该配置。
