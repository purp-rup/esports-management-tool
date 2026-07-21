import time
import threading

_typing_lock = threading.Lock()
_typing_status = {}
TYPING_TIMEOUT_SECONDS = 5

def set_typing(game_id: int, user_id: int) -> None:
    with _typing_lock:
        _typing_status.setdefault(game_id, {})[user_id] = time.time()

def get_typing_users(game_id: int, exclude_user_id: int = None) -> list:
    now = time.time()
    with _typing_lock:
        entries = _typing_status.get(game_id, {})
        active = {uid: ts for uid, ts in entries.items() if now - ts < TYPING_TIMEOUT_SECONDS}
        _typing_status[game_id] = active  # prune stale entries as a side effect

    if exclude_user_id is not None:
        active = {uid: ts for uid, ts in active.items() if uid != exclude_user_id}
    return list(active.keys())