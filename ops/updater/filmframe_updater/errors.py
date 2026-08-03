from __future__ import annotations


SAFE_ERROR_MESSAGES = {
    "invalid_request": "The updater request is invalid.",
    "request_too_large": "The updater request exceeds the size limit.",
    "peer_forbidden": "The local caller is not authorized.",
    "update_busy": "Another update is already active.",
    "idempotency_conflict": "The idempotency key was used for another target.",
    "job_not_found": "The update job was not found.",
    "release_not_found": "The requested stable release is unavailable.",
    "release_untrusted": "The release could not be verified.",
    "updater_upgrade_required": "The host updater must be upgraded first.",
    "migration_incompatible": "The release requires a maintenance deployment.",
    "updater_unavailable": "The host updater is temporarily unavailable.",
    "internal_error": "The updater could not complete the request.",
}


class UpdaterError(Exception):
    def __init__(self, code: str, *, retryable: bool = False) -> None:
        if code not in SAFE_ERROR_MESSAGES:
            code = "internal_error"
        super().__init__(SAFE_ERROR_MESSAGES[code])
        self.code = code
        self.retryable = retryable


class DeploymentError(Exception):
    """A safe deployment failure classification; details stay in journald."""

    def __init__(self, code: str) -> None:
        super().__init__(code)
        self.code = code
