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