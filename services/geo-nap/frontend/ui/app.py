from pathlib import Path
import runpy

ROOT_APP = Path(__file__).resolve().parents[4] / "frontend" / "geo-nap-ui" / "ui" / "app.py"
runpy.run_path(str(ROOT_APP), run_name="__main__")
