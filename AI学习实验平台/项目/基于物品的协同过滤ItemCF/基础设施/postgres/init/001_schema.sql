CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    note TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS items (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS interactions (
    id BIGSERIAL PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    item_id TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
    event_type TEXT NOT NULL DEFAULT 'like',
    weight DOUBLE PRECISION NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, item_id, event_type)
);

CREATE INDEX IF NOT EXISTS idx_interactions_user ON interactions(user_id);
CREATE INDEX IF NOT EXISTS idx_interactions_item ON interactions(item_id);

INSERT INTO users (id, name, note) VALUES
    ('u1', '小林', '喜欢科幻、纪录片，也开始学习机器学习。'),
    ('u2', '小周', '当前手算案例用户，喜欢科幻电影和太空纪录片。'),
    ('u3', '小许', '偏好纪录片、机器学习和编程实战。'),
    ('u4', '小陈', '喜欢机器学习和 Python 工程内容。'),
    ('u5', '小何', '喜欢 Python 实战和产品经理方法。'),
    ('u6', '小孟', '喜欢产品、增长和数据分析。')
ON CONFLICT (id) DO NOTHING;

INSERT INTO items (id, title, category) VALUES
    ('i1', '科幻电影', '影视'),
    ('i2', '太空纪录片', '影视'),
    ('i3', '机器学习入门', 'AI'),
    ('i4', 'Python 实战', '编程'),
    ('i5', '产品经理方法', '产品'),
    ('i6', '增长分析案例', '数据'),
    ('i7', '推荐系统导论', 'AI'),
    ('i8', 'RAG 系统实战', 'AI'),
    ('i9', 'LangChain 工作流', 'AI'),
    ('i10', 'LlamaIndex 入门', 'AI'),
    ('i11', 'FastAPI 后端开发', '编程'),
    ('i12', 'PostgreSQL 数据建模', '数据库'),
    ('i13', 'Docker 部署基础', '工程'),
    ('i14', 'Chroma 向量数据库', 'AI'),
    ('i15', 'FAISS 向量检索', 'AI'),
    ('i16', 'Milvus 企业向量库', 'AI'),
    ('i17', 'Agent 工具调用', 'AI'),
    ('i18', '多智能体协作', 'AI'),
    ('i19', 'Graph RAG 知识图谱', 'AI'),
    ('i20', '提示词工程', 'AI'),
    ('i21', '自动化测试平台', '测试'),
    ('i22', '接口测试实战', '测试'),
    ('i23', '性能测试入门', '测试'),
    ('i24', '前端可视化 Canvas', '前端'),
    ('i25', 'Three.js 3D 可视化', '前端'),
    ('i26', '数据分析 SQL', '数据'),
    ('i27', '推荐系统评估指标', '推荐'),
    ('i28', '用户画像建模', '推荐'),
    ('i29', 'A/B 实验设计', '产品'),
    ('i30', '云服务器部署', '工程'),
    ('i31', 'Ollama 本地模型', 'AI')
ON CONFLICT (id) DO NOTHING;

INSERT INTO interactions (user_id, item_id, event_type, weight) VALUES
    ('u1', 'i1', 'like', 1),
    ('u1', 'i2', 'like', 1),
    ('u1', 'i3', 'like', 1),
    ('u1', 'i8', 'like', 1),
    ('u1', 'i14', 'like', 1),
    ('u1', 'i20', 'like', 1),
    ('u1', 'i24', 'like', 1),
    ('u1', 'i25', 'like', 1),
    ('u2', 'i1', 'like', 1),
    ('u2', 'i2', 'like', 1),
    ('u2', 'i8', 'like', 1),
    ('u2', 'i9', 'like', 1),
    ('u2', 'i11', 'like', 1),
    ('u2', 'i12', 'like', 1),
    ('u2', 'i17', 'like', 1),
    ('u2', 'i21', 'like', 1),
    ('u3', 'i2', 'like', 1),
    ('u3', 'i3', 'like', 1),
    ('u3', 'i4', 'like', 1),
    ('u3', 'i8', 'like', 1),
    ('u3', 'i10', 'like', 1),
    ('u3', 'i14', 'like', 1),
    ('u3', 'i15', 'like', 1),
    ('u3', 'i19', 'like', 1),
    ('u4', 'i3', 'like', 1),
    ('u4', 'i4', 'like', 1),
    ('u4', 'i7', 'like', 1),
    ('u4', 'i11', 'like', 1),
    ('u4', 'i12', 'like', 1),
    ('u4', 'i13', 'like', 1),
    ('u4', 'i26', 'like', 1),
    ('u4', 'i27', 'like', 1),
    ('u5', 'i4', 'like', 1),
    ('u5', 'i5', 'like', 1),
    ('u5', 'i6', 'like', 1),
    ('u5', 'i20', 'like', 1),
    ('u5', 'i21', 'like', 1),
    ('u5', 'i22', 'like', 1),
    ('u5', 'i23', 'like', 1),
    ('u5', 'i29', 'like', 1),
    ('u6', 'i5', 'like', 1),
    ('u6', 'i6', 'like', 1),
    ('u6', 'i7', 'like', 1),
    ('u6', 'i17', 'like', 1),
    ('u6', 'i18', 'like', 1),
    ('u6', 'i19', 'like', 1),
    ('u6', 'i28', 'like', 1),
    ('u6', 'i30', 'like', 1),
    ('u6', 'i31', 'like', 1)
ON CONFLICT (user_id, item_id, event_type) DO NOTHING;
