import argparse
import csv
import json
import sys
from pathlib import Path

try:
    import requests
except ImportError:
    print("requests is required: pip install requests", file=sys.stderr)
    raise


def main():
    parser = argparse.ArgumentParser(description="Probe Deribit public API and optionally export instruments CSV.")
    parser.add_argument("--endpoint", default="https://www.deribit.com/api/v2")
    parser.add_argument("--symbol", default="BTC")
    parser.add_argument("--csv", default="")
    parser.add_argument("--timeout", type=float, default=10.0)
    args = parser.parse_args()

    report = {
        "endpoint": args.endpoint,
        "symbol": args.symbol.upper(),
        "proxies_from_env": True,
        "checks": {},
    }

    try:
        report["checks"]["get_time"] = {
            "status": "ok",
            "result": deribit_get(args.endpoint, "public/get_time", timeout=args.timeout),
        }
        instruments = deribit_get(
            args.endpoint,
            "public/get_instruments",
            params={"currency": args.symbol.upper(), "kind": "option", "expired": "false"},
            timeout=args.timeout,
        )
        report["checks"]["get_instruments"] = {
            "status": "ok",
            "count": len(instruments),
        }
        if args.csv:
            write_csv(Path(args.csv), instruments)
            report["csv"] = str(Path(args.csv).resolve())
        report["summary"] = "ok"
    except Exception as exc:
        report["summary"] = "failed"
        report["error"] = str(exc)

    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0 if report["summary"] == "ok" else 1


def deribit_get(endpoint, method, params=None, timeout=10.0):
    response = requests.get(
        f"{endpoint.rstrip('/')}/{method}",
        params=params or {},
        timeout=timeout,
    )
    response.raise_for_status()
    payload = response.json()
    if "error" in payload:
        raise RuntimeError(payload["error"])
    return payload["result"]


def write_csv(path, rows):
    path.parent.mkdir(parents=True, exist_ok=True)
    if not rows:
        path.write_text("", encoding="utf-8")
        return
    fieldnames = sorted({key for row in rows for key in row.keys()})
    with path.open("w", newline="", encoding="utf-8-sig") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)


if __name__ == "__main__":
    raise SystemExit(main())
