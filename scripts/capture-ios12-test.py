"""Capture the real simulator connection UI; does not claim iOS-12 hardware acceptance."""
import json
from pathlib import Path
import subprocess
import time

ROOT = Path(__file__).resolve().parents[1]
def run(*args): return subprocess.check_output(list(args),text=True).strip()
devices = json.loads(run('xcrun','simctl','list','devices','available','--json'))['devices']
choices = [(runtime,d) for runtime,items in devices.items() if 'iOS' in runtime for d in items if d['name'].startswith('iPhone') and d['isAvailable']]
runtime,device = next(((r,d) for r,d in choices if 'SE' in d['name']),choices[0])
identifier = device['udid']
if device['state'] != 'Booted': run('xcrun','simctl','boot',identifier)
run('xcrun','simctl','bootstatus',identifier,'-b')
app = ROOT / '.local/ios12/native/iphonesimulator/PCTest.app'
run('xcrun','simctl','install',identifier,str(app))
run('xcrun','simctl','launch',identifier,'it.ritvio.pctest')
time.sleep(8)
output = ROOT / '.local/ios12/artifacts'
run('xcrun','simctl','io',identifier,'screenshot',str(output / 'native-connection.png'))
run('xcrun','simctl','ui',identifier,'content_size','accessibility-extra-large')
run('xcrun','simctl','terminate',identifier,'it.ritvio.pctest')
run('xcrun','simctl','launch',identifier,'it.ritvio.pctest')
time.sleep(5)
run('xcrun','simctl','io',identifier,'screenshot',str(output / 'native-connection-large-text.png'))
(output / 'simulator-ui.json').write_text(json.dumps({'model':device['name'],'runtime':runtime,'scope':'real WKWebView/native bridge bootstrap and connection UI captures; no touch acceptance or provider audio proof','iOS12PhysicalAcceptance':'pending'},indent=2)+'\n')
run('xcrun','simctl','shutdown',identifier)
