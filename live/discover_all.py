import json
from azure import get_azure
from vast import get_vast
from runpod import get_runpod
from lambda_labs import get_lambda
from paperspace import get_paperspace
from aws import get_aws
from gcp import get_gcp

def discover_all():
    data = []

    # Public / mostly stable
    data += get_azure()
    data += get_vast()
    data += get_paperspace()

    # Semi-public
    data += get_lambda()
    data += get_runpod()

    # Private hyperscalers
    data += get_aws()
    data += get_gcp()

    json.dump(data, open("cache/providers.json","w"), indent=2)
    print("Discovered", len(data), "GPU providers")

if __name__ == "__main__":
    discover_all()
