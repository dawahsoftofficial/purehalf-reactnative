import { CommonActions } from '@react-navigation/native';
import axios, { type AxiosResponse } from 'axios';

import { navigationRef } from '../../navigation/RootNavigation';
import { setGlobalState } from '../context';
import { StorageManager } from '../storageManager';
import { TesterDiagnostics } from '../tester/tester-diagnostics';
import BaseUrl from './BaseUrl';

const Api = axios.create({
  baseURL: BaseUrl,
  // Without a timeout a stalled connection leaves chat sends (and the UI that
  // awaits them) hanging forever. Rejects with no `response`, which the chat
  // error helper maps to NETWORK.
  timeout: 20000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Replace any auth-bearing header value with a redaction marker before logging.
// Token leakage via console.log in release builds was a real audit finding —
// keep this function pure-defensive even though logs are now __DEV__-gated.
const redactHeaders = (headers: any) => {
  if (!headers) return headers;
  const safe: Record<string, any> = { ...headers };
  for (const key of Object.keys(safe)) {
    if (key.toLowerCase() === 'authorization') {
      safe[key] = '[REDACTED]';
    }
  }
  return safe;
};

Api.interceptors.request.use(
  async (config: any) => {
    if (!config) {
      console.error('[API Request] Received undefined request config');
      return Promise.reject(new Error('Invalid request configuration'));
    }

    config.headers = config.headers ?? {};

    const token = await StorageManager.getData(
      StorageManager.storageKeys.USER_TOKEN
    );
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    // FormData uploads: if the Content-Type is left unset, axios falls back to
    // its default POST type (application/x-www-form-urlencoded), which makes
    // React Native's OkHttp multipart builder throw
    // "multipart != application/x-www-form-urlencoded" and fail instantly.
    // Set multipart/form-data explicitly; RN/OkHttp appends the boundary.
    if (config.data instanceof FormData) {
      config.headers['Content-Type'] = 'multipart/form-data';
    }

    if (__DEV__) {
      const requestInfo = {
        method: config.method?.toUpperCase(),
        fullUrl: `${config.baseURL || ''}${config.url}`,
        headers: redactHeaders(config.headers),
        data: config.data instanceof FormData ? '[FormData]' : config.data,
        params: config.params,
      };
      console.log('[API Request]', JSON.stringify(requestInfo, null, 4));
    }

    // Store request timestamp for response time calculation
    config.metadata = { startTime: Date.now() };

    return config;
  },
  (error: any) => {
    if (__DEV__) {
      console.error('[API Request Error]', JSON.stringify(error, null, 4));
    }
    return Promise.reject(error);
  }
);

Api.interceptors.response.use(
  (response: AxiosResponse) => {
    if (!response) {
      console.error('[API Response] Received undefined response object');
      return response;
    }

    const startedAt = (response.config as any)?.metadata?.startTime;
    TesterDiagnostics.record({
      method: response.config?.method?.toUpperCase() || 'GET',
      url: response.config?.url || '',
      status: response.status,
      duration_ms: startedAt ? Date.now() - startedAt : 0,
      timestamp: new Date().toISOString(),
    });

    if (__DEV__) {
      const responseInfo = {
        method: response.config?.method?.toUpperCase(),
        fullUrl: `${response.config?.baseURL || ''}${response.config?.url}`,
        status: response.status,
        statusText: response.statusText,
        headers: redactHeaders(response.headers),
        data: response.data,
      };
      console.log('[API Response]', JSON.stringify(responseInfo, null, 4));
    }
    return response;
  },
  async (error: any) => {
    const startedAt = error?.config?.metadata?.startTime;
    TesterDiagnostics.record({
      method: error?.config?.method?.toUpperCase() || 'GET',
      url: error?.config?.url || '',
      status: error?.response?.status,
      duration_ms: startedAt ? Date.now() - startedAt : 0,
      timestamp: new Date().toISOString(),
    });
    if (__DEV__) {
      const errorInfo = {
        method: error?.config?.method?.toUpperCase(),
        fullUrl: `${error?.config?.baseURL || ''}${error?.config?.url}`,
        status: error?.response?.status,
        statusText: error?.response?.statusText,
        errorMessage: error?.message,
        errorCode: error?.code,
        responseData: error?.response?.data,
      };
      console.error('[API Response Error]', JSON.stringify(errorInfo, null, 4));
    }

    // Only 401 (unauthenticated) should trigger forced logout. 400 = bad
    // request / validation error — those must surface to the caller, not
    // wipe the user's session.
    if (error?.response?.status === 401) {
      const { getData, setData, deleteAll, storageKeys } = StorageManager;
      const verificationId = await getData(
        storageKeys.FIREBASE_VERIFICATION_ID
      );
      StorageManager.setString(storageKeys.IS_RECOMMENDED, 'false');
      await deleteAll()
        .then(async () => {
          setGlobalState({ currentUser: null });
          await setData(storageKeys.FIREBASE_VERIFICATION_ID, verificationId);
          navigationRef.dispatch(
            CommonActions.reset({
              index: 1,
              routes: [{ name: 'AuthWelcome' }],
            })
          );
        })
        .catch((err) =>
          console.error(
            '[API Response Error] Error during logout cleanup:',
            err
          )
        );
    }
    return Promise.reject(error);
  }
);

export { Api };
