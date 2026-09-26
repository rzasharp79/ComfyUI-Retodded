import sys

from retodded.restart import restart_command

EXE = r"D:\ComfyUI\venv\Scripts\python.exe"


def test_keeps_launch_args_and_blocks_new_browser_tab():
    cmd = restart_command(["main.py", "--enable-manager", "--auto-launch"], EXE)
    assert cmd[-3:] == ["--enable-manager", "--auto-launch", "--disable-auto-launch"]


def test_does_not_repeat_disable_flag():
    cmd = restart_command(["main.py", "--disable-auto-launch"], EXE)
    assert cmd.count("--disable-auto-launch") == 1


def test_quotes_paths_on_windows():
    cmd = restart_command(["main.py"], EXE)
    if sys.platform == "win32":
        assert cmd[:2] == [f'"{EXE}"', '"main.py"']
    else:
        assert cmd[:2] == [EXE, "main.py"]


def test_does_not_change_caller_argv():
    argv = ["main.py", "--listen"]
    restart_command(argv, EXE)
    assert argv == ["main.py", "--listen"]
