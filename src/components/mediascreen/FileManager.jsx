import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Trash2, Image, Video, File, Search } from 'lucide-react';
import { toast } from 'sonner';
import moment from 'moment';

export default function FileManager({ restaurantId, open, onClose, onSelectFile }) {
    const [searchQuery, setSearchQuery] = useState('');
    const queryClient = useQueryClient();

    const { data: files = [] } = useQuery({
        queryKey: ['media-files', restaurantId],
        queryFn: () => base44.entities.MediaFile.filter({ restaurant_id: restaurantId }),
        enabled: !!restaurantId && open,
    });

    const { data: content = [] } = useQuery({
        queryKey: ['promotional-content', restaurantId],
        queryFn: () => base44.entities.PromotionalContent.filter({ restaurant_id: restaurantId }),
        enabled: !!restaurantId && open,
    });

    const deleteMutation = useMutation({
        mutationFn: (id) => base44.entities.MediaFile.delete(id),
        onSuccess: () => {
            queryClient.invalidateQueries(['media-files']);
            toast.success('File deleted successfully');
        },
    });

    const filteredFiles = files.filter(f => 
        !searchQuery || f.file_name?.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const isFileUsed = (fileUrl) => {
        return content.some(c => c.media_url === fileUrl);
    };

    const formatFileSize = (bytes) => {
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
        return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    };

    const getFileIcon = (fileType) => {
        if (fileType?.startsWith('image/')) return <Image className="h-5 w-5 text-blue-500" />;
        if (fileType?.startsWith('video/')) return <Video className="h-5 w-5 text-purple-500" />;
        return <File className="h-5 w-5 text-gray-500" />;
    };

    const handleDelete = (file) => {
        if (isFileUsed(file.file_url)) {
            toast.error('Cannot delete file that is currently used in content');
            return;
        }
        
        if (window.confirm(`Delete "${file.file_name}"?`)) {
            deleteMutation.mutate(file.id);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onClose}>
            <DialogContent className="max-w-4xl max-h-[80vh]">
                <DialogHeader>
                    <CardTitle>Media File Manager</CardTitle>
                    <p className="text-sm text-gray-500">
                        Manage your uploaded media files ({files.length} total)
                    </p>
                </DialogHeader>
                
                <div className="space-y-4">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                        <Input
                            placeholder="Search files..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="pl-10"
                        />
                    </div>

                    <div className="max-h-[50vh] overflow-y-auto space-y-2">
                        {filteredFiles.map((file) => {
                            const used = isFileUsed(file.file_url);
                            return (
                                <Card key={file.id} className={used ? 'border-green-200 bg-green-50' : ''}>
                                    <CardContent className="p-4">
                                        <div className="flex gap-4">
                                            <div className="w-20 h-20 bg-gray-100 rounded-lg overflow-hidden flex-shrink-0">
                                                {file.file_type?.startsWith('video/') ? (
                                                    <video src={file.file_url} className="w-full h-full object-cover" />
                                                ) : file.file_type?.startsWith('image/') ? (
                                                    <img src={file.file_url} alt={file.file_name} className="w-full h-full object-cover" />
                                                ) : (
                                                    <div className="w-full h-full flex items-center justify-center">
                                                        {getFileIcon(file.file_type)}
                                                    </div>
                                                )}
                                            </div>
                                            
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-start justify-between gap-2">
                                                    <div className="flex-1 min-w-0">
                                                        <h4 className="font-medium truncate">{file.file_name}</h4>
                                                        <p className="text-sm text-gray-500">
                                                            {formatFileSize(file.file_size)} • {moment(file.created_date).format('MMM D, YYYY')}
                                                        </p>
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                        {used && (
                                                            <Badge className="bg-green-100 text-green-800">In Use</Badge>
                                                        )}
                                                        {onSelectFile && (
                                                            <Button
                                                                size="sm"
                                                                variant="outline"
                                                                onClick={() => {
                                                                    onSelectFile(file.file_url, file.file_type);
                                                                    onClose();
                                                                }}
                                                            >
                                                                Use File
                                                            </Button>
                                                        )}
                                                        <Button
                                                            size="sm"
                                                            variant="ghost"
                                                            onClick={() => handleDelete(file)}
                                                            disabled={used}
                                                        >
                                                            <Trash2 className={`h-4 w-4 ${used ? 'text-gray-300' : 'text-red-500'}`} />
                                                        </Button>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </CardContent>
                                </Card>
                            );
                        })}

                        {filteredFiles.length === 0 && (
                            <div className="text-center py-12 text-gray-500">
                                {searchQuery ? 'No files found' : 'No files uploaded yet'}
                            </div>
                        )}
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}