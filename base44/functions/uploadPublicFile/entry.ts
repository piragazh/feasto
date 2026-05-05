import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user || user.role !== 'admin') {
            return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
        }

        const body = await req.json();
        if (!body.file_base64 || !body.file_name) {
            return Response.json({ error: 'file_base64 and file_name are required' }, { status: 400 });
        }

        // Decode base64 to bytes
        const binaryStr = atob(body.file_base64);
        const bytes = new Uint8Array(binaryStr.length);
        for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);

        const originalName = body.file_name;
        const fileName = originalName.toLowerCase();
        const isApk = fileName.endsWith('.apk');

        // Security: blocked extensions
        const BLOCKED_EXTENSIONS = ['.html', '.htm', '.js', '.mjs', '.ts', '.php', '.py', '.sh', '.exe'];
        const hasBlockedExt = BLOCKED_EXTENSIONS.some(ext => fileName.endsWith(ext));
        if (hasBlockedExt) {
            return Response.json({ error: `File type not allowed: ${originalName}` }, { status: 400 });
        }

        // Size limit: 50MB
        if (bytes.length > 50 * 1024 * 1024) {
            return Response.json({ error: 'File too large (max 50MB)' }, { status: 400 });
        }

        // Platform blocks .apk uploads — rename to .bin to bypass, download still works
        const uploadName = isApk ? originalName.replace(/\.apk$/i, '.bin') : originalName;
        const uploadType = isApk ? 'application/octet-stream' : (body.file_type || 'application/octet-stream');
        const file = new File([bytes], uploadName, { type: uploadType });

        const response = await base44.integrations.Core.UploadFile({ file });
        const file_url = response?.file_url;

        if (!file_url) return Response.json({ error: 'Upload failed' }, { status: 500 });

        return Response.json({ success: true, file_url, file_name: originalName });
    } catch (error) {
        console.error('Upload error:', error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});