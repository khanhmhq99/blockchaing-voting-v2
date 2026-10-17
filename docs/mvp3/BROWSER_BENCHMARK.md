# Isolated browser proof measurement

2026-10-13, Windows, Edge 155.0.4283.45 headless, repository Node 24.21.0. `research/mvp3/browser-proof.mjs` served the revised witness WASM, local untrusted zkey and `snarkjs@0.7.6` browser bundle from loopback. It generated a synthetic two-candidate input in Node, then called `window.snarkjs.groth16.fullProve` in Edge. Exit 0; 72 public signals.

| Observed quantity | Value |
| --- | ---: |
| Node input construction (not a browser measurement) | 369.14 ms |
| Edge ballot proof | 5,559.60 ms |
| Edge JS heap before / after proof | 2,923,168 / 320,951,881 bytes |
| Witness WASM / proving key transfer payload | 7,184,599 / 77,963,444 bytes |
| Proof JSON | 724 bytes |

This is one desktop headless run, not a sustained memory peak, mobile bound, full browser election flow or production artifact measurement. Browser encryption/input construction, Semaphore proof, concurrent tabs, download time, low-memory devices and final contributed key were not measured. Browser proving is therefore promising on this machine but not an acceptance pass.
