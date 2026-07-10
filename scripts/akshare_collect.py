import argparse
import importlib
import json
import math
import os
import time
from datetime import datetime, timezone


DEFAULT_SYMBOLS = ["CN.CFFEX.IF", "CN.SHFE.au"]

EASTMONEY_GREEKS_INTERFACES = [
    {
        "name": "option_risk_analysis_em",
        "args": {},
        "role": "greeks",
        "source": "eastmoney",
        "optional": True,
    },
    {
        "name": "option_value_analysis_em",
        "args": {},
        "role": "greeks",
        "source": "eastmoney",
        "optional": True,
    },
    {
        "name": "option_current_em",
        "args": {},
        "role": "greeks",
        "source": "eastmoney",
        "optional": True,
    },
]

SYMBOL_PLANS = {
    "CN.CFFEX.IF": {
        "region": "CN",
        "venue": "CFFEX",
        "underlying": "IO",
        "assetClass": "index_option",
        "interfaces": [
            *EASTMONEY_GREEKS_INTERFACES,
            {
                "name": "option_finance_board",
                "args": {
                    "symbol": "\u6caa\u6df1300\u80a1\u6307\u671f\u6743",
                    "end_month": "{end_month}",
                },
                "role": "option_board",
                "source": "akshare",
                "optional": True,
            },
        ],
        "metadataPlaceholders": {
            "expiry": None,
            "impliedVolatility": None,
            "gamma": None,
            "contractMultiplier": 100,
            "underlyingPrice": None,
            "model": "blackScholes",
            "sourceName": "AKShare Eastmoney",
        },
        "warnings": [
            "CN.CFFEX.IF is collected through the CSI 300 index option alias IO when Eastmoney returns instrument-level Greeks.",
            "Rows without real IV/gamma, OI, multiplier, expiry, or underlying price are stored as raw source rows but skipped from GEX.",
        ],
    },
    "CN.CFFEX.IO": {
        "region": "CN",
        "venue": "CFFEX",
        "underlying": "IO",
        "assetClass": "index_option",
        "interfaces": [
            *EASTMONEY_GREEKS_INTERFACES,
            {
                "name": "option_finance_board",
                "args": {
                    "symbol": "\u6caa\u6df1300\u80a1\u6307\u671f\u6743",
                    "end_month": "{end_month}",
                },
                "role": "option_board",
                "source": "akshare",
                "optional": True,
            },
        ],
        "metadataPlaceholders": {
            "expiry": None,
            "impliedVolatility": None,
            "gamma": None,
            "contractMultiplier": 100,
            "underlyingPrice": None,
            "model": "blackScholes",
            "sourceName": "AKShare Eastmoney",
        },
        "warnings": [
            "Rows without real IV/gamma, OI, multiplier, expiry, or underlying price are stored as raw source rows but skipped from GEX.",
        ],
    },
    "CN.CFFEX.MO": {
        "region": "CN",
        "venue": "CFFEX",
        "underlying": "MO",
        "assetClass": "index_option",
        "interfaces": EASTMONEY_GREEKS_INTERFACES,
        "metadataPlaceholders": {
            "expiry": None,
            "impliedVolatility": None,
            "gamma": None,
            "contractMultiplier": 100,
            "underlyingPrice": None,
            "model": "blackScholes",
            "sourceName": "AKShare Eastmoney",
        },
        "warnings": [
            "CSI 1000 option support depends on Eastmoney returning MO instrument codes with IV/gamma fields.",
        ],
    },
    "CN.CFFEX.HO": {
        "region": "CN",
        "venue": "CFFEX",
        "underlying": "HO",
        "assetClass": "index_option",
        "interfaces": EASTMONEY_GREEKS_INTERFACES,
        "metadataPlaceholders": {
            "expiry": None,
            "impliedVolatility": None,
            "gamma": None,
            "contractMultiplier": 100,
            "underlyingPrice": None,
            "model": "blackScholes",
            "sourceName": "AKShare Eastmoney",
        },
        "warnings": [
            "SSE 50 index option support depends on Eastmoney returning HO instrument codes with IV/gamma fields.",
        ],
    },
    "CN.SSE.510050": {
        "region": "CN",
        "venue": "SSE",
        "underlying": "510050",
        "assetClass": "etf_option",
        "interfaces": [
            {
                "name": "option_risk_indicator_sse",
                "args": {"date": "{date}"},
                "role": "greeks",
                "source": "sse",
                "optional": True,
            },
            {
                "name": "option_sse_greeks_sina",
                "args": {"symbol": "10003045"},
                "role": "greeks",
                "source": "sina",
                "optional": True,
            },
            *EASTMONEY_GREEKS_INTERFACES,
        ],
        "metadataPlaceholders": {
            "expiry": None,
            "impliedVolatility": None,
            "gamma": None,
            "contractMultiplier": 10000,
            "underlyingPrice": None,
            "model": "blackScholes",
            "sourceName": "AKShare SSE/Sina",
        },
        "warnings": [
            "SSE ETF option Greeks require current SSE/Sina fields plus a real underlying price before GEX can be calculated.",
        ],
    },
    "CN.SSE.510300": {
        "region": "CN",
        "venue": "SSE",
        "underlying": "510300",
        "assetClass": "etf_option",
        "interfaces": [
            {
                "name": "option_risk_indicator_sse",
                "args": {"date": "{date}"},
                "role": "greeks",
                "source": "sse",
                "optional": True,
            },
            *EASTMONEY_GREEKS_INTERFACES,
        ],
        "metadataPlaceholders": {
            "expiry": None,
            "impliedVolatility": None,
            "gamma": None,
            "contractMultiplier": 10000,
            "underlyingPrice": None,
            "model": "blackScholes",
            "sourceName": "AKShare SSE/Eastmoney",
        },
        "warnings": [
            "SSE 300 ETF option rows are filtered later by normalized instrument fields; rows missing real Greeks are not used for GEX.",
        ],
    },
    "CN.SHFE.au": {
        "region": "CN",
        "venue": "SHFE",
        "underlying": "au",
        "assetClass": "commodity_option",
        "interfaces": [
            {
                "name": "option_commodity_contract_table_sina",
                "args": {"symbol": "\u9ec4\u91d1\u671f\u6743"},
                "role": "option_table",
                "source": "sina",
            },
            {
                "name": "option_commodity_contract_sina",
                "args": {"symbol": "\u9ec4\u91d1\u671f\u6743"},
                "role": "contract_list",
                "source": "sina",
                "optional": True,
            },
        ],
        "metadataPlaceholders": {
            "expiry": None,
            "impliedVolatility": None,
            "gamma": None,
            "contractMultiplier": None,
            "underlyingPrice": None,
            "model": "black76",
            "sourceName": "AKShare Sina",
        },
        "warnings": [
            "Commodity option sources currently provide raw quote/OI data only; rows without IV or gamma remain raw and are not drawn as GEX.",
        ],
    },
}


def main():
    parser = argparse.ArgumentParser(description="Collect AKShare TradFi option snapshots.")
    parser.add_argument(
        "--symbols",
        default=",".join(DEFAULT_SYMBOLS),
        help="Comma-separated symbols such as CN.CFFEX.IF,CN.SHFE.au.",
    )
    parser.add_argument("--once", action="store_true", help="Collect one snapshot and exit.")
    parser.add_argument(
        "--interval",
        type=int,
        default=0,
        help="Repeat collection every N milliseconds.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Print planned AKShare interfaces without importing AKShare or using the network.",
    )
    parser.add_argument("--json", action="store_true", help="Print compact JSON.")
    parser.add_argument(
        "--end-month",
        default=None,
        help="Financial option end month in YYYYMM format. Defaults to the current UTC month.",
    )
    parser.add_argument(
        "--date",
        default=None,
        help="SSE risk indicator date in YYYYMMDD format. Defaults to the current UTC date.",
    )
    args = parser.parse_args()

    apply_proxy_environment()

    symbols = parse_symbols(args.symbols)
    end_month = args.end_month or datetime.now(timezone.utc).strftime("%Y%m")
    query_date = args.date or datetime.now(timezone.utc).strftime("%Y%m%d")
    plans, warnings = build_collection_plans(symbols, end_month, query_date)

    if args.dry_run:
        report = base_report(symbols, "dry_run")
        report["status"] = plan_status(plans)
        report["plans"] = plans
        report["warnings"] = warnings
        print_report(report, args.json)
        return 0

    if not has_supported_plans(plans):
        report = base_report(symbols, "collect")
        report["status"] = "unavailable"
        report["warnings"] = warnings
        report["snapshots"] = plans
        print_report(report, args.json)
        return 1

    try:
        akshare = importlib.import_module("akshare")
    except Exception as exc:
        report = base_report(symbols, "collect")
        report["status"] = "unavailable"
        report["warnings"] = warnings
        report["errors"] = [f"Failed to import akshare: {exc}"]
        report["plans"] = plans
        print_report(report, args.json)
        return 1

    interval_seconds = max(args.interval, 0) / 1000
    run_once = args.once or args.interval <= 0

    while True:
        report = collect_snapshot(akshare, symbols, plans, warnings)
        print_report(report, args.json)
        if report["status"] == "unavailable":
            return 1
        if run_once:
            return 0
        time.sleep(interval_seconds)


def parse_symbols(value):
    symbols = [symbol.strip() for symbol in str(value or "").split(",") if symbol.strip()]
    return symbols or list(DEFAULT_SYMBOLS)


def build_collection_plans(symbols, end_month, query_date):
    plans = []
    warnings = []
    for symbol in symbols:
        template = SYMBOL_PLANS.get(symbol)
        if not template:
            warnings.append(f"Unsupported AKShare TradFi symbol: {symbol}")
            plans.append({"symbol": symbol, "status": "unsupported", "interfaces": []})
            continue
        plans.append(expand_plan(symbol, template, end_month, query_date))
    return plans, warnings


def expand_plan(symbol, template, end_month, query_date):
    interfaces = []
    for item in template["interfaces"]:
        args = {
            key: substitute_arg(value, end_month, query_date)
            for key, value in item["args"].items()
        }
        interfaces.append(
            {
                "name": item["name"],
                "args": args,
                "role": item["role"],
                "source": item["source"],
                "optional": bool(item.get("optional", False)),
            }
        )
    return {
        "symbol": symbol,
        "status": "planned",
        "region": template["region"],
        "venue": template["venue"],
        "underlying": template["underlying"],
        "assetClass": template["assetClass"],
        "interfaces": interfaces,
        "metadataPlaceholders": dict(template["metadataPlaceholders"]),
        "warnings": list(template.get("warnings", [])),
    }


def substitute_arg(value, end_month, query_date):
    if value == "{end_month}":
        return end_month
    if value == "{date}":
        return query_date
    return value


def plan_status(plans):
    planned_count = sum(1 for plan in plans if plan.get("status") == "planned")
    unsupported_count = sum(
        1 for plan in plans if plan.get("status") == "unsupported"
    )
    if planned_count == len(plans) and planned_count > 0:
        return "ok"
    if planned_count and unsupported_count:
        return "partial"
    return "unavailable"


def has_supported_plans(plans):
    return any(plan.get("status") == "planned" for plan in plans)


def collect_snapshot(akshare, symbols, plans, warnings):
    report = base_report(symbols, "collect")
    report["akshareVersion"] = getattr(akshare, "__version__", None)
    report["warnings"] = list(warnings)
    report["snapshots"] = []

    for plan in plans:
        if plan["status"] == "unsupported":
            report["snapshots"].append(plan)
            continue
        snapshot = collect_symbol_snapshot(akshare, plan)
        report["snapshots"].append(snapshot)
        append_source_warnings(report, snapshot)

    ok_count = sum(1 for snapshot in report["snapshots"] if snapshot.get("status") == "ok")
    partial_count = sum(
        1 for snapshot in report["snapshots"] if snapshot.get("status") == "partial"
    )
    if ok_count == len(report["snapshots"]) and ok_count > 0:
        report["status"] = "ok"
    elif ok_count or partial_count:
        report["status"] = "partial"
    else:
        report["status"] = "unavailable"
    return report


def collect_symbol_snapshot(akshare, plan):
    snapshot = {
        **plan,
        "status": "unavailable",
        "interfaces": [],
        "rawRows": [],
        "rowCount": 0,
    }
    successes = 0
    failures = 0

    for interface_plan in plan["interfaces"]:
        result = collect_interface(akshare, interface_plan)
        snapshot["interfaces"].append(result["interface"])
        if result["interface"]["status"] == "ok":
            successes += 1
            snapshot["rawRows"].append(
                {
                    "interface": interface_plan["name"],
                    "role": interface_plan["role"],
                    "source": interface_plan["source"],
                    "rows": result["rows"],
                }
            )
            snapshot["rowCount"] += len(result["rows"])
        elif not interface_plan.get("optional"):
            failures += 1

    if successes and failures:
        snapshot["status"] = "partial"
    elif successes:
        snapshot["status"] = "ok"
    return snapshot


def collect_interface(akshare, interface_plan):
    entry = {
        "name": interface_plan["name"],
        "args": interface_plan["args"],
        "role": interface_plan["role"],
        "source": interface_plan["source"],
        "optional": interface_plan["optional"],
        "status": "unavailable",
        "rowCount": 0,
    }
    try:
        interface = getattr(akshare, interface_plan["name"])
        result = interface(**interface_plan["args"])
        rows, columns = dataframe_to_rows(result)
        entry["status"] = "ok"
        entry["rowCount"] = len(rows)
        entry["columns"] = columns
        return {"interface": entry, "rows": rows}
    except Exception as exc:
        entry["error"] = str(exc)
        return {"interface": entry, "rows": []}


def append_source_warnings(report, snapshot):
    for interface in snapshot.get("interfaces", []):
        if interface.get("status") != "ok":
            report["warnings"].append(
                f"{snapshot.get('symbol')} {interface.get('source')}.{interface.get('name')} unavailable: {interface.get('error', 'unknown error')}"
            )


def dataframe_to_rows(result):
    if (
        hasattr(result, "columns")
        and hasattr(result, "to_dict")
        and hasattr(result, "__len__")
    ):
        columns = [str(column) for column in result.columns.tolist()]
        rows = result.to_dict(orient="records")
        return sanitize(rows), columns
    if isinstance(result, list):
        columns = sorted(
            {str(key) for row in result if isinstance(row, dict) for key in row.keys()}
        )
        return sanitize(result), columns
    if isinstance(result, dict):
        return [sanitize(result)], [str(key) for key in result.keys()]
    return [sanitize(result)], []


def apply_proxy_environment():
    http_proxy = os.environ.get("AKSHARE_HTTP_PROXY")
    https_proxy = os.environ.get("AKSHARE_HTTPS_PROXY")
    if http_proxy:
        os.environ["HTTP_PROXY"] = http_proxy
        os.environ["http_proxy"] = http_proxy
    if https_proxy:
        os.environ["HTTPS_PROXY"] = https_proxy
        os.environ["https_proxy"] = https_proxy


def base_report(symbols, mode):
    return {
        "sourceName": "akshare",
        "mode": mode,
        "observedAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "requestedSymbols": symbols,
        "status": "unavailable",
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
    print(json.dumps(report, ensure_ascii=True, indent=indent), flush=True)


if __name__ == "__main__":
    raise SystemExit(main())
