import json
import os
import sys
import time
print(json.dumps({"ready": True, "pid": os.getpid()}), flush=True)
for line in sys.stdin:
    video_id = json.loads(line)["videoId"]
    if video_id == "slow0000001":
        time.sleep(5)
    if video_id == "break000001":
        sys.exit(1)
    print(json.dumps({"ok": True, "info": {"id": video_id, "url": "https://fixture.googlevideo.com/tone", "vcodec": "none", "duration": 12, "title": "Synthetic"}}), flush=True)
