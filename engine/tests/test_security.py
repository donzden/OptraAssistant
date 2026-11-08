"""
Unit tests for core/security.py — internal API key gate shared by all
engine endpoints that the Node API calls.
"""
from unittest.mock import patch

import pytest
from fastapi import HTTPException

from app.core.security import require_internal_key


def test_accepts_the_configured_key():
    with patch("app.core.security.settings") as mock_settings:
        mock_settings.internal_api_key = "correct-key"
        assert require_internal_key("correct-key") == "correct-key"


def test_rejects_an_incorrect_key():
    with patch("app.core.security.settings") as mock_settings:
        mock_settings.internal_api_key = "correct-key"
        with pytest.raises(HTTPException) as exc_info:
            require_internal_key("wrong-key")
    assert exc_info.value.status_code == 401


def test_rejects_a_missing_key():
    with patch("app.core.security.settings") as mock_settings:
        mock_settings.internal_api_key = "correct-key"
        with pytest.raises(HTTPException) as exc_info:
            require_internal_key(None)
    assert exc_info.value.status_code == 401
