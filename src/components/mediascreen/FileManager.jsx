import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Trash2, Image, Video, File, Search, Folder, FolderPlus, Tag, Edit, Eye, X, Grid3x3, List } from 'lucide-react';
import { toast } from 'sonner';
import moment from 'moment';

export default function FileManager({ restaurantId, open, onClose, onSelectFile }) {
    const [searchQuery, setSearchQuery] = useState('');
    const [currentFolder, setCurrentFolder] = useState('All Files');
    const [filterType, setFilterType] = useState('all');
    const [filterTag, setFilterTag] = useState('all');
    const [sortBy, setSortBy] = useState('date-desc');
    const [viewMode, setViewMode] = useState('grid');
    const [showNewFolder, setShowNewFolder] = useState(false);
    const [newFolderName, setNewFolderName] = useState('');
    const [editingFile, setEditingFile] = useState(null);
    const [editTags, setEditTags] = useState([]);
    const [newTag, setNewTag] = useState('');
    const [previewFile, setPreviewFile] = useState(null);
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

    const updateFileMutation = useMutation({
        mutationFn: ({ id, data }) => base44.entities.MediaFile.update(id, data),
        onSuccess: () => {
            queryClient.invalidateQueries(['media-files']);
            toast.success('File updated');
            setEditingFile(null);
        },
    });

    const folders = ['All Files', ...new Set(files.filter(f => f.folder).map(f => f.folder))];
    const allTags = [...new Set(files.flatMap(f => f.tags || []))];

    let filteredFiles = files.filter(f => {
        const matchesSearch = !searchQuery || f.file_name?.toLowerCase().includes(searchQuery.toLowerCase()) || 
            f.tags?.some(tag => tag.toLowerCase().includes(searchQuery.toLowerCase()));
        const matchesFolder = currentFolder === 'All Files' || f.folder === currentFolder || (!f.folder && currentFolder === 'All Files');
        const matchesType = filterType === 'all' || 
            (filterType === 'image' && f.file_type?.startsWith('image/')) ||
            (filterType === 'video' && f.file_type?.startsWith('video/'));
        const matchesTag = filterTag === 'all' || f.tags?.includes(filterTag);
        
        return matchesSearch && matchesFolder && matchesType && matchesTag;
    });

    // Sort files
    filteredFiles.sort((a, b) => {
        switch(sortBy) {
            case 'name-asc': return (a.file_name || '').localeCompare(b.file_name || '');
            case 'name-desc': return (b.file_name || '').localeCompare(a.file_name || '');
            case 'size-asc': return (a.file_size || 0) - (b.file_size || 0);
            case 'size-desc': return (b.file_size || 0) - (a.file_size || 0);
            case 'date-asc': return new Date(a.created_date) - new Date(b.created_date);
            case 'date-desc': 
            default: return new Date(b.created_date) - new Date(a.created_date);
        }
    });

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

    const handleCreateFolder = () => {
        if (newFolderName.trim()) {
            setCurrentFolder(newFolderName.trim());
            setNewFolderName('');
            setShowNewFolder(false);
            toast.success(`Folder "${newFolderName}" ready`);
        }
    };

    const handleSaveTags = () => {
        if (editingFile) {
            updateFileMutation.mutate({
                id: editingFile.id,
                data: { tags: editTags }
            });
        }
    };

    const handleAddTag = () => {
        if (newTag.trim() && !editTags.includes(newTag.trim())) {
            setEditTags([...editTags, newTag.trim()]);
            setNewTag('');
        }
    };

    const handleMoveToFolder = (file, folder) => {
        updateFileMutation.mutate({
            id: file.id,
            data: { folder: folder === 'All Files' ? null : folder }
        });
    };

    return (
        <Dialog open={open} onOpenChange={onClose}>
            <DialogContent className="max-w-6xl max-h-[90vh]">
                <DialogHeader>
                    <CardTitle className="flex items-center justify-between">
                        <span>Media Library</span>
                        <div className="flex gap-2">
                            <Button size="sm" variant="outline" onClick={() => setViewMode(viewMode === 'grid' ? 'list' : 'grid')}>
                                {viewMode === 'grid' ? <List className="h-4 w-4" /> : <Grid3x3 className="h-4 w-4" />}
                            </Button>
                        </div>
                    </CardTitle>
                    <p className="text-sm text-gray-500">
                        {filteredFiles.length} of {files.length} files
                    </p>
                </DialogHeader>
                
                <div className="flex gap-4">
                    {/* Sidebar */}
                    <div className="w-48 flex-shrink-0 space-y-4">
                        <div>
                            <div className="flex items-center justify-between mb-2">
                                <Label className="text-xs font-semibold">FOLDERS</Label>
                                <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => setShowNewFolder(true)}>
                                    <FolderPlus className="h-3 w-3" />
                                </Button>
                            </div>
                            <div className="space-y-1">
                                {folders.map(folder => (
                                    <Button
                                        key={folder}
                                        variant={currentFolder === folder ? 'secondary' : 'ghost'}
                                        className="w-full justify-start text-sm h-8"
                                        onClick={() => setCurrentFolder(folder)}
                                    >
                                        <Folder className="h-3 w-3 mr-2" />
                                        {folder}
                                    </Button>
                                ))}
                            </div>
                        </div>

                        {allTags.length > 0 && (
                            <div>
                                <Label className="text-xs font-semibold mb-2 block">TAGS</Label>
                                <div className="flex flex-wrap gap-1">
                                    {allTags.slice(0, 10).map(tag => (
                                        <Badge
                                            key={tag}
                                            variant={filterTag === tag ? 'default' : 'outline'}
                                            className="cursor-pointer text-xs"
                                            onClick={() => setFilterTag(filterTag === tag ? 'all' : tag)}
                                        >
                                            {tag}
                                        </Badge>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Main content */}
                    <div className="flex-1 space-y-4">
                        <div className="flex gap-2">
                            <div className="flex-1 relative">
                                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                                <Input
                                    placeholder="Search files and tags..."
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    className="pl-10"
                                />
                            </div>
                            <Select value={filterType} onValueChange={setFilterType}>
                                <SelectTrigger className="w-32">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">All Types</SelectItem>
                                    <SelectItem value="image">Images</SelectItem>
                                    <SelectItem value="video">Videos</SelectItem>
                                </SelectContent>
                            </Select>
                            <Select value={sortBy} onValueChange={setSortBy}>
                                <SelectTrigger className="w-40">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="date-desc">Newest First</SelectItem>
                                    <SelectItem value="date-asc">Oldest First</SelectItem>
                                    <SelectItem value="name-asc">Name A-Z</SelectItem>
                                    <SelectItem value="name-desc">Name Z-A</SelectItem>
                                    <SelectItem value="size-asc">Smallest First</SelectItem>
                                    <SelectItem value="size-desc">Largest First</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        <div className={`max-h-[55vh] overflow-y-auto ${viewMode === 'grid' ? 'grid grid-cols-3 gap-3' : 'space-y-2'}`}>
                            {filteredFiles.map((file) => {
                                const used = isFileUsed(file.file_url);
                                
                                if (viewMode === 'grid') {
                                    return (
                                        <Card key={file.id} className="overflow-hidden hover:shadow-md transition-shadow">
                                            <div className="aspect-square bg-gray-100 relative group cursor-pointer" onClick={() => setPreviewFile(file)}>
                                                {file.file_type?.startsWith('video/') ? (
                                                    <video src={file.file_url} className="w-full h-full object-cover" />
                                                ) : file.file_type?.startsWith('image/') ? (
                                                    <img src={file.file_url} alt={file.file_name} className="w-full h-full object-cover" />
                                                ) : (
                                                    <div className="w-full h-full flex items-center justify-center">
                                                        {getFileIcon(file.file_type)}
                                                    </div>
                                                )}
                                                <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-40 transition-all flex items-center justify-center">
                                                    <Eye className="h-8 w-8 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                                                </div>
                                            </div>
                                            <CardContent className="p-2">
                                                <p className="text-xs font-medium truncate" title={file.file_name}>{file.file_name}</p>
                                                <div className="flex gap-1 mt-1 flex-wrap">
                                                    {used && <Badge className="bg-green-100 text-green-700 text-[10px]">In Use</Badge>}
                                                    {file.tags?.slice(0, 2).map(tag => (
                                                        <Badge key={tag} variant="outline" className="text-[10px]">{tag}</Badge>
                                                    ))}
                                                </div>
                                                <div className="flex gap-1 mt-2">
                                                    <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => setPreviewFile(file)}>
                                                        <Eye className="h-3 w-3" />
                                                    </Button>
                                                    <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => {
                                                        setEditingFile(file);
                                                        setEditTags(file.tags || []);
                                                    }}>
                                                        <Tag className="h-3 w-3" />
                                                    </Button>
                                                    <Select onValueChange={(folder) => handleMoveToFolder(file, folder)}>
                                                        <SelectTrigger className="h-6 w-6 p-0 border-0">
                                                            <Folder className="h-3 w-3" />
                                                        </SelectTrigger>
                                                        <SelectContent>
                                                            {folders.map(f => (
                                                                <SelectItem key={f} value={f}>{f}</SelectItem>
                                                            ))}
                                                        </SelectContent>
                                                    </Select>
                                                    {onSelectFile && (
                                                        <Button size="sm" variant="outline" className="h-6 flex-1 text-[10px]" onClick={() => {
                                                            onSelectFile(file.file_url, file.file_type);
                                                            onClose();
                                                        }}>
                                                            Use
                                                        </Button>
                                                    )}
                                                    <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => handleDelete(file)} disabled={used}>
                                                        <Trash2 className={`h-3 w-3 ${used ? 'text-gray-300' : 'text-red-500'}`} />
                                                    </Button>
                                                </div>
                                            </CardContent>
                                        </Card>
                                    );
                                }

                                // List view
                                return (
                                    <Card key={file.id} className={used ? 'border-green-200 bg-green-50' : ''}>
                                        <CardContent className="p-3">
                                            <div className="flex gap-3 items-center">
                                                <div className="w-16 h-16 bg-gray-100 rounded overflow-hidden flex-shrink-0 cursor-pointer" onClick={() => setPreviewFile(file)}>
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
                                                    <h4 className="font-medium truncate text-sm">{file.file_name}</h4>
                                                    <p className="text-xs text-gray-500">
                                                        {formatFileSize(file.file_size)} • {moment(file.created_date).format('MMM D, YYYY')}
                                                    </p>
                                                    {file.tags && file.tags.length > 0 && (
                                                        <div className="flex gap-1 mt-1 flex-wrap">
                                                            {file.tags.map(tag => (
                                                                <Badge key={tag} variant="outline" className="text-[10px]">{tag}</Badge>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>

                                                <div className="flex items-center gap-1">
                                                    {used && <Badge className="bg-green-100 text-green-700 text-xs">In Use</Badge>}
                                                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => setPreviewFile(file)}>
                                                        <Eye className="h-3 w-3" />
                                                    </Button>
                                                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => {
                                                        setEditingFile(file);
                                                        setEditTags(file.tags || []);
                                                    }}>
                                                        <Tag className="h-3 w-3" />
                                                    </Button>
                                                    <Select onValueChange={(folder) => handleMoveToFolder(file, folder)}>
                                                        <SelectTrigger className="h-7 w-7 p-0 border-0">
                                                            <Folder className="h-3 w-3" />
                                                        </SelectTrigger>
                                                        <SelectContent>
                                                            {folders.map(f => (
                                                                <SelectItem key={f} value={f}>{f}</SelectItem>
                                                            ))}
                                                        </SelectContent>
                                                    </Select>
                                                    {onSelectFile && (
                                                        <Button size="sm" variant="outline" onClick={() => {
                                                            onSelectFile(file.file_url, file.file_type);
                                                            onClose();
                                                        }}>
                                                            Use File
                                                        </Button>
                                                    )}
                                                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => handleDelete(file)} disabled={used}>
                                                        <Trash2 className={`h-3 w-3 ${used ? 'text-gray-300' : 'text-red-500'}`} />
                                                    </Button>
                                                </div>
                                            </div>
                                        </CardContent>
                                    </Card>
                                );
                            })}

                            {filteredFiles.length === 0 && (
                                <div className="col-span-3 text-center py-12 text-gray-500">
                                    {searchQuery || filterType !== 'all' || filterTag !== 'all' ? 'No files match your filters' : 'No files in this folder'}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </DialogContent>
        </Dialog>

        {/* New Folder Dialog */}
        <Dialog open={showNewFolder} onOpenChange={setShowNewFolder}>
            <DialogContent className="max-w-sm">
                <DialogHeader>
                    <DialogTitle>Create New Folder</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                    <div>
                        <Label>Folder Name</Label>
                        <Input
                            value={newFolderName}
                            onChange={(e) => setNewFolderName(e.target.value)}
                            placeholder="e.g., Seasonal Promotions"
                            onKeyDown={(e) => e.key === 'Enter' && handleCreateFolder()}
                        />
                    </div>
                    <div className="flex gap-2">
                        <Button onClick={handleCreateFolder} className="flex-1">Create</Button>
                        <Button variant="outline" onClick={() => setShowNewFolder(false)}>Cancel</Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>

        {/* Edit Tags Dialog */}
        <Dialog open={!!editingFile} onOpenChange={() => setEditingFile(null)}>
            <DialogContent className="max-w-md">
                <DialogHeader>
                    <DialogTitle>Edit Tags</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                    <div>
                        <Label>File: {editingFile?.file_name}</Label>
                    </div>
                    <div>
                        <Label>Tags</Label>
                        <div className="flex gap-2 flex-wrap mt-2 mb-2">
                            {editTags.map(tag => (
                                <Badge key={tag} className="gap-1">
                                    {tag}
                                    <X className="h-3 w-3 cursor-pointer" onClick={() => setEditTags(editTags.filter(t => t !== tag))} />
                                </Badge>
                            ))}
                        </div>
                        <div className="flex gap-2">
                            <Input
                                value={newTag}
                                onChange={(e) => setNewTag(e.target.value)}
                                placeholder="Add tag..."
                                onKeyDown={(e) => e.key === 'Enter' && handleAddTag()}
                            />
                            <Button onClick={handleAddTag}>Add</Button>
                        </div>
                    </div>
                    <div className="flex gap-2">
                        <Button onClick={handleSaveTags} className="flex-1">Save</Button>
                        <Button variant="outline" onClick={() => setEditingFile(null)}>Cancel</Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>

        {/* Preview Dialog */}
        <Dialog open={!!previewFile} onOpenChange={() => setPreviewFile(null)}>
            <DialogContent className="max-w-4xl">
                <DialogHeader>
                    <DialogTitle>{previewFile?.file_name}</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                    <div className="bg-gray-100 rounded-lg overflow-hidden flex items-center justify-center" style={{ maxHeight: '60vh' }}>
                        {previewFile?.file_type?.startsWith('video/') ? (
                            <video src={previewFile.file_url} controls className="max-w-full max-h-[60vh]" />
                        ) : previewFile?.file_type?.startsWith('image/') ? (
                            <img src={previewFile.file_url} alt={previewFile.file_name} className="max-w-full max-h-[60vh] object-contain" />
                        ) : (
                            <div className="p-8 text-center">
                                {getFileIcon(previewFile?.file_type)}
                                <p className="mt-2 text-gray-500">Preview not available</p>
                            </div>
                        )}
                    </div>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                            <Label className="text-xs text-gray-500">File Size</Label>
                            <p>{formatFileSize(previewFile?.file_size)}</p>
                        </div>
                        <div>
                            <Label className="text-xs text-gray-500">Upload Date</Label>
                            <p>{moment(previewFile?.created_date).format('MMM D, YYYY h:mm A')}</p>
                        </div>
                        <div>
                            <Label className="text-xs text-gray-500">Type</Label>
                            <p>{previewFile?.file_type}</p>
                        </div>
                        <div>
                            <Label className="text-xs text-gray-500">Folder</Label>
                            <p>{previewFile?.folder || 'All Files'}</p>
                        </div>
                        {previewFile?.tags && previewFile.tags.length > 0 && (
                            <div className="col-span-2">
                                <Label className="text-xs text-gray-500 mb-2 block">Tags</Label>
                                <div className="flex gap-1 flex-wrap">
                                    {previewFile.tags.map(tag => (
                                        <Badge key={tag} variant="outline">{tag}</Badge>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                    <div className="flex gap-2">
                        {onSelectFile && (
                            <Button onClick={() => {
                                onSelectFile(previewFile.file_url, previewFile.file_type);
                                onClose();
                            }} className="flex-1">
                                Use This File
                            </Button>
                        )}
                        <Button variant="outline" onClick={() => setPreviewFile(null)}>Close</Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    </>
    );
}