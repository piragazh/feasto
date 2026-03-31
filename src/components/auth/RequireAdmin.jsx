import { useAuth } from '@/lib/AuthContext';
import { base44 } from '@/api/base44Client';

/**
 * RequireAdmin — blocks render until auth is confirmed, then enforces admin role.
 * Prevents child components from firing queries before auth resolves.
 */
export default function RequireAdmin({ children }) {
    const { user, isLoadingAuth, isLoadingPublicSettings } = useAuth();

    if (isLoadingPublicSettings || isLoadingAuth) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center">
                <div className="text-center">
                    <div className="w-16 h-16 border-4 border-orange-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                    <p className="text-gray-600">Checking access...</p>
                </div>
            </div>
        );
    }

    if (!user || user.role !== 'admin') {
        base44.auth.redirectToLogin(window.location.pathname);
        return null;
    }

    return children;
}