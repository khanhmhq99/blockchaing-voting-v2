"""Inventory isolated installed dependencies without guessing missing licenses."""

import importlib.metadata
import json
from pathlib import Path

base = Path(__file__).resolve().parent
lock = json.loads((base / "package-lock.json").read_text(encoding="utf-8"))
node = []
for path, entry in sorted(lock["packages"].items()):
    if not path.startswith("node_modules/"):
        continue
    package_json = base / path / "package.json"
    metadata = json.loads(package_json.read_text(encoding="utf-8")) if package_json.exists() else {}
    node.append({
        "name": metadata.get("name", path.removeprefix("node_modules/")),
        "version": entry.get("version"),
        "license_declared": metadata.get("license"),
        "legacy_licenses": metadata.get("licenses"),
        "integrity": entry.get("integrity"),
        "dev": entry.get("dev", False),
        "optional": entry.get("optional", False),
    })
python = []
for distribution in sorted(importlib.metadata.distributions(), key=lambda d: d.metadata.get("Name", "").lower()):
    metadata = distribution.metadata
    classifiers = metadata.get_all("Classifier", [])
    license_classifiers = [value for value in classifiers if value.startswith("License ::")]
    license_text = metadata.get("License")
    python.append({
        "name": metadata.get("Name"),
        "version": distribution.version,
        "license_expression": metadata.get("License-Expression"),
        "license_classifiers": license_classifiers,
        "license_field": license_text if license_text and len(license_text) < 120 and "\n" not in license_text else None,
        "requires_dist": metadata.get_all("Requires-Dist", []),
    })
output = {
    "scope": "installed isolated research dependencies; declarations are not legal verification",
    "semaphore_tag": "v4.14.4",
    "electionguard_python_tag": "1.4.0",
    "node_packages": node,
    "python_distributions": python,
}
target = base.parent.parent.parent / "docs" / "mvp3" / "semaphore-electionguard" / "dependency-inventory.json"
target.write_text(json.dumps(output, indent=2, sort_keys=True) + "\n", encoding="utf-8")
print(json.dumps({
    "node_packages": len(node), "node_missing_license": sum(item["license_declared"] is None for item in node),
    "python_distributions": len(python),
    "python_missing_license_metadata": sum(not (item["license_expression"] or item["license_classifiers"] or item["license_field"]) for item in python),
}))
