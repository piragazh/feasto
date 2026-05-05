import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        // CRITICAL: Admin-only check
        if (!user || user.role !== 'admin') {
            return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
        }

        // Parse the request body as FormData
        const formData = await req.formData();
        const file = formData.get('file');

        if (!file) {
            return Response.json({ error: 'No file provided' }, { status: 400 });
        }

        // SECURITY: Allowlist safe file types only
        const ALLOWED_TYPES = [
            'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml',
            'application/pdf',
            'video/mp4', 'video/webm',
            'audio/mpeg', 'audio/wav',
            'text/plain', 'text/csv',
            'application/json',
            'application/vnd.android.package-archive',
            'application/octet-stream',
        ];
        const BLOCKED_EXTENSIONS = ['.html', '.htm', '.js', '.mjs', '.ts', '.php', '.py', '.sh', '.exe'];
        const fileName = (file.name || '').toLowerCase();
        const hasBlockedExt = BLOCKED_EXTENSIONS.some(ext => fileName.endsWith(ext));
        // Allow .apk regardless of MIME type
        const isApk = fileName.endsWith('.apk');
        if (!isApk && (hasBlockedExt || (file.type && !ALLOWED_TYPES.includes(file.type)))) {
            return Response.json({ error: `File type not allowed: ${file.type || fileName}` }, { status: 400 });
        }

        // SECURITY: 50MB size limit
        const MAX_SIZE = 50 * 1024 * 1024;
        if (file.size && file.size > MAX_SIZE) {
            return Response.json({ error: 'File too large (max 50MB)' }, { status: 400 });
        }

        // Upload file to public folder
        const response = await base44.integrations.Core.UploadFile({
            file: file
        });

        if (!response?.file_url) {
            return Response.json({ error: 'Upload failed' }, { status: 500 });
        }

        return Response.json({
            success: true,
            file_url: response.file_url,
            file_name: file.name
        });
    } catch (error) {
        console.error('Upload error:', error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});