import { createMMKV } from 'react-native-mmkv';

// Create MMKV storage instance
const storage = createMMKV({
  id: 'app-storage',
});

class GStorageManager {
  storageKeys = {
    LANGUAGE: 'LANGUAGE',
    USER: 'USER',
    IS_LOGGED_IN: 'IS_LOGGED_IN',
    USER_TOKEN: 'USER_TOKEN',
    FCM_TOKEN: 'FCM_TOKEN',
    // The last token the backend confirmed (see ApiServices.syncFcmToken).
    FCM_TOKEN_UPLOADED: 'FCM_TOKEN_UPLOADED',
    ATTRIBUTE: 'ATTRIBUTE',
    PROFILE_DETAIL_LOCAL: 'PROFILE_DETAIL_LOCAL',
    CONVERSATIONS: 'CONVERSATIONS',
    OPENED_CONVERSATION_ID: 'OPENED_CONVERSATION_ID',
    VERIFICATION_CODE_TIMER: 'VERIFICATION_CODE_TIMER',
    FIREBASE_VERIFICATION_ID: 'FIREBASE_VERIFICATION_ID',
    IS_RECOMMENDED: 'isRecommended',
    MEMBERSHIP_DISCOUNT: 'membership_discount',
    PRIMER_SEEN: 'PRIMER_SEEN',
    PRIMER_ANSWERS: 'PRIMER_ANSWERS',
    ONBOARDING_INTRO_SEEN: 'ONBOARDING_INTRO_SEEN',
  };

  deleteAll = () => {
    return new Promise<void>((resolve, reject) => {
      try {
        storage.clearAll();
        resolve();
      } catch (error) {
        console.log('error while deleting all data from MMKV =>', error);
        reject(error);
      }
    });
  };

  deleteMultipleItems = (keys: string[]) => {
    return new Promise<void>((resolve, reject) => {
      try {
        keys.forEach((key) => {
          storage.remove(key);
        });
        resolve();
      } catch (error) {
        console.log('error while deleting multi data from MMKV =>', error);
        reject(error);
      }
    });
  };

  deleteData = (key: string) => {
    return new Promise<void>((resolve, reject) => {
      try {
        storage.remove(key);
        resolve();
      } catch (error) {
        console.log('error while deleting data from MMKV =>', error);
        reject(error);
      }
    });
  };

  getData = (key: string) => {
    return new Promise<unknown>((resolve, reject) => {
      try {
        const data = storage.getString(key);
        if (data != null) {
          try {
            resolve(JSON.parse(data));
          } catch {
            // If parsing fails, return the raw string (for backwards compatibility)
            resolve(data);
          }
        } else {
          resolve(null);
        }
      } catch (error) {
        console.log('error while reading data from MMKV =>', error);
        reject(error);
      }
    });
  };

  setData = (key: string, value: unknown) => {
    return new Promise<void>((resolve, reject) => {
      try {
        const jsonValue = JSON.stringify(value);
        storage.set(key, jsonValue);
        resolve();
      } catch (error) {
        console.log('Error while saving data in MMKV =>', error);
        reject(error);
      }
    });
  };

  // Direct string getter (for keys that store plain strings)
  getString = (key: string): string | undefined => {
    return storage.getString(key);
  };

  // Direct string setter (for keys that store plain strings)
  setString = (key: string, value: string): void => {
    storage.set(key, value);
  };
}

const StorageManager = new GStorageManager();
export default StorageManager;
