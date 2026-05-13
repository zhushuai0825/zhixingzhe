import os
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv


PROJECT_ROOT = Path(__file__).resolve().parents[2]
load_dotenv(PROJECT_ROOT / ".env")


@dataclass(frozen=True)
class Settings:
    database_url: str = os.getenv(
        "DATABASE_URL",
        "postgresql://zhixingzhe:zhixingzhe_dev_password@localhost:5432/zhixingzhe_ai_lab",
    )
    chroma_host: str = os.getenv("CHROMA_HOST", "localhost")
    chroma_port: int = int(os.getenv("CHROMA_PORT", "8001"))
    chroma_collection: str = os.getenv("CHROMA_COLLECTION", "document_vectors")
    embedding_dimensions: int = int(os.getenv("EMBEDDING_DIMENSIONS", "384"))
    senseaudio_api_key: str = os.getenv("SENSEAUDIO_API_KEY", "")
    senseaudio_base_url: str = os.getenv("SENSEAUDIO_BASE_URL", "")
    senseaudio_chat_model: str = os.getenv("SENSEAUDIO_CHAT_MODEL", "deepseek-v4-pro")
    senseaudio_chat_model_alt: str = os.getenv("SENSEAUDIO_CHAT_MODEL_ALT", "senseaudio-s2")
    senseaudio_vl_model: str = os.getenv("SENSEAUDIO_VL_MODEL", "senseaudio-vl-1.0-260319")
    senseaudio_asr_model: str = os.getenv("SENSEAUDIO_ASR_MODEL", "senseaudio-asr-1.5-260319")


settings = Settings()
