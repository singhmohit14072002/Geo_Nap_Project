import os
import time
from typing import Any, Dict, Optional

import requests


DEFAULT_COST_ESTIMATOR_BASE_URL = "http://127.0.0.1:4001"
DEFAULT_COST_ESTIMATOR_URL = f"{DEFAULT_COST_ESTIMATOR_BASE_URL}/estimate"


class CostEstimatorApiError(Exception):
    """Raised when the cost estimator backend call fails."""


_TOKEN_CACHE: Optional[str] = None
_PROJECT_CACHE: Dict[str, str] = {}


def _extract_error_message(response: requests.Response, default: str) -> str:
    try:
        body = response.json()
        if isinstance(body, dict):
            if isinstance(body.get("error"), dict):
                nested = body["error"]
                if isinstance(nested.get("message"), str):
                    return nested["message"]
            if isinstance(body.get("error"), str):
                return body["error"]
            if isinstance(body.get("message"), str):
                return body["message"]
    except ValueError:
        pass
    return default


def _base_url() -> str:
    explicit = os.getenv("COST_ESTIMATOR_API_BASE_URL")
    if explicit and explicit.strip():
        return explicit.rstrip("/")
    endpoint = os.getenv("COST_ESTIMATOR_API_URL", DEFAULT_COST_ESTIMATOR_URL).rstrip("/")
    if endpoint.endswith("/estimate"):
        return endpoint[: -len("/estimate")]
    return endpoint


def _auth_headers(token: str) -> Dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def _demo_auth_identity() -> Dict[str, str]:
    return {
        "email": os.getenv("COST_ESTIMATOR_DEMO_EMAIL", "demo@geonap.local"),
        "password": os.getenv("COST_ESTIMATOR_DEMO_PASSWORD", "Demo12345!"),
        "organizationName": os.getenv("COST_ESTIMATOR_DEMO_ORG", "GeoNAP Demo"),
    }


def _login(base: str, email: str, password: str) -> Optional[str]:
    endpoint = f"{base}/auth/login"
    try:
        response = requests.post(
            endpoint,
            json={"email": email, "password": password},
            timeout=20,
        )
    except requests.RequestException as exc:
        raise CostEstimatorApiError(
            f"Unable to connect to cost-estimator-service auth endpoint at {endpoint}."
        ) from exc

    if response.status_code >= 400:
        return None

    try:
        payload = response.json()
    except ValueError:
        return None
    token = payload.get("token")
    return token if isinstance(token, str) and token.strip() else None


def _register(base: str, email: str, password: str, organization_name: str) -> str:
    endpoint = f"{base}/auth/register"
    try:
        response = requests.post(
            endpoint,
            json={
                "email": email,
                "password": password,
                "organizationName": organization_name,
            },
            timeout=20,
        )
    except requests.RequestException as exc:
        raise CostEstimatorApiError(
            f"Unable to connect to cost-estimator-service auth endpoint at {endpoint}."
        ) from exc

    if response.status_code >= 400:
        msg = _extract_error_message(
            response,
            f"Registration failed with status {response.status_code}.",
        )
        raise CostEstimatorApiError(msg)

    try:
        payload = response.json()
    except ValueError as exc:
        raise CostEstimatorApiError("Registration endpoint returned a non-JSON response.") from exc

    token = payload.get("token")
    if not isinstance(token, str) or not token.strip():
        raise CostEstimatorApiError("Registration response missing authentication token.")
    return token


def _ensure_auth_token(base: str) -> str:
    global _TOKEN_CACHE
    if _TOKEN_CACHE:
        return _TOKEN_CACHE

    identity = _demo_auth_identity()
    email = identity["email"]
    password = identity["password"]
    organization_name = identity["organizationName"]

    token = _login(base, email, password)
    if not token:
        try:
            token = _register(base, email, password, organization_name)
        except CostEstimatorApiError:
            # If another process already registered this user, retry login once.
            token = _login(base, email, password)

    if not token:
        raise CostEstimatorApiError("Authentication failed for cost-estimator-service.")

    _TOKEN_CACHE = token
    return token


def _ensure_project(base: str, token: str, region: str) -> str:
    region_key = (region or "centralindia").strip().lower()
    if region_key in _PROJECT_CACHE:
        return _PROJECT_CACHE[region_key]

    list_endpoint = f"{base}/projects"
    try:
        response = requests.get(
            list_endpoint,
            headers=_auth_headers(token),
            timeout=20,
        )
    except requests.RequestException as exc:
        raise CostEstimatorApiError(
            f"Unable to list projects from {list_endpoint}."
        ) from exc

    if response.status_code >= 400:
        msg = _extract_error_message(
            response,
            f"Project listing failed with status {response.status_code}.",
        )
        raise CostEstimatorApiError(msg)

    try:
        payload = response.json()
    except ValueError as exc:
        raise CostEstimatorApiError("Project listing returned non-JSON response.") from exc

    projects = payload.get("projects", [])
    if isinstance(projects, list):
        for project in projects:
            if not isinstance(project, dict):
                continue
            project_region = str(project.get("region", "")).strip().lower()
            project_id = project.get("id")
            if project_region == region_key and isinstance(project_id, str):
                _PROJECT_CACHE[region_key] = project_id
                return project_id

    create_endpoint = f"{base}/projects"
    project_name = f"GeoNAP {region_key}"
    try:
        response = requests.post(
            create_endpoint,
            headers=_auth_headers(token),
            json={"name": project_name, "region": region_key},
            timeout=20,
        )
    except requests.RequestException as exc:
        raise CostEstimatorApiError(
            f"Unable to create project via {create_endpoint}."
        ) from exc

    if response.status_code >= 400:
        msg = _extract_error_message(
            response,
            f"Project creation failed with status {response.status_code}.",
        )
        raise CostEstimatorApiError(msg)

    try:
        project_payload = response.json()
    except ValueError as exc:
        raise CostEstimatorApiError("Project creation returned non-JSON response.") from exc

    project_id = project_payload.get("id")
    if not isinstance(project_id, str) or not project_id.strip():
        raise CostEstimatorApiError("Project creation response missing project id.")

    _PROJECT_CACHE[region_key] = project_id
    return project_id


def estimate_cost(payload: Dict[str, Any]) -> Dict[str, Any]:
    global _TOKEN_CACHE
    base = _base_url()
    endpoint = f"{base}/estimate"
    poll_interval_sec = float(os.getenv("COST_ESTIMATOR_POLL_INTERVAL_SEC", "2"))
    timeout_sec = float(os.getenv("COST_ESTIMATOR_TIMEOUT_SEC", "60"))

    region = str(payload.get("region", "centralindia"))
    token = _ensure_auth_token(base)
    project_id = payload.get("projectId")
    if not isinstance(project_id, str) or not project_id.strip():
        project_id = _ensure_project(base, token, region)

    request_payload = dict(payload)
    request_payload["projectId"] = project_id

    try:
        response = requests.post(
            endpoint,
            json=request_payload,
            headers=_auth_headers(token),
            timeout=20,
        )
        if response.status_code == 401:
            _TOKEN_CACHE = None
            token = _ensure_auth_token(base)
            response = requests.post(
                endpoint,
                json=request_payload,
                headers=_auth_headers(token),
                timeout=20,
            )
    except requests.RequestException as exc:
        raise CostEstimatorApiError(
            f"Unable to connect to cost-estimator-service at {endpoint}."
        ) from exc

    if response.status_code >= 400:
        message = _extract_error_message(
            response,
            f"Request failed with status {response.status_code}.",
        )

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
            status_response = requests.get(
                status_endpoint,
                headers=_auth_headers(token),
                timeout=20,
            )
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
