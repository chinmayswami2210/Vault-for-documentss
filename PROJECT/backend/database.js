const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
require('dotenv').config();

const DATA_DIR = process.env.VERCEL ? path.join('/tmp', 'data') : path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'vault_data.json');

// Ensure data directory exists
try {
    if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
    }
} catch (err) {
    console.warn('Could not create DATA_DIR:', err.message);
}

const DEFAULT_USERS = [
    {
        _id: 'usr_admin',
        username: 'admin',
        password: bcrypt.hashSync('admin123', 10),
        role: 'Admin'
    },
    {
        _id: 'usr_inspector',
        username: 'inspector_sharma',
        password: bcrypt.hashSync('user123', 10),
        role: 'User'
    }
];

const DEFAULT_EVIDENCE = [
    {
        _id: 'EV-101',
        case_ref: 'FIR-2026-001',
        file_name: 'surveillance_entry_cam4.jpg',
        doc_type: 'image',
        hash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
        image_base64: 'https://images.unsplash.com/photo-1557597774-9d273605dfa9?w=600&auto=format&fit=crop&q=80',
        uploaded_by: 'admin',
        created_at: new Date(Date.now() - 3600000).toISOString()
    },
    {
        _id: 'EV-102',
        case_ref: 'FIR-2026-002',
        file_name: 'forensic_ballistic_microscope.jpg',
        doc_type: 'image',
        hash: '8f434346648f6b96df89dda901c5176b10a6d83961dd3c1ac88b59b2dc327aa4',
        image_base64: 'https://images.unsplash.com/photo-1582719478250-c89cae4dc85b?w=600&auto=format&fit=crop&q=80',
        uploaded_by: 'admin',
        created_at: new Date(Date.now() - 7200000).toISOString()
    },
    {
        _id: 'EV-103',
        case_ref: 'FIR-2026-003',
        file_name: 'forensic_investigation_brief.pdf',
        doc_type: 'document',
        doc_content: 'PRIMARY FORENSIC SUMMARY:\nBiometric samples and footprint impression collected from the scene under tamper-evident seal #8841. Preliminary analysis demonstrates 98.4% match with cataloged database signatures. Digital custody confirmed.',
        hash: 'a4f1076b32870425c27fba26557571dd6cf0f190d63fe884a441b65e9021c322',
        uploaded_by: 'admin',
        created_at: new Date(Date.now() - 14400000).toISOString()
    }
];

const DEFAULT_LOGS = [
    {
        _id: 'log_1',
        action: 'System Initialized & Secured with cryptographic SHA-256 chain.',
        username: 'System',
        role: 'System',
        created_at: new Date(Date.now() - 10800000).toISOString()
    },
    {
        _id: 'log_2',
        action: 'admin uploaded evidence image: surveillance_entry_cam4.jpg (Case: FIR-2026-001)',
        username: 'admin',
        role: 'Admin',
        created_at: new Date(Date.now() - 3600000).toISOString()
    },
    {
        _id: 'log_3',
        action: 'admin authored case document: forensic_investigation_brief.pdf (Case: FIR-2026-003)',
        username: 'admin',
        role: 'Admin',
        created_at: new Date(Date.now() - 14400000).toISOString()
    }
];

function loadData() {
    try {
        if (fs.existsSync(DATA_FILE)) {
            const raw = fs.readFileSync(DATA_FILE, 'utf8');
            const data = JSON.parse(raw);
            return {
                users: data.users || DEFAULT_USERS,
                evidence: data.evidence || DEFAULT_EVIDENCE,
                logs: data.logs || DEFAULT_LOGS
            };
        }
    } catch (err) {
        console.error('Error reading vault data file, using defaults:', err.message);
    }
    const initial = {
        users: DEFAULT_USERS,
        evidence: DEFAULT_EVIDENCE,
        logs: DEFAULT_LOGS
    };
    saveData(initial);
    return initial;
}

function saveData(data) {
    try {
        fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
    } catch (err) {
        console.error('Error writing vault data file:', err.message);
    }
}

function makeQueryable(items) {
    const promise = Promise.resolve([...items]);
    promise.sort = function (sortObj) {
        return promise.then((arr) => {
            const copy = [...arr];
            if (sortObj && sortObj.created_at) {
                copy.sort((a, b) => {
                    const timeA = new Date(a.created_at || 0).getTime();
                    const timeB = new Date(b.created_at || 0).getTime();
                    return sortObj.created_at === -1 ? timeB - timeA : timeA - timeB;
                });
            }
            return copy;
        });
    };
    return promise;
}

// User Model
const User = {
    async findOne(query) {
        const data = loadData();
        const found = data.users.find((u) => {
            if (query.username && u.username.toLowerCase() !== query.username.toLowerCase()) return false;
            if (query._id && u._id !== query._id) return false;
            return true;
        });
        return found || null;
    },
    async create(userData) {
        const data = loadData();
        const newUser = {
            _id: 'usr_' + Date.now() + '_' + Math.floor(Math.random() * 1000),
            ...userData
        };
        data.users.push(newUser);
        saveData(data);
        return newUser;
    },
    find() {
        const data = loadData();
        return makeQueryable(data.users);
    }
};

// Evidence Model
const Evidence = {
    find(filter = {}) {
        const data = loadData();
        let items = data.evidence;
        if (filter.case_ref) {
            items = items.filter((ev) => ev.case_ref === filter.case_ref);
        }
        return makeQueryable(items);
    },
    async findById(id) {
        const data = loadData();
        return data.evidence.find((ev) => ev._id === id || ev.id === id) || null;
    },
    async create(evidenceData) {
        const data = loadData();
        const id = evidenceData.id || evidenceData._id || 'EV-' + Math.floor(100 + Math.random() * 900);
        const newRecord = {
            _id: id,
            id: id,
            case_ref: evidenceData.case_ref,
            file_name: evidenceData.file_name,
            doc_type: evidenceData.doc_type || 'document',
            doc_content: evidenceData.doc_content || '',
            category: evidenceData.category || '',
            hash: evidenceData.hash,
            image_base64: evidenceData.image_base64 || evidenceData.image_url || evidenceData.file_data || '',
            file_url: evidenceData.file_url || '',
            cloudinary_url: evidenceData.cloudinary_url || '',
            cloudinary_id: evidenceData.cloudinary_id || '',
            sync_status: evidenceData.sync_status || 'synced',
            uploaded_by: evidenceData.uploaded_by || 'admin',
            created_at: evidenceData.created_at || new Date().toISOString()
        };
        data.evidence.unshift(newRecord);
        saveData(data);
        return newRecord;
    },
    async findByIdAndUpdate(id, updateData) {
        const data = loadData();
        const idx = data.evidence.findIndex((ev) => ev._id === id || ev.id === id);
        if (idx !== -1) {
            data.evidence[idx] = { ...data.evidence[idx], ...updateData };
            saveData(data);
            return data.evidence[idx];
        }
        return null;
    },
    async findByIdAndDelete(id) {
        const data = loadData();
        const initialLength = data.evidence.length;
        data.evidence = data.evidence.filter((ev) => ev._id !== id && ev.id !== id);
        if (data.evidence.length !== initialLength) {
            saveData(data);
            return true;
        }
        return null;
    }
};

// Log Model
const Log = {
    find() {
        const data = loadData();
        return makeQueryable(data.logs);
    },
    async create(logData) {
        const data = loadData();
        const newLog = {
            _id: 'log_' + Date.now() + '_' + Math.floor(Math.random() * 1000),
            id: Date.now(),
            action: logData.action,
            username: logData.username || 'System',
            role: logData.role || (logData.username === 'admin' ? 'Admin' : 'User'),
            created_at: logData.created_at || new Date().toISOString()
        };
        data.logs.unshift(newLog);
        saveData(data);
        return newLog;
    }
};

async function logAction(action, username) {
    try {
        await Log.create({ action, username });
    } catch (err) {
        console.error('Error logging action:', err);
    }
}

// Ensure database file exists on startup
loadData();

module.exports = {
    User,
    Evidence,
    Log,
    logAction
};
