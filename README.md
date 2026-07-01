<img width="846" height="1193" alt="扬州 THO02 阵营探索页面截图" src="https://github.com/user-attachments/assets/248f7bb9-d9a8-42f7-bdc8-3884f304e735" />

# 扬州 THO02 阵营探索

这是一个面向线下活动的本地运行网页系统，包含玩家端和管理员端。玩家通过门票码注册、选择阵营、消耗体力执行行动并获得积分；管理员可以搜索玩家、发放活动奖励、恢复体力、重置账号状态并进行现场抽奖。

项目不依赖数据库，运行状态会写入本地 JSON 文件，适合在活动现场用一台电脑快速部署和管理。

## 功能概览

玩家端：

- 使用门票码注册，并设置昵称和密码。
- 在「琪露诺探索小队」和「大妖精探索小队」之间选择阵营。
- 执行随机行动，结算个人积分、阵营积分和体力。
- 触发随机特殊事件，例如恢复体力、额外加分、反转分数等。
- 查看阵营战况、排行榜和自己的最近行动记录。
- 移动端优先布局，适合手机扫码后访问。

管理员端：

- 使用本地管理员口令登录。
- 按用户 ID、门票码或昵称搜索玩家。
- 手动加分、恢复体力、重置密码、重置登录 ID。
- 发放舞台互动、小游戏和摊位奖励。
- 控制一次性奖励和摊位奖励的领取限制。
- 执行现场抽奖，并显示抽奖动画和中奖玩家信息。
- 在危险操作区重置活动数据，重置前需要二次确认并再次输入管理员口令。

## 快速开始

项目只需要 Node.js，不需要安装额外 npm 依赖。

```bash
npm start
```

启动后访问：

- 玩家端：[http://127.0.0.1:3000](http://127.0.0.1:3000)
- 管理员端：默认是 [http://127.0.0.1:3000/staff-only-admin.html](http://127.0.0.1:3000/staff-only-admin.html)

如需运行测试：

```bash
npm test
```

测试通过时会输出：

```text
All tests passed
```

## 管理员配置

管理员入口和口令保存在 `data/admin.local.json`。第一次启动时，如果该文件不存在，服务会自动生成默认配置：

```json
{
  "password": "THOADMIN",
  "entryPath": "/staff-only-admin.html"
}
```

字段说明：

- `password`：管理员登录口令。
- `entryPath`：管理员后台的本地访问路径。服务会拦截真实的 `/admin.html`，只能通过这里配置的入口访问。

活动正式使用前，建议修改默认口令和后台入口路径。

## 测试门票码

当前种子数据内置了一组可直接注册的测试门票码：

- `TEST0001`
- `TEST0002`
- `TEST0003`
- `TEST0004`
- `TEST0005`

完整门票码列表见 [`shared/seeds/ticket-codes.json`](shared/seeds/ticket-codes.json)。

## 数据存储

运行时数据保存在 `data/` 目录：

- `data/state.json`：玩家、队伍积分、领取记录、日志、会话等运行状态。
- `data/admin.local.json`：本地管理员口令和后台入口配置。

这两个文件已加入 `.gitignore`，默认不会提交到仓库。

如需重置本地测试数据，可以停止服务后删除 `data/state.json`，再重新执行：

```bash
npm start
```

也可以登录管理员后台，在「危险操作」区域点击红色的「重置全部数据」，展开确认区后再次输入管理员口令完成重置。玩家端不提供重置入口，公开 API 也不接受玩家直接重置数据。

## 目录结构

```text
.
├── data/                  # 本地运行时数据，不提交
├── pictures/              # 原始角色立绘素材
├── scripts/               # 种子数据和测试脚本
├── shared/                # 前后端共享规则、认证工具和活动配置
│   └── seeds/             # 队伍、行动、随机事件、称号、门票码配置
└── web/
    ├── server.js          # 本地 Node HTTP 服务和 API
    └── public/            # 静态前端页面、脚本、样式和角色图片
```

## 活动规则配置

主要规则都在 `shared/seeds/` 下维护：

- `activity-config.json`：注册开关、行动开关、体力上限、体力恢复间隔、随机事件概率、阵营人数差限制。
- `teams.json`：阵营初始信息和角色图路径。
- `actions-config.json`：玩家可执行行动、权重、消耗和结算规则。
- `random-events-config.json`：随机事件、权重和效果。
- `titles-config.json`：积分称号阈值。
- `ticket-codes.json`：门票码池。

修改规则后，如果本地已经生成过 `data/state.json`，需要删除该文件后重启，才能让新的种子配置完整生效。

## 前端美术资源

玩家端使用 `web/public/characters/` 中的 PNG 立绘。当前角色图已在 `web/public/app.js` 中登记尺寸、展示名和配色，用于：

- 给首屏队伍角色图设置 preload 和 eager loading。
- 给动态渲染的角色图写入 `width`、`height`、`loading` 和 `decoding` 属性，减少布局抖动。
- 使用统一的 `.character-frame` 画框展示立绘，避免角色被裁切。
- 按角色设置轻量背景色和边框色，让不同角色卡片有区别但不破坏整体 UI。

新增或替换立绘时，请同步更新：

1. `web/public/characters/` 下的图片文件。
2. `web/public/app.js` 里的 `CHARACTER_ASSETS` 元数据。
3. 如需更换队伍角色或事件角色，同步调整 `TEAM_META` 或 `EVENT_META`。

## 常用开发命令

```bash
# 启动本地服务
npm start

# 运行规则和认证测试
npm test
```

## 维护注意事项

- 不要提交 `data/state.json` 和 `data/admin.local.json`。
- 正式活动前请修改管理员默认口令。
- 修改门票码、活动规则或队伍初始数据后，先备份并重置本地运行状态。
- 玩家昵称来自现场输入，前端渲染时需要继续保持 HTML 转义，不要直接拼接未处理的用户内容。
- 角色图建议保持透明背景 PNG，单张图片控制在 1 MB 以内，优先保证移动端加载速度。
