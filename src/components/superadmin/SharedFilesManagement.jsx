import React, { useState } from 'react';
import { getApiUrl } from '@/lib/api-origin';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Upload, Trash2, FolderOpen, Download, Eye, EyeOff, FileText, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';

const CATEGORIES = [
    { value: 'general', label: 'General' },
    { value: 'apk', label: 'APK / App Install' },
    { value: 'guide', label: 'Guide / Manual' },
    { value: 'policy', label: 'Policy / Legal' },
    { value: 'marketing', label: 'Marketing Material' },
    { value: 'other', label: 'Other' },
];

const CATEGORY_COLORS = {
    apk: 'bg-green-100 text-green-700',
    guide: 'bg-blue-100 text-blue-700',
    policy: 'bg-purple-100 text-purple-700',
    marketing: 'bg-pink-100 text-pink-700',
    general: 'bg-gray-100 text-gray-700',
    other: 'bg-yellow-100 text-yellow-700',
};

function formatBytes(bytes) {
    if (!bytes) return 'Unknown size';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

export default function SharedFilesManagement() {
    const queryClient = useQueryClient();
    const [uploading, setUploading] = useState(false);
    const [form, setForm] = useState({ title: '', description: '', category: 'general' });
    const [selectedFile, setSelectedFile] = useState(null);

    const { data: files = [], isLoading } = useQuery({
        queryKey: ['shared-files-admin'],
        queryFn: () => base44.entities.SharedFile.list('-created_date'),
    });

    const deleteMutation = useMutation({
        mutationFn: (id) => base44.entities.SharedFile.delete(id),
        onSuccess: () => {
            queryClient.invalidateQueries(['shared-files-admin']);
            toast.success('File deleted');
        },
        onError: () => toast.error('Failed to delete file'),
    });

    const toggleMutation = useMutation({
        mutationFn: ({ id, is_active }) => base44.entities.SharedFile.update(id, { is_active }),
        onSuccess: () => queryClient.invalidateQueries(['shared-files-admin']),
        onError: () => toast.error('Failed to update file visibility'),
    });

    const handleFileSelect = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        setSelectedFile(file);
        if (!form.title) setForm(f => ({ ...f, title: file.name.replace(/\.[^/.]+$/, '') }));
    };

    const handleUpload = async () => {
        if (!selectedFile) { toast.error('Please select a file'); return; }
        if (!form.title.trim()) { toast.error('Please enter a title'); return; }

        setUploading(true);
        try {
            // Use backend function via fetch with FormData (platform UploadFile blocks .apk)
            const formData = new FormData();
            formData.append('file', selectedFile, selectedFile.name);
            const uploadRes = await fetch(getApiUrl('/uploadPublicFile'), {
                method: 'POST',
                body: formData,
                credentials: 'include',
            });
            const uploadData = await uploadRes.json();
            if (!uploadData?.file_url) throw new Error(uploadData?.error || 'Upload failed');
            const file_url = uploadData.file_url;
            await base44.entities.SharedFile.create({
                title: form.title.trim(),
                description: form.description.trim(),
                category: form.category,
                file_url,
                file_name: selectedFile.name,
                file_size: selectedFile.size,
                file_type: selectedFile.type || 'application/vnd.android.package-archive',
                is_active: true,
                download_count: 0,
            });
            queryClient.invalidateQueries(['shared-files-admin']);
            toast.success('File uploaded and shared successfully!');
            setForm({ title: '', description: '', category: 'general' });
            setSelectedFile(null);
            document.getElementById('file-upload-input').value = '';
        } catch (e) {
            toast.error('Upload failed: ' + (e.message || 'Unknown error'));
        } finally {
            setUploading(false);
        }
    };

    return (
        <div className="space-y-6">
            <div>
                <h2 className="text-2xl font-bold text-gray-900">Shared Files</h2>
                <p className="text-gray-500 text-sm mt-1">Upload files that all restaurant dashboards can view and download. Perfect for APKs, guides, policies, and more.</p>
            </div>

            {/* Upload Card */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Upload className="h-5 w-5 text-orange-500" />
                        Upload New File
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="text-sm font-medium text-gray-700 mb-1 block">Title *</label>
                            <Input
                                placeholder="e.g., MealDrop Android App v2.1"
                                value={form.title}
                                onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                            />
                        </div>
                        <div>
                            <label className="text-sm font-medium text-gray-700 mb-1 block">Category</label>
                            <Select value={form.category} onValueChange={v => setForm(f => ({ ...f, category: v }))}>
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {CATEGORIES.map(c => (
                                        <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                    <div>
                        <label className="text-sm font-medium text-gray-700 mb-1 block">Description (optional)</label>
                        <Input
                            placeholder="Brief description of what this file contains"
                            value={form.description}
                            onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                        />
                    </div>
                    <div>
                        <label className="text-sm font-medium text-gray-700 mb-1 block">File *</label>
                        <div className="flex items-center gap-3">
                            <input
                                id="file-upload-input"
                                type="file"
                                onChange={handleFileSelect}
                                className="hidden"
                                accept="*/*"
                            />
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() => document.getElementById('file-upload-input').click()}
                                className="flex-shrink-0"
                            >
                                <FolderOpen className="h-4 w-4 mr-2" />
                                Choose File
                            </Button>
                            {selectedFile && (
                                <div className="text-sm text-gray-600">
                                    <span className="font-medium">{selectedFile.name}</span>
                                    <span className="text-gray-400 ml-2">({formatBytes(selectedFile.size)})</span>
                                </div>
                            )}
                        </div>
                    </div>
                    <Button
                        onClick={handleUpload}
                        disabled={uploading || !selectedFile}
                        className="bg-orange-500 hover:bg-orange-600"
                    >
                        {uploading ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Uploading...</> : <><Upload className="h-4 w-4 mr-2" />Upload & Share</>}
                    </Button>
                </CardContent>
            </Card>

            {/* Files List */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center justify-between">
                        <span className="flex items-center gap-2">
                            <FileText className="h-5 w-5 text-orange-500" />
                            All Shared Files
                        </span>
                        <Badge variant="outline">{files.length} file{files.length !== 1 ? 's' : ''}</Badge>
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    {isLoading ? (
                        <div className="text-center py-8 text-gray-500">Loading files...</div>
                    ) : files.length === 0 ? (
                        <div className="text-center py-12 text-gray-400">
                            <Upload className="h-12 w-12 mx-auto mb-3 opacity-30" />
                            <p className="font-medium">No files uploaded yet</p>
                            <p className="text-sm mt-1">Upload your first file above to share with restaurants</p>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {files.map(file => (
                                <div key={file.id} className={`flex items-center gap-4 p-4 rounded-xl border ${file.is_active ? 'bg-white' : 'bg-gray-50 opacity-60'}`}>
                                    <div className="h-10 w-10 bg-orange-100 rounded-lg flex items-center justify-center flex-shrink-0">
                                        <FileText className="h-5 w-5 text-orange-600" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <p className="font-semibold text-gray-900 truncate">{file.title}</p>
                                            <Badge className={`text-xs ${CATEGORY_COLORS[file.category] || CATEGORY_COLORS.general}`}>
                                                {CATEGORIES.find(c => c.value === file.category)?.label || file.category}
                                            </Badge>
                                            {!file.is_active && <Badge variant="outline" className="text-xs text-gray-500">Hidden</Badge>}
                                        </div>
                                        {file.description && <p className="text-sm text-gray-500 truncate mt-0.5">{file.description}</p>}
                                        <p className="text-xs text-gray-400 mt-1">
                                            {file.file_name} • {formatBytes(file.file_size)} • {file.download_count || 0} downloads • {file.created_date ? format(new Date(file.created_date), 'dd MMM yyyy') : 'N/A'}
                                        </p>
                                    </div>
                                    <div className="flex items-center gap-2 flex-shrink-0">
                                        <a href={file.file_url} target="_blank" rel="noopener noreferrer">
                                            <Button size="sm" variant="outline">
                                                <Download className="h-4 w-4" />
                                            </Button>
                                        </a>
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            onClick={() => toggleMutation.mutate({ id: file.id, is_active: !file.is_active })}
                                            title={file.is_active ? 'Hide from restaurants' : 'Show to restaurants'}
                                        >
                                            {file.is_active ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                                        </Button>
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            className="text-red-500 hover:text-red-700"
                                            onClick={() => deleteMutation.mutate(file.id)}
                                            disabled={deleteMutation.isPending}
                                        >
                                            <Trash2 className="h-4 w-4" />
                                        </Button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}