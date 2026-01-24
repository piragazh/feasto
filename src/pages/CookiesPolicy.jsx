import React from 'react';
import { Button } from "@/components/ui/button";
import { ArrowLeft, Cookie } from 'lucide-react';

export default function CookiesPolicy() {
    return (
        <div className="min-h-screen bg-gray-50">
            <div className="bg-white border-b sticky top-0 z-10">
                <div className="max-w-4xl mx-auto px-4 py-4">
                    <Button variant="ghost" size="sm" className="gap-2" onClick={() => window.history.back()}>
                        <ArrowLeft className="h-4 w-4" />
                        Back
                    </Button>
                </div>
            </div>

            <div className="max-w-4xl mx-auto px-4 py-12">
                <div className="bg-white rounded-2xl shadow-sm border p-8 md:p-12">
                    <div className="flex items-center gap-3 mb-6">
                        <div className="w-12 h-12 bg-orange-100 rounded-xl flex items-center justify-center">
                            <Cookie className="h-6 w-6 text-orange-600" />
                        </div>
                        <div>
                            <h1 className="text-3xl font-bold text-gray-900">Cookies Policy</h1>
                            <p className="text-sm text-gray-500">Last updated: January 24, 2026</p>
                        </div>
                    </div>

                    <div className="prose prose-gray max-w-none space-y-8">
                        {/* Introduction */}
                        <section>
                            <p className="text-gray-700 leading-relaxed">
                                This Cookies Policy explains how MealDrop uses cookies and similar technologies to recognize you when you visit our platform. It explains what these technologies are and why we use them, as well as your rights to control our use of them.
                            </p>
                        </section>

                        {/* What are cookies */}
                        <section>
                            <h2 className="text-2xl font-bold text-gray-900 mb-4">What are cookies?</h2>
                            <p className="text-gray-700">
                                Cookies are small data files that are placed on your computer or mobile device when you visit a website. Cookies are widely used by website owners to make their websites work, or to work more efficiently, as well as to provide reporting information.
                            </p>
                            <p className="text-gray-700 mt-3">
                                Cookies set by the website owner (in this case, MealDrop) are called "first-party cookies". Cookies set by parties other than the website owner are called "third-party cookies". Third-party cookies enable third-party features or functionality to be provided on or through the website.
                            </p>
                        </section>

                        {/* Why we use cookies */}
                        <section>
                            <h2 className="text-2xl font-bold text-gray-900 mb-4">Why do we use cookies?</h2>
                            <p className="text-gray-700">We use cookies for several reasons:</p>
                            <ul className="list-disc pl-6 space-y-2 text-gray-700 mt-3">
                                <li><strong>Essential cookies:</strong> Required for the platform to function properly (e.g., user authentication, shopping cart)</li>
                                <li><strong>Performance cookies:</strong> Help us understand how visitors interact with our platform</li>
                                <li><strong>Functionality cookies:</strong> Remember your preferences and settings</li>
                                <li><strong>Analytics cookies:</strong> Help us improve our services by analyzing usage patterns</li>
                            </ul>
                        </section>

                        {/* Types of cookies we use */}
                        <section>
                            <h2 className="text-2xl font-bold text-gray-900 mb-4">Types of cookies we use</h2>
                            
                            <h3 className="text-xl font-semibold text-gray-800 mt-6 mb-3">1. Essential Cookies</h3>
                            <p className="text-gray-700">
                                These cookies are strictly necessary to provide you with services available through our platform and to use some of its features, such as access to secure areas.
                            </p>
                            <ul className="list-disc pl-6 space-y-2 text-gray-700 mt-2">
                                <li>Authentication tokens (keeps you logged in)</li>
                                <li>Session management</li>
                                <li>Shopping cart persistence</li>
                                <li>Security features</li>
                            </ul>

                            <h3 className="text-xl font-semibold text-gray-800 mt-6 mb-3">2. Analytics and Performance Cookies</h3>
                            <p className="text-gray-700">
                                These cookies collect information about how you use our platform, such as which pages you visit most often. This data helps us optimize our platform and improve user experience.
                            </p>
                            <ul className="list-disc pl-6 space-y-2 text-gray-700 mt-2">
                                <li>Google Tag Manager (GTM) for analytics</li>
                                <li>Page view tracking</li>
                                <li>User interaction tracking</li>
                                <li>Performance monitoring</li>
                            </ul>

                            <h3 className="text-xl font-semibold text-gray-800 mt-6 mb-3">3. Functionality Cookies</h3>
                            <p className="text-gray-700">
                                These cookies enable the platform to provide enhanced functionality and personalization.
                            </p>
                            <ul className="list-disc pl-6 space-y-2 text-gray-700 mt-2">
                                <li>Language preferences</li>
                                <li>Location settings</li>
                                <li>Favorite restaurants</li>
                                <li>Order preferences</li>
                            </ul>
                        </section>

                        {/* Third-party cookies */}
                        <section>
                            <h2 className="text-2xl font-bold text-gray-900 mb-4">Third-party cookies</h2>
                            <p className="text-gray-700 mb-3">
                                In addition to our own cookies, we may also use various third-party cookies to report usage statistics and deliver advertisements:
                            </p>
                            <ul className="list-disc pl-6 space-y-2 text-gray-700">
                                <li><strong>Google Analytics:</strong> Helps us understand how visitors engage with our platform</li>
                                <li><strong>Stripe:</strong> For secure payment processing</li>
                                <li><strong>Map providers:</strong> For location services and delivery tracking</li>
                            </ul>
                        </section>

                        {/* How to control cookies */}
                        <section>
                            <h2 className="text-2xl font-bold text-gray-900 mb-4">How can you control cookies?</h2>
                            <p className="text-gray-700 mb-3">
                                You have the right to decide whether to accept or reject cookies. You can exercise your cookie rights by setting your preferences in your browser settings.
                            </p>
                            
                            <h3 className="text-xl font-semibold text-gray-800 mt-6 mb-3">Browser Controls</h3>
                            <p className="text-gray-700 mb-2">Most web browsers allow you to control cookies through their settings:</p>
                            <ul className="list-disc pl-6 space-y-2 text-gray-700">
                                <li><strong>Chrome:</strong> Settings → Privacy and Security → Cookies</li>
                                <li><strong>Safari:</strong> Preferences → Privacy → Cookies and website data</li>
                                <li><strong>Firefox:</strong> Options → Privacy & Security → Cookies and Site Data</li>
                                <li><strong>Edge:</strong> Settings → Privacy, search, and services → Cookies</li>
                            </ul>

                            <h3 className="text-xl font-semibold text-gray-800 mt-6 mb-3">Important Notice</h3>
                            <p className="text-gray-700">
                                If you choose to block or delete cookies, some features of our platform may not function properly. For example, you may not be able to stay logged in or maintain items in your shopping cart.
                            </p>
                        </section>

                        {/* Cookie retention */}
                        <section>
                            <h2 className="text-2xl font-bold text-gray-900 mb-4">How long do cookies last?</h2>
                            <p className="text-gray-700 mb-3">
                                The length of time a cookie remains on your device depends on whether it is a "persistent" or "session" cookie:
                            </p>
                            <ul className="list-disc pl-6 space-y-2 text-gray-700">
                                <li><strong>Session cookies:</strong> Last only as long as your browser is open and are automatically deleted when you close your browser</li>
                                <li><strong>Persistent cookies:</strong> Remain on your device until they expire or are deleted. Expiration dates vary depending on the purpose of the cookie</li>
                            </ul>
                        </section>

                        {/* Local storage */}
                        <section>
                            <h2 className="text-2xl font-bold text-gray-900 mb-4">Local Storage</h2>
                            <p className="text-gray-700">
                                In addition to cookies, we also use browser local storage to store certain information:
                            </p>
                            <ul className="list-disc pl-6 space-y-2 text-gray-700 mt-3">
                                <li>Shopping cart items</li>
                                <li>Restaurant preferences</li>
                                <li>Order history cache</li>
                                <li>User interface preferences</li>
                            </ul>
                            <p className="text-gray-700 mt-3">
                                Local storage data persists even after you close your browser and can be cleared through your browser settings.
                            </p>
                        </section>

                        {/* Updates */}
                        <section>
                            <h2 className="text-2xl font-bold text-gray-900 mb-4">Updates to this Cookies Policy</h2>
                            <p className="text-gray-700">
                                We may update this Cookies Policy from time to time to reflect changes in our practices or for operational, legal, or regulatory reasons. Please revisit this Cookies Policy regularly to stay informed about our use of cookies.
                            </p>
                        </section>

                        {/* Contact */}
                        <section className="bg-orange-50 rounded-xl p-6">
                            <h2 className="text-2xl font-bold text-gray-900 mb-4">Questions?</h2>
                            <p className="text-gray-700 mb-4">
                                If you have questions about our use of cookies or this Cookies Policy, please contact us:
                            </p>
                            <div className="space-y-2 text-gray-700">
                                <p><strong>Email:</strong> privacy@mealdrop.com</p>
                                <p><strong>Support:</strong> Through the in-app support chat</p>
                            </div>
                        </section>

                        {/* Consent */}
                        <section className="border-t pt-6 mt-8">
                            <p className="text-gray-600 text-sm italic">
                                By continuing to use MealDrop, you consent to our use of cookies as described in this Cookies Policy.
                            </p>
                        </section>
                    </div>
                </div>
            </div>
        </div>
    );
}