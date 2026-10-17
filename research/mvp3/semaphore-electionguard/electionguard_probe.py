"""Synthetic ElectionGuard 1.4.0 workflow. Run only in isolated research Python."""

import json
import logging
import os
from copy import deepcopy
from pathlib import Path
from time import perf_counter

from electionguard.ballot import PlaintextBallot, PlaintextBallotContest, PlaintextBallotSelection
from electionguard.ballot_box import BallotBox
from electionguard.data_store import DataStore
from electionguard.decryption_mediator import DecryptionMediator
from electionguard.encrypt import EncryptionDevice, EncryptionMediator
from electionguard.key_ceremony_mediator import KeyCeremonyMediator
from electionguard.manifest import Manifest
from electionguard.serialize import from_raw, to_raw
from electionguard.tally import tally_ballots
from electionguard.utils import get_optional
from electionguard_verify.verify import verify_aggregation, verify_ballot, verify_decryption
from guardian_worker import GuardianWorker


ROOT = Path(__file__).resolve().parent
UPSTREAM = ROOT / "upstream" / "electionguard-python"
logging.disable(logging.CRITICAL)
if os.getenv("PRIME_OPTION") not in (None, "Standard"):
    raise RuntimeError("Research probe requires standard ElectionGuard group constants")


def require(value, name):
    if not value:
        raise RuntimeError(name)
    return value


def ceremony():
    guardians = [GuardianWorker(str(i + 1), i + 1) for i in range(3)]
    require(len({guardian.process.pid for guardian in guardians}) == 3, "distinct guardian processes")
    try:
        guardians[0].call("_election_key_pair")
        raise RuntimeError("private guardian accessor exposed")
    except RuntimeError as error:
        require("operation denied" in str(error), "private guardian accessor rejection")
    mediator = KeyCeremonyMediator("synthetic-mediator", guardians[0].ceremony_details)
    for guardian in guardians:
        mediator.announce(guardian.share_key())
    for guardian in guardians:
        for key in get_optional(mediator.share_announced(guardian.id)):
            guardian.save_guardian_key(key)
    require(mediator.all_guardians_announced(), "guardian announcement")
    for guardian in guardians:
        guardian.generate_election_partial_key_backups()
        mediator.receive_backups(guardian.share_election_partial_key_backups())
    require(mediator.all_backups_available(), "guardian backups")
    for guardian in guardians:
        for backup in get_optional(mediator.share_backups(guardian.id)):
            guardian.save_election_partial_key_backup(backup)
    for guardian in guardians:
        for other in guardians:
            if guardian.id != other.id:
                verification = get_optional(guardian.verify_election_partial_key_backup(other.id))
                mediator.receive_backup_verifications([verification])
    require(mediator.all_backups_verified(), "guardian backup verification")
    return guardians, get_optional(mediator.publish_joint_key())


def manifest():
    source = json.loads((UPSTREAM / "data" / "election_manifest_simple.json").read_text())
    contest = source["contests"][0]
    contest["number_elected"] = 1
    contest["votes_allowed"] = 1
    contest["ballot_selections"] = contest["ballot_selections"][:3]
    source["contests"] = [contest]
    source["candidates"] = [
        candidate for candidate in source["candidates"]
        if candidate["object_id"] in {selection["candidate_id"] for selection in contest["ballot_selections"]}
    ]
    source["ballot_styles"] = source["ballot_styles"][:1]
    result = from_raw(Manifest, json.dumps(source))
    require(result.is_valid(), "three-candidate manifest")
    return result, contest


def decrypt(guardians, context, ciphertext_tally):
    mediator = DecryptionMediator("synthetic-decryption", context)
    for guardian in guardians:
        share = get_optional(guardian.compute_tally_share(ciphertext_tally, context))
        mediator.announce(guardian.share_key(), share)
    for guardian in all_guardians:
        if guardian not in guardians:
            mediator.announce_missing(guardian.share_key())
    if len(guardians) < context.quorum:
        return mediator.announcement_complete(), None
    for guardian in guardians:
        for missing in mediator.get_missing_guardians():
            share = guardian.compute_compensated_tally_share(missing.owner_id, ciphertext_tally, context)
            require(share, "compensated share")
            mediator.receive_tally_compensation_share(share)
    if mediator.get_missing_guardians():
        mediator.reconstruct_shares_for_tally(ciphertext_tally)
    require(mediator.announcement_complete(), "quorum announcement")
    return True, mediator


started = perf_counter()
manifest_value, contest = manifest()
all_guardians, joint_key = ceremony()
from electionguard_tools.helpers.election_builder import ElectionBuilder

builder = ElectionBuilder(3, 2, manifest_value)
builder.set_public_key(joint_key.joint_public_key)
builder.set_commitment_hash(joint_key.commitment_hash)
internal_manifest, context = get_optional(builder.build())
ceremony_ms = round((perf_counter() - started) * 1000)

device = EncryptionDevice(1, 1, 1, "synthetic-local")
encrypter = EncryptionMediator(internal_manifest, context, device)
store = DataStore()
box = BallotBox(internal_manifest, context, store)
submitted = []
selection_ids = [item["object_id"] for item in contest["ballot_selections"]]
for index, choice in enumerate([0, 1, 1]):
    selections = [PlaintextBallotSelection(item, int(position == choice)) for position, item in enumerate(selection_ids)]
    ballot = PlaintextBallot(
        f"synthetic-{index}",
        manifest_value.ballot_styles[0].object_id,
        [PlaintextBallotContest(contest["object_id"], selections)],
    )
    encrypted = get_optional(encrypter.encrypt(ballot))
    require(verify_ballot(encrypted, manifest_value, context).verified, "ballot validity")
    submitted.append(get_optional(box.cast(encrypted)))
encrypted_ms = round((perf_counter() - started) * 1000)

encrypted_tally = get_optional(tally_ballots(store, internal_manifest, context))
require(verify_aggregation(submitted, encrypted_tally, manifest_value, context).verified, "aggregation")
missing_ballot_rejected = not verify_aggregation(submitted[:-1], encrypted_tally, manifest_value, context).verified
require(missing_ballot_rejected, "missing ballot aggregation rejection")
wrong_manifest = deepcopy(manifest_value)
wrong_manifest.election_scope_id = "altered-election"
wrong_manifest_rejected = not verify_ballot(submitted[0], wrong_manifest, context).verified
require(wrong_manifest_rejected, "wrong manifest rejection")
public_dir = ROOT / "outputs" / "electionguard-record"
public_dir.mkdir(parents=True, exist_ok=True)
for index, ballot in enumerate(submitted):
    ballot_public = json.loads(to_raw(ballot))
    require(all(value is None for key, value in ballot_public.items() if key == "nonce"), "public ballot nonce")
    (public_dir / f"accepted-ballot-{index}.json").write_text(
        json.dumps(ballot_public, sort_keys=True, separators=(",", ":")), encoding="utf-8"
    )
(public_dir / "manifest.json").write_text(
    json.dumps(json.loads(to_raw(manifest_value)), sort_keys=True, separators=(",", ":")), encoding="utf-8"
)
(public_dir / "context.json").write_text(
    json.dumps(json.loads(to_raw(context)), sort_keys=True, separators=(",", ":")), encoding="utf-8"
)
one_ready, _ = decrypt(all_guardians[:1], context, encrypted_tally)
require(not one_ready, "one-guardian quorum rejection")
one_b_ready, _ = decrypt(all_guardians[1:2], context, encrypted_tally)
require(not one_b_ready, "second one-guardian quorum rejection")
two_ready, decryption = decrypt(all_guardians[:2], context, encrypted_tally)
require(two_ready, "two-guardian quorum")
plain = get_optional(decryption.get_plaintext_tally(encrypted_tally, manifest_value))
totals = [plain.contests[contest["object_id"]].selections[item].tally for item in selection_ids]
require(totals == [1, 2, 0], "final tally")
for quorum in ((all_guardians[0], all_guardians[2]), (all_guardians[1], all_guardians[2])):
    ready, alternate = decrypt(list(quorum), context, encrypted_tally)
    require(ready, "alternate quorum announcement")
    alternate_plain = get_optional(alternate.get_plaintext_tally(encrypted_tally, manifest_value))
    alternate_totals = [
        alternate_plain.contests[contest["object_id"]].selections[item].tally for item in selection_ids
    ]
    require(alternate_totals == totals, "alternate quorum tally")
try:
    compensated_verification = verify_decryption(plain, {g.id: g.share_key() for g in all_guardians}, context)
    compensated_verifier_result = compensated_verification.verified
except (AttributeError, TypeError) as exc:
    compensated_verifier_result = type(exc).__name__
_, full_decryption = decrypt(all_guardians, context, encrypted_tally)
full_plain = get_optional(full_decryption.get_plaintext_tally(encrypted_tally, manifest_value))
verification = verify_decryption(full_plain, {g.id: g.share_key() for g in all_guardians}, context)
modified_final = deepcopy(full_plain)
modified_final.contests[contest["object_id"]].selections[selection_ids[0]].tally += 1
modified_final_accepted_by_reference_verifier = verify_decryption(
    modified_final, {g.id: g.share_key() for g in all_guardians}, context
).verified
for guardian in all_guardians:
    (public_dir / f"guardian-{guardian.id}.json").write_text(to_raw(guardian.publish()), encoding="utf-8")
for guardian_id, share in decryption._tally_shares.items():
    if guardian_id in {all_guardians[0].id, all_guardians[1].id}:
        (public_dir / f"direct-share-{guardian_id}.json").write_text(to_raw(share), encoding="utf-8")
for pair, share in decryption._compensated_tally_shares.items():
    (public_dir / f"compensated-share-{pair.owner_id}-{pair.designated_id}.json").write_text(
        to_raw(share), encoding="utf-8"
    )
(public_dir / "published-tally.json").write_text(to_raw(plain), encoding="utf-8")
print(json.dumps({
    "implementation": "electionguard-python 1.4.0",
    "spec_version": str(manifest_value.spec_version),
    "guardians": 3,
    "guardian_processes_distinct": True,
    "private_accessor_denied": True,
    "quorum": 2,
    "ballots": len(submitted),
    "choices": [0, 1, 1],
    "totals": totals,
    "ballot_validity": True,
    "aggregation_verified": True,
    "missing_ballot_rejected": missing_ballot_rejected,
    "wrong_manifest_rejected": wrong_manifest_rejected,
    "single_guardian_rejected": not one_ready,
    "second_single_guardian_rejected": not one_b_ready,
    "all_two_guardian_quorums_verified": True,
    "two_of_three_reference_verifier": compensated_verifier_result,
    "three_of_three_reference_verifier": verification.verified,
    "modified_final_accepted_by_reference_verifier": modified_final_accepted_by_reference_verifier,
    "ceremony_ms": ceremony_ms,
    "encryption_ms_elapsed": encrypted_ms,
    "total_ms": round((perf_counter() - started) * 1000),
}))
require(verification.verified, "reference decryption verification")
for guardian in all_guardians:
    guardian.close()
