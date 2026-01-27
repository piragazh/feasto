import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Trash2, Search, Image as ImageIcon, FileText, CheckSquare, Square, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

export default function PublicFilesManager() {
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedFiles, setSelectedFiles] = useState([]);
    const queryClient = useQueryClient();

    // Check admin access
    const { data: user } = useQuery({
        queryKey: ['current-user'],
        queryFn: () => base44.auth.me(),
    });

    // Fetch all public files from MediaFile entity
    const { data: files = [], isLoading } = useQuery({
        queryKey: ['public-files'],
        queryFn: () => base44.entities.MediaFile.list('-created_date'),
    });

    const deleteMutation = useMutation({
        mutationFn: async (fileIds) => {
            for (const id of fileIds) {
                await base44.entities.MediaFile.delete(id);
            }
        },
        onSuccess: () => {
            queryClient.invalidateQueries(['public-files']);
            toast.success(`Deleted ${selectedFiles.length} file(s)`);
            setSelectedFiles([]);
        },
        onError: () => {
            toast.error('Failed to delete files');
        },
    });

    if (user?.role !== 'admin') {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <Card className="p-6">
                    <p className="text-red-600">Access Denied: Admin Only</p>
                </Card>
            </div>
        );
    }

    const filteredFiles = files.filter(file =>
        file.filename?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        file.url?.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const toggleSelect = (fileId) => {
        setSelectedFiles(prev =>
            prev.includes(fileId)
                ? prev.filter(id => id !== fileId)
                : [...prev, fileId]
        );
    };

    const toggleSelectAll = () => {
        if (selectedFiles.length === filteredFiles.length) {
            setSelectedFiles([]);
        } else {
            setSelectedFiles(filteredFiles.map(f => f.id));
        }
    };

    const handleDelete = () => {
        if (confirm(`Delete ${selectedFiles.length} selected file(s)? This cannot be undone.`)) {
            deleteMutation.mutate(selectedFiles);
        }
    };

    const formatFileSize = (bytes) => {
        if (!bytes) return 'Unknown';
        const kb = bytes / 1024;
        if (kb < 1024) return `${kb.toFixed(1)} KB`;
        return `${(kb / 1024).toFixed(1)} MB`;
    };

    const isImage = (url) => {
        return /\.(jpg|jpeg|png|gif|webp|svg)$/i.test(url);
    };

    return (
        <div className="min-h-screen bg-gray-50 p-6">
            <div className="max-w-7xl mx-auto space-y-6">
                <Card>
                    <CardHeader>
                        <div className="flex items-center justify-between">
                            <div>
                                <CardTitle className="text-2xl">Public Files Manager</CardTitle>
                                <p className="text-sm text-gray-500 mt-1">
                                    Manage all uploaded media files - {files.length} total files
                                </p>
                            </div>
                        </div>
                    </CardHeader>
                </Card>

                <Card>
                    <CardContent className="pt-6">
                        <div className="flex items-center gap-4 mb-6">
                            <div className="relative flex-1">
                                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                                <Input
                                    placeholder="Search files by name or URL..."
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    className="pl-10"
                                />
                            </div>
                            <Button
                                variant="outline"
                                onClick={toggleSelectAll}
                                disabled={filteredFiles.length === 0}
                            >
                                {selectedFiles.length === filteredFiles.length && filteredFiles.length > 0 ? (
                                    <>
                                        <CheckSquare className="h-4 w-4 mr-2" />
                                        Deselect All
                                    </>
                                ) : (
                                    <>
                                        <Square className="h-4 w-4 mr-2" />
                                        Select All
                                    </>
                                )}
                            </Button>
                            {selectedFiles.length > 0 && (
                                <Button
                                    variant="destructive"
                                    onClick={handleDelete}
                                    disabled={deleteMutation.isPending}
                                >
                                    {deleteMutation.isPending ? (
                                        <>
                                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                            Deleting...
                                        </>
                                    ) : (
                                        <>
                                            <Trash2 className="h-4 w-4 mr-2" />
                                            Delete {selectedFiles.length}
                                        </>
                                    )}
                                </Button>
                            )}
                        </div>

                        {isLoading ? (
                            <div className="text-center py-12">
                                <Loader2 className="h-8 w-8 animate-spin mx-auto text-gray-400" />
                                <p className="text-gray-500 mt-2">Loading files...</p>
                            </div>
                        ) : filteredFiles.length === 0 ? (
                            <div className="text-center py-12">
                                <FileText className="h-12 w-12 mx-auto text-gray-300 mb-3" />
                                <p className="text-gray-500">
                                    {searchTerm ? 'No files found matching your search' : 'No files uploaded yet'}
                                </p>
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                                {filteredFiles.map((file) => (
                                    <Card
                                        key={file.id}
                                        className={`relative cursor-pointer transition-all ${
                                            selectedFiles.includes(file.id)
                                                ? 'ring-2 ring-orange-500 bg-orange-50'
                                                : 'hover:shadow-lg'
                                        }`}
                                        onClick={() => toggleSelect(file.id)}
                                    >
                                        <CardContent className="p-4">
                                            <div className="absolute top-2 right-2 z-10">
                                                <div className={`h-5 w-5 rounded border-2 flex items-center justify-center ${
                                                    selectedFiles.includes(file.id)
                                                        ? 'bg-orange-500 border-orange-500'
                                                        : 'bg-white border-gray-300'
                                                }`}>
                                                    {selectedFiles.includes(file.id) && (
                                                        <svg className="h-3 w-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                                                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                                        </svg>
                                                    )}
                                                </div>
                                            </div>

                                            <div className="aspect-square bg-gray-100 rounded-lg mb-3 flex items-center justify-center overflow-hidden">
                                                {isImage(file.url) ? (
                                                    <img
                                                        src={file.url}
                                                        alt={file.filename || 'File'}
                                                        className="w-full h-full object-cover"
                                                        loading="lazy"
                                                    />
                                                ) : (
                                                    <FileText className="h-12 w-12 text-gray-400" />
                                                )}
                                            </div>

                                            <div className="space-y-2">
                                                <p className="text-sm font-medium truncate" title={file.filename}>
                                                    {file.filename || 'Unnamed file'}
                                                </p>
                                                <div className="flex items-center gap-2 flex-wrap">
                                                    {file.file_size && (
                                                        <Badge variant="outline" className="text-xs">
                                                            {formatFileSize(file.file_size)}
                                                        </Badge>
                                                    )}
                                                    {file.mime_type && (
                                                        <Badge variant="outline" className="text-xs">
                                                            {file.mime_type.split('/')[1]?.toUpperCase()}
                                                        </Badge>
                                                    )}
                                                </div>
                                                {file.created_date && (
                                                    <p className="text-xs text-gray-500">
                                                        {new Date(file.created_date).toLocaleDateString()}
                                                    </p>
                                                )}
                                                <a
                                                    href={file.url}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    onClick={(e) => e.stopPropagation()}
                                                    className="text-xs text-blue-600 hover:underline block truncate"
                                                >
                                                    View file
                                                </a>
                                            </div>
                                        </CardContent>
                                    </Card>
                                ))}
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}