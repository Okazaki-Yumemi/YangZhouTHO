# 扬州 THO02 阵营探索

当前仓库保留了早期微信小程序骨架，但现在主用的是本地网站版。

## 现在怎么跑

1. 在项目根目录打开终端
2. 运行：

```bash
npm start
```

3. 浏览器打开：

```text
http://127.0.0.1:3000
```

## 网站版特性

- 注册、体力恢复、行动结算、随机事件都保留
- 不依赖微信云开发
- 自动使用 `shared/seeds` 里的测试数据初始化
- 本地状态保存在 `data/state.json`

## 测试门票码

可直接使用：

- `TEST0001`
- `TEST0002`
- `TEST0003`
- `TEST0004`
- `TEST0005`

更多测试码见 [shared/seeds/ticket-codes.json](G:\Programming\Small_interests_projects\Yangzhou-THO\shared\seeds\ticket-codes.json)。

## 目录

- `web/`: 网站版前端和本地 Node 服务
- `shared/`: 共用业务规则和默认种子数据
- `pictures/`: 角色立绘资源
- `data/`: 网站版运行时生成的本地状态
- `miniprogram/`: 旧的小程序前端骨架
- `cloudfunctions/`: 旧的云函数骨架

## 重置数据

网站右下角有 `重置测试数据` 按钮。

如果你想手工重置，也可以删除 [data/state.json](G:\Programming\Small_interests_projects\Yangzhou-THO\data\state.json) 后重新执行 `npm start`。

## 本地测试

```bash
node scripts/run-tests.js
```
