# auth_log_exp

轻量级登录实验项目（实验 3）。项目提供一个可运行的登录服务，并使用 `winston` 输出接近 Elastic Common Schema（ECS）风格的结构化 JSON 日志，方便做认证行为统计、异常检测和后续日志分析实验。

## 项目概览

- 前端页面：`public/login.html`
- 服务入口：`src/server.js`
- 认证逻辑：`src/auth/`
- 日志实现：`src/logger.js`
- 日志解析：`scripts/parse_logs.py`
- 本地用户数据：`data/users.json`
- 数据库初始化：`db/init.sql`

当前日志系统使用 `winston`。应用启动、登录成功、登录失败、账户锁定、服务异常等事件都会写入 `logs/login_app.log`，并同步输出到控制台。

## 快速开始

### 本地运行

安装依赖：

```bash
npm install
```

启动服务：

```powershell
$Env:PORT='3004'
node src/server.js
```

打开页面：

`http://localhost:3004/login.html`

### Docker 运行

```bash
docker-compose up --build -d
```

启动后访问：

`http://localhost:3004/login.html`

## ECS 风格日志设计

日志文件为 `logs/login_app.log`，格式是 JSON Lines，也就是一行一个 JSON 对象。字段命名尽量贴近 ECS，便于后续接入 Elasticsearch、Kibana 或其他日志分析流程。

核心字段包括：

- `@timestamp`：UTC 时间戳
- `message`：摘要消息
- `log.level`：日志级别
- `host.name`：主机名
- `service.name`：服务名，固定为 `login_app`
- `event.kind`：固定为 `event`
- `event.category`：事件大类，例如 `authentication`、`web`、`process`
- `event.type`：事件类型，例如 `start`、`end`、`access`、`error`
- `event.action`：业务动作，例如 `auth_success`、`auth_failed`
- `event.outcome`：结果，例如 `success`、`failure`
- `event.code`：内部事件名，例如 `auth.login_success`
- `event.reason`：失败原因
- `user.id`：用户 ID
- `user.roles`：用户角色
- `source.ip`：来源 IP
- `trace.id`：请求关联 ID

以及常见上下文字段：

- `http.request.method`
- `url.path`
- `server.port`
- `process.signal`

日志器会自动过滤敏感字段，例如密码、token、密码哈希等不会进入主日志。

示例：

```json
{
  "@timestamp": "2026-06-11T10:15:36.335Z",
  "message": "login failed",
  "log.level": "WARNING",
  "host.name": "LAPTOP-1MR5IFK6",
  "service.name": "login_app",
  "event.kind": "event",
  "event.category": ["authentication"],
  "event.type": ["start"],
  "event.action": "auth_failed",
  "event.outcome": "failure",
  "event.code": "auth.login_fail",
  "event.reason": "user_not_found_or_disabled",
  "user.id": "1110000000",
  "source.ip": "::1",
  "trace.id": "3d789d3f-8608-401f-8137-3d0954357409"
}
```

来源 IP 识别规则：

- 优先读取 `X-Forwarded-For`
- 否则回退到连接的 `remoteAddress`
- 只有在 `ALLOW_CLIENT_SOURCE_IP=true` 时，才允许测试请求体显式传入 `sourceIp`

## 测试与日志生成

冒烟测试：

```bash
npm test
```

或：

```bash
npm run smoke
```

直接调用日志器，并验证 `login_app.log` 中写出的 ECS 风格 JSON 记录是否包含预期字段。

批量生成测试日志：

```bash
node scripts/run_tests.js
```

脚本模拟成功登录、错误密码、非法用户 ID 和重复失败触发锁定等场景，适合为实验分析生成样本日志。

生成课程实验用的 `medium` 相较大规模数据集：

```bash
npm run generate:medium
```

对应脚本是 `scripts/medi_dataset.js`。

运行后会在 `generated/` 目录下产出：

- `medium_login_app.log`：约 25,000 条 ECS 风格认证日志 （主要分析对象）
- `medium_users.json`：用户数据
- `medium_dataset_summary.json`：生成数据摘要

## 测试账号

测试账号写入 `db/init.sql`，并同步到 `data/users.json`：

- `2024000001` / `Study2026!`
- `2024000002` / `UniAccess#1`
- `2024000003` / `Welcome2026$`
- `2024000004` / `SecurePass88`
- `2024000005` / `Campus2026!`

## 日志解析

日志解析脚本位于 [scripts/parse_logs.py](c:/Users/14300/Desktop/网络安全/auth_log_exp/scripts/parse_logs.py:1)。

它支持两类输入：

- 当前的基于 `winston` 工具ECS 风格 JSON Lines 日志
- 旧版类 syslog 风格文本日志

解析输出会统一成 ECS 风格字段，并自动做标准化处理：（如果接入真正的日志分析程序 还是要检测对齐一下字段，很有可能会出现不一致）

示例：

```bash
python scripts/parse_logs.py logs/login_app.log --format json
python scripts/parse_logs.py logs/login_app.log --format csv > parsed.csv
```

## 目录结构

- `public/`：前端登录页面
- `src/`：服务端源码
- `data/`：本地用户数据
- `db/`：数据库初始化脚本
- `logs/`：运行期日志目录
- `scripts/`：解析与测试脚本
- `tests/`：最小验证脚本

## 说明

- 本地模式默认使用 `data/users.json`
- 高频并发测试更建议用 Docker + Postgres，避免 JSON 文件并发写入带来的竞态
- 这套字段命名是 ECS 风格近似映射，适合课程实验和日志分析；如果后续接入完整 ELK，可以继续细化字段集
```bash
Windows 日志 / Linux auth.log / 自己的 login_app.log / Web 访问日志
        ↓
       采集
        ↓
       解析
        ↓
    字段标准化
        ↓
    清洗与补充
        ↓
    统一数据集
        ↓
KPI 分析 / 安全分析 / 可视化
```
