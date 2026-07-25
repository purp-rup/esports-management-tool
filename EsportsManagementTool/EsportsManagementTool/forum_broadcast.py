import queue
import threading

_lock = threading.Lock()
_subscribers = {}  # { community_id: set of (user_id, queue.Queue) }


def subscribe(community_id: int, user_id: int) -> queue.Queue:
    q = queue.Queue()
    with _lock:
        _subscribers.setdefault(community_id, set()).add((user_id, q))
    return q


def unsubscribe(community_id: int, user_id: int, q: queue.Queue) -> None:
    with _lock:
        subs = _subscribers.get(community_id)
        if subs:
            subs.discard((user_id, q))
            if not subs:
                del _subscribers[community_id]


def publish(community_id: int, event_type: str, data: dict, exclude_user_id: int = None) -> None:
    with _lock:
        subs = list(_subscribers.get(community_id, ()))
    for uid, q in subs:
        if exclude_user_id is not None and uid == exclude_user_id:
            continue
        q.put((event_type, data))