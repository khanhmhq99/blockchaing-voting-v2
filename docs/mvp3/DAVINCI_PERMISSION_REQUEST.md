# Draft request to DAVINCI maintainers — not sent

Subject: License and security-review clarification for `davinci-circom` ballot circuit

Hello DAVINCI maintainers,

I am conducting a Master's thesis research prototype at HCMUT. I evaluated `vocdoni/davinci-circom` at commit `a39a9f9867bb70726ad2137ed536d75670e042b9` and made a two-file research patch to `circuits/ballot_proof.circom` and `circuits/ballot_cipher.circom`. The patch exposes the already constrained ballot statement as 72 Groth16 public signals and constrains all 16 padded ciphertexts and zero plaintext padding. I have not deployed this circuit for a real election.

The pinned repository revision has no visible LICENSE/NOTICE file or package `license` field. Could you identify the copyright holder(s) and the license or written permission that covers that exact revision? Specifically, please clarify whether I may:

1. Modify the circuit and use the modified source locally for academic research.
2. Share the original source, patch and compiled R1CS/WASM with an independent thesis reviewer and a trusted-setup contributor.
3. Publish the patch, technical report, synthetic test vectors, R1CS/WASM hashes and generated verification key/Solidity verifier in a thesis or public repository.
4. Distribute the modified proving key and witness generator to a browser client and deploy its verifier on a public **testnet** for synthetic-ballot research.
5. Continue using artifacts from the pinned revision if a license is added later; please state the effective scope, attribution, source-availability and patent terms, if any.

Please also let me know whether this ballot circuit or its cryptographic helpers have had an independent security audit that covers the pinned revision, and whether a security contact can receive a focused review request for the public-signal/padding patch. I can provide the exact patch, artifact hashes and a reproducible review packet through a channel you approve. I will not send private election keys, witnesses or contributor entropy.

Thank you.

---

Before sending, the owner should insert a preferred name/contact and confirm the intended publication and deployment scope. Record the maintainer's exact response and the rightsholder's authority in [SOURCE_AND_CIRCUIT_REVIEW.md](SOURCE_AND_CIRCUIT_REVIEW.md). A general statement that another Vocdoni repository uses AGPL does not answer this request. This draft does not grant rights and has not been sent by the assistant.
