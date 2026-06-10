#!/usr/bin/env python3
import re
import sys
import json
import csv
from pathlib import Path

LOG_LINE_RE = re.compile(r'^(?P<timestamp>\S+)\s+(?P<host>\S+)\s+(?P<service>[^:]+):\s+(?P<rest>.*)$')


def parse_line(line):
    m = LOG_LINE_RE.match(line)
    if not m:
        return None
    base = m.groupdict()
    rest = base.pop('rest')
    item = {
        'timestamp': base.get('timestamp'),
        'host': base.get('host'),
        'service': base.get('service'),
    }
    # parse key=value pairs (handles quoted values)
    for km in re.finditer(r'(\w+)=((?:"(?:\\.|[^"])*")|\S+)', rest):
        key = km.group(1)
        val = km.group(2)
        if val.startswith('"') and val.endswith('"'):
            val = val[1:-1].replace('\\"', '"')
        item[key] = val
    return item


def main():
    path = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(__file__).parent.parent / 'logs' / 'login_app.log'
    if not path.exists():
        print(f'log file not found: {path}', file=sys.stderr)
        sys.exit(2)

    out = []
    with path.open('r', encoding='utf8') as fh:
        for line in fh:
            line = line.strip()
            if not line:
                continue
            parsed = parse_line(line)
            if parsed is None:
                out.append({'raw': line})
            else:
                out.append(parsed)

    # print JSON to stdout
    json.dump(out, sys.stdout, ensure_ascii=False, indent=2)

    # also write a CSV summary to logs/parsed_logs.csv
    try:
        csv_path = Path('logs') / 'parsed_logs.csv'
        with csv_path.open('w', encoding='utf8', newline='') as cf:
            if not out:
                return
            keys = sorted({k for d in out for k in d.keys()})
            writer = csv.DictWriter(cf, fieldnames=keys)
            writer.writeheader()
            for d in out:
                writer.writerow({k: d.get(k, '') for k in keys})
    except Exception as e:
        print('warning: could not write csv:', e, file=sys.stderr)


if __name__ == '__main__':
    main()
#!/usr/bin/env python3
"""Parse syslog-style login_app.log into CSV or JSON.

Usage:
  python scripts/parse_logs.py logs/login_app.log --format json
  python scripts/parse_logs.py logs/login_app.log --format csv
"""

from __future__ import annotations

import argparse
import csv
import json
import re
from pathlib import Path
from typing import Dict, Iterable, List

LOG_RE = re.compile(
    r"^(?P<timestamp>\S+)\s+(?P<host>\S+)\s+login_app:\s+"
    r"level=(?P<level>\S+)\s+event_type=(?P<event_type>\S+)"
    r"(?:\s+user=(?P<user>\S+))?"
    r"(?:\s+src_ip=(?P<src_ip>\S+))?"
    r"(?:\s+message=\"(?P<message>(?:\\\"|[^\"])*)\")?"
    r"(?P<rest>.*)$"
)


def parse_kv_rest(rest: str) -> Dict[str, str]:
    data: Dict[str, str] = {}
    rest = rest.strip()
    if not rest:
        return data
    for item in re.finditer(r"(?P<key>[A-Za-z0-9_]+)=(?P<value>\"(?:\\\"|[^\"])*\"|\S+)", rest):
        key = item.group("key")
        value = item.group("value")
        if value.startswith('"') and value.endswith('"'):
            value = value[1:-1].replace('\\"', '"')
        data[key] = value
    return data


def parse_line(line: str) -> Dict[str, str] | None:
    line = line.strip()
    if not line:
        return None
    match = LOG_RE.match(line)
    if not match:
        return {
            "parse_error": line,
        }
    result = {k: (v or "") for k, v in match.groupdict().items() if k != "rest"}
    result["message"] = result.get("message", "").replace('\\"', '"')
    result.update(parse_kv_rest(match.group("rest") or ""))
    return result


def load_records(log_file: Path) -> List[Dict[str, str]]:
    records: List[Dict[str, str]] = []
    for line in log_file.read_text(encoding="utf-8").splitlines():
        record = parse_line(line)
        if record is not None:
            records.append(record)
    return records


def write_json(records: Iterable[Dict[str, str]]) -> None:
    print(json.dumps(list(records), ensure_ascii=False, indent=2))


def write_csv(records: List[Dict[str, str]]) -> None:
    if not records:
        return
    fieldnames = sorted({key for record in records for key in record.keys()})
    writer = csv.DictWriter(open(0, "w", encoding="utf-8", newline=""), fieldnames=fieldnames)
    writer.writeheader()
    writer.writerows(records)


def main() -> int:
    parser = argparse.ArgumentParser(description="Parse login_app syslog-style logs")
    parser.add_argument("log_file", type=Path, help="Path to logs/login_app.log")
    parser.add_argument("--format", choices=("json", "csv"), default="json")
    args = parser.parse_args()

    records = load_records(args.log_file)
    if args.format == "json":
        write_json(records)
    else:
        # CSV is written to stdout so it can be redirected to a file.
        if records:
            fieldnames = sorted({key for record in records for key in record.keys()})
            writer = csv.DictWriter(__import__("sys").stdout, fieldnames=fieldnames)
            writer.writeheader()
            writer.writerows(records)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
