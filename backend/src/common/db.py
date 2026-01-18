import boto3
from boto3.dynamodb.conditions import Key
from typing import Any, Dict, Optional

dynamodb = boto3.resource("dynamodb")

def table(name: str):
    return dynamodb.Table(name)

def get_item(table_name: str, key: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    resp = table(table_name).get_item(Key=key)
    return resp.get("Item")

def put_item(table_name: str, item: Dict[str, Any]) -> None:
    table(table_name).put_item(Item=item)

def query(table_name: str, key_condition, limit: int = 50, exclusive_start_key: Optional[Dict[str, Any]] = None):
    kwargs = {"KeyConditionExpression": key_condition, "Limit": limit}
    if exclusive_start_key:
        kwargs["ExclusiveStartKey"] = exclusive_start_key
    resp = table(table_name).query(**kwargs)
    return resp.get("Items", []), resp.get("LastEvaluatedKey")

def query_gsi(table_name: str, index_name: str, key_condition, limit: int = 1):
    resp = table(table_name).query(
        IndexName=index_name,
        KeyConditionExpression=key_condition,
        Limit=limit,
    )
    items = resp.get("Items", [])
    return items[0] if items else None