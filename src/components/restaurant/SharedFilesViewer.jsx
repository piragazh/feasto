import React from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Download, FileText, FolderOpen } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';

const CATEGORIES = {
    apk: { label: 'APK / App Install', color: 'bg-green-100 text-green-700' },
    guide: { label: 'Guide / Manual', color: 'bg-blue-100 text-blue-700' },
    policy: { label: 'Policy / Legal', color: 'bg-purple-100 text-purple-700' },
    marketing: { label: 'Marketing Material', color: 'bg-pink-100 text-pink-700' },
    general: { label: 'General', color: 'bg-gray-100 text-gray-700' },
    other: { label: 'Other', color: 'bg-yellow-100 text-yellow-700' },
};

function formatBytes(bytes) {
    if (!bytes) return '';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

// Group files by category
function groupByCategory(files) {
    return files.reduce((acc, file) => {
        const cat = file.category || 'general';
        if (!acc[cat]) acc[cat] = [];
        acc[cat].push(file);
        return acc;
    }, {});
}

export default function SharedFilesViewer() {
    const { data: files = [], isLoading } = useQuery({
        queryKey: ['shared-files-restaurant'],
        queryFn: () => base44.entities.SharedFile.filter({ is_active: true }, '-created_date'),
    });

    const handleDownload = async (file) => {
        try {
            // Increment download count silently
            base44.entities.SharedFile.update(file.id, {
                download_count: (file.download_count || 0) + 1
            }).catch(() => {});
            // Open file in new tab
            window.open(file.file_url, '_blank');
            toast.success(`Downloading ${file.title}`);
        } catch (e) {
            toast.error('Failed to download file');
        }
    };

    const grouped = groupByCategory(files);
    const categoryOrder = ['apk', 'guide', 'policy', 'marketing', 'general', 'other'];

    return (
        <div className="space-y-6">
            <div>
                <h2 className="text-2xl font-bold text-gray-900">Resources & Downloads</h2>
                <p className="text-gray-500 text-sm mt-1">Files and resources shared by the MealDrop team. Download anything you need below.</p>
            </div>

            {isLoading ? (
                <div className="text-center py-12 text-gray-500">Loading files...</div>
            ) : files.length === 0 ? (
                <Card>
                    <CardContent className="py-16 text-center">
                        <FolderOpen className="h-14 w-14 mx-auto mb-4 text-gray-300" />
                        <h3 className="text-lg font-semibold text-gray-700 mb-1">No files available yet</h3>
                        <p className="text-gray-400 text-sm">The MealDrop team hasn't shared any files yet. Check back soon!</p>
                    </CardContent>
                </Card>
            ) : (
                categoryOrder.map(cat => {
                    const catFiles = grouped[cat];
                    if (!catFiles || catFiles.length === 0) return null;
                    const catInfo = CATEGORIES[cat] || CATEGORIES.general;
                    return (
                        <Card key={cat}>
                            <CardHeader className="pb-3">
                                <CardTitle className="flex items-center gap-2 text-base">
                                    <Badge className={catInfo.color}>{catInfo.label}</Badge>
                                    <span className="text-sm text-gray-400 font-normal">{catFiles.length} file{catFiles.length !== 1 ? 's' : ''}</span>
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-3">
                                {catFiles.map(file => (
                                    <div key={file.id} className="flex items-center gap-4 p-4 bg-gray-50 rounded-xl border border-gray-100 hover:border-orange-200 hover:bg-orange-50 transition-colors group">
                                        <div className="h-12 w-12 bg-white border border-gray-200 rounded-xl flex items-center justify-center flex-shrink-0 group-hover:border-orange-300">
                                            <FileText className="h-6 w-6 text-orange-500" />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="font-semibold text-gray-900">{file.title}</p>
                                            {file.description && (
                                                <p className="text-sm text-gray-500 mt-0.5">{file.description}</p>
                                            )}
                                            <p className="text-xs text-gray-400 mt-1">
                                                {file.file_name}
                                                {file.file_size ? ` • ${formatBytes(file.file_size)}` : ''}
                                                {file.created_date ? ` • Added ${format(new Date(file.created_date), 'dd MMM yyyy')}` : ''}
                                            </p>
                                        </div>
                                        <Button
                                            onClick={() => handleDownload(file)}
                                            className="bg-orange-500 hover:bg-orange-600 flex-shrink-0"
                                        >
                                            <Download className="h-4 w-4 mr-2" />
                                            Download
                                        </Button>
                                    </div>
                                ))}
                            </CardContent>
                        </Card>
                    );
                })
            )}
        </div>
    );
}