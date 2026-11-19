const DB_NAME = 'vein-workspaces';
const DB_VERSION = 1;

export type StoreName = 'workspaces' | 'handles' | 'files';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      for (const name of ['workspaces', 'handles', 'files']) {
        if (!req.result.objectStoreNames.contains(name)) req.result.createObjectStore(name, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('无法打开工作区存储'));
    req.onblocked = () => reject(new Error('工作区存储被另一个页面占用'));
  });
}

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('工作区存储读写失败'));
  });
}

function completed(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('工作区存储事务失败'));
    tx.onabort = () => reject(tx.error ?? new Error('工作区存储事务已中止'));
  });
}

async function withDb<T>(run: (db: IDBDatabase) => Promise<T>): Promise<T> {
  const db = await openDb();
  try {
    return await run(db);
  } finally {
    db.close();
  }
}

export async function idbGet<T>(store: StoreName, id: string): Promise<T | undefined> {
  return withDb((db) => request(db.transaction(store, 'readonly').objectStore(store).get(id) as IDBRequest<T | undefined>));
}

export async function idbGetAll<T>(store: StoreName): Promise<T[]> {
  return withDb((db) => request(db.transaction(store, 'readonly').objectStore(store).getAll() as IDBRequest<T[]>));
}

export async function idbPut<T>(store: StoreName, value: T): Promise<void> {
  return withDb(async (db) => {
    const tx = db.transaction(store, 'readwrite');
    tx.objectStore(store).put(value);
    await completed(tx);
  });
}

export async function idbDelete(store: StoreName, id: string): Promise<void> {
  return withDb(async (db) => {
    const tx = db.transaction(store, 'readwrite');
    tx.objectStore(store).delete(id);
    await completed(tx);
  });
}

export async function idbDeleteWorkspace(id: string): Promise<void> {
  return withDb(async (db) => {
    const files = await request(db.transaction('files', 'readonly').objectStore('files').getAll()) as { id: string; wsId: string }[];
    const tx = db.transaction(['workspaces', 'handles', 'files'], 'readwrite');
    tx.objectStore('workspaces').delete(id);
    tx.objectStore('handles').delete(id);
    for (const file of files) if (file.wsId === id) tx.objectStore('files').delete(file.id);
    await completed(tx);
  });
}
