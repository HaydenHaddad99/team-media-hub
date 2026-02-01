"""
Team code generation and validation.

Team codes are human-friendly identifiers for teams (e.g., DALLAS-11B-NORTH)
Used for joining teams without needing invite links.
"""
import re
import hashlib
import secrets
from typing import Optional, Dict
from common.db import get_item, put_item, query_items
from common.config import TABLE_TEAMS

# Team code format: WORD-WORD-WORD (2-4 words, uppercase, hyphens)
# Allow 2-12 chars per word segment
TEAM_CODE_RE = re.compile(r'^[A-Z0-9]{2,12}(-[A-Z0-9]{2,12}){1,3}$')

def generate_team_code(team_name: str) -> str:
    """
    Generate a unique team code from team name.
    
    Examples:
      "Dallas MLS 11B North" -> "DALLAS-11B-NORTH"
      "Houston Hurricanes" -> "HOUSTON-HURR"
    """
    # Clean and split
    words = re.sub(r'[^a-zA-Z0-9\s]', '', team_name).upper().split()
    
    # Build code from first 3-4 meaningful words
    code_parts = []
    for word in words[:4]:
        if len(word) >= 2:  # Skip single letters
            # Truncate long words
            if len(word) > 6:
                code_parts.append(word[:4])
            else:
                code_parts.append(word)
    
    # Ensure we have at least 2 parts
    if len(code_parts) < 2:
        code_parts.append(secrets.token_hex(2).upper())
    
    base_code = '-'.join(code_parts[:4])
    
    # Add random suffix if collision (check during creation)
    return base_code

def validate_team_code_format(code: str) -> bool:
    """Check if team code matches expected format."""
    return bool(TEAM_CODE_RE.match(code))

def get_team_by_code(team_code: str) -> Optional[Dict]:
    """
    Look up team by team code.
    Returns team record or None.
    """
    # Query teams table with team_code GSI (we'll add this)
    # For now, do a simple lookup assuming team_code is stored
    items, _ = query_items(
        TABLE_TEAMS,
        key_condition="team_code = :code",
        expression_values={":code": team_code},
        index_name="team-code-index",
        limit=1
    )
    
    return items[0] if items else None

def store_team_code(team_id: str, team_code: str) -> None:
    """Update team record with team_code."""
    from common.db import update_item
    from common.config import TABLE_TEAMS
    
    # Note: We'll need to add update_item helper
    # For now, just document that team_code should be set on creation
    pass
