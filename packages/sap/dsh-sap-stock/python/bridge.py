#!/usr/bin/env python3
"""
dsh-sap-stock 自带 SAP 桥(独立于 sapconnect-dsh,只支持 rfc_call / ping)。

协议(stdin/stdout,每行一个 JSON):
  request : {"id": 1, "method": "rfc_call", "params": {"function_name": "...", "parameters": {...}}}
  response: {"id": 1, "result": {...}}  或  {"id": 1, "error": "..."}

SAP 连接参数由宿主插件经环境变量注入(本进程只接收调用参数,密码不进管道):
  SAP_USER / SAP_PASSWORD / SAP_ASHOST / SAP_SYSNR / SAP_CLIENT / SAP_LANG
SDK 路径: SAPNWRFC_SDK_LIB
"""
import json
import os
import sys
from decimal import Decimal


def _json_default(o):
    if isinstance(o, Decimal):
        return str(o)
    raise TypeError(f"Object of type {type(o).__name__} is not JSON serializable")


def _setup_sdk():
    sdk_lib = os.environ.get("SAPNWRFC_SDK_LIB")
    if sdk_lib and os.path.isdir(sdk_lib):
        os.environ["SAPNWRFC_HOME"] = os.path.dirname(sdk_lib)
        if hasattr(os, "add_dll_directory"):
            os.add_dll_directory(sdk_lib)
        os.environ["PATH"] = sdk_lib + os.pathsep + os.environ.get("PATH", "")


def _connect():
    import pyrfc

    return pyrfc.Connection(
        user=os.environ.get("SAP_USER", ""),
        passwd=os.environ.get("SAP_PASSWORD", ""),
        ashost=os.environ.get("SAP_ASHOST", ""),
        sysnr=os.environ.get("SAP_SYSNR", ""),
        client=os.environ.get("SAP_CLIENT", ""),
        lang=os.environ.get("SAP_LANG", "EN"),
    )


def handle(method, params):
    if method == "ping":
        return {"pong": True}
    if method == "rfc_call":
        fn = params.get("function_name")
        kwargs = params.get("parameters") or params.get("kwargs") or {}
        if not fn:
            raise ValueError("function_name required")
        with _connect() as conn:
            return conn.call(fn, **kwargs)
    raise ValueError(f"unknown method: {method}")


def main():
    if hasattr(sys.stdin, "reconfigure"):
        sys.stdin.reconfigure(encoding="utf-8")
        sys.stdout.reconfigure(encoding="utf-8")
    _setup_sdk()
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        rid = None
        try:
            req = json.loads(line)
            rid = req.get("id")
            result = handle(req.get("method"), req.get("params") or {})
            sys.stdout.write(
                json.dumps({"id": rid, "result": result}, ensure_ascii=False, default=_json_default) + "\n"
            )
            sys.stdout.flush()
        except Exception as e:  # noqa: BLE001 —— 桥必须对任何错误响应而非崩溃
            sys.stdout.write(
                json.dumps({"id": rid, "error": f"{type(e).__name__}: {e}"}, ensure_ascii=False) + "\n"
            )
            sys.stdout.flush()


if __name__ == "__main__":
    main()
