import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, AlertCircle, Loader2, ShieldCheck, ChefHat, CreditCard, UtensilsCrossed } from 'lucide-react';
import { createPageUrl } from '@/utils';

const ROLE_CONFIG = {
    manager: { label: 'Manager', icon: ShieldCheck, color: 'bg-purple-100 text-purple-800', redirect: 'RestaurantDashboard' },
    kitchen_staff: { label: 'Kitchen Staff', icon: ChefHat, color: 'bg-orange-100 text-orange-800', redirect: 'RestaurantDashboard' },
    cashier: { label: 'Cashier', icon: CreditCard, color: 'bg-blue-100 text-blue-800', redirect: 'POSDashboard' },
};

export default function StaffOnboarding() {
    const urlParams = new URLSearchParams(window.location.search);
    const token = urlParams.get('token');
    const email = urlParams.get('email');

    const [step, setStep] = useState('validating'); // validating | ready | logging_in | success | error
    const [staffInfo, setStaffInfo] = useState(null);
    const [errorMsg, setErrorMsg] = useState('');

    useEffect(() => {
        if (!token || !email) {
            setStep('error');
            setErrorMsg('Invalid invite link. Please contact your manager.');
            return;
        }
        validateToken();
    }, []);

    const validateToken = async () => {
        try {
            const res = await base44.functions.invoke('validateStaffToken', { token, email });
            if (res.data?.valid) {
                setStaffInfo(res.data.staff);
                setStep('ready');
            } else {
                setStep('error');
                setErrorMsg(res.data?.error || 'Invalid invite link.');
            }
        } catch (e) {
            setStep('error');
            setErrorMsg('Failed to validate invite link. Please try again.');
        }
    };

    const handleAcceptInvite = async () => {
        setStep('logging_in');
        try {
            // Complete onboarding (clears token)
            await base44.functions.invoke('staffOnboardingComplete', { token, email });

            // Now redirect to login — after login the user lands in the right place
            // We store a hint so the post-login redirect works
            sessionStorage.setItem('staff_post_login_role', staffInfo.role);
            sessionStorage.setItem('staff_post_login_email', email);

            // Redirect to platform login, then back to the correct dashboard
            const roleConfig = ROLE_CONFIG[staffInfo.role] || ROLE_CONFIG.manager;
            const redirectPage = roleConfig.redirect;
            base44.auth.redirectToLogin(createPageUrl(redirectPage));
        } catch (e) {
            setStep('error');
            setErrorMsg(e.message || 'Something went wrong. Please try again.');
        }
    };

    const roleConfig = staffInfo ? (ROLE_CONFIG[staffInfo.role] || ROLE_CONFIG.manager) : null;
    const RoleIcon = roleConfig?.icon || UtensilsCrossed;

    return (
        <div className="min-h-screen bg-gradient-to-br from-orange-50 to-orange-100 flex items-center justify-center p-4">
            <div className="w-full max-w-md">
                {/* Logo */}
                <div className="text-center mb-8">
                    <div className="w-16 h-16 bg-orange-500 rounded-2xl flex items-center justify-center mx-auto mb-3 shadow-lg">
                        <UtensilsCrossed className="h-8 w-8 text-white" />
                    </div>
                    <h1 className="text-2xl font-bold text-gray-900">MealDrop</h1>
                    <p className="text-gray-500 text-sm mt-1">Staff Onboarding</p>
                </div>

                <Card className="shadow-xl border-0">
                    <CardContent className="p-8">

                        {/* Validating */}
                        {step === 'validating' && (
                            <div className="text-center py-6">
                                <Loader2 className="h-10 w-10 text-orange-500 animate-spin mx-auto mb-4" />
                                <p className="text-gray-600 font-medium">Verifying your invite link…</p>
                            </div>
                        )}

                        {/* Ready to accept */}
                        {step === 'ready' && staffInfo && (
                            <div className="space-y-6">
                                <div className="text-center">
                                    <div className={`w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4 ${roleConfig?.color}`}>
                                        <RoleIcon className="h-7 w-7" />
                                    </div>
                                    <h2 className="text-xl font-bold text-gray-900">Hi, {staffInfo.full_name}! 👋</h2>
                                    <p className="text-gray-500 mt-1 text-sm">You've been invited to join</p>
                                    <p className="text-gray-900 font-semibold text-lg">{staffInfo.restaurant_name}</p>
                                </div>

                                <div className="bg-gray-50 rounded-xl p-4 space-y-3">
                                    <div className="flex items-center justify-between text-sm">
                                        <span className="text-gray-500">Your Role</span>
                                        <Badge className={roleConfig?.color}>{roleConfig?.label}</Badge>
                                    </div>
                                    <div className="flex items-center justify-between text-sm">
                                        <span className="text-gray-500">Email</span>
                                        <span className="font-medium text-gray-800">{staffInfo.email}</span>
                                    </div>
                                    <div className="flex items-center justify-between text-sm">
                                        <span className="text-gray-500">Dashboard Access</span>
                                        <span className="font-medium text-gray-800">
                                            {staffInfo.role === 'cashier' ? 'POS Only' : 'Restaurant Dashboard'}
                                        </span>
                                    </div>
                                </div>

                                <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 text-sm text-blue-700">
                                    <p className="font-medium mb-1">What happens next?</p>
                                    <p>You'll be taken to the login page. Sign in with <strong>{staffInfo.email}</strong> — if it's your first time, use the "Forgot Password" option to set your password.</p>
                                </div>

                                <Button
                                    className="w-full bg-orange-500 hover:bg-orange-600 h-12 text-base font-semibold"
                                    onClick={handleAcceptInvite}
                                >
                                    Accept Invite & Sign In
                                </Button>
                            </div>
                        )}

                        {/* Logging in */}
                        {step === 'logging_in' && (
                            <div className="text-center py-6">
                                <Loader2 className="h-10 w-10 text-orange-500 animate-spin mx-auto mb-4" />
                                <p className="text-gray-600 font-medium">Setting up your account…</p>
                                <p className="text-gray-400 text-sm mt-1">Redirecting to login</p>
                            </div>
                        )}

                        {/* Success */}
                        {step === 'success' && (
                            <div className="text-center py-6">
                                <CheckCircle2 className="h-12 w-12 text-green-500 mx-auto mb-4" />
                                <h2 className="text-xl font-bold text-gray-900 mb-2">All set!</h2>
                                <p className="text-gray-500">Redirecting you to the dashboard…</p>
                            </div>
                        )}

                        {/* Error */}
                        {step === 'error' && (
                            <div className="text-center py-6">
                                <AlertCircle className="h-12 w-12 text-red-400 mx-auto mb-4" />
                                <h2 className="text-xl font-bold text-gray-900 mb-2">Invalid Invite</h2>
                                <p className="text-gray-500 text-sm">{errorMsg}</p>
                                <p className="text-gray-400 text-xs mt-4">Please contact your manager to send a new invite link.</p>
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}