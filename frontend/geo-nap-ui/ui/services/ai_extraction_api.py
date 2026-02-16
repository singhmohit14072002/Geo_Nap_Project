import os
from typing import Any, Dict, Optional

import requests


DEFAULT_AI_EXTRACTION_URL = "http://localhost:4010"


class AiExtractionApiError(Exception):
    """Raised when AI extraction service calls fail."""


def _extract_error_message(response: requests.Response, default_msg: str) -> str:
    try:
        payload = response.json()
        if isinstance(payload, dict):
            if isinstance(payload.get("error"), str):
                return payload["error"]
            if isinstance(payload.get("message"), str):
                return payload["message"]
    except ValueError:
        pass
    return default_msg


def _base_url() -> str:
    return os.getenv("AI_EXTRACTION_API_URL", DEFAULT_AI_EXTRACTION_URL).rstrip("/")


def extract_requirements(
    file_name: str,
    file_bytes: bytes,
    mime_type: Optional[str] = None
) -> Dict[str, Any]:
    endpoint = f"{_base_url()}/extract"
    files = {
        "file": (file_name, file_bytes, mime_type or "application/octet-stream")
    }

    try:
        response = requests.post(endpoint, files=files, timeout=180)
    except requests.RequestException as exc:
        raise AiExtractionApiError(
            f"Unable to connect to ai-extraction-service at {endpoint}."
        ) from exc

    if response.status_code >= 400:
        msg = _extract_error_message(
            response,
            f"Extraction request failed with status {response.status_code}."
        )
        raise AiExtractionApiError(msg)

    try:
        payload = response.json()
    except ValueError as exc:
        raise AiExtractionApiError("Extraction service returned a non-JSON response.") from exc

    if not isinstance(payload, dict):
        raise AiExtractionApiError("Extraction service returned invalid payload format.")

    return payload


def submit_clarifications(
    candidate: Dict[str, Any],
    clarifications: Dict[str, Any]
) -> Dict[str, Any]:
    endpoint = f"{_base_url()}/extract/clarify"
    body = {
        "candidate": candidate,
        "clarifications": clarifications
    }

    try:
        response = requests.post(endpoint, json=body, timeout=180)
    except requests.RequestException as exc:
        raise AiExtractionApiError(
            f"Unable to connect to ai-extraction-service at {endpoint}."
        ) from exc

    if response.status_code >= 400:
        msg = _extract_error_message(
            response,
            f"Clarification request failed with status {response.status_code}."
        )
        raise AiExtractionApiError(msg)

    try:
        payload = response.json()
    except ValueError as exc:
        raise AiExtractionApiError("Clarification endpoint returned non-JSON response.") from exc

    if not isinstance(payload, dict):
        raise AiExtractionApiError("Clarification endpoint returned invalid payload format.")

    return payload
