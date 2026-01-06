import React from 'react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { Button } from "@/components/ui/button";
import { ArrowLeft } from 'lucide-react';

export default function TermsOfService() {
    return (
        <div className="min-h-screen bg-gray-50">
            <div className="bg-white border-b sticky top-0 z-10">
                <div className="max-w-4xl mx-auto px-4 py-4 flex items-center gap-4">
                    <Link to={createPageUrl('Home')}>
                        <Button size="icon" variant="ghost" className="rounded-full">
                            <ArrowLeft className="h-5 w-5" />
                        </Button>
                    </Link>
                    <h1 className="text-xl font-bold text-gray-900">Terms of Service</h1>
                </div>
            </div>

            <div className="max-w-4xl mx-auto px-4 py-8">
                <div className="bg-white rounded-2xl p-8 shadow-sm space-y-6">
                    <div>
                        <p className="text-sm text-gray-500 mb-4">Last updated: {new Date().toLocaleDateString('en-GB', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
                        <p className="text-gray-600 mb-6">
                            Please read these Terms of Service carefully before using MealDrop. By accessing or using our service, you agree to be bound by these terms.
                        </p>
                    </div>

                    <section>
                        <h2 className="text-2xl font-bold text-gray-900 mb-3">1. Service Overview</h2>
                        <p className="text-gray-600">
                            MealDrop is an online food ordering and delivery platform that connects customers with local restaurants. We facilitate orders but do not prepare or deliver the food ourselves.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-2xl font-bold text-gray-900 mb-3">2. User Accounts</h2>
                        <ul className="list-disc pl-6 text-gray-600 space-y-2">
                            <li>You must provide accurate and complete information when creating an account</li>
                            <li>You are responsible for maintaining the security of your account</li>
                            <li>You must be at least 18 years old to use our service</li>
                            <li>Guest checkout is available without creating an account</li>
                        </ul>
                    </section>

                    <section>
                        <h2 className="text-2xl font-bold text-gray-900 mb-3">3. Orders and Payments</h2>
                        <ul className="list-disc pl-6 text-gray-600 space-y-2">
                            <li>All orders are subject to acceptance by the restaurant</li>
                            <li>Prices are displayed in GBP and include VAT where applicable</li>
                            <li>We accept cash on delivery and card payments via Stripe</li>
                            <li>Payment is processed when you place your order</li>
                            <li>Delivery fees and minimum order values vary by restaurant</li>
                        </ul>
                    </section>

                    <section>
                        <h2 className="text-2xl font-bold text-gray-900 mb-3">4. Delivery</h2>
                        <ul className="list-disc pl-6 text-gray-600 space-y-2">
                            <li>Estimated delivery times are approximate and not guaranteed</li>
                            <li>You must provide a valid UK delivery address</li>
                            <li>Collection orders are available at participating restaurants</li>
                            <li>Delivery is subject to restaurant delivery zones</li>
                        </ul>
                    </section>

                    <section>
                        <h2 className="text-2xl font-bold text-gray-900 mb-3">5. Cancellations and Refunds</h2>
                        <ul className="list-disc pl-6 text-gray-600 space-y-2">
                            <li>Orders cannot be cancelled once accepted by the restaurant</li>
                            <li>Refunds are issued at our discretion for valid complaints</li>
                            <li>Contact us immediately if there's an issue with your order</li>
                            <li>Partial refunds may be offered for missing or incorrect items</li>
                        </ul>
                    </section>

                    <section>
                        <h2 className="text-2xl font-bold text-gray-900 mb-3">6. User Conduct</h2>
                        <p className="text-gray-600 mb-2">You agree not to:</p>
                        <ul className="list-disc pl-6 text-gray-600 space-y-2">
                            <li>Use the service for any illegal purposes</li>
                            <li>Provide false or misleading information</li>
                            <li>Abuse, harass, or threaten restaurant staff or delivery drivers</li>
                            <li>Attempt to manipulate prices, reviews, or ratings</li>
                            <li>Use automated systems to access the service</li>
                        </ul>
                    </section>

                    <section>
                        <h2 className="text-2xl font-bold text-gray-900 mb-3">7. Reviews and Content</h2>
                        <ul className="list-disc pl-6 text-gray-600 space-y-2">
                            <li>You retain rights to content you post, but grant us a license to use it</li>
                            <li>Reviews must be honest and based on genuine experiences</li>
                            <li>We reserve the right to remove inappropriate content</li>
                            <li>Defamatory or offensive content is prohibited</li>
                        </ul>
                    </section>

                    <section>
                        <h2 className="text-2xl font-bold text-gray-900 mb-3">8. Liability</h2>
                        <ul className="list-disc pl-6 text-gray-600 space-y-2">
                            <li>We are not responsible for food quality, preparation, or safety</li>
                            <li>Restaurants are solely responsible for their food and service</li>
                            <li>We are not liable for delivery delays caused by external factors</li>
                            <li>Our liability is limited to the value of your order</li>
                        </ul>
                    </section>

                    <section>
                        <h2 className="text-2xl font-bold text-gray-900 mb-3">9. Intellectual Property</h2>
                        <p className="text-gray-600">
                            All content on MealDrop, including logos, designs, and text, is protected by copyright and trademark laws. You may not use our intellectual property without permission.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-2xl font-bold text-gray-900 mb-3">10. Changes to Terms</h2>
                        <p className="text-gray-600">
                            We reserve the right to modify these terms at any time. Continued use of the service after changes constitutes acceptance of the new terms.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-2xl font-bold text-gray-900 mb-3">11. Termination</h2>
                        <p className="text-gray-600">
                            We may suspend or terminate your account for violations of these terms or for any other reason at our discretion.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-2xl font-bold text-gray-900 mb-3">12. Governing Law</h2>
                        <p className="text-gray-600">
                            These terms are governed by the laws of England and Wales. Any disputes will be resolved in UK courts.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-2xl font-bold text-gray-900 mb-3">13. Contact Us</h2>
                        <p className="text-gray-600">
                            If you have questions about these Terms of Service, please contact us through the app's support system or messaging feature.
                        </p>
                    </section>
                </div>
            </div>
        </div>
    );
}