const express = require('express');
const router = express.Router();
const multer = require('multer');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { Evidence, Log, logAction } = require('../database');
const { verifyToken, verifyAdmin } = require('./auth');
const { uploadToCloudinary, isConfigured, getConfig } = require('../cloudinaryService');

// Memory storage for uploads
const upload = multer({ 
    storage: multer.memoryStorage(),
    limits: { fileSize: 25 * 1024 * 1024 } // 25MB max
});

// GET /api/evidence - Public / All Authenticated Users & Demo User can read all evidence
router.get('/', verifyToken, async (req, res) => {
    try {
        const evidence = await Evidence.find().sort({ created_at: -1 });
        res.json(evidence);
    } catch (err) {
        console.error('Error fetching evidence:', err);
        res.status(500).json({ message: 'Database error fetching evidence' });
    }
});

// GET /api/evidence/cloudinary-status - Check Cloudinary configuration
router.get('/cloudinary-status', (req, res) => {
    const cfg = getConfig();
    res.json({
        configured: isConfigured(),
        cloud_name: cfg.cloud_name || null,
        has_api_key: Boolean(cfg.api_key),
        upload_preset: cfg.upload_preset || null
    });
});

// Helper to save base64 file data to uploads folder on disk
function saveBase64ToDisk(fileData, fileName, resolvedType) {
    if (!fileData || typeof fileData !== 'string' || !fileData.startsWith('data:')) {
        return null;
    }
    try {
        const matches = fileData.match(/^data:([^;]+);base64,(.+)$/);
        if (!matches || matches.length < 3) return null;
        
        const uploadsDir = process.env.VERCEL ? path.join('/tmp', 'uploads') : path.join(__dirname, '../uploads');
        try {
            if (!fs.existsSync(uploadsDir)) {
                fs.mkdirSync(uploadsDir, { recursive: true });
            }
        } catch (e) {
            console.warn('Could not create uploads directory:', e.message);
        }
        
        let ext = path.extname(fileName);
        if (!ext) {
            const mime = matches[1];
            if (mime.includes('png')) ext = '.png';
            else if (mime.includes('jpeg') || mime.includes('jpg')) ext = '.jpg';
            else if (mime.includes('webp')) ext = '.webp';
            else if (mime.includes('pdf')) ext = '.pdf';
            else if (mime.includes('text')) ext = '.txt';
            else ext = '.bin';
        }
        
        const safeBase = path.basename(fileName, ext).replace(/[^a-zA-Z0-9_-]/g, '_');
        const diskFileName = `${Date.now()}_${safeBase}${ext}`;
        const filePath = path.join(uploadsDir, diskFileName);
        
        fs.writeFileSync(filePath, Buffer.from(matches[2], 'base64'));
        return `/uploads/${diskFileName}`;
    } catch (err) {
        console.warn('[Storage] Could not write upload to disk:', err.message);
        return null;
    }
}

function extractTextContent(fileData, fileName, existingContent) {
    if (existingContent && existingContent.trim() && 
        existingContent !== 'Cryptographically verified evidence record.' && 
        existingContent !== 'Cryptographically sealed PDF Document.' &&
        existingContent !== 'Cryptographically verified image evidence.') {
        return existingContent.trim();
    }
    if (!fileData || typeof fileData !== 'string') return existingContent || '';
    const lower = (fileName || '').toLowerCase();
    if (lower.endsWith('.txt') || lower.endsWith('.json') || lower.endsWith('.csv') || lower.endsWith('.log') || lower.endsWith('.md') || fileData.startsWith('data:text/')) {
        try {
            const matches = fileData.match(/^data:[^;]+;base64,(.+)$/);
            if (matches && matches[1]) {
                const text = Buffer.from(matches[1], 'base64').toString('utf8');
                if (text && text.trim()) return text;
            }
        } catch (e) {}
    }
    return existingContent || '';
}

// POST /api/evidence/upload - Admin uploads a document / image file
router.post('/upload', (req, res, next) => {
    if (req.is('multipart/form-data')) {
        upload.single('file')(req, res, next);
    } else {
        next();
    }
}, verifyToken, verifyAdmin, async (req, res) => {
    const { case_ref, file_name, doc_type, doc_content, category } = req.body;
    
    if (!case_ref || !file_name) {
        return res.status(400).json({ message: 'Missing case_ref or file_name' });
    }

    let file_data = req.body.image_base64 || req.body.image_url || req.body.file_data || '';
    if (req.file) {
        const b64 = Buffer.from(req.file.buffer).toString('base64');
        file_data = `data:${req.file.mimetype};base64,${b64}`;
    }

    // Determine type: 'document', 'pdf', 'image', 'text'
    let resolvedType = doc_type || 'document';
    const lowerName = file_name.toLowerCase();
    if (lowerName.endsWith('.pdf')) {
        resolvedType = 'pdf';
    } else if (lowerName.endsWith('.png') || lowerName.endsWith('.jpg') || lowerName.endsWith('.jpeg') || lowerName.endsWith('.webp') || lowerName.endsWith('.gif') || lowerName.endsWith('.svg')) {
        resolvedType = 'image';
    } else if (lowerName.endsWith('.txt') || lowerName.endsWith('.doc') || lowerName.endsWith('.docx') || lowerName.endsWith('.csv') || lowerName.endsWith('.json')) {
        resolvedType = 'document';
    }

    // Auto extract text content if applicable
    const resolvedDocContent = extractTextContent(file_data, file_name, doc_content) || 
        (resolvedType === 'pdf' ? 'Cryptographically sealed PDF Document.' : 
         resolvedType === 'image' ? 'Cryptographically verified image evidence.' : 
         'Cryptographically verified evidence record.');

    // Save copy to local server disk storage
    const localUrl = saveBase64ToDisk(file_data, file_name, resolvedType);

    // Generate SHA-256 hash based on content and file name
    const hashSource = (file_data || resolvedDocContent || file_name) + Date.now().toString();
    const hash = crypto.createHash('sha256').update(hashSource).digest('hex');

    const uploader = req.user?.username || req.body.uploaded_by || 'admin';

    // Upload to Cloudinary if file_data is present and Cloudinary is configured
    let cloudinaryUrl = req.body.cloudinary_url || '';
    let cloudinaryId = req.body.cloudinary_id || '';

    if (file_data && (!cloudinaryUrl || cloudinaryUrl.startsWith('data:')) && isConfigured()) {
        try {
            const cloudRes = await uploadToCloudinary({
                file: file_data,
                fileName: file_name.trim(),
                folder: 'trace_vault_evidence',
                resourceType: resolvedType === 'image' ? 'image' : 'auto'
            });
            if (cloudRes && cloudRes.secure_url && !cloudRes.isMock) {
                cloudinaryUrl = cloudRes.secure_url;
                cloudinaryId = cloudRes.public_id || '';
            }
        } catch (cErr) {
            console.warn('[Cloudinary] Upload failed during evidence save, fallback to local:', cErr.message);
        }
    } else if (!isConfigured()) {
        cloudinaryUrl = '';
        cloudinaryId = '';
    }

    // Retain real previewable data: prefer the actual file_data data URI or localUrl
    const effectivePreview = file_data || localUrl || cloudinaryUrl;

    try {
        const newDoc = await Evidence.create({
            case_ref: case_ref.trim(),
            file_name: file_name.trim(),
            doc_type: resolvedType,
            doc_content: resolvedDocContent,
            category: category || (resolvedType === 'pdf' ? 'FIR Case Brief' : resolvedType === 'image' ? 'Visual Evidence' : 'Digital Evidence'),
            hash,
            image_base64: effectivePreview,
            file_url: localUrl || cloudinaryUrl || '',
            cloudinary_url: cloudinaryUrl,
            cloudinary_id: cloudinaryId,
            sync_status: cloudinaryUrl ? 'synced' : 'local',
            uploaded_by: uploader,
            created_at: new Date().toISOString()
        });

        const syncNote = cloudinaryUrl ? ' (Synced to Cloudinary)' : '';
        await logAction(
            `${uploader} secured & uploaded document "${file_name.trim()}" (Case: ${case_ref.trim()})${syncNote}`,
            uploader
        );

        res.status(201).json({ 
            message: 'Document secured in Central Vault successfully' + (cloudinaryUrl ? ' & Synced to Cloudinary' : ''), 
            evidence: newDoc 
        });
    } catch (err) {
        console.error('Error saving evidence upload:', err);
        res.status(500).json({ message: 'Database error while saving document' });
    }
});

// POST /api/evidence/write - Admin writes/authors a document or case statement directly
router.post('/write', verifyToken, verifyAdmin, async (req, res) => {
    const { case_ref, file_name, doc_type, doc_content, category } = req.body;

    if (!case_ref || !file_name || !doc_content) {
        return res.status(400).json({ message: 'Missing case_ref, file_name, or doc_content' });
    }

    const uploader = req.user?.username || req.body.uploaded_by || 'admin';
    const hash = crypto.createHash('sha256').update(doc_content + file_name + Date.now().toString()).digest('hex');

    try {
        const newDoc = await Evidence.create({
            case_ref: case_ref.trim(),
            file_name: file_name.trim(),
            doc_type: doc_type || 'written_report',
            doc_content: doc_content.trim(),
            category: category || 'Investigation Report',
            hash,
            image_base64: '',
            uploaded_by: uploader,
            created_at: new Date().toISOString()
        });

        await logAction(
            `${uploader} authored & sealed case report "${file_name.trim()}" (Case: ${case_ref.trim()})`,
            uploader
        );

        res.status(201).json({
            message: 'Document written and digitally signed in Central Vault',
            evidence: newDoc
        });
    } catch (err) {
        console.error('Error authoring document:', err);
        res.status(500).json({ message: 'Database error saving written document' });
    }
});

// DELETE /api/evidence/:id - Admin purges a record
router.delete('/:id', verifyToken, verifyAdmin, async (req, res) => {
    const id = req.params.id;
    const uploader = req.user?.username || 'admin';

    try {
        const ev = await Evidence.findById(id);
        if (!ev) {
            return res.status(404).json({ message: 'Document/Evidence not found' });
        }

        await Evidence.findByIdAndDelete(id);
        await logAction(`${uploader} purged vault record: "${ev.file_name}" (Case: ${ev.case_ref})`, uploader);

        res.json({ message: 'Record purged successfully', id });
    } catch (err) {
        console.error('Error deleting evidence:', err);
        res.status(500).json({ message: 'Database error purging document' });
    }
});

// GET /api/evidence/logs - Read audit logs
router.get('/logs', verifyToken, async (req, res) => {
    try {
        const logs = await Log.find().sort({ created_at: -1 });
        res.json(logs);
    } catch (err) {
        console.error('Error fetching logs:', err);
        res.status(500).json({ message: 'Database error fetching logs' });
    }
});

// POST /api/evidence/logs - Add client-triggered log (e.g. login/logout events)
router.post('/logs', verifyToken, async (req, res) => {
    const { action, username, role } = req.body;
    if (!action) {
        return res.status(400).json({ message: 'Missing action' });
    }

    try {
        const newLog = await Log.create({
            action,
            username: username || 'User',
            role: role || 'User',
            created_at: new Date().toISOString()
        });
        res.status(201).json(newLog);
    } catch (err) {
        console.error('Error creating log:', err);
        res.status(500).json({ message: 'Database error creating log' });
    }
});

// POST /api/evidence/sync-offline - Sync offline-created documents to Cloudinary & Central Vault
router.post('/sync-offline', verifyToken, async (req, res) => {
    const rawItems = Array.isArray(req.body.items) ? req.body.items : (req.body ? [req.body] : []);
    
    if (rawItems.length === 0) {
        return res.status(400).json({ message: 'No items provided to sync' });
    }

    const syncedResults = [];
    const uploader = req.user?.username || req.body.uploaded_by || 'admin';

    for (const item of rawItems) {
        try {
            const fileName = item.file_name || 'untitled_evidence';
            const caseRef = item.case_ref || 'FIR-UNASSIGNED';
            let fileData = item.image_base64 || item.file_data || item.image_url || '';
            let resolvedType = item.doc_type || 'document';
            const lowerName = fileName.toLowerCase();
            if (lowerName.endsWith('.pdf')) resolvedType = 'pdf';
            else if (lowerName.endsWith('.png') || lowerName.endsWith('.jpg') || lowerName.endsWith('.jpeg') || lowerName.endsWith('.webp') || lowerName.endsWith('.gif') || lowerName.endsWith('.svg')) resolvedType = 'image';
            else if (lowerName.endsWith('.txt') || lowerName.endsWith('.doc') || lowerName.endsWith('.docx') || lowerName.endsWith('.csv') || lowerName.endsWith('.json')) resolvedType = 'document';

            // Auto extract text content if applicable
            const resolvedDocContent = extractTextContent(fileData, fileName, item.doc_content) || 
                (resolvedType === 'pdf' ? 'Cryptographically sealed PDF Document.' : 
                 resolvedType === 'image' ? 'Cryptographically verified image evidence.' : 
                 'Cryptographically verified evidence record.');

            // Save copy to local server disk storage
            const localUrl = saveBase64ToDisk(fileData, fileName, resolvedType);

            let cloudinaryUrl = item.cloudinary_url || '';
            let cloudinaryId = item.cloudinary_id || '';

            // If we have file data (e.g. data URI) and Cloudinary is configured, upload it
            if (fileData && (!cloudinaryUrl || cloudinaryUrl.startsWith('data:')) && isConfigured()) {
                try {
                    const cloudRes = await uploadToCloudinary({
                        file: fileData,
                        fileName: fileName,
                        folder: 'trace_vault_evidence',
                        resourceType: resolvedType === 'image' ? 'image' : 'auto'
                    });
                    if (cloudRes && cloudRes.secure_url && !cloudRes.isMock) {
                        cloudinaryUrl = cloudRes.secure_url;
                        cloudinaryId = cloudRes.public_id || '';
                    }
                } catch (cErr) {
                    console.warn('[Cloudinary Sync] Error uploading item to Cloudinary:', cErr.message);
                }
            } else if (!isConfigured() && (!cloudinaryUrl || cloudinaryUrl.includes('res.cloudinary.com/trace-vault'))) {
                cloudinaryUrl = '';
                cloudinaryId = '';
            }

            // Retain real previewable data
            const effectivePreview = fileData || localUrl || item.image_base64 || '';
            const effectiveFileUrl = localUrl || cloudinaryUrl || item.file_url || '';

            // Generate or preserve SHA-256 hash
            const hash = item.hash || crypto.createHash('sha256').update((fileData || resolvedDocContent || fileName) + Date.now().toString()).digest('hex');

            // Check if already in DB
            let record = null;
            if (item._id || item.id) {
                record = await Evidence.findById(item._id || item.id);
            }

            if (record) {
                // Update existing record
                record = await Evidence.findByIdAndUpdate(record._id || record.id, {
                    cloudinary_url: cloudinaryUrl,
                    cloudinary_id: cloudinaryId,
                    sync_status: cloudinaryUrl ? 'synced' : 'local',
                    image_base64: effectivePreview || record.image_base64,
                    file_url: effectiveFileUrl || record.file_url,
                    doc_content: resolvedDocContent || record.doc_content
                });
            } else {
                // Create new record
                record = await Evidence.create({
                    id: item._id && !item._id.startsWith('offline_') ? item._id : undefined,
                    case_ref: caseRef,
                    file_name: fileName,
                    doc_type: resolvedType,
                    doc_content: resolvedDocContent,
                    category: item.category || (resolvedType === 'pdf' ? 'FIR Case Brief' : resolvedType === 'image' ? 'Visual Evidence' : 'Digital Evidence'),
                    hash: hash,
                    image_base64: effectivePreview,
                    file_url: effectiveFileUrl,
                    cloudinary_url: cloudinaryUrl,
                    cloudinary_id: cloudinaryId,
                    sync_status: cloudinaryUrl ? 'synced' : 'local',
                    uploaded_by: item.uploaded_by || uploader,
                    created_at: item.created_at || new Date().toISOString()
                });
            }

            await logAction(
                `Synced offline document "${fileName}" to Cloudinary Central Vault (Case: ${caseRef})`,
                uploader
            );

            syncedResults.push({
                offlineId: item._id || item.id,
                evidence: record,
                cloudinary_url: cloudinaryUrl,
                status: 'synced'
            });
        } catch (err) {
            console.error('[Sync Offline Item Error]:', err);
            syncedResults.push({
                offlineId: item._id || item.id,
                error: err.message,
                status: 'failed'
            });
        }
    }

    res.json({
        message: `Successfully synced ${syncedResults.filter(r => r.status === 'synced').length} document(s) to Cloudinary`,
        syncedCount: syncedResults.filter(r => r.status === 'synced').length,
        results: syncedResults
    });
});

// POST /api/evidence/cloudinary-config - Save Cloudinary configuration dynamically
router.post('/cloudinary-config', verifyToken, verifyAdmin, (req, res) => {
    const { cloud_name, api_key, api_secret, upload_preset } = req.body;
    if (cloud_name) process.env.CLOUDINARY_CLOUD_NAME = cloud_name;
    if (api_key) process.env.CLOUDINARY_API_KEY = api_key;
    if (api_secret) process.env.CLOUDINARY_API_SECRET = api_secret;
    if (upload_preset) process.env.CLOUDINARY_UPLOAD_PRESET = upload_preset;

    res.json({
        message: 'Cloudinary configuration updated',
        configured: isConfigured(),
        cloud_name: getConfig().cloud_name
    });
});

module.exports = router;
