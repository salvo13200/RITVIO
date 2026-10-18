import json
import os
from pathlib import Path
import sys
import time

json.load(sys.stdin)
Path('resolver-started.json').write_text(json.dumps({'pid': os.getpid()}), encoding='utf-8')
time.sleep(60)
