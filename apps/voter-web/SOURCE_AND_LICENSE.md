# Browser source and license for the academic demonstration

The voter web application uses `snarkjs@0.7.6` to generate MACI joining
proofs inside the browser. Its published package declares GPL-3.0 and ships
the GPLv3 text in `COPYING`. The browser application is offered under GPLv3;
the license text is in [LICENSE](LICENSE). This statement concerns the voter
web application, not the separate API, contracts, circuit artifacts or thesis
documents. The MACI credential and witness remain in the voter's browser.

Before distributing or publicly hosting a built web application, the operator
must provide the complete corresponding source for **the exact deployed web
build** under GPLv3 terms. At minimum, publish the `apps/voter-web` source,
the root and web package manifests and lockfile, build scripts and
configuration needed to reproduce the served JavaScript, all local modules
bundled into it, the `snarkjs` source and its license, and source/license
materials for any other bundled dependencies whose licenses require them.
Generated or transformed JavaScript and minified chunks are not a substitute
for their preferred source form. Link the source release and license from the
deployed site so recipients can find them, and keep the release available for
as long as the corresponding binary is served. Preserve copyright notices.

Do not place `.env` files, private keys, database URLs, voter records, proof
witnesses or ignored deployment artifacts in a source release. A release
should be built from a clean, reviewed commit or a reviewed source snapshot
that exactly matches the deployed build. Record its Git revision, dependency
lockfile hash, build command and the URL of the publicly accessible source
release in the deployment report. Verify that recipients can obtain it without
credentials. Local development does not constitute this publication step.

This file documents an implementation strategy, not a legal opinion. Before
hosting, the owner must confirm that all frontend contributors can grant the
stated license and that the complete source release covers the actual browser
bundle. Rights to redistribute the downloaded ZKeys and other circuit
artifacts require separate confirmation. If those rights or the source-release
conditions cannot be established, keep the demonstration private and do not
claim that the browser-distribution gate has passed.
