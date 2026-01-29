import boto3
from boto3.dynamodb.conditions import Key
from typing import Any, Dict, Optional, Tuple
from decimal import Decimal

dynamodb = boto3.resource("dynamodb")

def table(name: str):
    return dynamodb.Table(name)

def get_item(table_name: str, key: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    resp = table(table_name).get_item(Key=key)
    item = resp.get("Item")
    return _normalize(item) if item else None

def put_item(table_name: str, item: Dict[str, Any]) -> None:
    table(table_name).put_item(Item=item)

def query(table_name: str, key_condition, limit: int = 50, exclusive_start_key: Optional[Dict[str, Any]] = None) -> Tuple[list, Optional[Dict[str, Any]]]:
    kwargs = {"KeyConditionExpression": key_condition, "Limit": limit}
    if exclusive_start_key:
        kwargs["ExclusiveStartKey"] = exclusive_start_key
    resp = table(table_name).query(**kwargs)
    items = [_normalize(i) for i in resp.get("Items", [])]
    lek = resp.get("LastEvaluatedKey")
    return items, _normalize(lek) if lek else None

def query_gsi(table_name: str, index_name: str, key_condition, limit: int = 1) -> Optional[Dict[str, Any]]:
    resp = table(table_name).query(
        IndexName=index_name,
        KeyConditionExpression=key_condition,
        Limit=limit,
    )
    items = [_normalize(i) for i in resp.get("Items", [])]
    return items[0] if items else None

def query_media_items(table_name: str, team_id: str, limit: int = 30, cursor: Optional[str] = None) -> Tuple[list, Optional[str]]:
    """Query media items for a team with pagination (newest first)."""
    import json
    
    eks = None
    if cursor:
        try:
            eks = json.loads(cursor)
        except Exception:
            eks = None
    
    # Query with newest first by using ScanIndexForward=False
    kwargs = {"KeyConditionExpression": Key("team_id").eq(team_id), "Limit": limit, "ScanIndexForward": False}
    if eks:
        kwargs["ExclusiveStartKey"] = eks
    resp = table(table_name).query(**kwargs)
    items = [_normalize(i) for i in resp.get("Items", [])]
    lek = resp.get("LastEvaluatedKey")
    
    next_cursor = json.dumps(lek) if lek else None
    return items, next_cursor

def query_media_by_id(table_name: str, media_id: str):
    """
    Returns a dict-like item with keys as plain python strings:
    team_id, sk, object_key, thumb_key, filename, content_type...
    Assumes GSI1 has gsi1pk = media_id.
    """
    resp = table(table_name).query(
        IndexName="gsi1",
        KeyConditionExpression=Key("gsi1pk").eq(media_id),
        Limit=1,
    )
    items = resp.get("Items", [])
    return _normalize(items[0]) if items else None

def delete_item(table_name: str, key: dict):
    table(table_name).delete_item(Key=key)

def _normalize(obj: Any) -> Any:
    """
    Convert DynamoDB Decimal values (and nested structures) into JSON-serializable
    Python types (int/float), preserving strings and other primitives.
    """
    if isinstance(obj, Decimal):
        # Cast to int if integral, else float for safety.
        return int(obj) if obj % 1 == 0 else float(obj)
    if isinstance(obj, list):
        return [_normalize(v) for v in obj]
    if isinstance(obj, dict):
        return {k: _normalize(v) for k, v in obj.items()}
    return obj