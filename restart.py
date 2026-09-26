"""POST /retodded/restart: restarts the ComfyUI server (used by the sidebar button in web/restart_button.js).

Under run_comfy.bat the process exits with RESTART_EXIT_CODE and the launcher starts it again. Anywhere else
it re-executes itself like ComfyUI-Manager's /v2/manager/reboot. Either way the new process gets
--disable-auto-launch, so a restart opens no extra browser tab; the open page reconnects on its own.
"""

import asyncio
import logging
import os
import sys

from aiohttp import web

RESTART_DELAY = 0.5  # seconds; lets the HTTP reply reach the browser before the process is replaced
LAUNCHER_ENV = "RETODDED_RESTART_IN_LAUNCHER"  # set by D:\ComfyUI\run_comfy.bat
RESTART_EXIT_CODE = 42


def restart_command(argv: list[str], executable: str) -> list[str]:
    args = argv[1:]
    if "--disable-auto-launch" not in args:
        args.append("--disable-auto-launch")
    if sys.platform == "win32":
        # Windows execv joins the arguments into one command line without quoting them.
        return [f'"{executable}"', f'"{argv[0]}"'] + args
    return [executable, argv[0]] + args


def restart_now() -> None:
    logging.info("[Retodded] Restarting ComfyUI...")
    # ComfyUI-Manager's log tee keeps user/comfyui.log open; close it so the new process can rotate it.
    close_log = getattr(sys.stdout, "close_log", None)
    if close_log is not None:
        close_log()
    if os.environ.get(LAUNCHER_ENV):
        # run_comfy.bat loops on this exit code. execv would leave the launcher thinking ComfyUI had
        # stopped (it prints "press any key") while the new server keeps running in its window.
        os._exit(RESTART_EXIT_CODE)
    os.execv(sys.executable, restart_command(sys.argv, sys.executable))


async def restart_route(request: web.Request) -> web.Response:
    asyncio.get_running_loop().call_later(RESTART_DELAY, restart_now)
    return web.json_response({"restarting": True})


def add_routes(routes: web.RouteTableDef) -> None:
    routes.post("/retodded/restart")(restart_route)
