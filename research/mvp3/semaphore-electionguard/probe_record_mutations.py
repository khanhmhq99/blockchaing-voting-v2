"""Mutate copies of a public record and require the separate verifier to fail."""

import json
import os
import shutil
import subprocess
import sys
from pathlib import Path

base = Path(__file__).resolve().parent / "outputs"
source = base / "electionguard-record"
cases = base / "mutated-records"
cases.mkdir(parents=True, exist_ok=True)


def copy_case(name):
    target = cases / name
    if target.exists():
        shutil.rmtree(target)
    shutil.copytree(source, target)
    return target


def change_json(target, name, change):
    path = target / name
    value = json.loads(path.read_text(encoding="utf-8"))
    change(value)
    path.write_text(json.dumps(value), encoding="utf-8")


def first_selection(record):
    contest = next(iter(record["contests"].values()))
    return next(iter(contest["selections"].values()))


mutated_tally = copy_case("altered-final-total")
change_json(mutated_tally, "published-tally.json", lambda value: first_selection(value).__setitem__(
    "tally", first_selection(value)["tally"] + 1
))

forged_share = copy_case("forged-compensated-share")
change_json(forged_share, "compensated-share-1-3.json", lambda value: first_selection(value).__setitem__(
    "share", "01"
))

omitted_ballot = copy_case("omitted-ballot")
(omitted_ballot / "accepted-ballot-2.json").unlink()

wrong_key = copy_case("wrong-public-key")
change_json(wrong_key, "context.json", lambda value: value.__setitem__("elgamal_public_key", "01"))

altered_ballot_proof = copy_case("altered-ballot-proof")
change_json(altered_ballot_proof, "accepted-ballot-0.json", lambda value: value["contests"][0][
    "ballot_selections"
][0]["proof"].__setitem__("challenge", "01"))

duplicate_ballot = copy_case("duplicate-ballot")
shutil.copyfile(duplicate_ballot / "accepted-ballot-0.json", duplicate_ballot / "accepted-ballot-1.json")

results = {}
for name, target, expected_error in (
    ("altered_final_total", mutated_tally, "published result mismatch"),
    ("forged_compensated_share", forged_share, "compensated share proof"),
    ("omitted_ballot", omitted_ballot, "FileNotFoundError"),
    ("wrong_public_key", wrong_key, "election context mismatch"),
    ("altered_ballot_proof", altered_ballot_proof, "ballot proof invalid"),
    ("duplicate_ballot", duplicate_ballot, "duplicate ballot ID"),
):
    environment = dict(os.environ, SEG_RECORD_DIR=str(target))
    result = subprocess.run(
        [sys.executable, str(Path(__file__).with_name("verify_public_record.py"))],
        env=environment, capture_output=True, text=True, check=False,
    )
    results[name] = result.returncode != 0 and expected_error in result.stderr
if not all(results.values()):
    raise RuntimeError(f"Public verifier accepted a mutated record: {results}")
print(json.dumps({"external_record_mutations_rejected": results}))
