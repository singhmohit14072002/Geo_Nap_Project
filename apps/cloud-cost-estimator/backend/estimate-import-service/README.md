# estimate-import-service

Parses Azure Pricing Calculator export rows into normalized structured service cost input.

## Endpoint
- `POST /import`

## Request
```json
{
  "parsedRows": [
    {
      "Service category": "Compute",
      "Service type": "Virtual Machines",
      "Description": "1 F8s v2 x 730 Hours",
      "Estimated monthly cost": "?267,894.50"
    }
  ]
}
```

## Response
```json
{
  "services": [
    {
      "serviceCategory": "Compute",
      "serviceType": "Virtual Machines",
      "region": "unknown",
      "skuName": "F8s",
      "quantity": 1,
      "providedMonthlyCost": 267894.5
    }
  ],
  "providedTotal": 267894.5
}
```
