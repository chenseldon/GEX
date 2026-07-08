import argparse
import importlib
import json
import math
from datetime import datetime, timezone


CANDIDATE_INTERFACES = [
    {
        "name": "option_finance_board",
        "args": {"symbol": "沪深300股指期权", "end_month": "202607"},
    },
    {
        "name": "option_commodity_contract_sina",
        "args": {"symbol": "黄金期权"},
    },
    {
        "name": "option_commodity_contract_table_sina",
        "args": {"symbol": "黄金期权"},
    },
    {
        "name": "option_comm_info",
        "args": {"symbol": "黄金期权"},
    },
    {
        "name": "option_margin",
        "args": {"symbol": "黄金期权"},
    },
]


def main():
    parser = argparse.ArgumentParser(description="Probe AKShare option interfaces.")
    parser.add_argument("--symbols", default="")
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args()

    requested_symbols = [
        symbol.strip() for symbol in args.symbols.split(",") if symbol.strip()
    ]
    report = {
        "sourceName": "akshare",
        "observedAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "requestedSymbols": requested_symbols,
        "akshareVersion": None,
        "status": "unavailable",
        "interfaces": [],
    }

    try:
        akshare = importlib.import_module("akshare")
        report["akshareVersion"] = getattr(akshare, "__version__", None)
    except Exception as exc:
        report["interfaces"] = [
            {
                "name": candidate["name"],
                "args": candidate["args"],
                "status": "unavailable",
                "error": f"Failed to import akshare: {exc}",
            }
            for candidate in CANDIDATE_INTERFACES
        ]
        print_report(report, args.json)
        return 1

    for candidate in CANDIDATE_INTERFACES:
        report["interfaces"].append(probe_interface(akshare, candidate))

    report["status"] = (
        "ok"
        if any(item["status"] == "ok" for item in report["interfaces"])
        else "unavailable"
    )
    print_report(report, args.json)
    return 0 if report["status"] == "ok" else 1


def probe_interface(akshare, candidate):
    entry = {
        "name": candidate["name"],
        "args": candidate["args"],
        "status": "unavailable",
    }
    try:
        interface = getattr(akshare, candidate["name"])
        result = interface(**candidate["args"])
        entry["sample"] = sample_result(result)
        entry["status"] = "ok"
    except Exception as exc:
        entry["error"] = str(exc)
    return entry


def sample_result(result):
    if (
        hasattr(result, "columns")
        and hasattr(result, "head")
        and hasattr(result, "to_dict")
    ):
        columns = [str(column) for column in result.columns.tolist()]
        first_rows = result.head(3).to_dict(orient="records")
        return {
            "columns": columns,
            "rows": sanitize(first_rows),
            "rowCount": int(len(result)),
        }

    if isinstance(result, list):
        rows = result[:3]
        columns = sorted(
            {str(key) for row in rows if isinstance(row, dict) for key in row.keys()}
        )
        return {
            "columns": columns,
            "rows": sanitize(rows),
            "rowCount": len(result),
        }

    if isinstance(result, dict):
        return {
            "columns": [str(key) for key in result.keys()],
            "rows": [sanitize(result)],
            "rowCount": 1,
        }

    return {
        "columns": [],
        "rows": [sanitize(result)],
        "rowCount": 1 if result is not None else 0,
    }


def sanitize(value):
    if value is None:
        return None
    if isinstance(value, dict):
        return {str(key): sanitize(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [sanitize(item) for item in value]
    if isinstance(value, float):
        if math.isnan(value) or math.isinf(value):
            return None
        return value
    if isinstance(value, (str, int, bool)):
        return value
    if hasattr(value, "item"):
        try:
            return sanitize(value.item())
        except Exception:
            pass
    if hasattr(value, "isoformat"):
        try:
            return value.isoformat()
        except Exception:
            pass
    return str(value)


def print_report(report, compact):
    indent = None if compact else 2
    print(json.dumps(report, ensure_ascii=True, indent=indent))


if __name__ == "__main__":
    raise SystemExit(main())
