pragma circom 2.0.0;
include "coordinator/non-qv/VoteTally.circom";

component main {public [
    index,
    totalSignups,
    sbCommitment,
    currentTallyCommitment,
    newTallyCommitment
]} = VoteTallyNonQv(14, 5, 3);
