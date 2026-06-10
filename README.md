# auth_log_exp

轻量级登录实验项目（实验 3）。目标：提供可运行的登录服务、统一的 syslog 风格文本日志、固定测试账户，以及便于后续解析的工具和测试用例。

## Overview

本仓库实现了：

- 一个最小的登录服务（前端 `public/login.html` + 后端 `src/server.js`）。
- 认证逻辑（`src/auth`），包含密码校验、失败计数与账户锁定、access/refresh token 管理。
- 单一的 syslog 风格日志输出（`logs/login_app.log`），字段结构便于后续解析为 CSV/JSON。
- 可在本地使用 `data/users.json` 运行，也可通过 Docker 启动并在容器中使用 Postgres（由 `db/init.sql` 提供固定测试账号）。

## Quick Start

### Docker

1. 在项目根目录构建并启动服务：

```bash
docker-compose up --build -d
```

2. 访问前端：

打开 http://localhost:3004 或 http://127.0.0.1:3004/login.html

3. 查看日志：

```bash
tail -f logs/login_app.log
```

### Local (no Docker)

1. 安装依赖：

```bash
npm install
```

2. 启动服务：

```bash
PORT=3004 node src/server.js
```

3. 访问前端： http://localhost:3004/login.html

## Testing & Logs

### Logs auto-generation

- 日志文件 `logs/login_app.log` 由后端 `src/logger.js` 自动写入：服务启动、认证成功/失败、账户锁定、输入校验错误与服务异常等事件都会追加到该文件。启动服务前请确保项目根目录下存在 `logs/` 目录（项目启动时通常会自动创建）。

### Test accounts

固定测试账号已写入 `db/init.sql`（并同步到 `data/users.json`），示例：

- `2024000001` / `Study2026!`
- `2024000002` / `UniAccess#1`
- `2024000003` / `Welcome2026$`
- `2024000004` / `SecurePass88`
- `2024000005` / `Campus2026!`

### Quick test scripts

- `node scripts/run_tests.js`：模拟若干登录请求并触发锁定.\
- `node tests/smoke.js`：本地 smoke 测试（检查 logger 输出）。

### 常用测试方法与命令

- 冒烟（快速验通）：启动服务后运行最小验证脚本，确认服务能写入日志并返回基本响应：

```bash
npm install
node src/server.js        # 或使用 PORT=3004 node src/server.js
node tests/smoke.js
```

- 批量/场景化测试（生成用于分析的日志）：编辑 `scripts/run_tests.js` 中的参数（总请求数、并发、失败比率、是否并发），然后运行：

```bash
node scripts/run_tests.js
```

- 在 Docker 模式下（服务在容器内写日志到容器的 `logs/`），使用 `docker-compose up --build -d` 启动后，可在宿主机查看挂载的 `logs/login_app.log`：

```bash
docker-compose up --build -d
tail -f logs/login_app.log
```

- 解析日志为结构化数据（JSON/CSV），用于实验四：

```bash
python3 scripts/parse_logs.py logs/login_app.log --format json   # 输出 JSON 到 stdout
python3 scripts/parse_logs.py logs/login_app.log --format csv > parsed.csv
```

### 建议的测试规模与样本构成

- 小规模：100 用户，~500 次请求（功能验证）
- 中等规模：1,000 用户，~10,000 次请求（统计分析、ML 特征提取）
- 大规模：10,000+ 用户，≥100,000 次请求（压力与异常检测评估）
- 示例行为比例（可在 `scripts/run_tests.js` 中调整）

  - 正常：90%（成功登录）
  - 探测/凭证填充：6%（中等失败频率）
  - 单源暴力：3%（高频失败，触发锁定）
  - 分布式慢速：1%（大量 IP 低频失败）

### 注意事项

- 本地（非 Docker）模式使用 `data/users.json`，频繁并发写入可能造成文件竞态；若要做高并发/长时间测试，请使用 Docker 模式并启用数据库（`USE_DB=true`）。

### Log parsing

- `python3 scripts/parse_logs.py`：解析 `logs/login_app.log`，输出 JSON 并写入 `logs/parsed_logs.csv`。

日志示例：

```
2026-06-10T12:05:12.345Z myhost login_app: level=INFO event_type=auth_success user=2024000001 src_ip=127.0.0.1 message="login success"
```

## Architecture

### Project layout

- `public/` — 前端登录页面。\
- `src/` — 后端源码（入口：`src/server.js`；日志：`src/logger.js`；认证子模块在 `src/auth/`）。\
- `data/` — 本地用户数据（仅在非 Docker 模式下使用）。\
- `db/` — Postgres 初始化脚本（用于 Docker 模式）。\
- `logs/` — 运行时日志（`login_app.log`）。\
- `scripts/` — 辅助脚本（解析、测试）。

### `src/auth` 目录（关键文件）

- `auth-router.js`：处理 `/api/v1/auth/*` 路由，负责输入校验、锁定检查、密码验证、token 签发、更新最后登录时间，并在每个关键点写日志（成功/失败/锁定/非法输入）。日志字段统一为 `user` 与 `src_ip`。
- `login-rate-limit.js`：实现内存失败计数与锁定（默认 5 次失败 → 锁定 15 分钟）。\
- `user-store.js`：提供两种后端：本地 JSON（`data/users.json`）与 Postgres（当环境变量 `USE_DB=true` 时）。对外提供 `findUser` / `updateUser`（异步兼容）。\
- `token-service.js`：签发 HMAC 签名的 access token，并用内存 Map 管理一次性 refresh token。

## Security & Notes

- 主日志禁止记录明文密码或完整 tokens。\
- 日志包含失败原因标签（`password_mismatch`、`user_not_found_or_disabled`、`validation_failed`、`too_many_failures` 等），便于后续分析。\
- 如果需要更强的持久性或生产级安全，请将 refresh token 存储迁移到持久存储（DB/Redis），并对 `token_service` 引入更严格的密钥管理。
