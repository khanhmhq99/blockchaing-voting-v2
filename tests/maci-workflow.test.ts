import assert from 'node:assert/strict';
import test from 'node:test';
import { describeWorkflowFailure, nextAutomaticStep, voteBlockReason } from '../apps/voter-web/app/maci-workflow.ts';

const approved = { electionStatus: 'REGISTRATION', chainHealth: 'AVAILABLE', eligible: true, credentialUnlocked: true, registrationStatus: undefined, joinStatus: undefined, joinIndex: null };

test('first registration creates a local credential only after approval and a healthy chain', () => {
  assert.equal(nextAutomaticStep(approved), 'register');
  assert.equal(nextAutomaticStep({ ...approved, eligible: false }), null);
  assert.equal(nextAutomaticStep({ ...approved, credentialUnlocked: false }), 'register');
  assert.equal(nextAutomaticStep({ ...approved, chainHealth: 'INVALID_OR_UNAVAILABLE' }), null);
  assert.equal(nextAutomaticStep({ ...approved, registrationStatus: 'PENDING' }), null);
  assert.equal(nextAutomaticStep({ ...approved, credentialUnlocked: false, registrationStatus: 'ISSUED' }), null);
  assert.equal(nextAutomaticStep({ ...approved, registrationStatus: 'FAILED' }), null);
  assert.equal(nextAutomaticStep({ ...approved, registrationStatus: 'CONFIRMED' }), null);
});

test('join waits for confirmed registration and does not duplicate pending or completed joins', () => {
  const opened = { ...approved, electionStatus: 'OPEN', registrationStatus: 'CONFIRMED' };
  assert.equal(nextAutomaticStep(opened), 'join');
  assert.equal(nextAutomaticStep({ ...opened, registrationStatus: 'PENDING' }), null);
  assert.equal(nextAutomaticStep({ ...opened, joinStatus: 'PENDING' }), null);
  assert.equal(nextAutomaticStep({ ...opened, joinStatus: 'FAILED' }), null);
  assert.equal(nextAutomaticStep({ ...opened, joinIndex: '1' }), null);
  assert.equal(nextAutomaticStep({ ...opened, electionStatus: 'CLOSED' }), null);
  assert.equal(nextAutomaticStep({ ...opened, electionStatus: 'VERIFIED' }), null);
});

test('missing browser RPC and credential errors stop retries without exposing raw errors', () => {
  const config = describeWorkflowFailure('join', new Error('MACI_PUBLIC_RPC_NOT_CONFIGURED'));
  assert.equal(config.retryable, false);
  assert.match(config.message, /NEXT_PUBLIC_MACI_RPC_URL/);
  const credential = describeWorkflowFailure('register', new Error('MACI_CREDENTIAL_MISMATCH'));
  assert.equal(credential.retryable, false);
  const sponsor = describeWorkflowFailure('register', { code: 'MACI_BALANCE_LOW', message: 'sensitive internal details' });
  assert.equal(sponsor.retryable, false);
  assert.ok(!sponsor.message.includes('sensitive internal details'));
  const unknown = describeWorkflowFailure('join', new Error('private witness value macisk.secret'));
  assert.equal(unknown.retryable, true);
  assert.ok(!unknown.message.includes('macisk.secret'));
});

test('approval during the voting window alone cannot unlock an unregistered or unjoined ballot', () => {
  const ready = { chainId: '31337', electionStatus: 'OPEN', chainHealth: 'AVAILABLE', eligible: true,
    credentialReady: true, registrationMatches: true, registrationStatus: 'CONFIRMED', joinStatus: 'JOINED', joinIndex: '1' };
  assert.equal(voteBlockReason(ready), null);
  assert.match(voteBlockReason({ ...ready, registrationStatus: undefined }) ?? '', /đăng ký MACI/);
  assert.match(voteBlockReason({ ...ready, joinIndex: null }) ?? '', /tham gia poll/);
  assert.match(voteBlockReason({ ...ready, credentialReady: false }) ?? '', /Khóa MACI/);
  assert.match(voteBlockReason({ ...ready, chainHealth: 'INVALID_OR_UNAVAILABLE' }) ?? '', /deployment MACI/);
  assert.match(voteBlockReason({ ...ready, chainId: '97' }) ?? '', /31337/);
});
