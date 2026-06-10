# db

这里放数据库初始化脚本和结构说明。

当前只保留和登录实验有关的基础表：

- `users`
- `login_failures`
- `audit_logs`

Docker Compose 只启动数据库，不包含 MinIO、Redis 或其他无关服务。
