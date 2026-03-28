import { createClient } from '@base44/sdk';
import { appParams } from '@/lib/app-params';

const { appId, token, functionsVersion } = appParams;

export const base44 = createClient({
  appId,
  token,
  functionsVersion,
  requiresAuth: false,
});