"""Windows multiprocessing entrypoint for the isolated ElectionGuard probe."""

if __name__ == "__main__":
    import runpy
    import sys
    from pathlib import Path

    import electionguard.scheduler as scheduler

    scheduler.cpu_count = lambda logical=False: 2
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    runpy.run_path(str(Path(__file__).with_name("electionguard_probe.py")), run_name="electionguard_probe")
