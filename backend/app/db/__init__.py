from app.db import auth_sessions, rate_limits, users
from app.db.mongo import INDEX_SETUPS

# Every collection module registers its index setup here; they run at startup.
INDEX_SETUPS.extend([users.setup_indexes, auth_sessions.setup_indexes, rate_limits.setup_indexes])
