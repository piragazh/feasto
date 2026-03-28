import { createClient } from '@base44/sdk';
import { appParams } from '@/lib/app-params';
import { getApiUrl } from '@/lib/api-origin';

const { appId, token, functionsVersion } = appParams;

// Initialize SDK with backend URL properly configured for custom domains
// getApiUrl() is called here (at module load) after window.location is available
const backendUrl = getApiUrl('').replace(/\/$/, '');
console.log('[base44Client] Initialized with backend URL:', backendUrl, 'appId:', appId);

export const base44 = createClient({
  appId,
  token,
  functionsVersion,
  requiresAuth: false,
  backendUrl: backendUrl
});