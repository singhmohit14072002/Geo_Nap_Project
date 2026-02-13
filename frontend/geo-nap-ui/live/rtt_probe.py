import subprocess
import re

def ping(host):
    result = subprocess.run(["ping", "-n", "4", host],
                            capture_output=True, text=True)
    match = re.findall(r"Average = (\d+)ms", result.stdout)
    return float(match[0]) if match else None

def get_live_rtt():
    hosts = {
        "aws_mumbai": "ec2.ap-south-1.amazonaws.com",
        "azure_mumbai": "azure.microsoft.com",
        "gcp_singapore": "cloud.google.com"
    }
    return {k: ping(v) for k, v in hosts.items()}
