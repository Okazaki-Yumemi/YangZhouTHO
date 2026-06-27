<img width="846" height="1193" alt="ScreenShot_2026-06-27_102817_237" src="https://github.com/user-attachments/assets/248f7bb9-d9a8-42f7-bdc8-3884f304e735" />

# 扬州 THO02 阵营探索

这是一个本地运行的活动网站，分为玩家端和管理员端。

玩家端支持：

- 门票码注册
- 选择队伍
- 随机行动与特殊事件结算
- 体力恢复倒计时
- 手机优先的浏览体验

管理员端支持：

- 按玩家编号、门票码、昵称搜索
- 手动加分
- 恢复体力
- 发放小游戏奖励
- 发放摊位奖励

## 运行

在项目根目录打开终端后执行：

```bash
npm start
```

启动后访问：

- 玩家端：[http://127.0.0.1:3000](http://127.0.0.1:3000)
- 管理员端：`data/admin.local.json` 中配置的本地入口地址

默认本地管理员配置文件：

```json
{
  "password": "THOADMIN",
  "entryPath": "/staff-only-admin.html"
}
```

如果保持默认配置，管理员地址就是：

```text
http://127.0.0.1:3000/staff-only-admin.html
```

## 测试数据

可直接使用这些测试门票码：

- `TEST0001`
- `TEST0002`
- `TEST0003`
- `TEST0004`
- `TEST0005`

更多测试门票码见 [shared/seeds/ticket-codes.json](G:\Programming\Small_interests_projects\Yangzhou-THO\shared\seeds\ticket-codes.json)。

## 数据存储

- 运行状态保存在 [data/state.json](G:\Programming\Small_interests_projects\Yangzhou-THO\data\state.json)
- 本地管理员配置保存在 [data/admin.local.json](G:\Programming\Small_interests_projects\Yangzhou-THO\data\admin.local.json)

这两个文件都已经加入 `.gitignore`，不会默认提交。

## 目录结构

- `web/`：网站前端和本地 Node 服务
- `shared/`：共享规则、种子数据、活动配置
- `pictures/`：角色立绘资源
- `scripts/`：测试脚本
- `data/`：本地运行时数据

## 重置本地数据

如需清空测试进度，删除 [data/state.json](G:\Programming\Small_interests_projects\Yangzhou-THO\data\state.json) 后重新执行：

```bash
npm start
```

## 测试

```bash
npm test
```
