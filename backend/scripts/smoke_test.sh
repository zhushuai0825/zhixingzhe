#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-http://127.0.0.1:8000}"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "1. Health check"
curl -s "$BASE_URL/api/health"
echo

echo "2. Create knowledge base"
KB_RESPONSE="$(curl -s -X POST "$BASE_URL/api/knowledge-bases" \
  -H 'Content-Type: application/json' \
  -d '{"name":"RAG 学习 Demo","description":"用于验证知行者 MVP 主链路"}')"
echo "$KB_RESPONSE"
KB_ID="$(python3 -c 'import json,sys; print(json.load(sys.stdin)["id"])' <<< "$KB_RESPONSE")"

echo "3. Upload document"
curl -s -X POST "$BASE_URL/api/knowledge-bases/$KB_ID/documents" \
  -F "files=@$ROOT_DIR/examples/rag_demo.md"
echo

echo "4. Ask question"
curl -s -X POST "$BASE_URL/api/chat" \
  -H 'Content-Type: application/json' \
  -d "{\"knowledge_base_id\":\"$KB_ID\",\"question\":\"RAG 系统的核心流程是什么？\"}"
echo

echo "5. Generate tasks"
curl -s -X POST "$BASE_URL/api/tasks/generate" \
  -H 'Content-Type: application/json' \
  -d '{"content":"接下来需要学习文档解析，完成文本切片 Demo，并验证检索效果。"}'
echo

