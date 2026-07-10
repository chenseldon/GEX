import argparse
import importlib
import json
import math
import os
from datetime import datetime, timezone


PROBE_DATE = datetime.now(timezone.utc).strftime("%Y%m%d")

CANDIDATE_INTERFACES = [
    {
        "name": "option_risk_analysis_em",
        "args": {},
        "role": "greeks",
        "source": "eastmoney",
    },
    {
        "name": "option_value_analysis_em",
        "args": {},
        "role": "greeks",
        "source": "eastmoney",
    },
    {
        "name": "option_current_em",
        "args": {},
        "role": "quote",
        "source": "eastmoney",
    },
    {
        "name": "option_risk_indicator_sse",
        "args": {"date": PROBE_DATE},
        "role": "greeks",
        "source": "sse",
    },
    {
        "name": "option_sse_greeks_sina",
        "args": {"symbol": "10003045"},
        "role": "greeks",
        "source": "sina",
    },
    {
        "name": "option_finance_board",
        "args": {"symbol": "\u6caa\u6df1300\u80a1\u6307\u671f\u6743", "end_month": "202607"},
        "role": "option_board",
        "source": "akshare",
    },
    {
        "name": "option_commodity_contract_sina",
        "args": {"symbol": "\u9ec4\u91d1\u671f\u6743"},
        "role": "contract_list",
        "source": "sina",
    },
    {
        "name": "option_commodity_contract_table_sina",
        "args": {"symbol": "\u9ec4\u91d1\u671f\u6743"},
        "role": "option_table",
        "source": "sina",
    },
    {
        "name": "option_comm_info",
        "args": {"symbol": "\u9ec4\u91d1\u671f\u6743"},
        "role": "metadata",
        "source": "akshare",
    },
    {
        "name": "option_margin",
        "args": {"symbol": "\u9ec4\u91d1\u671f\u6743"},
        "role": "metadata",
        "source": "akshare",
    },
]

FIELD_ALIASES = {
    "contractCode": [
        "instrument",
        "instrumentName",
        "code",
        "\u4ee3\u7801",
        "\u8bc1\u5238\u4ee3\u7801",
        "\u671f\u6743\u4ee3\u7801",
        "\u5408\u7ea6\u4ee3\u7801",
        "\u5408\u7ea6\u7f16\u7801",
        "\u5408\u7ea6\u4ea4\u6613\u4ee3\u7801",
    ],
    "underlying": ["underlying", "\u6807\u7684", "\u6807\u7684\u540d\u79f0", "\u6807\u7684\u8bc1\u5238"],
    "expiry": ["expiry", "\u5230\u671f\u65e5", "\u884c\u6743\u65e5"],
    "strike": ["strike", "\u884c\u6743\u4ef7", "\u6267\u884c\u4ef7"],
    "optionType": ["optionType", "type", "\u8ba4\u8d2d\u8ba4\u6cbd", "\u671f\u6743\u7c7b\u578b"],
    "openInterest": ["position", "openInterest", "\u6301\u4ed3\u91cf", "\u6301\u4ed3"],
    "price": ["lastprice", "lastPrice", "\u6700\u65b0\u4ef7", "\u73b0\u4ef7"],
    "impliedVolatility": [
        "impliedVolatility",
        "markIv",
        "iv",
        "IV",
        "\u9690\u542b\u6ce2\u52a8\u7387",
        "\u9690\u6ce2",
    ],
    "delta": ["delta", "Delta", "\u5fb7\u5c14\u5854"],
    "gamma": ["gamma", "Gamma", "\u4f3d\u9a6c"],
    "vega": ["vega", "Vega"],
    "theta": ["theta", "Theta"],
    "multiplier": ["contractMultiplier", "\u5408\u7ea6\u4e58\u6570", "\u4e58\u6570"],
    "underlyingPrice": ["underlyingPrice", "\u6807\u7684\u4ef7\u683c", "\u6807\u7684\u6700\u65b0\u4ef7"],
}


def main():
    parser = argparse.ArgumentParser(description="Probe AKShare option interfaces.")
    parser.add_argument("--symbols", default="")
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args()

    apply_proxy_environment()

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
                "role": candidate["role"],
                "source": candidate["source"],
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
        "role": candidate["role"],
        "source": candidate["source"],
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
            "fieldMatrix": field_matrix(columns),
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
            "fieldMatrix": field_matrix(columns),
            "rows": sanitize(rows),
            "rowCount": len(result),
        }

    if isinstance(result, dict):
        columns = [str(key) for key in result.keys()]
        return {
            "columns": columns,
            "fieldMatrix": field_matrix(columns),
            "rows": [sanitize(result)],
            "rowCount": 1,
        }

    return {
        "columns": [],
        "fieldMatrix": field_matrix([]),
        "rows": [sanitize(result)],
        "rowCount": 1 if result is not None else 0,
    }


def field_matrix(columns):
    labels = [str(column).strip().lower() for column in columns]
    return {
        key: any(str(alias).strip().lower() in labels for alias in aliases)
        for key, aliases in FIELD_ALIASES.items()
    }


def apply_proxy_environment():
    http_proxy = os.environ.get("AKSHARE_HTTP_PROXY")
    https_proxy = os.environ.get("AKSHARE_HTTPS_PROXY")
    if http_proxy:
        os.environ["HTTP_PROXY"] = http_proxy
        os.environ["http_proxy"] = http_proxy
    if https_proxy:
        os.environ["HTTPS_PROXY"] = https_proxy
        os.environ["https_proxy"] = https_proxy


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
