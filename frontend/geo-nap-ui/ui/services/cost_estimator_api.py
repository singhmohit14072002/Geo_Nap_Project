import os
import time
from typing import Any, Dict

import requests


DEFAULT_COST_ESTIMATOR_URL = "http://localhost:4001/estimate"


class CostEstimatorApiError(Exception):
    """Raised when the cost estimator backend call fails."""


def estimate_cost(payload: Dict[str, Any]) -> Dict[str, Any]:
    endpoint = os.getenv("COST_ESTIMATOR_API_URL", DEFAULT_COST_ESTIMATOR_URL)
    poll_interval_sec = float(os.getenv("COST_ESTIMATOR_POLL_INTERVAL_SEC", "2"))
    timeout_sec = float(os.getenv("COST_ESTIMATOR_TIMEOUT_SEC", "60"))

    try:
        response = requests.post(endpoint, json=payload, timeout=20)
    except requests.RequestException as exc:
        raise CostEstimatorApiError(
            f"Unable to connect to cost-estimator-service at {endpoint}."
        ) from exc

    if response.status_code >= 400:
        message = f"Request failed with status {response.status_code}."
        try:
            body = response.json()
            if isinstance(body, dict):
                if isinstance(body.get("error"), dict):
                    message = body["error"].get("message", message)
                elif isinstance(body.get("message"), str):
                    message = body["message"]
        except ValueError:
            pass

        raise CostEstimatorApiError(message)

    try:
        submit_data = response.json()
    except ValueError as exc:
        raise CostEstimatorApiError(
            "Cost estimator returned a non-JSON response."
        ) from exc

    # Backward compatibility: if service still returns synchronous result.
    if isinstance(submit_data, dict) and "results" in submit_data:
        return submit_data

    if not isinstance(submit_data, dict) or "jobId" not in submit_data:
        raise CostEstimatorApiError(
            "Invalid async submit response from cost-estimator-service."
        )

    job_id = submit_data["jobId"]
    status_endpoint = endpoint.rstrip("/") + f"/{job_id}"
    deadline = time.time() + timeout_sec

    while time.time() <= deadline:
        try:
            status_response = requests.get(status_endpoint, timeout=20)
        except requests.RequestException as exc:
            raise CostEstimatorApiError(
                f"Unable to fetch estimate job status from {status_endpoint}."
            ) from exc

        if status_response.status_code >= 400:
            raise CostEstimatorApiError(
                f"Job status request failed with status {status_response.status_code}."
            )

        try:
            status_data = status_response.json()
        except ValueError as exc:
            raise CostEstimatorApiError(
                "Job status endpoint returned a non-JSON response."
            ) from exc

        if not isinstance(status_data, dict):
            raise CostEstimatorApiError("Invalid job status response payload.")

        status = str(status_data.get("status", "")).upper()
        if status == "COMPLETED":
            result = status_data.get("result", [])
            if not isinstance(result, list):
                raise CostEstimatorApiError("Completed job response has invalid result shape.")
            return {"results": result}

        if status == "FAILED":
            error_message = status_data.get("error", "Estimate job failed.")
            raise CostEstimatorApiError(str(error_message))

        # PROCESSING / PENDING
        time.sleep(poll_interval_sec)

    raise CostEstimatorApiError(
        f"Estimate job timed out after {timeout_sec:.0f} seconds."
    )
