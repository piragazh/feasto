import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Upload, Link as LinkIcon, Copy, Check, Volume2 } from 'lucide-react';
import { toast } from 'sonner';

export default function PublicFilesManagement() {
    const [uploading, setUploading] = useState(false);
    const [uploadedFile, setUploadedFile] = useState(null);
    const [copied, setCopied] = useState(false);
    const [notificationUrl, setNotificationUrl] = useState('');
    const [savingNotification, setSavingNotification] = useState(false);

    const { data: settings } = useQuery({
        queryKey: ['system-settings'],
        queryFn: () => base44.asServiceRole.entities.SystemSettings.filter({ 
            setting_key: 'notification_sound_url' 
        }),
    });

    useEffect(() => {
        if (settings && settings.length > 0) {
            setNotificationUrl(settings[0].setting_value);
        }
    }, [settings]);

    const handleFileChange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        setUploading(true);
        try {
            const formData = new FormData();
            formData.append('file', file);

            const response = await base44.functions.invoke('uploadPublicFile', {
                file: file
            });

            if (response?.data?.file_url) {
                setUploadedFile({
                    name: file.name,
                    url: response.data.file_url
                });
                toast.success('File uploaded successfully!');
            } else {
                toast.error('Upload failed');
            }
        } catch (error) {
            console.error('Upload error:', error);
            toast.error('Failed to upload file');
        } finally {
            setUploading(false);
        }
    };

    const copyToClipboard = () => {
        navigator.clipboard.writeText(uploadedFile.url);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
        toast.success('URL copied!');
    };

    const saveNotificationSound = async () => {
        if (!notificationUrl) {
            toast.error('Please enter a notification sound URL');
            return;
        }

        setSavingNotification(true);
        try {
            const response = await base44.functions.invoke('saveNotificationSound', {
                notification_sound_url: notificationUrl
            });

            if (response?.data?.success) {
                toast.success('Notification sound saved!');
            } else {
                toast.error('Failed to save notification sound');
            }
        } catch (error) {
            console.error('Save error:', error);
            toast.error('Failed to save notification sound');
        } finally {
            setSavingNotification(false);
        }
    };

    return (
        <div className="space-y-6">
            <div>
                <h2 className="text-2xl font-bold text-gray-900">Public Files Management</h2>
                <p className="text-gray-600 text-sm mt-1">Upload files to the public folder for use across the platform</p>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Upload className="h-5 w-5" />
                        Upload File
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div>
                        <Label htmlFor="file-input">Select File *</Label>
                        <Input
                            id="file-input"
                            type="file"
                            onChange={handleFileChange}
                            disabled={uploading}
                            className="h-12 mt-2"
                            accept="audio/*,image/*,application/pdf,.mp3,.wav,.ogg"
                        />
                        <p className="text-xs text-gray-500 mt-2">Supported: MP3, WAV, OGG, images, PDF</p>
                    </div>

                    {uploading && (
                        <div className="flex items-center gap-2 text-orange-600">
                            <div className="w-4 h-4 border-2 border-orange-600 border-t-transparent rounded-full animate-spin"></div>
                            <span>Uploading...</span>
                        </div>
                    )}

                    {uploadedFile && (
                        <div className="p-4 bg-green-50 border border-green-200 rounded-lg space-y-3">
                            <div>
                                <p className="text-sm font-medium text-green-900 mb-1">File Uploaded Successfully</p>
                                <p className="text-sm text-green-800 break-all">{uploadedFile.name}</p>
                            </div>
                            <div className="flex items-center gap-2">
                                <div className="flex-1 bg-white border border-green-300 rounded px-3 py-2">
                                    <p className="text-xs text-gray-600 break-all">{uploadedFile.url}</p>
                                </div>
                                <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={copyToClipboard}
                                    className="flex items-center gap-2"
                                >
                                    {copied ? (
                                        <>
                                            <Check className="h-4 w-4" />
                                            Copied
                                        </>
                                    ) : (
                                        <>
                                            <Copy className="h-4 w-4" />
                                            Copy
                                        </>
                                    )}
                                </Button>
                            </div>
                            <a
                                href={uploadedFile.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-2 text-sm text-blue-600 hover:text-blue-700"
                            >
                                <LinkIcon className="h-4 w-4" />
                                Open in new tab
                            </a>
                        </div>
                    )}
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Volume2 className="h-5 w-5" />
                        Notification Sound
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div>
                        <Label htmlFor="notification-url">Notification Sound URL</Label>
                        <Input
                            id="notification-url"
                            placeholder="https://..."
                            value={notificationUrl}
                            onChange={(e) => setNotificationUrl(e.target.value)}
                            className="h-10 mt-2"
                        />
                        <p className="text-xs text-gray-500 mt-2">Set the system-wide notification sound URL</p>
                    </div>
                    <Button
                        onClick={saveNotificationSound}
                        disabled={savingNotification}
                        className="bg-blue-600 hover:bg-blue-700"
                    >
                        {savingNotification ? 'Saving...' : 'Save Notification Sound'}
                    </Button>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>Usage</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="bg-gray-50 p-4 rounded-lg space-y-2 text-sm">
                        <p className="text-gray-700">Use uploaded files in your app by adding the URL to:</p>
                        <ul className="list-disc list-inside text-gray-600 space-y-1">
                            <li>System settings (e.g., notification sounds)</li>
                            <li>HTML/CSS files</li>
                            <li>JavaScript code</li>
                            <li>Image sources and references</li>
                        </ul>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}