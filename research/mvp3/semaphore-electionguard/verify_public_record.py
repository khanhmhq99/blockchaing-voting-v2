"""Independent-process v0.95 public-record probe using upstream ElectionGuard math."""

import json
import logging
import os
from copy import deepcopy
from pathlib import Path
from time import perf_counter

from electionguard.ballot import BallotBoxState, SubmittedBallot
from electionguard.data_store import DataStore
from electionguard.decrypt_with_shares import decrypt_tally
from electionguard.decryption import (
    compute_lagrange_coefficients_for_guardians,
    compute_recovery_public_key,
    reconstruct_decryption_share,
)
from electionguard.decryption_share import CompensatedDecryptionShare, DecryptionShare
from electionguard.election import CiphertextElectionContext, make_ciphertext_election_context
from electionguard.guardian import GuardianRecord
from electionguard.key_ceremony import ElectionPublicKey, combine_election_public_keys
from electionguard.manifest import InternalManifest, Manifest
from electionguard.serialize import from_raw, to_raw
from electionguard.tally import PlaintextTally, tally_ballots
from electionguard_verify.verify import verify_aggregation, verify_ballot


logging.disable(logging.CRITICAL)
if os.getenv("PRIME_OPTION") not in (None, "Standard"):
    raise RuntimeError("Verifier requires standard ElectionGuard group constants")

ROOT = Path(os.getenv("SEG_RECORD_DIR", Path(__file__).resolve().parent / "outputs" / "electionguard-record"))


def load(type_, filename):
    return from_raw(type_, (ROOT / filename).read_text(encoding="utf-8"))


def require(condition, label):
    if not condition:
        raise RuntimeError(label)


def verify():
    started = perf_counter()
    manifest = load(Manifest, "manifest.json")
    context = load(CiphertextElectionContext, "context.json")
    require(manifest.is_valid(), "manifest invalid")
    require(context.number_of_guardians == 3 and context.quorum == 2, "wrong ceremony parameters")
    require(manifest.crypto_hash() == context.manifest_hash, "manifest hash mismatch")

    public_keys = {}
    for sequence in range(1, 4):
        record = load(GuardianRecord, f"guardian-{sequence}.json")
        require(record.guardian_id == str(sequence) and record.sequence_order == sequence, "guardian order")
        require(len(record.election_commitments) == 2 == len(record.election_proofs), "coefficient count")
        require(record.election_public_key == record.election_commitments[0], "public commitment mismatch")
        for commitment, proof in zip(record.election_commitments, record.election_proofs):
            require(proof.public_key == commitment and proof.is_valid(), "guardian Schnorr proof")
        public_keys[record.guardian_id] = ElectionPublicKey(
            record.guardian_id, record.sequence_order, record.election_public_key,
            record.election_commitments, record.election_proofs,
        )
    joint = combine_election_public_keys(list(public_keys.values()))
    expected_context = make_ciphertext_election_context(
        3, 2, joint.joint_public_key, joint.commitment_hash, manifest.crypto_hash()
    )
    require(expected_context == context, "election context mismatch")

    ballots = []
    store = DataStore()
    for index in range(3):
        ballot = load(SubmittedBallot, f"accepted-ballot-{index}.json")
        require(ballot.state == BallotBoxState.CAST, "non-cast ballot")
        require(ballot.object_id not in store.keys(), "duplicate ballot ID")
        require(verify_ballot(ballot, manifest, context).verified, "ballot proof invalid")
        store.set(ballot.object_id, ballot)
        ballots.append(ballot)
    tally = tally_ballots(store, InternalManifest(manifest), context)
    require(tally is not None, "aggregation failed")
    require(verify_aggregation(ballots, tally, manifest, context).verified, "aggregation verification failed")

    direct = {}
    for sequence in (1, 2):
        share = load(DecryptionShare, f"direct-share-{sequence}.json")
        require(share.guardian_id == str(sequence), "direct share guardian")
        require(share.public_key == public_keys[share.guardian_id].key, "direct share key")
        for contest_id, contest in tally.contests.items():
            for selection_id, encrypted in contest.selections.items():
                selection_share = share.contests[contest_id].selections[selection_id]
                require(selection_share.is_valid(
                    encrypted.ciphertext, share.public_key, context.crypto_extended_base_hash
                ), "direct share proof")
        direct[share.guardian_id] = share

    compensated = {}
    for sequence in (1, 2):
        share = load(CompensatedDecryptionShare, f"compensated-share-{sequence}-3.json")
        require(share.guardian_id == str(sequence) and share.missing_guardian_id == "3", "compensation IDs")
        require(share.public_key == public_keys[share.guardian_id].key, "compensation guardian key")
        recovery_key = compute_recovery_public_key(public_keys[share.guardian_id], public_keys["3"])
        for contest_id, contest in tally.contests.items():
            for selection_id, encrypted in contest.selections.items():
                part = share.contests[contest_id].selections[selection_id]
                require(part.recovery_key == recovery_key, "recovery key not bound to ceremony")
                require(part.proof.is_valid(
                    encrypted.ciphertext, recovery_key, part.share, context.crypto_extended_base_hash
                ), "compensated share proof")
        compensated[share.guardian_id] = share

    forged = deepcopy(compensated["1"])
    first_contest = next(iter(tally.contests))
    first_selection = next(iter(tally.contests[first_contest].selections))
    forged_part = forged.contests[first_contest].selections[first_selection]
    from electionguard.group import ONE_MOD_P
    forged_part.share = ONE_MOD_P
    forged_share_rejected = not forged_part.proof.is_valid(
        tally.contests[first_contest].selections[first_selection].ciphertext,
        forged_part.recovery_key, forged_part.share, context.crypto_extended_base_hash,
    )
    require(forged_share_rejected, "forged compensated share accepted")

    coefficients = compute_lagrange_coefficients_for_guardians([public_keys["1"], public_keys["2"]])
    reconstructed = reconstruct_decryption_share(public_keys["3"], tally, compensated, coefficients)
    shares = {**direct, "3": reconstructed}
    computed = decrypt_tally(tally, shares, context.crypto_extended_base_hash, manifest)
    require(computed is not None, "public decryption failed")
    published = load(PlaintextTally, "published-tally.json")
    require(json.loads(to_raw(computed)) == json.loads(to_raw(published)), "published result mismatch")
    mutated = deepcopy(published)
    mutated.contests[first_contest].selections[first_selection].tally += 1
    modified_tally_rejected = json.loads(to_raw(computed)) != json.loads(to_raw(mutated))
    require(modified_tally_rejected, "modified final tally accepted")
    totals = [selection.tally for selection in computed.contests[first_contest].selections.values()]
    require(totals == [1, 2, 0], "wrong synthetic totals")
    print(json.dumps({
        "independent_process": True, "private_keys_loaded": False,
        "guardian_public_records": 3, "ballots": 3, "available_guardians": 2,
        "compensated_guardians": 1, "forged_share_rejected": forged_share_rejected,
        "modified_tally_rejected": modified_tally_rejected, "totals": totals,
        "elapsed_ms": round((perf_counter() - started) * 1000),
    }))


if __name__ == "__main__":
    import electionguard.scheduler as scheduler
    scheduler.cpu_count = lambda logical=False: 2
    verify()
