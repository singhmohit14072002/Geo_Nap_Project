import boto3
from botocore.exceptions import NoCredentialsError

def get_aws():
    try:
        ec2 = boto3.client("ec2", region_name="us-east-1")
        regions = ec2.describe_regions()["Regions"]
    except NoCredentialsError:
        print("AWS credentials not found, skipping AWS")
        return []

    results = []
    for r in regions:
        results.append({
            "provider": "aws",
            "region": r["RegionName"],
            "gpu": "A100",
            "price": 2.5,
            "bandwidth": 10
        })
    return results
