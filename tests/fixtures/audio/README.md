# Original fragmented audio regression

`fragmented-timing.m4a` contains a five-second, synthesized 440 Hz sine wave,
created for RITVIO's native timing regression. No recording, catalog media or
third-party song is used. The tone is dedicated to the public domain under
CC0-1.0.

The file deliberately declares nonzero `mvhd`, `tkhd` and `mdhd` durations while
its initial sample tables are empty and its audio is in movie fragments. This
reproduces the double-duration metadata conflict on Apple players. The native
test records the unmodified AVAsset duration, then checks the resource loader's
normalized duration, paused seek and actual next-track boundary.

The build harness verifies the adjacent SHA-256 manifest and places the fixture
only in a DEBUG simulator's Documents directory. It is not embedded in the
Release IPA. FFmpeg is a regeneration tool only, not an app dependency.

To regenerate with an installed FFmpeg:

```sh
python tests/generate-ios-fragmented-tone.py --ffmpeg /path/to/ffmpeg
```

The generator updates the adjacent size/hash manifest. Encoder versions can
produce different bytes; verification uses the committed fixture and manifest.
