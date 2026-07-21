import os
import time
import boto3
from decimal import Decimal
from boto3.dynamodb.conditions import Key, Attr
from ulid import ULID

TABLE_NAME = os.environ.get("FORUM_MESSAGES_TABLE", "community_chat_messages")
AWS_REGION = os.environ.get("AWS_REGION", "us-east-2")

_dynamodb = boto3.resource("dynamodb", region_name=AWS_REGION)
_table = _dynamodb.Table(TABLE_NAME)


def _clean(item: dict) -> dict:
    """
    Converts decimal values (dynamoDB default) to integer values.
    """
    if item is None:
        return item
    return {
        k: (int(v) if isinstance(v, Decimal) else v)
        for k, v in item.items()
    }


def create_message(community_id: int, user_id: int, content: str) -> dict:
    message_id = str(ULID())
    created_at = int(time.time())

    item = {
        "community_id": community_id,
        "message_id": message_id,
        "user_id": user_id,
        "content": content,
        "created_at": created_at,
        "is_deleted": False,    
        "deleted_at": None,
        "deleted_by": None,
    }

    _table.put_item(Item=item)
    return item


def get_message(community_id: int, message_id: str) -> dict | None:
    response = _table.get_item(Key={"community_id": community_id, "message_id": message_id})
    return _clean(response.get("Item"))


def get_messages_page(community_id: int, before: str | None = None, limit: int = 30):
    """
    Returns (items_newest_first, has_more). Caller is expected to reverse
    the list to ascending order for display.
    """
    collected = []
    exclusive_start_key = None
    if before is not None:
        exclusive_start_key = {"community_id": community_id, "message_id": before}

    while len(collected) < limit:
        query_kwargs = {
            "KeyConditionExpression": Key("community_id").eq(community_id),
            "FilterExpression": Attr("is_deleted").ne(True),
            "ScanIndexForward": False,  # descending by message_id
            "Limit": max(limit - len(collected), 1) + 10,  # small buffer to absorb filtered-out deleted rows
        }
        if exclusive_start_key:
            query_kwargs["ExclusiveStartKey"] = exclusive_start_key

        response = _table.query(**query_kwargs)
        collected.extend(response.get("Items", []))
        exclusive_start_key = response.get("LastEvaluatedKey")

        if not exclusive_start_key:
            break

    has_more = exclusive_start_key is not None or len(collected) > limit
    return [_clean(item) for item in collected[:limit]], has_more


def soft_delete_message(community_id: int, message_id: str, deleted_by: int) -> dict | None:
    """
    Mark a message deleted. Returns the updated item, or None if it didn't exist.
    """
    try:
        response = _table.update_item(
            Key={"community_id": community_id, "message_id": message_id},
            UpdateExpression="SET is_deleted = :true, deleted_at = :dt, deleted_by = :db",
            ConditionExpression="attribute_exists(message_id)",
            ExpressionAttributeValues={
                ":true": True,
                ":dt": int(time.time()),
                ":db": deleted_by,
            },
            ReturnValues="ALL_NEW",
        )
        return _clean(response.get("Attributes"))
    except _dynamodb.meta.client.exceptions.ConditionalCheckFailedException:
        return None

def get_new_messages(community_id: int, after_message_id: str, limit: int = 50):
    """
    Returns messages newer than after_message_id
    """
    query_kwargs = {
        "KeyConditionExpression": Key("community_id").eq(community_id) & Key("message_id").gt(after_message_id),
        "FilterExpression": Attr("is_deleted").ne(True),
        "ScanIndexForward": True, 
        "Limit": limit,
    }
    response = _table.query(**query_kwargs)
    return [_clean(item) for item in response.get("Items", [])]

def get_recently_deleted(community_id: int, since_timestamp: int, limit: int = 100):
    """
    Updates recently deleted messages with the live functionality
    """
    response = _table.query(
        KeyConditionExpression=Key("community_id").eq(community_id),
        FilterExpression=Attr("is_deleted").eq(True) & Attr("deleted_at").gt(since_timestamp),
        Limit=limit,
    )
    items = [_clean(item) for item in response.get("Items", [])]
    return [item["message_id"] for item in items]
