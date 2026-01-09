import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { CreditCard, Wallet, DollarSign } from 'lucide-react';

export default function PaymentMethods({ selectedMethod, onMethodChange, acceptsCash = true }) {

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
            </CardContent>
        </Card>
    );
}