import React, { useState, useRef } from 'react';
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { base44 } from '@/api/base44Client';
import { Upload, X, CheckCircle, AlertCircle, Film, Image as ImageIcon } from 'lucide-react';
import { toast } from 'sonner';

export default function EnhancedFileUploader({ restaurantId, onFilesUploaded, onClose }) {
    const [uploadQueue, setUploadQueue] = useState([]);
    const [isUploading, setIsUploading] = useState(false);
    const fileInputRef = useRef(null);

    const handleFileSelect = (e) => {
        const files = Array.from(e.target.files || []);
        if (files.length === 0) return;

        const newItems = files.map(file => ({
            id: Math.random().toString(36).substr(2, 9),
            file,
            progress: 0,
            status: 'pending', // pending, uploading, success, error
            url: null,
            error: null
        }));

        setUploadQueue(prev => [...prev, ...newItems]);
    };

    const uploadFile = async (item) => {
        setUploadQueue(prev => prev.map(i => 
            i.id === item.id ? { ...i, status: 'uploading', progress: 0 } : i
        ));

        try {
            // Simulate progress for better UX
            const progressInterval = setInterval(() => {
                setUploadQueue(prev => prev.map(i => {
                    if (i.id === item.id && i.progress < 90) {
                        return { ...i, progress: i.progress + 10 };
                    }
                    return i;
                }));
            }, 200);

            const { file_url } = await base44.integrations.Core.UploadFile({ file: item.file });
            
            clearInterval(progressInterval);

            // Save to MediaFile entity
            await base44.entities.MediaFile.create({
                restaurant_id: restaurantId,
                file_url: file_url,
                file_name: item.file.name,
                file_type: item.file.type,
                file_size: item.file.size
            });

            setUploadQueue(prev => prev.map(i => 
                i.id === item.id ? { ...i, status: 'success', progress: 100, url: file_url } : i
            ));

            return { success: true, url: file_url, type: item.file.type };
        } catch (error) {
            setUploadQueue(prev => prev.map(i => 
                i.id === item.id ? { ...i, status: 'error', error: error.message } : i
            ));
            return { success: false };
        }
    };

    const handleUploadAll = async () => {
        setIsUploading(true);
        const pendingItems = uploadQueue.filter(i => i.status === 'pending');
        
        const results = [];
        for (const item of pendingItems) {
            const result = await uploadFile(item);
            if (result.success) {
                results.push({ url: result.url, type: result.type });
            }
        }

        setIsUploading(false);
        
        if (results.length > 0) {
            toast.success(`${results.length} file(s) uploaded successfully`);
            onFilesUploaded?.(results);
        }
    };

    const removeItem = (id) => {
        setUploadQueue(prev => prev.filter(i => i.id !== id));
    };

    const clearCompleted = () => {
        setUploadQueue(prev => prev.filter(i => i.status !== 'success'));
    };

    const getFileIcon = (file) => {
        if (file.type.startsWith('video/')) return <Film className="h-5 w-5 text-blue-500" />;
        return <ImageIcon className="h-5 w-5 text-green-500" />;
    };

    const formatFileSize = (bytes) => {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
    };

    return (
        <Card className="p-6">
            <div className="space-y-4">
                <div className="flex items-center justify-between">
                    <h3 className="text-lg font-semibold">Upload Files</h3>
                    <Button variant="ghost" size="sm" onClick={onClose}>
                        <X className="h-4 w-4" />
                    </Button>
                </div>

                <div
                    className="border-2 border-dashed rounded-lg p-8 text-center cursor-pointer hover:bg-gray-50 transition-colors"
                    onClick={() => fileInputRef.current?.click()}
                >
                    <Upload className="h-12 w-12 mx-auto mb-4 text-gray-400" />
                    <p className="text-sm font-medium mb-1">Click to upload or drag and drop</p>
                    <p className="text-xs text-gray-500">Support for images and videos (multiple files)</p>
                    <input
                        ref={fileInputRef}
                        type="file"
                        multiple
                        accept="image/*,video/*"
                        onChange={handleFileSelect}
                        className="hidden"
                    />
                </div>

                {uploadQueue.length > 0 && (
                    <div className="space-y-3">
                        <div className="flex items-center justify-between">
                            <p className="text-sm font-medium">{uploadQueue.length} file(s) selected</p>
                            <div className="flex gap-2">
                                <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={clearCompleted}
                                    disabled={!uploadQueue.some(i => i.status === 'success')}
                                >
                                    Clear Completed
                                </Button>
                                <Button
                                    size="sm"
                                    onClick={handleUploadAll}
                                    disabled={isUploading || !uploadQueue.some(i => i.status === 'pending')}
                                >
                                    Upload All
                                </Button>
                            </div>
                        </div>

                        <div className="space-y-2 max-h-96 overflow-y-auto">
                            {uploadQueue.map(item => (
                                <Card key={item.id} className="p-3">
                                    <div className="flex items-center gap-3">
                                        {getFileIcon(item.file)}
                                        
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center justify-between mb-1">
                                                <p className="text-sm font-medium truncate">{item.file.name}</p>
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => removeItem(item.id)}
                                                    disabled={item.status === 'uploading'}
                                                >
                                                    <X className="h-4 w-4" />
                                                </Button>
                                            </div>
                                            
                                            <div className="flex items-center gap-2 text-xs text-gray-500 mb-2">
                                                <span>{formatFileSize(item.file.size)}</span>
                                                {item.status === 'success' && (
                                                    <>
                                                        <span>•</span>
                                                        <span className="text-green-600 flex items-center gap-1">
                                                            <CheckCircle className="h-3 w-3" />
                                                            Uploaded
                                                        </span>
                                                    </>
                                                )}
                                                {item.status === 'error' && (
                                                    <>
                                                        <span>•</span>
                                                        <span className="text-red-600 flex items-center gap-1">
                                                            <AlertCircle className="h-3 w-3" />
                                                            Failed
                                                        </span>
                                                    </>
                                                )}
                                            </div>

                                            {(item.status === 'uploading' || item.status === 'pending') && (
                                                <Progress value={item.progress} className="h-1" />
                                            )}

                                            {item.status === 'error' && item.error && (
                                                <p className="text-xs text-red-600 mt-1">{item.error}</p>
                                            )}
                                        </div>
                                    </div>
                                </Card>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </Card>
    );
}