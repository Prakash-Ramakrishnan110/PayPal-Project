from typing import Generator
from sqlmodel import Session, SQLModel, create_engine
from app.config import get_settings

settings = get_settings()

# SQLite specific connect args for thread safety
connect_args = {"check_same_thread": False} if settings.DATABASE_URL.startswith("sqlite") else {}

engine = create_engine(
    settings.DATABASE_URL,
    echo=False,
    connect_args=connect_args,
)


def init_db() -> None:
    # Ensure all models are imported so SQLModel registers their tables
    from app.models.mandate import Mandate  # noqa: F401
    from app.models.audit import AuditEvent, PendingApproval  # noqa: F401

    SQLModel.metadata.create_all(engine)


def get_session() -> Generator[Session, None, None]:
    with Session(engine) as session:
        yield session
