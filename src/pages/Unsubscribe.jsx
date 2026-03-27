import React, { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Loader2, CheckCircle, AlertCircle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export default function Unsubscribe() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState('loading'); // 'loading', 'success', 'error'
  const [message, setMessage] = useState('Processing your request...');

  useEffect(() => {
    const handleUnsubscribe = async () => {
      const token = searchParams.get('token');
      const channel = searchParams.get('channel');

      if (!token || !channel) {
        setStatus('error');
        setMessage('Invalid or missing unsubscribe parameters.');
        return;
      }

      try {
        // Call the unsubscribe endpoint via GET
        const response = await fetch(
          `/unsubscribeFromPromotions?token=${encodeURIComponent(token)}&channel=${encodeURIComponent(channel)}`
        );

        if (response.ok) {
          setStatus('success');
          setMessage(`You have successfully unsubscribed from ${channel === 'email' ? 'promotional emails' : 'promotional messages'}.`);
        } else if (response.status === 400) {
          setStatus('error');
          setMessage('This unsubscribe link is invalid or has expired.');
        } else if (response.status === 404) {
          setStatus('error');
          setMessage('User account not found.');
        } else {
          setStatus('error');
          setMessage('An error occurred while processing your request. Please try again later.');
        }
      } catch (error) {
        console.error('Unsubscribe error:', error);
        setStatus('error');
        setMessage('An unexpected error occurred. Please try again later.');
      }
    };

    handleUnsubscribe();
  }, [searchParams]);

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <Card className="max-w-md w-full">
        <CardHeader>
          <CardTitle className="text-center">Unsubscribe</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center space-y-4">
            {status === 'loading' && (
              <>
                <Loader2 className="h-12 w-12 animate-spin text-orange-500 mx-auto" />
                <p className="text-gray-600">{message}</p>
              </>
            )}

            {status === 'success' && (
              <>
                <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto">
                  <CheckCircle className="h-8 w-8 text-green-600" />
                </div>
                <h2 className="text-lg font-semibold text-gray-900">Unsubscribed</h2>
                <p className="text-gray-600">{message}</p>
                <p className="text-sm text-gray-500">
                  You can resubscribe anytime by contacting our support team.
                </p>
                <Button
                  onClick={() => navigate('/')}
                  className="w-full bg-orange-500 hover:bg-orange-600"
                >
                  Return to Home
                </Button>
              </>
            )}

            {status === 'error' && (
              <>
                <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto">
                  <AlertCircle className="h-8 w-8 text-red-600" />
                </div>
                <h2 className="text-lg font-semibold text-gray-900">Unable to Unsubscribe</h2>
                <p className="text-gray-600">{message}</p>
                <Button
                  onClick={() => navigate('/')}
                  variant="outline"
                  className="w-full"
                >
                  Return to Home
                </Button>
              </>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}