# auth_log_exp

轻量级登录实验项目（实验 3：程序设计与日志记录）。目标：提供可运行的登录服务、统一的 syslog 风格文本日志、固定测试账户，以及便于后续解析的工具和测试用例。

## 主要变更与约定

- 本仓库已调整为使用单一 syslog 风格文本日志，输出文件：`logs/login_app.log`。
- Docker 服务端口已设为 `3004`（`docker-compose.yml` 中 `app` 服务映射为 `3004:3004`）。
- 使用固定测试帐户（写入 `db/init.sql`），不再使用运行时的种子脚本。

## 目录说明

- `public/`：简单前端登录页面（`login.html`）。
- `src/`：服务端源码（入口 `src/server.js`、日志 `src/logger.js`、认证 `src/auth/*`）。
- `data/`：备用的本地数据文件（当前不作为主要测试账户源，数据库 init.sql 中已插入固定测试用户）。
- `logs/`：运行时日志目录，主日志文件为 `logs/login_app.log`。
- `scripts/`：辅助脚本：`run_tests.js`（模拟登录请求），`parse_logs.py`（将 `login_app.log` 解析为 JSON / CSV）。
- `db/`：Postgres 初始化脚本，包含固定测试账户的 INSERT 语句。
- `tests/`：测试用例 CSV（`tests/test_cases.csv`）以及其他测试说明。

## 测试账户（已写入 `db/init.sql`）

请在 Docker 环境中使用以下账号密码进行测试（密码在数据库中以 scrypt(id) 哈希存储）：

- 用户 ID: `2024000001`   密码: `Study2026!`
- 用户 ID: `2024000002`   密码: `UniAccess#1`
- 用户 ID: `2024000003`   密码: `Welcome2026$`
- 用户 ID: `2024000004`   密码: `SecurePass88`
- 用户 ID: `2024000005`   密码: `Campus2026!`

（注意：这些仅用于实验和演示，请勿用于生产环境。）

## 使用 Docker 启动

1. 在项目根目录构建并启动服务：

```bash
docker-compose up --build -d
```

2. 等待服务启动后访问前端：

打开 http://localhost:3004 或 http://127.0.0.1:3004/login.html

3. 查看日志文件（宿主机）：

```bash
tail -f logs/login_app.log
```

## 本地运行（不使用 Docker）

1. 安装依赖：

```bash
npm install
```

2. 启动服务（推荐将端口设为 3004）：

```bash
PORT=3004 node src/server.js
```

3. 打开浏览器访问： http://localhost:3004/login.html

## 快速测试

- 使用内置脚本运行一批示例请求（需要本地服务或 Docker 中的服务可访问）：

```bash
node scripts/run_tests.js
```

该脚本会依次发出几条登录请求并模拟多次失败以触发锁定机制。运行后请检查 `logs/login_app.log` 是否包含期望的事件。

## 解析日志（实验 4 用）

- 提供了 `scripts/parse_logs.py`，用于把 `logs/login_app.log` 解析为 JSON（stdout）并在 `logs/parsed_logs.csv` 中写入表格化结果：

```bash
python3 scripts/parse_logs.py logs/login_app.log > parsed.json
# 或仅使用默认日志路径
python3 scripts/parse_logs.py > parsed.json
```

解析后可进一步转换为 CSV/JSON 数据集用于实验 4 的 KPI 分析。

## 日志格式示例（syslog 风格，每行为一条）：

示例：服务启动

```
2026-06-10T12:00:00.000Z myhost login_app: level=INFO event_type=service_start message="service started" port=3004
```

示例：认证成功

```
2026-06-10T12:05:12.345Z myhost login_app: level=INFO event_type=auth_success user=2024000001 src_ip=127.0.0.1 message="login success"
```

示例：认证失败（原因：密码错误）

```
2026-06-10T12:06:00.123Z myhost login_app: level=WARNING event_type=auth_failed user=2024000001 src_ip=127.0.0.1 message="login failed" reason=password_mismatch failCount=1
```

示例：账户被锁定

```
2026-06-10T12:07:30.000Z myhost login_app: level=ERROR event_type=account_locked user=2024000002 src_ip=127.0.0.2 message="account locked due to repeated failures" failCount=5 lockedUntil=2026-06-10T12:22:30.000Z
```

字段说明：每条日志包含 `timestamp host login_app:` 前缀，之后以 `key=value` 形式给出固定字段 `level`、`event_type`、`user`、`src_ip`、`message`，以及其它可选分析字段（例如 `reason`、`failCount`、`lockedUntil`）。

## 测试用例清单

- 请参见 `tests/test_cases.csv`，其中定义了若干典型测试输入与期望事件类型，便于人工或脚本化验证。

## 注意与安全要求

- 不记录明文密码或完整敏感 token。
- 日志仅写入失败原因标签（如 `bad_password`、`invalid_user`、`locked`、`invalid_input`）。
- 异常路径会记录 `service_error`，但不会将完整堆栈写入主日志以避免泄露敏感数据。

## 代码相关说明

- `src/logger.js`：负责把事件格式化为 syslog 风格文本并追加到 `logs/login_app.log`。
- `src/auth/auth-router.js`：认证路由，触发登录成功、失败与锁定事件；`src/logger.js` 会把这些事件映射到规范的 `event_type`。

---

如需我继续增加自动化测试或把 `logs/` 目录改为持久卷映射到特定路径，请告诉我。
