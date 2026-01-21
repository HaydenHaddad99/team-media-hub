#!/usr/bin/env python3
import boto3

cf_client = boto3.client('cloudfront', region_name='us-east-1')

distribution_config = {
    "CallerReference": "team-media-hub-1",
    "Comment": "Team Media Hub Frontend",
    "Enabled": True,
    "DefaultRootObject": "index.html",
    "Origins": {
        "Quantity": 1,
        "Items": [
            {
                "Id": "S3-team-media-hub-frontend",
                "DomainName": "team-media-hub-frontend-1768953690.s3.us-east-1.amazonaws.com",
                "S3OriginConfig": {
                    "OriginAccessIdentity": ""
                }
            }
        ]
    },
    "DefaultCacheBehavior": {
        "TargetOriginId": "S3-team-media-hub-frontend",
        "ViewerProtocolPolicy": "redirect-to-https",
        "TrustedSigners": {
            "Enabled": False,
            "Quantity": 0
        },
        "ForwardedValues": {
            "QueryString": False,
            "Cookies": {
                "Forward": "none"
            }
        },
        "MinTTL": 0,
        "DefaultTTL": 86400,
        "MaxTTL": 31536000
    },
    "CacheBehaviors": {
        "Quantity": 0,
        "Items": []
    },
    "CustomErrorResponses": {
        "Quantity": 1,
        "Items": [
            {
                "ErrorCode": 404,
                "ErrorCachingMinTTL": 300,
                "ResponsePagePath": "/index.html",
                "ResponseCode": "200"
            }
        ]
    }
}

response = cf_client.create_distribution(DistributionConfig=distribution_config)
print(f"Distribution ID: {response['Distribution']['Id']}")
print(f"Domain Name: {response['Distribution']['DomainName']}")
print(f"Status: {response['Distribution']['Status']}")
