from __future__ import annotations

import math
from typing import Any

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from .db import get_conn


app = FastAPI(title="ItemCF 学习实验室 API", version="0.2.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


class InteractionCreate(BaseModel):
    userId: str
    itemId: str


class ItemCreate(BaseModel):
    title: str
    category: str = "自定义"
    userId: str | None = None


SEED_ITEMS = [
    ("i1", "科幻电影", "影视"),
    ("i2", "太空纪录片", "影视"),
    ("i3", "机器学习入门", "AI"),
    ("i4", "Python 实战", "编程"),
    ("i5", "产品经理方法", "产品"),
    ("i6", "增长分析案例", "数据"),
    ("i7", "推荐系统导论", "AI"),
    ("i8", "RAG 系统实战", "AI"),
    ("i9", "LangChain 工作流", "AI"),
    ("i10", "LlamaIndex 入门", "AI"),
    ("i11", "FastAPI 后端开发", "编程"),
    ("i12", "PostgreSQL 数据建模", "数据库"),
    ("i13", "Docker 部署基础", "工程"),
    ("i14", "Chroma 向量数据库", "AI"),
    ("i15", "FAISS 向量检索", "AI"),
    ("i16", "Milvus 企业向量库", "AI"),
    ("i17", "Agent 工具调用", "AI"),
    ("i18", "多智能体协作", "AI"),
    ("i19", "Graph RAG 知识图谱", "AI"),
    ("i20", "提示词工程", "AI"),
    ("i21", "自动化测试平台", "测试"),
    ("i22", "接口测试实战", "测试"),
    ("i23", "性能测试入门", "测试"),
    ("i24", "前端可视化 Canvas", "前端"),
    ("i25", "Three.js 3D 可视化", "前端"),
    ("i26", "数据分析 SQL", "数据"),
    ("i27", "推荐系统评估指标", "推荐"),
    ("i28", "用户画像建模", "推荐"),
    ("i29", "A/B 实验设计", "产品"),
    ("i30", "云服务器部署", "工程"),
    ("i31", "Ollama 本地模型", "AI"),
]

SEED_INTERACTIONS = [
    ("u1", "i1"),
    ("u1", "i2"),
    ("u1", "i3"),
    ("u1", "i8"),
    ("u1", "i14"),
    ("u1", "i20"),
    ("u1", "i24"),
    ("u1", "i25"),
    ("u2", "i1"),
    ("u2", "i2"),
    ("u2", "i8"),
    ("u2", "i9"),
    ("u2", "i11"),
    ("u2", "i12"),
    ("u2", "i17"),
    ("u2", "i21"),
    ("u3", "i2"),
    ("u3", "i3"),
    ("u3", "i4"),
    ("u3", "i8"),
    ("u3", "i10"),
    ("u3", "i14"),
    ("u3", "i15"),
    ("u3", "i19"),
    ("u4", "i3"),
    ("u4", "i4"),
    ("u4", "i7"),
    ("u4", "i11"),
    ("u4", "i12"),
    ("u4", "i13"),
    ("u4", "i26"),
    ("u4", "i27"),
    ("u5", "i4"),
    ("u5", "i5"),
    ("u5", "i6"),
    ("u5", "i20"),
    ("u5", "i21"),
    ("u5", "i22"),
    ("u5", "i23"),
    ("u5", "i29"),
    ("u6", "i5"),
    ("u6", "i6"),
    ("u6", "i7"),
    ("u6", "i17"),
    ("u6", "i18"),
    ("u6", "i19"),
    ("u6", "i28"),
    ("u6", "i30"),
    ("u6", "i31"),
]


def load_users() -> list[dict[str, Any]]:
    with get_conn() as conn:
        rows = conn.execute("SELECT id, name, note FROM users ORDER BY id").fetchall()
    return [dict(row) for row in rows]


def load_items() -> list[dict[str, Any]]:
    with get_conn() as conn:
        rows = conn.execute("SELECT id, title, category FROM items ORDER BY id").fetchall()
    return [dict(row) for row in rows]


def load_interactions() -> list[dict[str, Any]]:
    with get_conn() as conn:
        rows = conn.execute(
            """
            SELECT user_id AS "userId", item_id AS "itemId", event_type AS "eventType", weight, created_at
            FROM interactions
            WHERE event_type = 'like'
            ORDER BY created_at, id
            """
        ).fetchall()
    return [dict(row) for row in rows]


def item_by_id(items: list[dict[str, Any]], item_id: str) -> dict[str, Any]:
    item = next((item for item in items if item["id"] == item_id), None)
    if not item:
        raise HTTPException(status_code=404, detail="item not found")
    return item


def user_by_id(users: list[dict[str, Any]], user_id: str) -> dict[str, Any]:
    user = next((user for user in users if user["id"] == user_id), None)
    if not user:
        raise HTTPException(status_code=404, detail="user not found")
    return user


def liked_item_ids(interactions: list[dict[str, Any]], user_id: str) -> list[str]:
    return [entry["itemId"] for entry in interactions if entry["userId"] == user_id]


def build_user_item_matrix(
    users: list[dict[str, Any]],
    items: list[dict[str, Any]],
    interactions: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    liked = {f"{entry['userId']}:{entry['itemId']}" for entry in interactions}
    return [
        {
            "user": user,
            "values": [1 if f"{user['id']}:{item['id']}" in liked else 0 for item in items],
        }
        for user in users
    ]


def build_item_similarity(items: list[dict[str, Any]], interactions: list[dict[str, Any]]) -> dict[str, Any]:
    item_user_sets = {item["id"]: set() for item in items}
    for entry in interactions:
        item_user_sets[entry["itemId"]].add(entry["userId"])

    similarity: dict[str, dict[str, float]] = {}
    co_counts: dict[str, dict[str, int]] = {}

    for left in items:
        left_id = left["id"]
        similarity[left_id] = {}
        co_counts[left_id] = {}
        for right in items:
            right_id = right["id"]
            left_users = item_user_sets[left_id]
            right_users = item_user_sets[right_id]
            co_count = len(left_users & right_users)
            denominator = math.sqrt(len(left_users) * len(right_users))
            co_counts[left_id][right_id] = co_count
            similarity[left_id][right_id] = 0 if denominator == 0 else co_count / denominator

    item_counts = {item_id: len(user_ids) for item_id, user_ids in item_user_sets.items()}
    return {"similarity": similarity, "coCounts": co_counts, "itemCounts": item_counts}


def score_candidates_for_user(
    user_id: str,
    users: list[dict[str, Any]],
    items: list[dict[str, Any]],
    interactions: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    user_by_id(users, user_id)
    liked = liked_item_ids(interactions, user_id)
    liked_set = set(liked)
    matrices = build_item_similarity(items, interactions)
    similarity = matrices["similarity"]
    co_counts = matrices["coCounts"]
    item_counts = matrices["itemCounts"]

    results = []
    for candidate in items:
        candidate_id = candidate["id"]
        if candidate_id in liked_set:
            continue

        contributions = [
            {
                "from": item_by_id(items, liked_id),
                "coCount": co_counts[candidate_id][liked_id],
                "candidateCount": item_counts[candidate_id],
                "sourceCount": item_counts[liked_id],
                "value": similarity[candidate_id][liked_id],
            }
            for liked_id in liked
        ]
        contributions.sort(key=lambda entry: entry["value"], reverse=True)
        score = sum(entry["value"] for entry in contributions)
        results.append({"item": candidate, "score": score, "contributions": contributions})

    results.sort(key=lambda entry: entry["score"], reverse=True)
    return results


def item_similarity_points(items: list[dict[str, Any]], similarity: dict[str, dict[str, float]]) -> list[dict[str, Any]]:
    points = []
    total = max(1, len(items))
    for index, item in enumerate(items):
        values = [similarity[item["id"]][other["id"]] for other in items if other["id"] != item["id"]]
        avg_similarity = sum(values) / len(values) if values else 0
        x = math.cos(index / total * math.tau) * (1.2 + avg_similarity)
        z = math.sin(index / total * math.tau) * (1.2 + avg_similarity)
        y = avg_similarity * 2 - 0.5
        points.append(
            {
                "id": item["id"],
                "title": item["title"],
                "category": item["category"],
                "x": round(x, 4),
                "y": round(y, 4),
                "z": round(z, 4),
                "avgSimilarity": round(avg_similarity, 4),
            }
        )
    return points


def state_payload(user_id: str = "u2") -> dict[str, Any]:
    users = load_users()
    items = load_items()
    interactions = load_interactions()
    user_by_id(users, user_id)
    matrices = build_item_similarity(items, interactions)
    candidates = score_candidates_for_user(user_id, users, items, interactions)
    recommendations = [entry for entry in candidates if entry["score"] > 0]

    return {
        "dataSource": "postgres",
        "users": users,
        "items": items,
        "interactions": interactions,
        "selectedUserId": user_id,
        "likedItemIds": liked_item_ids(interactions, user_id),
        "behaviorMatrix": build_user_item_matrix(users, items, interactions),
        "similarity": matrices["similarity"],
        "coCounts": matrices["coCounts"],
        "itemCounts": matrices["itemCounts"],
        "itemSimilarityPoints": item_similarity_points(items, matrices["similarity"]),
        "candidates": candidates,
        "recommendations": recommendations,
    }


def next_item_id() -> str:
    with get_conn() as conn:
        rows = conn.execute("SELECT id FROM items WHERE id LIKE 'i%'").fetchall()
    max_number = 0
    for row in rows:
        suffix = row["id"][1:]
        if suffix.isdigit():
            max_number = max(max_number, int(suffix))
    return f"i{max_number + 1}"


@app.get("/health")
def health() -> dict[str, Any]:
    with get_conn() as conn:
        counts = conn.execute(
            """
            SELECT
                (SELECT count(*) FROM users) AS users,
                (SELECT count(*) FROM items) AS items,
                (SELECT count(*) FROM interactions) AS interactions
            """
        ).fetchone()
    return {"status": "ok", "postgres": True, **dict(counts)}


@app.get("/api/state")
def get_state(user_id: str = "u2") -> dict[str, Any]:
    return state_payload(user_id)


@app.post("/api/items")
def create_item(payload: ItemCreate) -> dict[str, Any]:
    title = payload.title.strip()
    category = payload.category.strip() or "自定义"
    if not title:
        raise HTTPException(status_code=400, detail="title is required")

    users = load_users()
    if payload.userId:
        user_by_id(users, payload.userId)

    item_id = next_item_id()
    with get_conn() as conn:
        conn.execute(
            """
            INSERT INTO items (id, title, category)
            VALUES (%s, %s, %s)
            """,
            (item_id, title, category),
        )
        if payload.userId:
            conn.execute(
                """
                INSERT INTO interactions (user_id, item_id, event_type, weight)
                VALUES (%s, %s, 'like', 1)
                """,
                (payload.userId, item_id),
            )

    return state_payload(payload.userId or "u2")


@app.post("/api/interactions")
def add_interaction(payload: InteractionCreate) -> dict[str, Any]:
    users = load_users()
    items = load_items()
    user_by_id(users, payload.userId)
    item_by_id(items, payload.itemId)

    with get_conn() as conn:
        try:
            conn.execute(
                """
                INSERT INTO interactions (user_id, item_id, event_type, weight)
                VALUES (%s, %s, 'like', 1)
                """,
                (payload.userId, payload.itemId),
            )
        except Exception as exc:
            raise HTTPException(status_code=409, detail="interaction already exists") from exc

    return state_payload(payload.userId)


@app.delete("/api/interactions")
def delete_interaction(payload: InteractionCreate) -> dict[str, Any]:
    users = load_users()
    items = load_items()
    user_by_id(users, payload.userId)
    item_by_id(items, payload.itemId)

    with get_conn() as conn:
        result = conn.execute(
            """
            DELETE FROM interactions
            WHERE user_id = %s AND item_id = %s AND event_type = 'like'
            """,
            (payload.userId, payload.itemId),
        )
        if result.rowcount == 0:
            raise HTTPException(status_code=404, detail="interaction not found")

    return state_payload(payload.userId)


@app.post("/api/reset")
def reset_data(user_id: str = "u2") -> dict[str, Any]:
    with get_conn() as conn:
        conn.execute("TRUNCATE interactions RESTART IDENTITY")
        conn.execute("DELETE FROM items")
        with conn.cursor() as cur:
            cur.executemany(
                """
                INSERT INTO items (id, title, category)
                VALUES (%s, %s, %s)
                """,
                SEED_ITEMS,
            )
            cur.executemany(
                """
                INSERT INTO interactions (user_id, item_id, event_type, weight)
                VALUES (%s, %s, 'like', 1)
                """,
                SEED_INTERACTIONS,
            )
    return state_payload(user_id)
