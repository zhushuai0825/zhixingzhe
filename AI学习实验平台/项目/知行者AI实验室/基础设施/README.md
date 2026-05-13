# 本地基础设施说明

当前项目使用：

- PostgreSQL：业务数据库
- Chroma：向量数据库
- Docker Desktop：本地容器运行环境

## 1. 启动 Docker 运行环境

打开 Docker Desktop，等左下角显示运行中。

确认当前使用的是 Docker Desktop：

```bash
docker context ls
```

正常情况下，`desktop-linux` 后面会有 `*`。

## 2. 启动数据库和向量库

在项目根目录执行：

```bash
cd /Users/zhushuai/Downloads/知行者AI实验室
docker compose up -d
```

## 3. 查看运行状态

```bash
docker compose ps
```

## 4. 停止服务

```bash
docker compose stop
```

## 5. 完全关闭并保留数据

```bash
docker compose down
```

这个命令会删除容器和网络，但会保留 PostgreSQL 与 Chroma 的数据卷。

## 6. PostgreSQL 连接信息

```text
host: localhost
port: 5432
database: zhixingzhe_ai_lab
user: zhixingzhe
password: zhixingzhe_dev_password
```

连接命令：

```bash
docker exec -it zhixingzhe-ai-postgres psql -U zhixingzhe -d zhixingzhe_ai_lab
```

## 7. Chroma 连接信息

```text
url: http://127.0.0.1:8001
collection: document_vectors
```

心跳检查：

```bash
curl http://127.0.0.1:8001/api/v2/heartbeat
```

## 8. 当前职责划分

```text
PostgreSQL
  -> knowledge_bases
  -> documents
  -> document_chunks
  -> rag_runs
  -> agent_runs
  -> tasks

Chroma
  -> chunk embedding
  -> vector index
  -> similarity search
```

## 9. 常用维护命令

查看容器：

```bash
docker compose ps
```

查看 PostgreSQL 日志：

```bash
docker logs zhixingzhe-ai-postgres
```

查看 Chroma 日志：

```bash
docker logs zhixingzhe-ai-chroma
```

进入 PostgreSQL：

```bash
docker exec -it zhixingzhe-ai-postgres psql -U zhixingzhe -d zhixingzhe_ai_lab
```

检查 Chroma：

```bash
curl http://127.0.0.1:8001/api/v2/heartbeat
```

## 10. 更多说明

更完整的数据和排错文档：

```text
../文档/04_数据与存储说明.md
../文档/06_运行部署与排错.md
```
