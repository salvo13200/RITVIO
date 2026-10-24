# iOS embedded resolver runtime

`runtime-lock.json` pins the Python Apple Support archive, QuickJS source and
eight pure-Python wheels by SHA-256. `scripts/prepare-ios-resolver.mjs` verifies
them before extraction. Generated frameworks, packages and source copies live in
the ignored `apps/mobile/ios/App/Runtime/` directory.

- Python 3.13.17 / Python Apple Support `3.13-b17`: PSF/Python and MIT support
  packaging. [Runtime source and release](https://github.com/beeware/Python-Apple-support/releases/tag/3.13-b17).
- QuickJS 2026-06-04: MIT. [Original source](https://bellard.org/quickjs/quickjs-2026-06-04.tar.xz).
- The Python support archive identifies BZip2 1.0.8-2, libffi 3.4.7-2,
  mpdecimal 4.0.0-2, OpenSSL 3.5.9-1 and XZ 5.6.4-2 as its native dependencies.
  Their upstream notices are retained here. XZ's `liblzma` uses the 0BSD notice;
  the project's COPYING file explains the licenses of its separate components.
- Notices for the Python wheels are also in the existing `third-party/python/`
  inventory and remain inside the embedded `.dist-info` directories.

The app build bundles this directory and the existing third-party inventory.
The support archive supplies native standard-library extensions; the build
relocates them into framework form following
[CPython's iOS embedding guide](https://docs.python.org/3.13/using/ios.html).
No compiler, pip installation, JIT entitlement or external Python process is
required on the phone. These notices concern software; they grant no rights to
provider catalog content.
