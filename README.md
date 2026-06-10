# auth_log_exp

这是从 Linksee 中复制出来的登录实验目录。目标是保留登录、认证路由、失败锁定、日志记录和最小启动流程，不带课程、作业、聊天、评分等业务模块，也不改动原仓库。

## 目录作用

- `public/`：登录页面和最小前端资源。当前页面包含用户名、密码、来源 IP 输入。
- `src/`：后端核心源码。当前包含启动入口、日志输出和认证路由挂载逻辑。
- `src/auth/`：认证相关子模块。当前放失败锁定、用户仓库、token 服务和认证路由。
- `data/`：实验用测试数据。当前保存测试用户表，密码以哈希形式存储。
- `logs/`：运行时日志目录。服务会把 JSONL 格式日志追加到这里。
- `scripts/`：实验辅助脚本。当前放种子脚本，日志解析脚本预留到后续实现。
- `db/`：数据库初始化脚本与结构说明。Docker 环境里只保留数据库服务，不放 MinIO 和 Redis。
- `tests/`：占位目录，当前不放测试用例，按你的要求留到后续再补。

## 当前文件的详细作用

- `public/login.html`：初始登录 UI，收集用户名、密码、来源 IP，并提交登录请求。
- `src/server.js`：实验服务主入口，负责启动、关闭、异常捕获、静态页面服务、认证路由转发和日志写入。
- `src/logger.js`：把安全事件写入 `logs/app.jsonl`，使用 JSON Lines 便于后续统计和解析。
- `src/auth/login-rate-limit.js`：连续失败锁定逻辑，默认 5 次失败后锁定 15 分钟。
- `src/auth/user-store.js`：本地用户仓库，负责加载、查询、更新和持久化 `data/users.json`。
- `src/auth/token-service.js`：访问令牌和刷新令牌逻辑，使用内存态刷新令牌存储。
- `src/auth/auth-router.js`：认证路由，迁移登录、刷新、登出和锁定闭环。
- `data/users.json`：测试用户表，当前已经种子化为可直接使用的哈希密码数据。
- `scripts/seed-users.js`：把 `data/users.json` 中的 `passwordSeed` 转成 `passwordHash`。
- `scripts/parse-logs.js`：当前保留为后续实现的占位脚本。
- `Dockerfile`：保留给后续可选的应用容器镜像构建。
- `docker-compose.yml`：当前只保留数据库服务，不包含 MinIO、Redis 或其它和登录无关的服务。

## 存储逻辑

- 用户数据：放在 `data/users.json`，由 `src/auth/user-store.js` 负责加载和持久化。
- 登录成功/失败/锁定日志：追加写入 `logs/app.jsonl`，每行一条 JSON，便于脚本解析。
- 数据库：放在 `db/` 对应的初始化脚本里，Docker 只启动数据库
- 前端页面：只保留登录页，登录成功后不跳复杂业务页，避免把无关模块带进实验。

## 运行思路

- 启动服务后访问 `/` 或 `/login.html`。
- 登录请求提交到 `/api/v1/auth/login`。
- 成功、失败、锁定、刷新、登出、启动、关闭、异常都会写入 `logs/app.jsonl`。
- 连续失败达到阈值后，账号会在内存锁定窗口内拒绝登录。
