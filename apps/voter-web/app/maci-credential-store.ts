'use client';

// Historical encrypted backup envelopes remain readable for earlier local tests.
const databaseName = 'maci-encrypted-credentials-v1';
const storeName = 'backups';

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(databaseName, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(storeName);
    request.onerror = () => reject(new Error('Không thể mở kho lưu trữ khóa trên trình duyệt.'));
    request.onsuccess = () => resolve(request.result);
  });
}

export function credentialStorageKey(userId: string, electionId: string) { return `${userId}:${electionId}`; }

export function readEncryptedCredential(key: string): Promise<string | null> {
  return openDatabase().then(database => new Promise((resolve, reject) => {
    const transaction = database.transaction(storeName, 'readonly');
    const request = transaction.objectStore(storeName).get(key);
    transaction.oncomplete = () => { database.close(); resolve(typeof request.result === 'string' ? request.result : null); };
    transaction.onerror = () => { database.close(); reject(new Error('Không thể đọc bản sao khóa đã mã hóa.')); };
  }));
}

export function saveEncryptedCredential(key: string, backup: string): Promise<void> {
  return openDatabase().then(database => new Promise((resolve, reject) => {
    const transaction = database.transaction(storeName, 'readwrite');
    transaction.objectStore(storeName).put(backup, key);
    transaction.oncomplete = () => { database.close(); resolve(); };
    transaction.onerror = () => { database.close(); reject(new Error('Không thể lưu bản sao khóa đã mã hóa.')); };
  }));
}

// Versioned, origin-local credentials. A deployment is part of the key so an
// election recreated at a different MACI address cannot reuse its secret.
export type CredentialContext = { userId: string; electionId: string; chainId: string; maciAddress: string };
export type LocalMaciCredential = { version: 1; context: CredentialContext; secret: string; publicKeyX: string; publicKeyY: string };
const credentialDatabase = 'maci-local-credentials-v1';
const credentialStore = 'credentials';

export function credentialId(context: CredentialContext): string {
  if (!context || ![context.userId, context.electionId, context.chainId, context.maciAddress].every(value => typeof value === 'string' && value.length > 0) ||
    !/^0x[0-9a-fA-F]{40}$/.test(context.maciAddress)) throw new Error('MACI_CREDENTIAL_CONTEXT_INVALID');
  return JSON.stringify([context.userId, context.electionId, context.chainId, context.maciAddress.toLowerCase()]);
}

function openCredentialDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(credentialDatabase, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(credentialStore);
    request.onerror = () => reject(new Error('MACI_CREDENTIAL_STORAGE_UNAVAILABLE'));
    request.onblocked = () => reject(new Error('MACI_CREDENTIAL_STORAGE_UNAVAILABLE'));
    request.onsuccess = () => resolve(request.result);
  });
}

export async function readLocalCredential(context: CredentialContext): Promise<LocalMaciCredential | null> {
  const database = await openCredentialDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(credentialStore, 'readonly');
    const request = transaction.objectStore(credentialStore).get(credentialId(context));
    transaction.oncomplete = () => {
      database.close();
      const value: unknown = request.result;
      if (value === undefined) { resolve(null); return; }
      if (!value || typeof value !== 'object') { reject(new Error('MACI_CREDENTIAL_INVALID')); return; }
      const record = value as Partial<LocalMaciCredential>;
      let matchingContext = false;
      try { matchingContext = !!record.context && credentialId(record.context) === credentialId(context); } catch { /* malformed local record */ }
      if (record.version !== 1 || !matchingContext || !/^macisk\.[0-9a-f]{64}$/.test(record.secret ?? '') ||
        typeof record.publicKeyX !== 'string' || typeof record.publicKeyY !== 'string') {
        reject(new Error('MACI_CREDENTIAL_INVALID')); return;
      }
      resolve(record as LocalMaciCredential);
    };
    transaction.onerror = () => { database.close(); reject(new Error('MACI_CREDENTIAL_STORAGE_UNAVAILABLE')); };
  });
}

export async function addLocalCredential(record: LocalMaciCredential): Promise<void> {
  const database = await openCredentialDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(credentialStore, 'readwrite');
    // add is atomic across tabs. put would silently replace a voting credential.
    transaction.objectStore(credentialStore).add(record, credentialId(record.context));
    transaction.oncomplete = () => { database.close(); resolve(); };
    transaction.onerror = () => { database.close(); reject(new Error('MACI_CREDENTIAL_ALREADY_EXISTS_OR_STORAGE_UNAVAILABLE')); };
  });
}
