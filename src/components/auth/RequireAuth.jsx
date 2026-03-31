import { useEffect } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { base44 } from '@/api/base44Client';

/**
 * RequireAuth — blocks render until auth is confirmed, then enforces authenticated user.
 * Prevents child components from firing queries before auth resolves.
 */
export default function RequireAuth({ children }) {
    const context = useAuth();
    const { user, isLoadingAuth, isLoadingPublicSettings } = context || { user: null, isLoadingAuth: true, isLoadingPublicSettings: true };

    // ── Trigger redirect as side effect (not during render) ────────────────────
    useEffect(() => {
        if (!isLoadingAuth && !isLoadingPublicSettings && !user) {
            base44.auth.redirectToLogin(window.location.pathname);
        }
    }, [user, isLoadingAuth, isLoadingPublicSettings]);

    // Safety check: context must exist
    if (!context) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center">
                <div className="text-center">
                    <p className="text-red-600 font-semibold">Error: Auth context not available</p>
                </div>
            </div>
        );
    }

    // Always wait for auth to fully load before checking
    if (isLoadingPublicSettings || isLoadingAuth) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center">
                <div className="text-center">
                    <div className="w-16 h-16 border-4 border-orange-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                    <p className="text-gray-600">Authenticating...</p>
                </div>
            </div>
        );
    }

    // After loading, verify user is authenticated
    if (!user) {
        return null;
    }

    return children;
}