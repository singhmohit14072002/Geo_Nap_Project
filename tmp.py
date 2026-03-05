import json
from ui.services.cost_estimator_api import estimate_cost

data = json.loads('''{"status":"VALID","requirement":{"compute":[],"database":{"engine":"none","storageGB":0,"ha":false},"network":{"dataEgressGB":0},"region":"centralindia"},"extractionModel":"azure_estimate_excel","azureEstimate":{"documentType":"CLOUD_ESTIMATE","mode":"AZURE_ESTIMATE_MODE","classifiedServices":[]}}''')
