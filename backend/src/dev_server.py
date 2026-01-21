import os
from dotenv import load_dotenv
from flask import Flask, request, jsonify
from flask_cors import CORS
import json
from main import handler

# Load environment variables for local dev (e.g., AWS creds, table names)
load_dotenv()
os.environ.setdefault("AWS_REGION", os.getenv("AWS_REGION", "us-east-1"))

app = Flask(__name__)
CORS(app)

@app.route('/<path:path>', methods=['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'])
def catch_all(path):
    # Convert Flask request to Lambda event format
    body = request.get_data(as_text=True) or None
    
    event = {
        'requestContext': {
            'http': {
                'method': request.method,
                'path': f'/{path}'
            }
        },
        'rawPath': f'/{path}',
        'body': body,
        'headers': dict(request.headers),
        'queryStringParameters': dict(request.args) or None,
    }
    
    # Call the Lambda handler
    response = handler(event, None)
    
    # Extract status code and body
    status_code = response.get('statusCode', 200)
    body = response.get('body', '{}')
    
    # Parse body if it's a string
    if isinstance(body, str):
        body = json.loads(body)
    
    return jsonify(body), status_code

if __name__ == '__main__':
    port = int(os.getenv("PORT", "8000"))
    app.run(debug=True, host='0.0.0.0', port=port)