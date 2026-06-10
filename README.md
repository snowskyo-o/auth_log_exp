# auth_log_exp

轻量级登录实验项目（实验 3：程序设计与日志记录）。目标：提供可运行的登录服务、统一的 syslog 风格文本日志、固定测试账户，以及便于后续解析的工具和测试用例。

## 环境差异（本地 vs Docker）

- 本地运行（默认）：服务使用 `data/users.json` 作为用户数据源。适合快速调试和不希望启动数据库的场景。
- Docker 运行（使用 `docker-compose`）：`docker-compose.yml` 中为 `app` 服务设置了环境变量 `USE_DB=true`，此时服务会连接容器内的 Postgres（由 `auth-db` 服务提供）并从 `users` 表查询/更新用户数据。`db/init.sql` 中的固定测试账号会在数据库初始化时写入。

## 目录说明

- `public/`：简单前端登录页面（`login.html`）。
- `src/`：服务端源码（入口 `src/server.js`、日志 `src/logger.js`、认证 `src/auth/*`）。
- `data/`：本地数据文件
# auth_log_exp

轻量级登录实验项目（实验 3：程序设计与日志记录）。目标：提供可运行的登录服务、统一的 syslog 风格文本日志、固定测试账户，以及便于后续解析的工具和测试用例。

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

---

查看源代码文件以了解实现细节：`src/logger.js`、`src/auth/auth-router.js`、`src/auth/user-store.js`。
