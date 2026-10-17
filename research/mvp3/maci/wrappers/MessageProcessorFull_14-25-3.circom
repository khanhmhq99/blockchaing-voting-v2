pragma circom 2.0.0;
include "coordinator/full/MessageProcessor.circom";

component main {public [
    totalSignups,
    index,
    batchEndIndex,
    currentSbCommitment,
    newSbCommitment,
    outputBatchHash,
    actualStateTreeDepth,
    coordinatorPublicKeyHash,
    voteOptions
]} = MessageProcessorFull(14, 25, 3);
