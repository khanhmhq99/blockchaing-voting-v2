"""Ephemeral ElectionGuard guardian process; secret keys stay in child memory."""

import multiprocessing

PUBLIC_OPERATIONS = frozenset({
    "ceremony_details", "share_key", "save_guardian_key",
    "generate_election_partial_key_backups", "share_election_partial_key_backups",
    "save_election_partial_key_backup", "verify_election_partial_key_backup",
    "compute_tally_share", "compute_compensated_tally_share", "publish",
})


def worker(connection, guardian_id, sequence):
    import logging

    logging.disable(logging.CRITICAL)
    from electionguard.guardian import Guardian

    guardian = Guardian.from_nonce(guardian_id, sequence, 3, 2)
    try:
        while True:
            name, args = connection.recv()
            if name == "close":
                connection.send((True, None))
                break
            if name not in PUBLIC_OPERATIONS:
                connection.send((False, "operation denied"))
                continue
            try:
                attribute = getattr(guardian, name)
                result = attribute(*args) if callable(attribute) else attribute
                connection.send((True, result))
            except Exception as error:
                connection.send((False, type(error).__name__))
    finally:
        connection.close()


class GuardianWorker:
    def __init__(self, guardian_id, sequence):
        self.id = guardian_id
        parent, child = multiprocessing.Pipe()
        self.connection = parent
        self.process = multiprocessing.Process(target=worker, args=(child, guardian_id, sequence))
        self.process.start()
        child.close()
        self.ceremony_details = self.call("ceremony_details")

    def call(self, name, *args):
        self.connection.send((name, args))
        success, result = self.connection.recv()
        if not success:
            raise RuntimeError(f"Guardian {self.id} {name}: {result}")
        return result

    def __getattr__(self, name):
        return lambda *args: self.call(name, *args)

    def close(self):
        self.call("close")
        self.connection.close()
        self.process.join(timeout=5)
        if self.process.is_alive():
            self.process.terminate()
            self.process.join()
            raise RuntimeError(f"Guardian {self.id} did not exit cleanly")
