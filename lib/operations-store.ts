import { EMPTY_OPERATIONS, type Operations } from "./operations";

let connection: Promise<IDBDatabase> | undefined;

function database() {
  connection ??= new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("steelcalc.operations", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("workspace");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  }).catch((error) => {
    connection = undefined;
    throw error;
  });
  return connection;
}

export async function readOperations(): Promise<Operations> {
  const db = await database();
  return new Promise((resolve, reject) => {
    const request = db.transaction("workspace").objectStore("workspace").get("state");
    request.onsuccess = () => resolve(request.result ?? EMPTY_OPERATIONS);
    request.onerror = () => reject(request.error);
  });
}

export async function updateOperations(update: (state: Operations) => Operations): Promise<Operations> {
  const db = await database();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction("workspace", "readwrite");
    const store = transaction.objectStore("workspace");
    const request = store.get("state");
    let next: Operations;
    request.onsuccess = () => {
      try {
        next = update(request.result ?? EMPTY_OPERATIONS);
        store.put(next, "state");
      } catch (error) {
        reject(error);
        transaction.abort();
      }
    };
    transaction.oncomplete = () => resolve(next);
    transaction.onabort = () => reject(transaction.error ?? new Error("本地工作台保存失败。"));
    transaction.onerror = () => reject(transaction.error);
  });
}
