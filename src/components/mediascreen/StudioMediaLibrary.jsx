import React, { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Upload, Search, Trash2, Image as ImageIcon, Film, LayoutGrid, List, Scissors, Edit } from 'lucide-react';
import { toast } from 'sonner';
import InlinePhotoEditor from './InlinePhotoEditor';
import VideoEditor from './VideoEditor';

export default function StudioMediaLibrary({ restaurantId }) {
    const queryClient = useQueryClient();
    const [search, setSearch] = useState('');
    const [filter, setFilter] = useState('all');
    const [viewMode, setViewMode] = useState('grid');
    const [uploading, setUploading] = useState(false);
    const [uploadProgress, setUploadProgress] = useState(0);
    const [editingPhoto, setEditingPhoto] = useState(null);
    const [editingVideo, setEditingVideo] = useState(null);
    const fileInputRef = useRef(null);

    const { data: mediaFiles = [] } = useQuery({
        queryKey: ['media-files', restaurantId],
        queryFn: () => base44.entities.MediaFile.filter({ restaurant_id: restaurantId }),
        enabled: !!restaurantId,
    });

    const deleteFileMutation = useMutation({
        mutationFn: (id) => base44.entities.MediaFile.delete(id),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['media-files', restaurantId] });
            toast.success('File deleted');
        }
    });

    const handleUpload = async (e) => {
        const files = Array.from(e.target.files);
        if (!files.length) return;
        setUploading(true);
        setUploadProgress(0);
        let done = 0;
        for (const file of files) {
            try {
                const { file_url } = await base44.integrations.Core.UploadFile({ file });
                await base44.entities.MediaFile.create({
                    restaurant_id: restaurantId,
                    file_url,
                    file_name: file.name,
                    file_type: file.type,
                    file_size: file.size
                });
                done++;
                setUploadProgress(Math.round((done / files.length) * 100));
            } catch {
                toast.error(`Failed to upload ${file.name}`);
            }
        }
        queryClient.invalidateQueries({ queryKey: ['media-files', restaurantId] });
        if (done > 0) toast.success(`${done} file${done !== 1 ? 's' : ''} uploaded`);
        setUploading(false);
        setUploadProgress(0);
        e.target.value = '';
    };

    const getFileType = (file) => {
        if (file.file_type?.startsWith('video/')) return 'video';
        if (file.file_type === 'image/gif') return 'gif';
        return 'image';
    };

    const formatSize = (bytes) => {
        if (!bytes) return '—';
        if (bytes < 1024) return `${bytes}B`;
        if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)}KB`;
        return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
    };

    const filtered = mediaFiles.filter(f => {
        const matchSearch = !search || f.file_name?.toLowerCase().includes(search.toLowerCase());
        const type = getFileType(f);
        const matchFilter = filter === 'all' || filter === type;
        return matchSearch && matchFilter;
    });

    const typeColors = {
        video: 'bg-blue-500',
        gif: 'bg-purple-500',
        image: 'bg-gray-600',
    };

    return (
        <div className="p-6 space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Media Library</h1>
                    <p className="text-gray-500 text-sm mt-1">{mediaFiles.length} file{mediaFiles.length !== 1 ? 's' : ''} · Click images/videos to edit them</p>
                </div>
                <div>
                    <Button onClick={() => fileInputRef.current?.click()} disabled={uploading} className="bg-orange-500 hover:bg-orange-600">
                        {uploading ? (
                            <>
                                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                                {uploadProgress}%
                            </>
                        ) : (
                            <>
                                <Upload className="h-4 w-4 mr-2" />
                                Upload Files
                            </>
                        )}
                    </Button>
                    <input ref={fileInputRef} type="file" accept="image/*,video/*" multiple onChange={handleUpload} className="hidden" />
                </div>
            </div>

            {/* Toolbar */}
            <div className="flex items-center gap-3 flex-wrap">
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search files..." className="pl-9 w-64" />
                </div>
                <div className="flex gap-1 bg-gray-100 rounded-xl p-1">
                    {[
                        { value: 'all', label: 'All' },
                        { value: 'image', label: 'Images' },
                        { value: 'video', label: 'Videos' },
                        { value: 'gif', label: 'GIFs' },
                    ].map(f => (
                        <button
                            key={f.value}
                            onClick={() => setFilter(f.value)}
                            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${filter === f.value ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-800'}`}
                        >
                            {f.label}
                        </button>
                    ))}
                </div>
                <div className="flex gap-1 bg-gray-100 rounded-xl p-1 ml-auto">
                    <button
                        onClick={() => setViewMode('grid')}
                        className={`p-2 rounded-lg transition-all ${viewMode === 'grid' ? 'bg-white shadow text-gray-900' : 'text-gray-400 hover:text-gray-700'}`}
                    >
                        <LayoutGrid className="h-4 w-4" />
                    </button>
                    <button
                        onClick={() => setViewMode('list')}
                        className={`p-2 rounded-lg transition-all ${viewMode === 'list' ? 'bg-white shadow text-gray-900' : 'text-gray-400 hover:text-gray-700'}`}
                    >
                        <List className="h-4 w-4" />
                    </button>
                </div>
            </div>

            {/* Empty state */}
            {filtered.length === 0 && (
                <div
                    onClick={() => fileInputRef.current?.click()}
                    className="flex flex-col items-center justify-center border-2 border-dashed border-gray-300 rounded-2xl p-16 cursor-pointer hover:border-orange-400 hover:bg-orange-50 transition-colors"
                >
                    <Upload className="h-14 w-14 text-gray-300 mb-4" />
                    <p className="text-gray-600 font-semibold text-lg">{search ? 'No files match your search' : 'Drop files here or click to upload'}</p>
                    <p className="text-gray-400 text-sm mt-1">Supports JPG, PNG, GIF, MP4, MOV and more</p>
                </div>
            )}

            {/* Grid view */}
            {viewMode === 'grid' && filtered.length > 0 && (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                    {filtered.map(file => {
                        const fileType = getFileType(file);
                        return (
                            <div key={file.id} className="group relative bg-gray-100 rounded-2xl overflow-hidden aspect-video shadow-sm hover:shadow-md transition-shadow">
                                {fileType === 'video' ? (
                                    <video src={file.file_url} className="w-full h-full object-cover" muted />
                                ) : (
                                    <img src={file.file_url} alt={file.file_name} className="w-full h-full object-cover" />
                                )}
                                <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-all flex flex-col justify-between p-2">
                                    <div className="flex justify-end gap-1.5">
                                        {fileType === 'image' && (
                                            <button
                                                onClick={() => setEditingPhoto(file.file_url)}
                                                className="w-7 h-7 rounded-full bg-white/90 flex items-center justify-center hover:bg-white transition-colors shadow"
                                                title="Edit photo"
                                            >
                                                <Edit className="h-3.5 w-3.5 text-gray-700" />
                                            </button>
                                        )}
                                        {fileType === 'video' && (
                                            <button
                                                onClick={() => setEditingVideo(file.file_url)}
                                                className="w-7 h-7 rounded-full bg-white/90 flex items-center justify-center hover:bg-white transition-colors shadow"
                                                title="Edit video"
                                            >
                                                <Scissors className="h-3.5 w-3.5 text-gray-700" />
                                            </button>
                                        )}
                                        <button
                                            onClick={() => deleteFileMutation.mutate(file.id)}
                                            className="w-7 h-7 rounded-full bg-red-500/90 flex items-center justify-center hover:bg-red-600 transition-colors shadow"
                                            title="Delete"
                                        >
                                            <Trash2 className="h-3.5 w-3.5 text-white" />
                                        </button>
                                    </div>
                                    <p className="text-white text-[10px] font-medium truncate">{file.file_name}</p>
                                </div>
                                <div className="absolute top-2 left-2">
                                    <div className={`${typeColors[fileType]} text-white text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wide`}>
                                        {fileType}
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* List view */}
            {viewMode === 'list' && filtered.length > 0 && (
                <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm">
                    <table className="w-full">
                        <thead>
                            <tr className="border-b border-gray-100 bg-gray-50">
                                <th className="text-left px-5 py-3 text-xs font-bold text-gray-500 uppercase tracking-wide">File</th>
                                <th className="text-left px-5 py-3 text-xs font-bold text-gray-500 uppercase tracking-wide">Type</th>
                                <th className="text-left px-5 py-3 text-xs font-bold text-gray-500 uppercase tracking-wide">Size</th>
                                <th className="text-right px-5 py-3 text-xs font-bold text-gray-500 uppercase tracking-wide">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                            {filtered.map(file => {
                                const fileType = getFileType(file);
                                return (
                                    <tr key={file.id} className="hover:bg-gray-50 transition-colors">
                                        <td className="px-5 py-3">
                                            <div className="flex items-center gap-3">
                                                <div className="w-14 h-10 bg-gray-100 rounded-lg overflow-hidden flex-shrink-0">
                                                    {fileType === 'video' ? (
                                                        <video src={file.file_url} className="w-full h-full object-cover" muted />
                                                    ) : (
                                                        <img src={file.file_url} alt="" className="w-full h-full object-cover" />
                                                    )}
                                                </div>
                                                <span className="text-sm font-medium text-gray-900 truncate max-w-xs">{file.file_name}</span>
                                            </div>
                                        </td>
                                        <td className="px-5 py-3">
                                            <Badge className={`${typeColors[fileType]} text-white border-0 text-[10px] uppercase`}>{fileType}</Badge>
                                        </td>
                                        <td className="px-5 py-3 text-sm text-gray-500">{formatSize(file.file_size)}</td>
                                        <td className="px-5 py-3">
                                            <div className="flex items-center justify-end gap-1">
                                                {fileType === 'image' && (
                                                    <Button size="sm" variant="ghost" onClick={() => setEditingPhoto(file.file_url)} className="h-8 w-8 p-0 text-gray-400 hover:text-blue-600">
                                                        <Edit className="h-3.5 w-3.5" />
                                                    </Button>
                                                )}
                                                {fileType === 'video' && (
                                                    <Button size="sm" variant="ghost" onClick={() => setEditingVideo(file.file_url)} className="h-8 w-8 p-0 text-gray-400 hover:text-blue-600">
                                                        <Scissors className="h-3.5 w-3.5" />
                                                    </Button>
                                                )}
                                                <Button size="sm" variant="ghost" onClick={() => deleteFileMutation.mutate(file.id)} className="h-8 w-8 p-0 text-gray-400 hover:text-red-600">
                                                    <Trash2 className="h-3.5 w-3.5" />
                                                </Button>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}

            {/* Editors */}
            <InlinePhotoEditor
                open={!!editingPhoto}
                imageUrl={editingPhoto}
                onClose={() => setEditingPhoto(null)}
                onSave={(newUrl) => {
                    setEditingPhoto(null);
                    queryClient.invalidateQueries({ queryKey: ['media-files', restaurantId] });
                    toast.success('Photo saved');
                }}
            />
            <VideoEditor
                open={!!editingVideo}
                videoUrl={editingVideo}
                onClose={() => setEditingVideo(null)}
                onSave={() => {
                    setEditingVideo(null);
                    toast.success('Video saved');
                }}
            />
        </div>
    );
}