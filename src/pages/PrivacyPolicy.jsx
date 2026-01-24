import React from 'react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { Button } from "@/components/ui/button";
import { ArrowLeft, Shield, Lock, Eye, Users, FileText, Mail } from 'lucide-react';

export default function PrivacyPolicy() {
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
                            <Shield className="h-6 w-6 text-orange-600" />
                        </div>
                        <div>
                            <h1 className="text-3xl font-bold text-gray-900">Privacy Policy</h1>
                            <p className="text-sm text-gray-500">Last updated: January 5, 2026</p>
                        </div>
                    </div>

                    <div className="prose prose-gray max-w-none space-y-8">
                        {/* Introduction */}
                        <section>
                            <p className="text-gray-700 leading-relaxed">
                                MealDrop ("we," "our," or "us") is committed to protecting your privacy. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use our food delivery and restaurant ordering platform.
                            </p>
                            <p className="text-gray-700 leading-relaxed">
                                Please read this privacy policy carefully. If you do not agree with the terms of this privacy policy, please do not access the application.
                            </p>
                        </section>

                        {/* Information Collection */}
                        <section>
                            <div className="flex items-center gap-2 mb-4">
                                <Eye className="h-5 w-5 text-orange-600" />
                                <h2 className="text-2xl font-bold text-gray-900 m-0">1. Information We Collect</h2>
                            </div>
                            
                            <h3 className="text-xl font-semibold text-gray-800 mt-6 mb-3">Personal Information</h3>
                            <p className="text-gray-700">We collect information that you provide directly to us, including:</p>
                            <ul className="list-disc pl-6 space-y-2 text-gray-700">
                                <li><strong>Account Information:</strong> Full name, email address, phone number</li>
                                <li><strong>Delivery Information:</strong> Delivery addresses, location coordinates (latitude/longitude)</li>
                                <li><strong>Payment Information:</strong> Payment card details (processed securely through Stripe)</li>
                                <li><strong>Order Information:</strong> Order history, food preferences, special instructions</li>
                                <li><strong>Communication Data:</strong> Messages with restaurants, drivers, and support</li>
                            </ul>

                            <h3 className="text-xl font-semibold text-gray-800 mt-6 mb-3">Automatically Collected Information</h3>
                            <ul className="list-disc pl-6 space-y-2 text-gray-700">
                                <li><strong>Device Information:</strong> Browser type, operating system, device identifiers</li>
                                <li><strong>Location Data:</strong> GPS coordinates for delivery tracking and restaurant recommendations</li>
                                <li><strong>Usage Data:</strong> Pages viewed, time spent, search queries, interaction with features</li>
                                <li><strong>Cookies:</strong> Session data, preferences, authentication tokens</li>
                            </ul>
                        </section>

                        {/* How We Use Information */}
                        <section>
                            <div className="flex items-center gap-2 mb-4">
                                <FileText className="h-5 w-5 text-orange-600" />
                                <h2 className="text-2xl font-bold text-gray-900 m-0">2. How We Use Your Information</h2>
                            </div>
                            
                            <p className="text-gray-700">We use the collected information for the following purposes:</p>
                            <ul className="list-disc pl-6 space-y-2 text-gray-700">
                                <li><strong>Order Processing:</strong> To process and deliver your food orders</li>
                                <li><strong>Account Management:</strong> To create and manage your account</li>
                                <li><strong>Payment Processing:</strong> To process payments securely through our payment partners</li>
                                <li><strong>Delivery Services:</strong> To coordinate delivery with drivers and provide real-time tracking</li>
                                <li><strong>Communications:</strong> To send order confirmations, updates, and customer support messages</li>
                                <li><strong>Personalization:</strong> To recommend restaurants and items based on your preferences</li>
                                <li><strong>Analytics:</strong> To understand usage patterns and improve our services</li>
                                <li><strong>Legal Compliance:</strong> To comply with applicable laws and regulations</li>
                            </ul>
                        </section>

                        {/* Information Sharing */}
                        <section>
                            <div className="flex items-center gap-2 mb-4">
                                <Users className="h-5 w-5 text-orange-600" />
                                <h2 className="text-2xl font-bold text-gray-900 m-0">3. Information Sharing and Disclosure</h2>
                            </div>
                            
                            <p className="text-gray-700">We may share your information with:</p>
                            <ul className="list-disc pl-6 space-y-2 text-gray-700">
                                <li><strong>Restaurants:</strong> Order details, delivery address, contact information</li>
                                <li><strong>Delivery Drivers:</strong> Delivery address, contact information, order details</li>
                                <li><strong>Payment Processors:</strong> Payment information (Stripe) for transaction processing</li>
                                <li><strong>Service Providers:</strong> Third-party services that help us operate (SMS notifications, analytics)</li>
                                <li><strong>Legal Requirements:</strong> When required by law or to protect our rights</li>
                                <li><strong>Business Transfers:</strong> In connection with a merger, acquisition, or sale of assets</li>
                            </ul>
                            <p className="text-gray-700 mt-4">
                                We do not sell your personal information to third parties for marketing purposes.
                            </p>
                        </section>

                        {/* Data Security */}
                        <section>
                            <div className="flex items-center gap-2 mb-4">
                                <Lock className="h-5 w-5 text-orange-600" />
                                <h2 className="text-2xl font-bold text-gray-900 m-0">4. Data Security</h2>
                            </div>
                            
                            <p className="text-gray-700">
                                We implement appropriate technical and organizational security measures to protect your personal information, including:
                            </p>
                            <ul className="list-disc pl-6 space-y-2 text-gray-700">
                                <li>Encryption of data in transit (HTTPS/SSL)</li>
                                <li>Secure storage of sensitive information</li>
                                <li>Access controls and authentication</li>
                                <li>Regular security audits and updates</li>
                                <li>Payment processing through PCI-compliant partners (Stripe)</li>
                            </ul>
                            <p className="text-gray-700 mt-4">
                                However, no method of transmission over the Internet or electronic storage is 100% secure. We cannot guarantee absolute security.
                            </p>
                        </section>

                        {/* Data Retention */}
                        <section>
                            <h2 className="text-2xl font-bold text-gray-900 mb-4">5. Data Retention</h2>
                            <p className="text-gray-700">
                                We retain your personal information for as long as necessary to provide our services and comply with legal obligations. Order history is retained for 7 years for accounting and tax purposes. You may request deletion of your account and associated data at any time.
                            </p>
                        </section>

                        {/* Your Rights */}
                        <section>
                            <h2 className="text-2xl font-bold text-gray-900 mb-4">6. Your Privacy Rights</h2>
                            <p className="text-gray-700">Depending on your location, you may have the following rights:</p>
                            <ul className="list-disc pl-6 space-y-2 text-gray-700">
                                <li><strong>Access:</strong> Request a copy of your personal information</li>
                                <li><strong>Correction:</strong> Update or correct inaccurate information</li>
                                <li><strong>Deletion:</strong> Request deletion of your personal information</li>
                                <li><strong>Objection:</strong> Object to processing of your information</li>
                                <li><strong>Portability:</strong> Request transfer of your data to another service</li>
                                <li><strong>Withdraw Consent:</strong> Withdraw consent for data processing</li>
                            </ul>
                            <p className="text-gray-700 mt-4">
                                To exercise these rights, please contact us using the information provided below.
                            </p>
                        </section>

                        {/* Location Data */}
                        <section>
                            <h2 className="text-2xl font-bold text-gray-900 mb-4">7. Location Data</h2>
                            <p className="text-gray-700">
                                We collect location data to:
                            </p>
                            <ul className="list-disc pl-6 space-y-2 text-gray-700">
                                <li>Calculate delivery fees and estimated delivery times</li>
                                <li>Show nearby restaurants</li>
                                <li>Provide real-time delivery tracking</li>
                                <li>Verify delivery completion</li>
                            </ul>
                            <p className="text-gray-700 mt-4">
                                You can control location permissions through your device settings. Disabling location services may limit some features.
                            </p>
                        </section>

                        {/* Third-Party Services */}
                        <section>
                            <h2 className="text-2xl font-bold text-gray-900 mb-4">8. Third-Party Services</h2>
                            <p className="text-gray-700">Our platform uses the following third-party services:</p>
                            <ul className="list-disc pl-6 space-y-2 text-gray-700">
                                <li><strong>Stripe:</strong> Payment processing (subject to Stripe's Privacy Policy)</li>
                                <li><strong>SMS Provider:</strong> Order notifications and updates</li>
                                <li><strong>Maps Services:</strong> Location and mapping functionality</li>
                            </ul>
                            <p className="text-gray-700 mt-4">
                                These services have their own privacy policies, and we encourage you to review them.
                            </p>
                        </section>

                        {/* Children's Privacy */}
                        <section>
                            <h2 className="text-2xl font-bold text-gray-900 mb-4">9. Children's Privacy</h2>
                            <p className="text-gray-700">
                                Our services are not directed to individuals under the age of 18. We do not knowingly collect personal information from children. If you believe we have collected information from a child, please contact us immediately.
                            </p>
                        </section>

                        {/* Cookies */}
                        <section>
                            <h2 className="text-2xl font-bold text-gray-900 mb-4">10. Cookies and Tracking</h2>
                            <p className="text-gray-700">
                                We use cookies and similar technologies to:
                            </p>
                            <ul className="list-disc pl-6 space-y-2 text-gray-700">
                                <li>Maintain your session and keep you logged in</li>
                                <li>Remember your preferences and settings</li>
                                <li>Analyze usage patterns and improve our services</li>
                                <li>Provide personalized recommendations</li>
                            </ul>
                            <p className="text-gray-700 mt-4">
                                You can control cookies through your browser settings, but disabling them may affect functionality.
                            </p>
                        </section>

                        {/* International Transfers */}
                        <section>
                            <h2 className="text-2xl font-bold text-gray-900 mb-4">11. International Data Transfers</h2>
                            <p className="text-gray-700">
                                Your information may be transferred to and processed in countries other than your country of residence. We ensure appropriate safeguards are in place to protect your information in accordance with this Privacy Policy.
                            </p>
                        </section>

                        {/* Changes to Policy */}
                        <section>
                            <h2 className="text-2xl font-bold text-gray-900 mb-4">12. Changes to This Privacy Policy</h2>
                            <p className="text-gray-700">
                                We may update this Privacy Policy from time to time. We will notify you of any changes by posting the new Privacy Policy on this page and updating the "Last updated" date. Your continued use of our services after changes constitutes acceptance of the updated policy.
                            </p>
                        </section>

                        {/* Contact */}
                        <section className="bg-orange-50 rounded-xl p-6">
                            <div className="flex items-center gap-2 mb-4">
                                <Mail className="h-5 w-5 text-orange-600" />
                                <h2 className="text-2xl font-bold text-gray-900 m-0">13. Contact Us</h2>
                            </div>
                            <p className="text-gray-700 mb-4">
                                If you have questions or concerns about this Privacy Policy or our data practices, please contact us:
                            </p>
                            <div className="space-y-2 text-gray-700">
                                <p><strong>Email:</strong> privacy@mealdrop.com</p>
                                <p><strong>Address:</strong> MealDrop Limited, London, United Kingdom</p>
                                <p><strong>Support:</strong> Through the in-app support chat</p>
                            </div>
                        </section>

                        {/* Compliance */}
                        <section>
                            <h2 className="text-2xl font-bold text-gray-900 mb-4">14. Legal Compliance</h2>
                            <p className="text-gray-700">
                                This Privacy Policy complies with applicable data protection laws including:
                            </p>
                            <ul className="list-disc pl-6 space-y-2 text-gray-700">
                                <li>UK General Data Protection Regulation (UK GDPR)</li>
                                <li>Data Protection Act 2018</li>
                                <li>Privacy and Electronic Communications Regulations (PECR)</li>
                                <li>California Consumer Privacy Act (CCPA) for applicable users</li>
                            </ul>
                        </section>

                        {/* Acceptance */}
                        <section className="border-t pt-6 mt-8">
                            <p className="text-gray-600 text-sm italic">
                                By using MealDrop, you acknowledge that you have read and understood this Privacy Policy and agree to its terms.
                            </p>
                        </section>
                    </div>
                </div>
            </div>
        </div>
    );
}