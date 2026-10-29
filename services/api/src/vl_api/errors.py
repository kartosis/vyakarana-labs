"""RFC 9457 problem responses.

CloudFront maps origin 403s to the site's 404 page (S3 answers 403 for missing keys), so this API
never returns 403: authentication failures are 401, and admin-only routes answer 404 to non-admins.
"""

from __future__ import annotations

import json

from aws_lambda_powertools.event_handler import Response

PROBLEM = "application/problem+json"
BASE = "https://sanskrit.identifyragas.com/problems/"


class ApiError(Exception):
    def __init__(self, status: int, slug: str, title: str, detail: str | None = None) -> None:
        super().__init__(title)
        if status == 403:  # see module docstring
            raise ValueError("use 401 or 404 instead of 403")
        self.status = status
        self.slug = slug
        self.title = title
        self.detail = detail

    def response(self) -> Response[str]:
        body: dict[str, object] = {"type": BASE + self.slug, "title": self.title, "status": self.status}
        if self.detail:
            body["detail"] = self.detail
        return Response(status_code=self.status, content_type=PROBLEM, body=json.dumps(body))


def unauthorized(detail: str = "Sign in again.") -> ApiError:
    return ApiError(401, "unauthorized", "Not signed in", detail)


def not_found(detail: str | None = None) -> ApiError:
    return ApiError(404, "not-found", "Not found", detail)


def bad_request(detail: str) -> ApiError:
    return ApiError(400, "bad-request", "Invalid request", detail)


def conflict(detail: str) -> ApiError:
    return ApiError(409, "conflict", "Conflict", detail)


def too_many(detail: str) -> ApiError:
    return ApiError(429, "too-many-requests", "Slow down", detail)
