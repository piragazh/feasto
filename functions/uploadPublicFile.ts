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