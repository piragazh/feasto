import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { CreditCard, Wallet, DollarSign } from 'lucide-react';

export default function PaymentMethods({ selectedMethod, onMethodChange, acceptsCash = true }) {
    const [isApplePayAvailable] = useState(
        typeof window !== 'undefined' && window.ApplePaySession && ApplePaySession.canMakePayments()
    );

    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    <Wallet className="h-5 w-5 text-orange-500" />
                    Payment Method
                </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
                <RadioGroup value={selectedMethod} onValueChange={onMethodChange}>
                    <div className="space-y-3">
                        {/* Apple Pay */}
                        {isApplePayAvailable && (
                            <div className="flex items-center space-x-3 p-4 border rounded-lg hover:bg-gray-50 cursor-pointer">
                                <RadioGroupItem value="apple_pay" id="apple_pay" />
                                <Label htmlFor="apple_pay" className="flex items-center gap-3 cursor-pointer flex-1">
                                    <div className="w-10 h-10 bg-black rounded-full flex items-center justify-center">
                                        <svg className="h-6 w-6" viewBox="0 0 24 24" fill="white">
                                            <path d="M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.48-3.24 0-1.44.62-2.2.44-3.06-.4C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09l.01-.01zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/>
                                        </svg>
                                    </div>
                                    <div>
                                        <p className="font-medium">Apple Pay</p>
                                        <p className="text-sm text-gray-500">Quick and secure payment</p>
                                    </div>
                                </Label>
                            </div>
                        )}

                        {/* Google Pay */}
                        <div className="flex items-center space-x-3 p-4 border rounded-lg hover:bg-gray-50 cursor-pointer">
                            <RadioGroupItem value="google_pay" id="google_pay" />
                            <Label htmlFor="google_pay" className="flex items-center gap-3 cursor-pointer flex-1">
                                <div className="w-10 h-10 bg-white border rounded-full flex items-center justify-center">
                                    <svg className="h-8 w-8" viewBox="0 0 48 24" fill="none">
                                        <path d="M22.5 11.5v4.75h-1.35V6.5h3.575c.862 0 1.638.325 2.188.862.55.538.875 1.238.875 2.088 0 .862-.325 1.562-.875 2.1-.55.538-1.313.95-2.188.95h-2.225zm0-3.75v2.4h2.263c.487 0 .912-.175 1.237-.5.325-.325.5-.75.5-1.2 0-.45-.175-.875-.5-1.2-.325-.325-.75-.5-1.237-.5h-2.263z" fill="#5F6368"/>
                                        <path d="M30.125 9.375c1.075 0 1.925.3 2.55.9.625.6.937 1.45.937 2.55v3.925h-1.287v-.887h-.063c-.562.75-1.312 1.125-2.237 1.125-.825 0-1.512-.25-2.063-.737-.55-.488-.825-1.1-.825-1.838 0-.775.288-1.387.863-1.85.575-.462 1.337-.687 2.287-.687.8 0 1.462.15 1.988.45v-.313c0-.5-.2-.937-.6-1.312-.4-.375-.875-.563-1.425-.563-.737 0-1.325.312-1.762.937l-1.188-.75c.638-1 1.613-1.5 2.826-1.5zm-1.775 5.588c0 .4.175.737.525 1.012.35.275.763.412 1.238.412.637 0 1.212-.25 1.712-.75.5-.5.75-1.088.75-1.762-.45-.363-1.05-.55-1.8-.55-.6 0-1.1.15-1.5.45-.4.3-.6.688-.6 1.188z" fill="#5F6368"/>
                                        <path d="M40.413 9.625l-5.038 11.625h-1.375l1.875-4.063-3.35-7.562h1.45l2.488 5.95h.025l2.438-5.95h1.487z" fill="#5F6368"/>
                                        <path fill="#4285F4" d="M15.525 11.112c0-.537-.05-1.05-.137-1.537H8.2v2.912h4.1c-.175.95-.712 1.763-1.512 2.3v1.888h2.438c1.437-1.325 2.3-3.275 2.3-5.563z"/>
                                        <path fill="#34A853" d="M8.2 16.825c2.05 0 3.775-.675 5.038-1.825l-2.438-1.888c-.675.45-1.537.725-2.6.725-2 0-3.7-1.35-4.3-3.162H1.4v1.95c1.263 2.513 3.85 4.2 6.8 4.2z"/>
                                        <path fill="#FBBC04" d="M3.9 10.675c-.313-.95-.313-1.975 0-2.925V5.8H1.4c-1.075 2.138-1.075 4.65 0 6.788l2.5-1.913z"/>
                                        <path fill="#EA4335" d="M8.2 5.088c1.125 0 2.137.387 2.938 1.15l2.187-2.188C11.95 2.825 10.225 2 8.2 2c-2.95 0-5.537 1.688-6.8 4.2l2.5 1.913c.6-1.813 2.3-3.025 4.3-3.025z"/>
                                    </svg>
                                </div>
                                <div>
                                    <p className="font-medium">Google Pay</p>
                                    <p className="text-sm text-gray-500">Fast checkout with Google</p>
                                </div>
                            </Label>
                        </div>

                        {/* Card Payment */}
                        <div className="flex items-center space-x-3 p-4 border rounded-lg hover:bg-gray-50 cursor-pointer">
                            <RadioGroupItem value="card" id="card" />
                            <Label htmlFor="card" className="flex items-center gap-3 cursor-pointer flex-1">
                                <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                                    <CreditCard className="h-5 w-5 text-blue-600" />
                                </div>
                                <div>
                                    <p className="font-medium">Credit / Debit Card</p>
                                    <p className="text-sm text-gray-500">Pay securely with your card</p>
                                </div>
                            </Label>
                        </div>

                        {/* Cash on Delivery */}
                        {acceptsCash && (
                            <div className="flex items-center space-x-3 p-4 border rounded-lg hover:bg-gray-50 cursor-pointer">
                                <RadioGroupItem value="cash" id="cash" />
                                <Label htmlFor="cash" className="flex items-center gap-3 cursor-pointer flex-1">
                                    <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center">
                                        <DollarSign className="h-5 w-5 text-green-600" />
                                    </div>
                                    <div>
                                        <p className="font-medium">Cash on Delivery</p>
                                        <p className="text-sm text-gray-500">Pay when you receive your order</p>
                                    </div>
                                </Label>
                            </div>
                        )}
                    </div>
                </RadioGroup>

                {/* Express Checkout Buttons */}
                {selectedMethod === 'apple_pay' && isApplePayAvailable && (
                    <Button 
                        className="w-full h-14 bg-black hover:bg-gray-900 text-white rounded-lg"
                        type="button"
                    >
                        <svg className="h-7 w-7 mr-2" viewBox="0 0 24 24" fill="white">
                            <path d="M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.48-3.24 0-1.44.62-2.2.44-3.06-.4C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09l.01-.01zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/>
                        </svg>
                        Pay with Apple Pay
                    </Button>
                )}

                {selectedMethod === 'google_pay' && (
                    <Button 
                        className="w-full h-14 bg-white hover:bg-gray-50 text-gray-800 border-2 border-gray-200 rounded-lg"
                        type="button"
                    >
                        <svg className="h-10 w-10 mr-2" viewBox="0 0 48 24" fill="none">
                            <path d="M22.5 11.5v4.75h-1.35V6.5h3.575c.862 0 1.638.325 2.188.862.55.538.875 1.238.875 2.088 0 .862-.325 1.562-.875 2.1-.55.538-1.313.95-2.188.95h-2.225zm0-3.75v2.4h2.263c.487 0 .912-.175 1.237-.5.325-.325.5-.75.5-1.2 0-.45-.175-.875-.5-1.2-.325-.325-.75-.5-1.237-.5h-2.263z" fill="#5F6368"/>
                            <path d="M30.125 9.375c1.075 0 1.925.3 2.55.9.625.6.937 1.45.937 2.55v3.925h-1.287v-.887h-.063c-.562.75-1.312 1.125-2.237 1.125-.825 0-1.512-.25-2.063-.737-.55-.488-.825-1.1-.825-1.838 0-.775.288-1.387.863-1.85.575-.462 1.337-.687 2.287-.687.8 0 1.462.15 1.988.45v-.313c0-.5-.2-.937-.6-1.312-.4-.375-.875-.563-1.425-.563-.737 0-1.325.312-1.762.937l-1.188-.75c.638-1 1.613-1.5 2.826-1.5zm-1.775 5.588c0 .4.175.737.525 1.012.35.275.763.412 1.238.412.637 0 1.212-.25 1.712-.75.5-.5.75-1.088.75-1.762-.45-.363-1.05-.55-1.8-.55-.6 0-1.1.15-1.5.45-.4.3-.6.688-.6 1.188z" fill="#5F6368"/>
                            <path d="M40.413 9.625l-5.038 11.625h-1.375l1.875-4.063-3.35-7.562h1.45l2.488 5.95h.025l2.438-5.95h1.487z" fill="#5F6368"/>
                            <path fill="#4285F4" d="M15.525 11.112c0-.537-.05-1.05-.137-1.537H8.2v2.912h4.1c-.175.95-.712 1.763-1.512 2.3v1.888h2.438c1.437-1.325 2.3-3.275 2.3-5.563z"/>
                            <path fill="#34A853" d="M8.2 16.825c2.05 0 3.775-.675 5.038-1.825l-2.438-1.888c-.675.45-1.537.725-2.6.725-2 0-3.7-1.35-4.3-3.162H1.4v1.95c1.263 2.513 3.85 4.2 6.8 4.2z"/>
                            <path fill="#FBBC04" d="M3.9 10.675c-.313-.95-.313-1.975 0-2.925V5.8H1.4c-1.075 2.138-1.075 4.65 0 6.788l2.5-1.913z"/>
                            <path fill="#EA4335" d="M8.2 5.088c1.125 0 2.137.387 2.938 1.15l2.187-2.188C11.95 2.825 10.225 2 8.2 2c-2.95 0-5.537 1.688-6.8 4.2l2.5 1.913c.6-1.813 2.3-3.025 4.3-3.025z"/>
                        </svg>
                        Pay with Google Pay
                    </Button>
                )}
            </CardContent>
        </Card>
    );
}