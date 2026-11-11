from __future__ import annotations

import csv
import hashlib
import io
import json
import logging
import multiprocessing
import os
import signal
import socket
import sys
import time
import uuid
from collections.abc import Mapping
from threading import Event
from urllib.error import HTTPError, URLError
from urllib.parse import urlsplit
from urllib.request import Request, urlopen

from engine import recommend_for_user

ENGINE_VERSION = "python-ubcf-v1"
MAX_SNAPSHOT_BYTES = 20 * 1024 * 1024
MAX_RESULT_BYTES = 2 * 1024 * 1024
MAX_RESULT_ROWS = 10_000
MAX_ACTIVE_FOODS = 10_000
LOG = logging.getLogger("foodrec.worker")


class WorkerError(Exception):
    def __init__(self, code: str, *, retryable: bool = True):
        super().__init__(code)
        self.code = code
        self.retryable = retryable


def validate_parameters(value: object) -> dict[str, object]:
    if not isinstance(value, dict):
        raise WorkerError("INVALID_JOB_PARAMETERS", retryable=False)
    k_neighbors = value.get("kNeighbors")
    top_n = value.get("topN")
    min_common_ratings = value.get("minCommonRatings")
    active_food_ids = value.get("activeFoodIds")
    if (
        value.get("similarityStrategy") != "overlap"
        or type(k_neighbors) is not int
        or not 1 <= k_neighbors <= 100
        or type(top_n) is not int
        or not 1 <= top_n <= 100
        or type(min_common_ratings) is not int
        or min_common_ratings < 1
        or not isinstance(active_food_ids, list)
        or len(active_food_ids) > MAX_ACTIVE_FOODS
        or any(type(food_id) is not int or food_id < 1 for food_id in active_food_ids)
        or len(set(active_food_ids)) != len(active_food_ids)
    ):
        raise WorkerError("INVALID_JOB_PARAMETERS", retryable=False)
    return {
        "kNeighbors": k_neighbors,
        "topN": top_n,
        "minCommonRatings": min_common_ratings,
        "similarityStrategy": "overlap",
        "activeFoodIds": active_food_ids,
    }


def parse_snapshot(buffer: bytes, expected_checksum: str, expected_rows: int) -> dict[int, dict[int, int]]:
    if len(buffer) > MAX_SNAPSHOT_BYTES:
        raise WorkerError("SNAPSHOT_TOO_LARGE", retryable=False)
    if hashlib.sha256(buffer).hexdigest() != expected_checksum:
        raise WorkerError("SNAPSHOT_CHECKSUM_MISMATCH", retryable=False)
    try:
        text = buffer.decode("utf-8-sig")
        reader = csv.DictReader(io.StringIO(text, newline=""), strict=True)
        if reader.fieldnames != ["user_id", "food_id", "rating"]:
            raise WorkerError("SNAPSHOT_INVALID", retryable=False)
        ratings: dict[int, dict[int, int]] = {}
        row_count = 0
        for row in reader:
            if None in row or any(row.get(key) is None for key in ("user_id", "food_id", "rating")):
                raise WorkerError("SNAPSHOT_INVALID", retryable=False)
            user_id, food_id, rating = (int(row[key]) for key in ("user_id", "food_id", "rating"))
            if user_id < 1 or food_id < 1 or not 1 <= rating <= 5:
                raise WorkerError("SNAPSHOT_INVALID", retryable=False)
            user_ratings = ratings.setdefault(user_id, {})
            if food_id in user_ratings:
                raise WorkerError("SNAPSHOT_INVALID", retryable=False)
            user_ratings[food_id] = rating
            row_count += 1
    except WorkerError:
        raise
    except (UnicodeError, csv.Error, TypeError, ValueError):
        raise WorkerError("SNAPSHOT_INVALID", retryable=False) from None
    if row_count != expected_rows or row_count == 0:
        raise WorkerError("SNAPSHOT_INVALID", retryable=False)
    return ratings


def compute_result(ratings: Mapping[int, Mapping[int, int]], raw_parameters: object) -> dict[str, list[dict[str, int | float]]]:
    parameters = validate_parameters(raw_parameters)
    rows: list[dict[str, int | float]] = []
    for user_id in sorted(ratings):
        result = recommend_for_user(
            user_id,
            ratings,
            parameters["activeFoodIds"],
            k_neighbors=parameters["kNeighbors"],
            top_n=parameters["topN"],
            min_common_ratings=parameters["minCommonRatings"],
            similarity_strategy=parameters["similarityStrategy"],
        )
        rows.extend(
            {
                "userId": user_id,
                "foodId": item.food_id,
                "rank": rank,
                "predictedRating": item.predicted_rating,
            }
            for rank, item in enumerate(result.recommendations, start=1)
        )
        if len(rows) > MAX_RESULT_ROWS:
            raise WorkerError("RESULT_TOO_LARGE", retryable=False)
    payload = {"recommendations": rows}
    if len(json.dumps(payload, separators=(",", ":")).encode("utf-8")) > MAX_RESULT_BYTES:
        raise WorkerError("RESULT_TOO_LARGE", retryable=False)
    return payload


def _compute_child(ratings: dict[int, dict[int, int]], parameters: object, connection) -> None:
    try:
        connection.send(("ok", compute_result(ratings, parameters)))
    except WorkerError as error:
        connection.send(("error", error.code))
    except Exception:
        connection.send(("error", "ENGINE_ERROR"))
    finally:
        connection.close()


class ApiClient:
    def __init__(self, base_url: str, secret: str, timeout: float = 10):
        parsed = urlsplit(base_url)
        local_hosts = {"localhost", "127.0.0.1", "::1"}
        if (
            parsed.scheme not in {"http", "https"}
            or not parsed.hostname
            or parsed.username
            or parsed.password
            or parsed.path not in {"", "/"}
            or parsed.query
            or parsed.fragment
        ):
            raise ValueError("FOODREC_WORKER_API_URL must be an HTTP(S) origin without credentials.")
        if parsed.scheme != "https" and parsed.hostname not in local_hosts:
            raise ValueError("Worker API requires HTTPS outside localhost.")
        if len(secret) < 32:
            raise ValueError("FOODREC_WORKER_SECRET must contain at least 32 characters.")
        self.base_url = base_url.rstrip("/")
        self.secret = secret
        self.timeout = timeout

    def request(self, method: str, path: str, *, payload: object | None = None, identity: Mapping[str, str] | None = None, max_bytes: int = 1024 * 1024):
        data = None if payload is None else json.dumps(payload, separators=(",", ":")).encode("utf-8")
        headers = {"Authorization": f"Bearer {self.secret}", "Accept": "application/json"}
        if data is not None:
            headers["Content-Type"] = "application/json"
        if identity:
            headers["X-FoodRec-Worker-Id"] = identity["workerId"]
            headers["X-FoodRec-Lease-Token"] = identity["leaseToken"]
        request = Request(f"{self.base_url}{path}", data=data, headers=headers, method=method)
        try:
            with urlopen(request, timeout=self.timeout) as response:
                body = response.read(max_bytes + 1)
                if len(body) > max_bytes:
                    raise WorkerError("RESPONSE_TOO_LARGE", retryable=False)
                return response.status, response.headers, body
        except HTTPError as error:
            body = error.read(min(max_bytes, 4096))
            try:
                error_code = json.loads(body).get("error", {}).get("code", "HTTP_ERROR")
            except (ValueError, AttributeError):
                error_code = "HTTP_ERROR"
            raise WorkerError(str(error_code), retryable=error.code >= 500 or error.code in {408, 429}) from None
        except (URLError, TimeoutError, OSError):
            raise WorkerError("NETWORK_ERROR") from None

    def claim(self, worker_id: str):
        status, _, body = self.request(
            "POST", "/api/internal/recommendation-jobs/claim",
            payload={"workerId": worker_id, "engineVersion": ENGINE_VERSION},
        )
        if status == 204:
            return None
        try:
            job = json.loads(body)["data"]
            if job["engineVersion"] != ENGINE_VERSION:
                raise WorkerError("ENGINE_VERSION_UNSUPPORTED", retryable=False)
            if not isinstance(job.get("leaseToken"), str) or not isinstance(job.get("id"), str):
                raise WorkerError("INVALID_CLAIM_RESPONSE", retryable=False)
            return job
        except (KeyError, TypeError, ValueError):
            raise WorkerError("INVALID_CLAIM_RESPONSE", retryable=False) from None

    def schedule(self, worker_id: str):
        status, _, body = self.request(
            "POST", "/api/internal/recommendation-jobs/schedule",
            payload={"workerId": worker_id, "engineVersion": ENGINE_VERSION},
        )
        if status != 200:
            raise WorkerError("SCHEDULER_REQUEST_FAILED")
        try:
            return json.loads(body)["data"]
        except (KeyError, TypeError, ValueError):
            raise WorkerError("INVALID_SCHEDULER_RESPONSE", retryable=False) from None

    def snapshot(self, job: dict[str, object], identity: Mapping[str, str]) -> bytes:
        status, headers, body = self.request(
            "GET", f"/api/internal/recommendation-jobs/{job['id']}/snapshot", identity=identity,
            max_bytes=MAX_SNAPSHOT_BYTES,
        )
        if status != 200:
            raise WorkerError("SNAPSHOT_UNAVAILABLE")
        expected = str(job["datasetChecksum"])
        if headers.get("X-FoodRec-Snapshot-SHA256") != expected or hashlib.sha256(body).hexdigest() != expected:
            raise WorkerError("SNAPSHOT_CHECKSUM_MISMATCH", retryable=False)
        return body

    def heartbeat(self, job_id: str, identity: Mapping[str, str]) -> None:
        self.request("POST", f"/api/internal/recommendation-jobs/{job_id}/heartbeat", identity=identity, payload={})

    def report_failure(self, job_id: str, identity: Mapping[str, str], code: str):
        return self.request("POST", f"/api/internal/recommendation-jobs/{job_id}/fail", identity=identity, payload={"code": code})

    def submit_result(self, job_id: str, identity: Mapping[str, str], payload: object):
        return self.request(
            "POST", f"/api/internal/recommendation-jobs/{job_id}/result", identity=identity,
            payload=payload, max_bytes=1024 * 1024,
        )


def _report_failure(client: ApiClient, job: dict[str, object], identity: Mapping[str, str], code: str) -> None:
    try:
        client.report_failure(str(job["id"]), identity, code)
    except WorkerError as error:
        LOG.warning("job=%s failure-report=%s", job["id"], error.code)


def _run_in_child(ratings: dict[int, dict[int, int]], parameters: object, timeout_seconds: int, client: ApiClient, job: dict[str, object], identity: Mapping[str, str], stop_requested: Event) -> dict[str, list[dict[str, int | float]]] | None:
    context = multiprocessing.get_context("spawn")
    parent, child = context.Pipe(duplex=False)
    process = context.Process(target=_compute_child, args=(ratings, parameters, child), name=f"foodrec-job-{job['id']}")
    started = time.monotonic()
    deadline = started + timeout_seconds
    heartbeat_interval = max(1, min(15, int(job.get("leaseDurationSeconds", 60)) // 3))
    next_heartbeat = started + heartbeat_interval
    try:
        process.start()
        child.close()
        while process.is_alive():
            now = time.monotonic()
            if now >= deadline:
                process.terminate()
                process.join(timeout=2)
                if process.is_alive():
                    process.kill()
                    process.join()
                _report_failure(client, job, identity, "TIMEOUT")
                LOG.warning("job=%s attempt=%s failed=TIMEOUT", job["id"], job["attemptCount"])
                return None
            if now >= next_heartbeat:
                try:
                    client.heartbeat(str(job["id"]), identity)
                except WorkerError as error:
                    if error.code in {"LEASE_EXPIRED", "LEASE_LOST", "LEASE_NOT_OWNED", "JOB_NOT_FOUND"}:
                        process.terminate()
                        process.join(timeout=2)
                        if process.is_alive():
                            process.kill()
                            process.join()
                        LOG.warning("job=%s lease-lost=%s", job["id"], error.code)
                        return None
                    LOG.warning("job=%s heartbeat=%s", job["id"], error.code)
                next_heartbeat = now + heartbeat_interval
            process.join(timeout=0.25)
        if not parent.poll():
            _report_failure(client, job, identity, "ENGINE_ERROR")
            LOG.warning("job=%s attempt=%s failed=ENGINE_ERROR", job["id"], job["attemptCount"])
            return None
        result_type, value = parent.recv()
        if result_type != "ok":
            failure_code = str(value) if value in {"TIMEOUT", "SNAPSHOT_CHECKSUM_MISMATCH", "SNAPSHOT_INVALID", "SNAPSHOT_UNAVAILABLE"} else "ENGINE_ERROR"
            _report_failure(client, job, identity, failure_code)
            LOG.warning("job=%s attempt=%s failed=%s", job["id"], job["attemptCount"], failure_code)
            return None
        if stop_requested.is_set():
            LOG.info("job=%s completed during graceful shutdown; submitting result", job["id"])
        return value
    finally:
        child.close()
        parent.close()
        if process.is_alive():
            process.terminate()
            process.join(timeout=2)


def process_job(client: ApiClient, job: dict[str, object], worker_id: str, stop_requested: Event) -> None:
    identity = {"workerId": worker_id, "leaseToken": str(job["leaseToken"])}
    try:
        parameters = validate_parameters(job["parameters"])
        snapshot = client.snapshot(job, identity)
        ratings = parse_snapshot(snapshot, str(job["datasetChecksum"]), int(job["datasetRowCount"]))
        result = _run_in_child(
            ratings,
            parameters,
            int(job["timeoutSeconds"]),
            client,
            job,
            identity,
            stop_requested,
        )
        if result is None:
            return
        try:
            status, _, _ = client.submit_result(str(job["id"]), identity, result)
            if status not in {200, 201}:
                raise WorkerError("RESULT_REJECTED")
        except WorkerError as error:
            if error.retryable:
                try:
                    status, _, _ = client.submit_result(str(job["id"]), identity, result)
                    if status in {200, 201}:
                        LOG.info("job=%s status=SUCCEEDED rows=%s", job["id"], len(result["recommendations"]))
                        return
                except WorkerError as retry_error:
                    error = retry_error
            if error.code in {"LEASE_EXPIRED", "LEASE_LOST", "LEASE_NOT_OWNED"}:
                LOG.warning("job=%s result-lease-lost", job["id"])
                return
            _report_failure(client, job, identity, "WORKER_ERROR")
            LOG.warning("job=%s result=%s", job["id"], error.code)
            return
        LOG.info("job=%s status=SUCCEEDED rows=%s", job["id"], len(result["recommendations"]))
    except WorkerError as error:
        if error.code in {"LEASE_EXPIRED", "LEASE_LOST", "LEASE_NOT_OWNED", "JOB_NOT_FOUND"}:
            LOG.warning("job=%s lease-lost=%s", job["id"], error.code)
            return
        if error.retryable:
            code = "SNAPSHOT_UNAVAILABLE" if error.code in {"NETWORK_ERROR", "HTTP_ERROR"} else "WORKER_ERROR"
        else:
            code = error.code if error.code in {"SNAPSHOT_CHECKSUM_MISMATCH", "SNAPSHOT_INVALID"} else "ENGINE_ERROR"
        _report_failure(client, job, identity, code)
        LOG.warning("job=%s attempt=%s failed=%s", job["id"], job["attemptCount"], code)
    except Exception:
        _report_failure(client, job, identity, "ENGINE_ERROR")
        LOG.warning("job=%s attempt=%s failed=ENGINE_ERROR", job["id"], job["attemptCount"])


def main() -> int:
    logging.basicConfig(level=os.environ.get("FOODREC_WORKER_LOG_LEVEL", "INFO").upper(), format="%(asctime)s %(levelname)s %(message)s")
    secret = os.environ.get("FOODREC_WORKER_SECRET", "")
    base_url = os.environ.get("FOODREC_WORKER_API_URL", "http://127.0.0.1:3000")
    worker_id = os.environ.get("FOODREC_WORKER_ID") or f"{socket.gethostname()}-{uuid.uuid4()}"
    try:
        poll_seconds = float(os.environ.get("FOODREC_WORKER_POLL_SECONDS", "2"))
        if not 0.5 <= poll_seconds <= 60:
            raise ValueError
        client = ApiClient(base_url, secret)
    except ValueError as error:
        LOG.error("worker configuration invalid: %s", error or "FOODREC_WORKER_POLL_SECONDS must be between 0.5 and 60")
        return 2

    stop_requested = Event()

    def request_shutdown(_signal, _frame):
        LOG.info("shutdown requested; finish current job, then stop claiming")
        stop_requested.set()

    signal.signal(signal.SIGINT, request_shutdown)
    if hasattr(signal, "SIGTERM"):
        signal.signal(signal.SIGTERM, request_shutdown)
    LOG.info("worker started id=%s api=%s engine=%s", worker_id, base_url, ENGINE_VERSION)
    next_schedule_check = 0.0
    while not stop_requested.is_set():
        try:
            now = time.monotonic()
            if now >= next_schedule_check:
                outcome = client.schedule(worker_id)
                retry_after = outcome.get("retryAfterSeconds", 60)
                if type(retry_after) not in {int, float} or retry_after < 1:
                    retry_after = 60
                next_schedule_check = time.monotonic() + min(float(retry_after), 60)
                if outcome.get("checked"):
                    LOG.info("scheduler checked reason=%s scheduled=%s", outcome.get("reason"), outcome.get("scheduled"))
            if stop_requested.is_set():
                break
            job = client.claim(worker_id)
            if job is None:
                stop_requested.wait(poll_seconds)
                continue
            LOG.info("job=%s claimed attempt=%s/%s", job["id"], job["attemptCount"], job["maxAttempts"])
            process_job(client, job, worker_id, stop_requested)
        except WorkerError as error:
            LOG.warning("worker request=%s", error.code)
            next_schedule_check = time.monotonic() + poll_seconds
            stop_requested.wait(min(poll_seconds, 5))
    LOG.info("worker stopped id=%s", worker_id)
    return 0


if __name__ == "__main__":
    multiprocessing.freeze_support()
    sys.exit(main())
