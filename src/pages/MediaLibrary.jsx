import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { 
    Upload, Search, Filter, Grid3x3, List, Image as ImageIcon, 
    Video, FileText, Download, Trash2, Edit, Copy, Tag, 
    X, Check, Folder, SortAsc, Calendar
} from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';

export default function MediaLibrary() {
    const [user, setUser] = useState(null);
    const [viewMode, setViewMode] = useState('grid');
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedCategory, setSelectedCategory] = useState('all');
    const [selectedType, setSelectedType] = useState('all');
    const [sortBy, setSortBy] = useState('recent');
    const [selectedItems, setSelectedItems] = useState([]);
    const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
    const [editDialogOpen, setEditDialogOpen] = useState(false);
    const [editingMedia, setEditingMedia] = useState(null);
    const [uploading, setUploading] = useState(false);
    const [newTag, setNewTag] = useState('');

    const [formData, setFormData] = useState({
        title: '',
        description: '',
        category: '',
        tags: [],
        is_public: true
    });

    const queryClient = useQueryClient();

    useEffect(() => {
        loadUser();
    }, []);

    const loadUser = async () => {
        try {
            const userData = await base44.auth.me();
            setUser(userData);
        } catch (e) {
            base44.auth.redirectToLogin();
        }
    };

    const { data: mediaFiles = [], isLoading } = useQuery({
        queryKey: ['media-library', user?.email],
        queryFn: () => base44.entities.MediaLibrary.list(),
        enabled: !!user,
    });

    const uploadMutation = useMutation({
        mutationFn: async (fileData) => {
            return await base44.entities.MediaLibrary.create(fileData);
        },
        onSuccess: () => {
            queryClient.invalidateQueries(['media-library']);
            toast.success('Media uploaded successfully');
            setUploadDialogOpen(false);
            resetForm();
        },
    });

    const updateMutation = useMutation({
        mutationFn: ({ id, data }) => base44.entities.MediaLibrary.update(id, data),
        onSuccess: () => {
            queryClient.invalidateQueries(['media-library']);
            toast.success('Media updated successfully');
            setEditDialogOpen(false);
            setEditingMedia(null);
        },
    });

    const deleteMutation = useMutation({
        mutationFn: async (ids) => {
            for (const id of ids) {
                await base44.entities.MediaLibrary.delete(id);
            }
        },
        onSuccess: () => {
            queryClient.invalidateQueries(['media-library']);
            toast.success(`Deleted ${selectedItems.length} item(s)`);
            setSelectedItems([]);
        },
    });

    const handleFileUpload = async (files) => {
        setUploading(true);
        try {
            for (const file of Array.from(files)) {
                const result = await base44.integrations.Core.UploadFile({ file });
                
                // Determine file type
                let fileType = 'other';
                if (file.type.startsWith('image/')) fileType = 'image';
                else if (file.type.startsWith('video/')) fileType = 'video';
                else if (file.type.includes('pdf') || file.type.includes('document')) fileType = 'document';

                // Get image dimensions if it's an image
                let width, height;
                if (fileType === 'image') {
                    const dimensions = await getImageDimensions(result.file_url);
                    width = dimensions.width;
                    height = dimensions.height;
                }

                await uploadMutation.mutateAsync({
                    file_url: result.file_url,
                    file_name: file.name,
                    file_type: fileType,
                    file_size: file.size,
                    mime_type: file.type,
                    title: formData.title || file.name,
                    description: formData.description,
                    category: formData.category,
                    tags: formData.tags,
                    is_public: formData.is_public,
                    width,
                    height,
                    thumbnail_url: fileType === 'image' ? result.file_url : null
                });
            }
        } catch (error) {
            toast.error('Failed to upload media');
        } finally {
            setUploading(false);
        }
    };

    const getImageDimensions = (url) => {
        return new Promise((resolve) => {
            const img = new Image();
            img.onload = () => resolve({ width: img.width, height: img.height });
            img.onerror = () => resolve({ width: null, height: null });
            img.src = url;
        });
    };

    const handleEdit = (media) => {
        setEditingMedia(media);
        setFormData({
            title: media.title || '',
            description: media.description || '',
            category: media.category || '',
            tags: media.tags || [],
            is_public: media.is_public !== false
        });
        setEditDialogOpen(true);
    };

    const handleBulkDelete = () => {
        if (confirm(`Delete ${selectedItems.length} selected item(s)?`)) {
            deleteMutation.mutate(selectedItems);
        }
    };

    const handleBulkCategoryUpdate = (category) => {
        selectedItems.forEach(async (id) => {
            const media = mediaFiles.find(m => m.id === id);
            if (media) {
                await base44.entities.MediaLibrary.update(id, { category });
            }
        });
        queryClient.invalidateQueries(['media-library']);
        toast.success(`Updated ${selectedItems.length} item(s)`);
        setSelectedItems([]);
    };

    const toggleSelection = (id) => {
        setSelectedItems(prev => 
            prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
        );
    };

    const copyUrl = (url) => {
        navigator.clipboard.writeText(url);
        toast.success('URL copied to clipboard');
    };

    const addTag = () => {
        if (newTag && !formData.tags.includes(newTag)) {
            setFormData({ ...formData, tags: [...formData.tags, newTag] });
            setNewTag('');
        }
    };

    const removeTag = (tag) => {
        setFormData({ ...formData, tags: formData.tags.filter(t => t !== tag) });
    };

    const resetForm = () => {
        setFormData({
            title: '',
            description: '',
            category: '',
            tags: [],
            is_public: true
        });
    };

    // Get unique categories and tags
    const categories = [...new Set(mediaFiles.map(m => m.category).filter(Boolean))];
    const allTags = [...new Set(mediaFiles.flatMap(m => m.tags || []))];

    // Filter and sort media
    const filteredMedia = mediaFiles
        .filter(media => {
            const matchesSearch = !searchQuery || 
                media.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                media.file_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                media.tags?.some(tag => tag.toLowerCase().includes(searchQuery.toLowerCase()));
            const matchesCategory = selectedCategory === 'all' || media.category === selectedCategory;
            const matchesType = selectedType === 'all' || media.file_type === selectedType;
            return matchesSearch && matchesCategory && matchesType;
        })
        .sort((a, b) => {
            if (sortBy === 'recent') return new Date(b.created_date) - new Date(a.created_date);
            if (sortBy === 'oldest') return new Date(a.created_date) - new Date(b.created_date);
            if (sortBy === 'name') return (a.title || a.file_name).localeCompare(b.title || b.file_name);
            if (sortBy === 'size') return (b.file_size || 0) - (a.file_size || 0);
            return 0;
        });

    const formatFileSize = (bytes) => {
        if (!bytes) return 'Unknown';
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
        return (bytes / 1048576).toFixed(1) + ' MB';
    };

    return (
        <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
            <div className="max-w-7xl mx-auto px-4 py-6">
                {/* Header */}
                <div className="flex items-center justify-between mb-6">
                    <div>
                        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Media Library</h1>
                        <p className="text-gray-600 dark:text-gray-400">
                            {filteredMedia.length} of {mediaFiles.length} files
                        </p>
                    </div>
                    <Button 
                        onClick={() => setUploadDialogOpen(true)}
                        className="bg-orange-500 hover:bg-orange-600"
                    >
                        <Upload className="h-4 w-4 mr-2" />
                        Upload Media
                    </Button>
                </div>

                {/* Toolbar */}
                <Card className="mb-6">
                    <CardContent className="pt-6">
                        <div className="flex flex-col md:flex-row gap-4">
                            {/* Search */}
                            <div className="flex-1">
                                <div className="relative">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                                    <Input
                                        placeholder="Search by title, filename, or tags..."
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                        className="pl-10"
                                    />
                                </div>
                            </div>

                            {/* Filters */}
                            <div className="flex gap-2 flex-wrap">
                                <select
                                    value={selectedType}
                                    onChange={(e) => setSelectedType(e.target.value)}
                                    className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                                >
                                    <option value="all">All Types</option>
                                    <option value="image">Images</option>
                                    <option value="video">Videos</option>
                                    <option value="document">Documents</option>
                                    <option value="other">Other</option>
                                </select>

                                <select
                                    value={selectedCategory}
                                    onChange={(e) => setSelectedCategory(e.target.value)}
                                    className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                                >
                                    <option value="all">All Categories</option>
                                    {categories.map(cat => (
                                        <option key={cat} value={cat}>{cat}</option>
                                    ))}
                                </select>

                                <select
                                    value={sortBy}
                                    onChange={(e) => setSortBy(e.target.value)}
                                    className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                                >
                                    <option value="recent">Recent First</option>
                                    <option value="oldest">Oldest First</option>
                                    <option value="name">Name A-Z</option>
                                    <option value="size">Largest First</option>
                                </select>

                                <Button
                                    variant="outline"
                                    size="icon"
                                    onClick={() => setViewMode(viewMode === 'grid' ? 'list' : 'grid')}
                                >
                                    {viewMode === 'grid' ? <List className="h-4 w-4" /> : <Grid3x3 className="h-4 w-4" />}
                                </Button>
                            </div>
                        </div>

                        {/* Bulk Actions */}
                        {selectedItems.length > 0 && (
                            <div className="mt-4 pt-4 border-t flex items-center gap-3">
                                <span className="text-sm font-medium">{selectedItems.length} selected</span>
                                <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => setSelectedItems([])}
                                >
                                    Clear
                                </Button>
                                <select
                                    onChange={(e) => {
                                        if (e.target.value) {
                                            handleBulkCategoryUpdate(e.target.value);
                                            e.target.value = '';
                                        }
                                    }}
                                    className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                                >
                                    <option value="">Set Category...</option>
                                    {categories.map(cat => (
                                        <option key={cat} value={cat}>{cat}</option>
                                    ))}
                                </select>
                                <Button
                                    size="sm"
                                    variant="destructive"
                                    onClick={handleBulkDelete}
                                >
                                    <Trash2 className="h-4 w-4 mr-2" />
                                    Delete
                                </Button>
                            </div>
                        )}
                    </CardContent>
                </Card>

                {/* Media Grid/List */}
                {isLoading ? (
                    <div className="text-center py-12">
                        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-500 mx-auto"></div>
                    </div>
                ) : filteredMedia.length === 0 ? (
                    <Card>
                        <CardContent className="py-12 text-center">
                            <ImageIcon className="h-16 w-16 text-gray-300 mx-auto mb-4" />
                            <h3 className="text-lg font-semibold text-gray-700 mb-2">No Media Found</h3>
                            <p className="text-gray-500 mb-4">Upload your first media file to get started</p>
                            <Button onClick={() => setUploadDialogOpen(true)} className="bg-orange-500 hover:bg-orange-600">
                                <Upload className="h-4 w-4 mr-2" />
                                Upload Media
                            </Button>
                        </CardContent>
                    </Card>
                ) : viewMode === 'grid' ? (
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                        {filteredMedia.map(media => (
                            <Card key={media.id} className={`overflow-hidden cursor-pointer hover:shadow-lg transition-shadow ${selectedItems.includes(media.id) ? 'ring-2 ring-orange-500' : ''}`}>
                                <div className="aspect-square relative bg-gray-100 dark:bg-gray-800">
                                    <input
                                        type="checkbox"
                                        checked={selectedItems.includes(media.id)}
                                        onChange={() => toggleSelection(media.id)}
                                        className="absolute top-2 left-2 z-10 h-5 w-5 rounded"
                                        onClick={(e) => e.stopPropagation()}
                                    />
                                    {media.file_type === 'image' ? (
                                        <img src={media.file_url} alt={media.title} className="w-full h-full object-cover" />
                                    ) : media.file_type === 'video' ? (
                                        <div className="w-full h-full flex items-center justify-center">
                                            <Video className="h-16 w-16 text-gray-400" />
                                        </div>
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center">
                                            <FileText className="h-16 w-16 text-gray-400" />
                                        </div>
                                    )}
                                    <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-2">
                                        <Badge className="text-xs">{media.file_type}</Badge>
                                    </div>
                                </div>
                                <CardContent className="p-3">
                                    <h3 className="font-medium text-sm truncate">{media.title || media.file_name}</h3>
                                    <p className="text-xs text-gray-500">{formatFileSize(media.file_size)}</p>
                                    {media.tags?.length > 0 && (
                                        <div className="flex flex-wrap gap-1 mt-2">
                                            {media.tags.slice(0, 2).map(tag => (
                                                <Badge key={tag} variant="outline" className="text-xs">{tag}</Badge>
                                            ))}
                                            {media.tags.length > 2 && (
                                                <Badge variant="outline" className="text-xs">+{media.tags.length - 2}</Badge>
                                            )}
                                        </div>
                                    )}
                                    <div className="flex gap-1 mt-3">
                                        <Button size="sm" variant="outline" className="flex-1" onClick={() => handleEdit(media)}>
                                            <Edit className="h-3 w-3" />
                                        </Button>
                                        <Button size="sm" variant="outline" onClick={() => copyUrl(media.file_url)}>
                                            <Copy className="h-3 w-3" />
                                        </Button>
                                        <Button size="sm" variant="outline" asChild>
                                            <a href={media.file_url} download target="_blank" rel="noopener noreferrer">
                                                <Download className="h-3 w-3" />
                                            </a>
                                        </Button>
                                    </div>
                                </CardContent>
                            </Card>
                        ))}
                    </div>
                ) : (
                    <div className="space-y-2">
                        {filteredMedia.map(media => (
                            <Card key={media.id} className={`${selectedItems.includes(media.id) ? 'ring-2 ring-orange-500' : ''}`}>
                                <CardContent className="p-4">
                                    <div className="flex items-center gap-4">
                                        <input
                                            type="checkbox"
                                            checked={selectedItems.includes(media.id)}
                                            onChange={() => toggleSelection(media.id)}
                                            className="h-5 w-5 rounded"
                                        />
                                        <div className="w-16 h-16 flex-shrink-0 bg-gray-100 dark:bg-gray-800 rounded overflow-hidden">
                                            {media.file_type === 'image' ? (
                                                <img src={media.file_url} alt={media.title} className="w-full h-full object-cover" />
                                            ) : media.file_type === 'video' ? (
                                                <div className="w-full h-full flex items-center justify-center">
                                                    <Video className="h-8 w-8 text-gray-400" />
                                                </div>
                                            ) : (
                                                <div className="w-full h-full flex items-center justify-center">
                                                    <FileText className="h-8 w-8 text-gray-400" />
                                                </div>
                                            )}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <h3 className="font-medium truncate">{media.title || media.file_name}</h3>
                                            <div className="flex items-center gap-2 text-xs text-gray-500 mt-1">
                                                <Badge variant="outline" className="text-xs">{media.file_type}</Badge>
                                                <span>{formatFileSize(media.file_size)}</span>
                                                {media.category && <span>• {media.category}</span>}
                                                <span>• {format(new Date(media.created_date), 'MMM d, yyyy')}</span>
                                            </div>
                                            {media.tags?.length > 0 && (
                                                <div className="flex flex-wrap gap-1 mt-2">
                                                    {media.tags.map(tag => (
                                                        <Badge key={tag} variant="outline" className="text-xs">{tag}</Badge>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                        <div className="flex gap-2">
                                            <Button size="sm" variant="outline" onClick={() => handleEdit(media)}>
                                                <Edit className="h-4 w-4" />
                                            </Button>
                                            <Button size="sm" variant="outline" onClick={() => copyUrl(media.file_url)}>
                                                <Copy className="h-4 w-4" />
                                            </Button>
                                            <Button size="sm" variant="outline" asChild>
                                                <a href={media.file_url} download target="_blank" rel="noopener noreferrer">
                                                    <Download className="h-4 w-4" />
                                                </a>
                                            </Button>
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>
                        ))}
                    </div>
                )}
            </div>

            {/* Upload Dialog */}
            <Dialog open={uploadDialogOpen} onOpenChange={setUploadDialogOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Upload Media</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4">
                        <div>
                            <Label>Select Files</Label>
                            <Input
                                type="file"
                                multiple
                                onChange={(e) => {
                                    if (e.target.files?.length) {
                                        handleFileUpload(e.target.files);
                                    }
                                }}
                                disabled={uploading}
                            />
                        </div>
                        <div>
                            <Label>Title (Optional)</Label>
                            <Input
                                value={formData.title}
                                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                                placeholder="Custom title for uploaded files"
                            />
                        </div>
                        <div>
                            <Label>Description (Optional)</Label>
                            <Textarea
                                value={formData.description}
                                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                                placeholder="Add notes or description"
                                rows={3}
                            />
                        </div>
                        <div>
                            <Label>Category (Optional)</Label>
                            <Input
                                value={formData.category}
                                onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                                placeholder="e.g., Product Photos, Marketing"
                                list="categories"
                            />
                            <datalist id="categories">
                                {categories.map(cat => (
                                    <option key={cat} value={cat} />
                                ))}
                            </datalist>
                        </div>
                        <div>
                            <Label>Tags</Label>
                            <div className="flex gap-2 mb-2">
                                <Input
                                    value={newTag}
                                    onChange={(e) => setNewTag(e.target.value)}
                                    onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addTag())}
                                    placeholder="Add tag"
                                />
                                <Button type="button" onClick={addTag} variant="outline">
                                    <Tag className="h-4 w-4" />
                                </Button>
                            </div>
                            <div className="flex flex-wrap gap-2">
                                {formData.tags.map(tag => (
                                    <Badge key={tag} className="gap-1">
                                        {tag}
                                        <X className="h-3 w-3 cursor-pointer" onClick={() => removeTag(tag)} />
                                    </Badge>
                                ))}
                            </div>
                        </div>
                        {uploading && (
                            <div className="text-center py-4">
                                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-500 mx-auto"></div>
                                <p className="text-sm text-gray-500 mt-2">Uploading...</p>
                            </div>
                        )}
                    </div>
                </DialogContent>
            </Dialog>

            {/* Edit Dialog */}
            <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Edit Media</DialogTitle>
                    </DialogHeader>
                    {editingMedia && (
                        <div className="space-y-4">
                            <div className="w-full h-48 bg-gray-100 dark:bg-gray-800 rounded overflow-hidden">
                                {editingMedia.file_type === 'image' ? (
                                    <img src={editingMedia.file_url} alt={editingMedia.title} className="w-full h-full object-contain" />
                                ) : (
                                    <div className="w-full h-full flex items-center justify-center">
                                        <FileText className="h-16 w-16 text-gray-400" />
                                    </div>
                                )}
                            </div>
                            <div>
                                <Label>Title</Label>
                                <Input
                                    value={formData.title}
                                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                                />
                            </div>
                            <div>
                                <Label>Description</Label>
                                <Textarea
                                    value={formData.description}
                                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                                    rows={3}
                                />
                            </div>
                            <div>
                                <Label>Category</Label>
                                <Input
                                    value={formData.category}
                                    onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                                    list="categories-edit"
                                />
                                <datalist id="categories-edit">
                                    {categories.map(cat => (
                                        <option key={cat} value={cat} />
                                    ))}
                                </datalist>
                            </div>
                            <div>
                                <Label>Tags</Label>
                                <div className="flex gap-2 mb-2">
                                    <Input
                                        value={newTag}
                                        onChange={(e) => setNewTag(e.target.value)}
                                        onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addTag())}
                                        placeholder="Add tag"
                                    />
                                    <Button type="button" onClick={addTag} variant="outline">
                                        <Tag className="h-4 w-4" />
                                    </Button>
                                </div>
                                <div className="flex flex-wrap gap-2">
                                    {formData.tags.map(tag => (
                                        <Badge key={tag} className="gap-1">
                                            {tag}
                                            <X className="h-3 w-3 cursor-pointer" onClick={() => removeTag(tag)} />
                                        </Badge>
                                    ))}
                                </div>
                            </div>
                            <div className="flex gap-3 justify-end">
                                <Button variant="outline" onClick={() => setEditDialogOpen(false)}>
                                    Cancel
                                </Button>
                                <Button 
                                    onClick={() => {
                                        updateMutation.mutate({
                                            id: editingMedia.id,
                                            data: formData
                                        });
                                    }}
                                    className="bg-orange-500 hover:bg-orange-600"
                                >
                                    Save Changes
                                </Button>
                            </div>
                        </div>
                    )}
                </DialogContent>
            </Dialog>
        </div>
    );
}