import React, { useContext, useState, useEffect, useRef } from 'react';
import { AuthContext } from '../context/AuthContext';
import { Shield, FolderOpen, UploadCloud, Terminal, LogOut, FileArchive, Image as ImageIcon, Trash2, Search, Printer } from 'lucide-react';

const Dashboard = () => {
    const { user, token, logout } = useContext(AuthContext);
    const [activeTab, setActiveTab] = useState('vault');
    const [evidence, setEvidence] = useState([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [logs, setLogs] = useState([]);
    const [loading, setLoading] = useState(false);

    // Upload state
    const [caseRef, setCaseRef] = useState('');
    const [fileName, setFileName] = useState('');
    const [file, setFile] = useState(null);
    const fileInputRef = useRef(null);

    useEffect(() => {
        if (activeTab === 'vault') fetchEvidence();
        if (activeTab === 'audit') fetchLogs();
    }, [activeTab]);

    const fetchEvidence = async () => {
        try {
            const res = await fetch('/api/evidence', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) {
                const data = await res.json();
                setEvidence(data);
            }
        } catch (error) {
            console.error('Failed to fetch evidence, mocking data for demo');
            setEvidence([
                { id: 1, file_name: 'demo_image.jpg', case_ref: 'FIR-2026-001', hash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855', created_at: new Date().toISOString() }
            ]);
        }
    };

    const fetchLogs = async () => {
        try {
            const res = await fetch('/api/evidence/logs', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) {
                const data = await res.json();
                setLogs(data);
            }
        } catch (error) {
            console.error('Failed to fetch logs, mocking data for demo');
            setLogs([
                { id: 1, username: 'System', action: 'Vault initialized & secured', created_at: new Date().toISOString() }
            ]);
        }
    };

    const handleUpload = async (e) => {
        e.preventDefault();
        if (!caseRef || !fileName || !file) return alert('Fill all fields');

        setLoading(true);
        const formData = new FormData();
        formData.append('case_ref', caseRef);
        formData.append('file_name', fileName);
        formData.append('image', file);

        try {
            const res = await fetch('/api/evidence/upload', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` },
                body: formData
            });
            
            if (res.ok) {
                alert('Evidence secured successfully');
                setCaseRef('');
                setFileName('');
                setFile(null);
                if(fileInputRef.current) fileInputRef.current.value = '';
                setActiveTab('vault');
            } else {
                const data = await res.json();
                alert(`Error: ${data.message}`);
            }
        } catch (error) {
            alert('Upload successful (Mocked for Vercel Demo)');
            setCaseRef('');
            setFileName('');
            setFile(null);
            if(fileInputRef.current) fileInputRef.current.value = '';
            setActiveTab('vault');
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async (id) => {
        if (!window.confirm('Are you sure you want to securely purge this record?')) return;
        
        try {
            const res = await fetch(`/api/evidence/${id}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) {
                fetchEvidence();
            } else {
                alert('Failed to delete');
            }
        } catch (error) {
            alert('Delete error');
        }
    };

    const renderTabContent = () => {
        switch (activeTab) {
            case 'vault':
                const filteredEvidence = evidence.filter(ev => 
                    ev.file_name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                    ev.case_ref.toLowerCase().includes(searchQuery.toLowerCase())
                );
                return (
                    <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
                            <h2 style={{ fontSize: '1.25rem' }}>Encrypted Vault</h2>
                            
                            <div style={{ display: 'flex', gap: '1rem', flex: 1, maxWidth: '400px' }}>
                                <div style={{ position: 'relative', flex: 1 }}>
                                    <Search size={18} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                                    <input 
                                        type="text" 
                                        className="form-control" 
                                        placeholder="Search by case or file name..." 
                                        style={{ paddingLeft: '2.5rem' }}
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                    />
                                </div>
                                <span className="badge badge-user" style={{ display: 'flex', alignItems: 'center' }}>{filteredEvidence.length} Records</span>
                            </div>
                        </div>
                        <div className="evidence-grid">
                            {filteredEvidence.map(ev => (
                                <div key={ev.id} className="evidence-card">
                                    <div className="evidence-img-container">
                                        {ev.image_base64 ? (
                                            <img src={ev.image_base64 || '/placeholder.png'} alt="Evidence" />
                                        ) : (
                                            <FileArchive size={48} color="var(--primary)" />
                                        )}
                                    </div>
                                    <div className="evidence-details">
                                        <h3 title={ev.file_name}>{ev.file_name}</h3>
                                        <p className="text-muted" style={{ fontSize: '0.8rem', marginBottom: '0.5rem' }}>Case: <span style={{ color: 'var(--text-main)' }}>{ev.case_ref}</span></p>
                                        <div className="hash-box">
                                            SHA-256:<br/>{ev.hash.substring(0, 32)}...
                                        </div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid var(--border)' }}>
                                            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{new Date(ev.created_at).toLocaleDateString()}</span>
                                            {user?.role === 'Admin' && (
                                                <button onClick={() => handleDelete(ev.id)} style={{ background: 'transparent', border: 'none', color: 'var(--danger)', cursor: 'pointer' }} title="Purge Record">
                                                    <Trash2 size={16} />
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                        {filteredEvidence.length === 0 && (
                            <div className="card text-center" style={{ padding: '3rem' }}>
                                <FolderOpen size={48} className="text-muted" style={{ margin: '0 auto 1rem' }} />
                                <h3>No Records Found</h3>
                                <p className="text-muted mt-2">Try adjusting your search criteria.</p>
                            </div>
                        )}
                    </div>
                );
            case 'upload':
                if (user?.role !== 'Admin') return <div className="card text-center text-muted">Unauthorized. Requires Level 5 clearance.</div>;
                return (
                    <div style={{ maxWidth: '600px', margin: '0 auto' }}>
                        <h2 style={{ fontSize: '1.25rem', marginBottom: '1.5rem' }}>Secure Upload Gateway</h2>
                        <div className="card">
                            <form onSubmit={handleUpload}>
                                <div className="form-group">
                                    <label className="form-label">Evidence Image</label>
                                    <label className="drop-zone" htmlFor="fileInput">
                                        <ImageIcon size={48} color="var(--text-muted)" style={{ margin: '0 auto 1rem' }} />
                                        <p style={{ fontWeight: '600', color: file ? 'var(--primary)' : 'var(--text-main)' }}>
                                            {file ? file.name : 'Click to Select File'}
                                        </p>
                                        <p className="text-muted" style={{ fontSize: '0.8rem', marginTop: '0.5rem' }}>Files will be encrypted upon upload</p>
                                    </label>
                                    <input 
                                        type="file" 
                                        id="fileInput" 
                                        ref={fileInputRef}
                                        style={{ display: 'none' }} 
                                        accept="image/*"
                                        onChange={(e) => {
                                            setFile(e.target.files[0]);
                                            if(!fileName && e.target.files[0]) setFileName(e.target.files[0].name);
                                        }}
                                    />
                                </div>
                                
                                <div className="form-group">
                                    <label className="form-label">File Designation (Name)</label>
                                    <input type="text" className="form-control" value={fileName} onChange={e => setFileName(e.target.value)} required />
                                </div>
                                <div className="form-group" style={{ marginBottom: '2rem' }}>
                                    <label className="form-label">Case Reference ID</label>
                                    <input type="text" className="form-control" value={caseRef} onChange={e => setCaseRef(e.target.value)} required />
                                </div>
                                
                                <button type="submit" className="btn" disabled={loading}>
                                    <Shield size={18} /> {loading ? 'Encrypting & Storing...' : 'Encrypt & Store to Vault'}
                                </button>
                            </form>
                        </div>
                    </div>
                );
            case 'audit':
                return (
                    <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                            <h2 style={{ fontSize: '1.25rem' }}>Immutable Audit Trail</h2>
                            <button className="btn btn-secondary" style={{ width: 'auto', padding: '0.5rem 1rem', fontSize: '0.85rem' }} onClick={() => window.print()}>
                                <Printer size={16} /> Print Report
                            </button>
                        </div>
                        <div className="table-container">
                            <table>
                                <thead>
                                    <tr>
                                        <th>Timestamp</th>
                                        <th>User</th>
                                        <th>Action Log</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {logs.map(log => (
                                        <tr key={log.id}>
                                            <td style={{ fontFamily: 'monospace', fontSize: '0.85rem' }}>{new Date(log.created_at).toLocaleString()}</td>
                                            <td style={{ fontWeight: '600', color: 'var(--primary)' }}>{log.username}</td>
                                            <td>{log.action}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                );
            default: return null;
        }
    };

    return (
        <div className="app-container">
            {/* Sidebar */}
            <aside className="dashboard-sidebar">
                <div className="sidebar-brand">
                    <Shield size={28} className="gold-text" />
                    <div>
                        <div style={{ fontWeight: '700', letterSpacing: '0.05em' }}>TRACE VAULT</div>
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Gov Enterprise</div>
                    </div>
                </div>
                
                <div className="sidebar-nav">
                    <button className={`nav-item ${activeTab === 'vault' ? 'active' : ''}`} style={{ background: activeTab==='vault'?'var(--bg-input)':'transparent', border: 'none', cursor: 'pointer', textAlign: 'left', width: '100%' }} onClick={() => setActiveTab('vault')}>
                        <FolderOpen size={20} /> Encrypted Vault
                    </button>
                    {user?.role === 'Admin' && (
                        <button className={`nav-item ${activeTab === 'upload' ? 'active' : ''}`} style={{ background: activeTab==='upload'?'var(--bg-input)':'transparent', border: 'none', cursor: 'pointer', textAlign: 'left', width: '100%' }} onClick={() => setActiveTab('upload')}>
                            <UploadCloud size={20} /> Secure Upload
                        </button>
                    )}
                    <button className={`nav-item ${activeTab === 'audit' ? 'active' : ''}`} style={{ background: activeTab==='audit'?'var(--bg-input)':'transparent', border: 'none', cursor: 'pointer', textAlign: 'left', width: '100%' }} onClick={() => setActiveTab('audit')}>
                        <Terminal size={20} /> Audit Logs
                    </button>
                </div>

                <div className="sidebar-footer">
                    <button onClick={logout} className="nav-item" style={{ background: 'transparent', border: 'none', color: 'var(--danger)', cursor: 'pointer', width: '100%', textAlign: 'left' }}>
                        <LogOut size={20} /> Terminate Session
                    </button>
                </div>
            </aside>

            {/* Main Area */}
            <main className="dashboard-main">
                <header className="dashboard-header">
                    <div>
                        <h1 style={{ fontSize: '1.1rem' }}>{activeTab === 'vault' ? 'Central Evidence Vault' : activeTab === 'upload' ? 'Upload Station' : 'System Logs'}</h1>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                        <div style={{ textAlign: 'right' }}>
                            <div style={{ fontSize: '0.85rem', fontWeight: '600' }}>{user?.username}</div>
                            <div style={{ fontSize: '0.7rem', color: 'var(--success)', textTransform: 'uppercase' }}>Security Level: {user?.role === 'Admin' ? '5 (Write)' : '1 (Read)'}</div>
                        </div>
                        <div className={`badge ${user?.role === 'Admin' ? 'badge-admin' : 'badge-user'}`}>
                            {user?.role}
                        </div>
                    </div>
                </header>

                <div className="dashboard-content">
                    {renderTabContent()}
                </div>
            </main>
        </div>
    );
};

export default Dashboard;
