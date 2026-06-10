#!/usr/bin/env python3
"""Parse and normalize login logs into an ECS-style schema."""

from __future__ import annotations

import argparse
import csv
import ipaddress
import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

LEGACY_LINE_RE = re.compile(
    r"^(?P<timestamp>\S+)\s+(?P<host>\S+)\s+(?P<service>[^:]+):\s+(?P<rest>.*)$"
)
KV_RE = re.compile(r"(?P<key>[A-Za-z0-9_.-]+)=(?P<value>\"(?:\\\"|[^\"])*\"|\S+)")

EVENT_ACTION_MAP = {
    "app.request": "app_request",
    "app_request": "app_request",
    "auth.login_success": "auth_success",
    "auth_success": "auth_success",
    "auth.login_fail": "auth_failed",
    "auth_failed": "auth_failed",
    "login_failed": "auth_failed",
    "validation_failed": "invalid_input",
    "invalid_input": "invalid_input",
    "auth.account_locked": "account_locked",
    "account_locked": "account_locked",
    "app.start": "service_start",
    "service_start": "service_start",
    "app.shutdown": "service_stop",
    "service_stop": "service_stop",
    "app.error_unhandled": "service_error",
    "service_error": "service_error",
    "auth.logout": "auth_logout",
    "auth_logout": "auth_logout",
}

EVENT_METADATA = {
    "service_start": {"category": ["process"], "type": ["start"], "outcome": "success"},
    "service_stop": {"category": ["process"], "type": ["end"], "outcome": "success"},
    "service_error": {"category": ["process"], "type": ["error"], "outcome": "failure"},
    "app_request": {"category": ["web"], "type": ["access"], "outcome": "unknown"},
    "auth_success": {"category": ["authentication"], "type": ["start"], "outcome": "success"},
    "auth_failed": {"category": ["authentication"], "type": ["start"], "outcome": "failure"},
    "account_locked": {"category": ["authentication"], "type": ["change"], "outcome": "failure"},
    "auth_logout": {"category": ["authentication"], "type": ["end"], "outcome": "success"},
    "invalid_input": {"category": ["authentication"], "type": ["info"], "outcome": "failure"},
    "unknown": {"category": ["application"], "type": ["info"], "outcome": "unknown"},
}

REASON_MAP = {
    "password_mismatch": "password_mismatch",
    "user_not_found": "user_not_found",
    "user_not_found_or_disabled": "user_not_found_or_disabled",
    "validation_failed": "validation_failed",
    "too_many_failures": "too_many_failures",
    "account_locked": "account_locked",
    "user_disabled": "user_disabled",
}

INT_FIELDS = {"server.port"}
BOOL_FIELDS: set[str] = set()
LEGACY_KEY_MAP = {
    "timestamp": "@timestamp",
    "host": "host.name",
    "service": "service.name",
    "level": "log.level",
    "event_type": "event.action",
    "event": "event.code",
    "user": "user.id",
    "src_ip": "source.ip",
    "requestId": "trace.id",
    "reason": "event.reason",
    "method": "http.request.method",
    "path": "url.path",
    "port": "server.port",
    "signal": "process.signal",
    "role": "user.roles",
}


def parse_kv_rest(rest: str) -> dict[str, str]:
    data: dict[str, str] = {}
    for item in KV_RE.finditer(rest.strip()):
        key = item.group("key")
        value = item.group("value")
        if value.startswith('"') and value.endswith('"'):
            value = value[1:-1].replace('\\"', '"')
        data[key] = value
    return data


def canonicalize_enum(value: str, mapping: dict[str, str]) -> str:
    normalized = value.strip().lower()
    if not normalized:
        return ""
    canonical = mapping.get(normalized)
    if canonical:
        return canonical
    return re.sub(r"[^a-z0-9]+", "_", normalized).strip("_")


def normalize_timestamp(value: str) -> str:
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    return parsed.astimezone(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def normalize_ip(value: str) -> str:
    ip = ipaddress.ip_address(value)
    if isinstance(ip, ipaddress.IPv6Address) and ip.ipv4_mapped:
        return str(ip.ipv4_mapped)
    return ip.compressed


def normalize_scalar(key: str, value: Any) -> Any:
    if value in ("", None):
        return None
    if key in INT_FIELDS:
        return int(value)
    if key in BOOL_FIELDS:
        if isinstance(value, bool):
            return value
        lowered = str(value).strip().lower()
        if lowered in {"true", "1"}:
            return True
        if lowered in {"false", "0"}:
            return False
    if key == "@timestamp":
        return normalize_timestamp(str(value))
    if key == "source.ip":
        return normalize_ip(str(value))
    if key == "event.action":
        return canonicalize_enum(str(value), EVENT_ACTION_MAP)
    if key == "event.reason":
        return canonicalize_enum(str(value), REASON_MAP)
    if key == "log.level":
        return str(value).upper()
    if key == "user.roles":
        if isinstance(value, list):
            return [str(item) for item in value]
        return [str(value)]
    return value


def enrich_event_metadata(record: dict[str, Any]) -> None:
    action = record.get("event.action")
    if not action:
        return
    metadata = EVENT_METADATA.get(action, EVENT_METADATA["unknown"])
    record.setdefault("event.kind", "event")
    record.setdefault("event.category", metadata["category"])
    record.setdefault("event.type", metadata["type"])
    record.setdefault("event.outcome", metadata["outcome"])


def normalize_record(record: dict[str, Any]) -> dict[str, Any]:
    normalized: dict[str, Any] = {}

    for key, value in record.items():
        mapped_key = LEGACY_KEY_MAP.get(key, key)
        if mapped_key in {"failCount", "maxAttempts", "forceChangePassword", "lockedUntil"}:
            continue
        normalized_value = normalize_scalar(mapped_key, value)
        if normalized_value is None:
            continue
        normalized[mapped_key] = normalized_value

    enrich_event_metadata(normalized)
    return normalized


def parse_json_line(line: str) -> dict[str, Any] | None:
    try:
        parsed = json.loads(line)
    except json.JSONDecodeError:
        return None
    if not isinstance(parsed, dict):
        return {"parse_error": line}
    return normalize_record(parsed)


def parse_legacy_line(line: str) -> dict[str, Any] | None:
    match = LEGACY_LINE_RE.match(line)
    if not match:
        return {"parse_error": line}
    base = match.groupdict()
    record = {
        "timestamp": base["timestamp"],
        "host": base["host"],
        "service": base["service"],
    }
    record.update(parse_kv_rest(base["rest"]))
    return normalize_record(record)


def parse_line(line: str) -> dict[str, Any] | None:
    line = line.strip()
    if not line:
        return None
    return parse_json_line(line) or parse_legacy_line(line)


def load_records(log_file: Path) -> list[dict[str, Any]]:
    records: list[dict[str, Any]] = []
    for line in log_file.read_text(encoding="utf-8").splitlines():
        record = parse_line(line)
        if record is not None:
            records.append(record)
    return records


def write_json(records: list[dict[str, Any]]) -> None:
    json.dump(records, sys.stdout, ensure_ascii=False, indent=2)
    sys.stdout.write("\n")


def write_csv(records: list[dict[str, Any]]) -> None:
    if not records:
        return
    fieldnames = sorted({key for record in records for key in record.keys()})
    writer = csv.DictWriter(sys.stdout, fieldnames=fieldnames)
    writer.writeheader()
    for record in records:
        row = {
            key: json.dumps(value, ensure_ascii=False) if isinstance(value, list) else value
            for key, value in record.items()
        }
        writer.writerow(row)


def main() -> int:
    parser = argparse.ArgumentParser(description="Parse and normalize login logs into ECS-style records")
    parser.add_argument("log_file", type=Path, help="Path to logs/login_app.log")
    parser.add_argument("--format", choices=("json", "csv"), default="json")
    args = parser.parse_args()

    records = load_records(args.log_file)
    if args.format == "json":
        write_json(records)
    else:
        write_csv(records)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
