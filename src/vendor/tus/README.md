# Pinned browser upload client

This directory contains the bundled browser implementation of `tus-js-client`
4.3.1, including its browser dependencies and their license notices. The upload
protocol, signed-token authentication, chunking, retries and cancellation use
the same upstream implementation as before.

Bolt repeatedly failed to install/resolve the npm dependency. Committing the
browser bundle lets Vite resolve it from the repository, with no CDN, remote
script, extra installation step or runtime external import. It is imported
only by the existing upload component and remains part of its lazy chunk.

`provenance.json` records the source, bundled package versions and SHA-256.
`THIRD_PARTY_LICENSES.txt` contains the complete bundled-package notices. Do not
hand-edit `tus.js`. Review upstream releases and regenerate when updating it.

To regenerate in a disposable checkout of this revision:

```sh
npm ci
npm install --no-save --package-lock=false tus-js-client@4.3.1 esbuild@0.25.12
node scripts/vendor-tus.mjs
```

Compare the package versions with `provenance.json`; pin transitive versions
from that file if upstream dependency resolution has changed. Review the diff,
licenses and checksum, then run the production build and video browser tests.
The maintenance script is never part of the deployment build.
