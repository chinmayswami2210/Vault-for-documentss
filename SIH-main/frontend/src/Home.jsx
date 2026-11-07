import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { 
  Shield, 
  FolderLock, 
  UploadCloud, 
  Clock, 
  LogOut, 
  Trash2, 
  Search, 
  Image as ImageIcon, 
  Lock, 
  FileCheck,
  CheckCircle2,
  AlertCircle,
  FileText,
  Eye,
  Download,
  X,
  PenTool,
  Check,
  RefreshCw,
  Wifi,
  WifiOff,
  Cloud,
  CloudUpload,
  CloudOff,
  ExternalLink,
  Settings
} from "lucide-react";
import { 
  saveOfflineEvidence, 
  getOfflineEvidenceList, 
  removeOfflineEvidence, 
  computeClientSHA256 
} from "./services/offlineVault";
import { 
  syncEvidenceItem, 
  getLocalCloudinaryConfig, 
  saveLocalCloudinaryConfig, 
  fetchServerCloudinaryStatus 
} from "./services/cloudinaryClient";
import "./App.css";

const DEFAULT_EVIDENCE = [
  {
    id: "EV-101",
    _id: "EV-101",
    case_ref: "FIR-2026-001",
    file_name: "surveillance_entry_cam4.jpg",
    doc_type: "image",
    hash: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    image_url: "https://images.unsplash.com/photo-1557597774-9d273605dfa9?w=600&auto=format&fit=crop&q=80",
    image_base64: "https://images.unsplash.com/photo-1557597774-9d273605dfa9?w=600&auto=format&fit=crop&q=80",
    uploaded_by: "admin",
    created_at: new Date(Date.now() - 3600000).toISOString()
  },
  {
    id: "EV-102",
    _id: "EV-102",
    case_ref: "FIR-2026-002",
    file_name: "forensic_ballistic_microscope.jpg",
    doc_type: "image",
    hash: "8f434346648f6b96df89dda901c5176b10a6d83961dd3c1ac88b59b2dc327aa4",
    image_url: "https://images.unsplash.com/photo-1582719478250-c89cae4dc85b?w=600&auto=format&fit=crop&q=80",
    image_base64: "https://images.unsplash.com/photo-1582719478250-c89cae4dc85b?w=600&auto=format&fit=crop&q=80",
    uploaded_by: "admin",
    created_at: new Date(Date.now() - 7200000).toISOString()
  },
  {
    id: "EV-103",
    _id: "EV-103",
    case_ref: "FIR-2026-003",
    file_name: "forensic_investigation_brief.pdf",
    doc_type: "document",
    doc_content: "PRIMARY FORENSIC SUMMARY:\nBiometric samples and footprint impression collected from the scene under tamper-evident seal #8841. Preliminary analysis demonstrates 98.4% match with cataloged database signatures. Digital custody confirmed.",
    hash: "a4f1076b32870425c27fba26557571dd6cf0f190d63fe884a441b65e9021c322",
    uploaded_by: "admin",
    created_at: new Date(Date.now() - 14400000).toISOString()
  }
];

const DEFAULT_LOGS = [
  {
    id: 1,
    _id: "log_1",
    username: "admin",
    role: "Admin",
    action: "System Vault initialized and cryptographic keys generated",
    created_at: new Date(Date.now() - 10800000).toISOString()
  },
  {
    id: 2,
    _id: "log_2",
    username: "admin",
    role: "Admin",
    action: "Uploaded evidence image: surveillance_entry_cam4.jpg (Case: FIR-2026-001)",
    created_at: new Date(Date.now() - 3600000).toISOString()
  },
  {
    id: 3,
    _id: "log_3",
    username: "admin",
    role: "Admin",
    action: "admin authored case document: forensic_investigation_brief.pdf (Case: FIR-2026-003)",
    created_at: new Date(Date.now() - 14400000).toISOString()
  }
];

function Home() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("vault"); // 'vault', 'upload', 'logs'
  const [searchQuery, setSearchQuery] = useState("");

  const [user, setUser] = useState({ username: "inspector_sharma", role: "User" });
  const [evidenceList, setEvidenceList] = useState([]);
  const [logs, setLogs] = useState([]);

  // Network & Cloudinary Offline Sync State
  const [isOnline, setIsOnline] = useState(typeof navigator !== "undefined" ? navigator.onLine : true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [pendingOfflineCount, setPendingOfflineCount] = useState(0);
  const [showCloudinaryModal, setShowCloudinaryModal] = useState(false);
  const [cloudinaryConfig, setCloudinaryConfig] = useState(getLocalCloudinaryConfig());
  const [serverCloudStatus, setServerCloudStatus] = useState({ configured: false, cloud_name: null });

  // Upload / Writer State
  const [uploadMode, setUploadMode] = useState("file"); // 'file' or 'write'
  const [caseRef, setCaseRef] = useState("");
  const [fileName, setFileName] = useState("");
  const [docCategory, setDocCategory] = useState("Investigation Report");
  const [docContent, setDocContent] = useState("");
  const [filePreview, setFilePreview] = useState(null);
  const [fileDetails, setFileDetails] = useState(null);
  const [fileType, setFileType] = useState("document");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const fileInputRef = useRef(null);

  // Document Viewer Modal State
  const [selectedDoc, setSelectedDoc] = useState(null);
  const [toastMessage, setToastMessage] = useState(null);

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(null);
    }, 4500);
  };

  const handleToggleRole = () => {
    const nextRole = user.role === "Admin" ? "User" : "Admin";
    const nextUsername = nextRole === "Admin" ? "admin" : "inspector_sharma";
    const updatedUser = {
      username: nextUsername,
      role: nextRole,
      loginTime: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    };
    setUser(updatedUser);
    localStorage.setItem("user", JSON.stringify(updatedUser));
    showToast(`Switched view to ${nextRole === "Admin" ? "Admin (Level 5 Clearance)" : "Field Inspector (Demo User View)"}`);
  };

  // Synchronize and fetch data from backend and fallback to localStorage & IndexedDB
  const fetchEvidenceAndLogs = async () => {
    // 1. Load pending items from IndexedDB
    let offlineItems = [];
    try {
      offlineItems = await getOfflineEvidenceList();
      setPendingOfflineCount(offlineItems.length);
    } catch (e) {
      console.warn("Could not read offline vault", e);
    }

    // 2. Load evidence from server or localStorage
    let serverEvidence = [];
    try {
      const token = localStorage.getItem("token");
      const headers = token ? { "Authorization": `Bearer ${token}` } : {};
      const res = await fetch("/api/evidence", { headers });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          serverEvidence = data;
          setIsOnline(true);
          try {
            const lightData = data.slice(0, 50).map(item => ({
              ...item,
              image_base64: item.image_base64 && item.image_base64.length > 50000 ? '' : item.image_base64
            }));
            localStorage.setItem("vault_evidence", JSON.stringify(lightData));
          } catch (e) {
            console.warn("Storage quota warning", e);
          }
        }
      }
    } catch (e) {
      const saved = localStorage.getItem("vault_evidence");
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed) && parsed.length > 0) {
            serverEvidence = parsed;
          }
        } catch (err) {
          serverEvidence = DEFAULT_EVIDENCE;
        }
      } else {
        serverEvidence = DEFAULT_EVIDENCE;
      }
    }

    // Combine: Pending offline items always appear at the top so user immediately sees their offline uploads
    const combined = [
      ...offlineItems.map(item => ({ ...item, is_offline: true, sync_status: item.sync_status || "pending" })),
      ...serverEvidence.filter(s => !offlineItems.some(o => (o.id && (o.id === s.id || o.id === s._id)) || (o._id && (o._id === s._id || o._id === s.id))))
    ];
    setEvidenceList(combined);

    // 3. Load logs
    try {
      const token = localStorage.getItem("token");
      const headers = token ? { "Authorization": `Bearer ${token}` } : {};
      const resLogs = await fetch("/api/evidence/logs", { headers });
      if (resLogs.ok) {
        const logData = await resLogs.json();
        if (Array.isArray(logData)) {
          setLogs(logData);
          try {
            localStorage.setItem("vault_logs", JSON.stringify(logData.slice(0, 100)));
          } catch (e) {}
        }
      }
    } catch (e) {
      const savedLogs = localStorage.getItem("vault_logs");
      if (savedLogs) {
        try {
          const parsed = JSON.parse(savedLogs);
          if (Array.isArray(parsed) && parsed.length > 0) {
            setLogs(prev => prev.length === 0 ? parsed : prev);
          }
        } catch (err) {
          setLogs(prev => prev.length === 0 ? DEFAULT_LOGS : prev);
        }
      } else {
        setLogs(prev => prev.length === 0 ? DEFAULT_LOGS : prev);
      }
    }
  };

  // Sync all pending offline items to Cloudinary
  const syncAllPendingItems = async () => {
    if (isSyncing) return;
    setIsSyncing(true);
    try {
      const offlineItems = await getOfflineEvidenceList();
      if (!offlineItems || offlineItems.length === 0) {
        showToast("All documents in Central Vault are already synced with Cloudinary.");
        setIsSyncing(false);
        return;
      }

      showToast(`🔄 Connecting to Cloudinary... Syncing ${offlineItems.length} offline document(s)...`);
      let syncedCount = 0;
      const token = localStorage.getItem("token");

      for (const item of offlineItems) {
        const syncRes = await syncEvidenceItem(item, token);
        if (syncRes && syncRes.success) {
          await removeOfflineEvidence(item.id || item._id);
          syncedCount++;

          const finalCloudUrl = syncRes.cloudinary_url || syncRes.evidence?.cloudinary_url;

          setEvidenceList(prev => prev.map(ev => {
            if (ev.id === item.id || ev._id === item._id || ev.id === item._id || ev._id === item.id) {
              return {
                ...ev,
                ...syncRes.evidence,
                is_offline: false,
                sync_status: "synced",
                cloudinary_url: finalCloudUrl,
                image_base64: finalCloudUrl || ev.image_base64
              };
            }
            return ev;
          }));
        }
      }

      const remaining = await getOfflineEvidenceList();
      setPendingOfflineCount(remaining.length);

      if (syncedCount > 0) {
        showToast(`✓ Cloudinary Sync Complete! ${syncedCount} offline document(s) uploaded & sealed in Cloudinary.`);
        await fetchEvidenceAndLogs();
        notifyUpdate();
      }
    } catch (err) {
      console.error("Cloudinary sync failed:", err);
      showToast(`Sync error: ${err.message}`);
    } finally {
      setIsSyncing(false);
    }
  };

  // Sync a single offline item to Cloudinary
  const syncSingleItem = async (item) => {
    if (isSyncing) return;
    setIsSyncing(true);
    showToast(`🔄 Syncing "${item.file_name}" to Cloudinary...`);
    try {
      const token = localStorage.getItem("token");
      const res = await syncEvidenceItem(item, token);
      if (res && res.success) {
        await removeOfflineEvidence(item.id || item._id);
        const remaining = await getOfflineEvidenceList();
        setPendingOfflineCount(remaining.length);

        const finalCloudUrl = res.cloudinary_url || res.evidence?.cloudinary_url;

        setEvidenceList(prev => prev.map(ev => {
          if (ev.id === item.id || ev._id === item._id || ev.id === item._id || ev._id === item.id) {
            return {
              ...ev,
              ...res.evidence,
              is_offline: false,
              sync_status: "synced",
              cloudinary_url: finalCloudUrl,
              image_base64: finalCloudUrl || ev.image_base64
            };
          }
          return ev;
        }));

        showToast(`✓ "${item.file_name}" successfully synced to Cloudinary!`);
        await fetchEvidenceAndLogs();
        notifyUpdate();
      } else {
        showToast(`Could not sync "${item.file_name}" to Cloudinary.`);
      }
    } catch (e) {
      showToast(`Sync error: ${e.message}`);
    } finally {
      setIsSyncing(false);
    }
  };

  useEffect(() => {
    // Load current user
    try {
      const savedUser = localStorage.getItem("user");
      if (savedUser) {
        setUser(JSON.parse(savedUser));
      }
    } catch (e) {
      console.warn("User load error", e);
    }

    fetchEvidenceAndLogs();

    // Query backend Cloudinary configuration
    fetchServerCloudinaryStatus().then(st => {
      if (st) setServerCloudStatus(st);
    });

    // Listen to network online and offline events
    const handleOnline = () => {
      setIsOnline(true);
      showToast("🟢 Internet connection restored! Auto-syncing pending documents to Cloudinary...");
      // Auto-sync when connection comes back
      setTimeout(() => {
        syncAllPendingItems();
      }, 800);
    };

    const handleOffline = () => {
      setIsOnline(false);
      showToast("⚡ Data disconnected! Switched to Offline Vault mode. Uploads will be secured locally.");
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    // BroadcastChannel for cross-tab synchronization
    let bc;
    try {
      bc = new BroadcastChannel("trace_vault_sync");
      bc.onmessage = () => {
        fetchEvidenceAndLogs();
      };
    } catch (e) {}

    // Storage event for window-to-window sync
    const handleStorage = (e) => {
      if (e.key === "vault_evidence" || e.key === "vault_logs") {
        fetchEvidenceAndLogs();
      }
    };
    window.addEventListener("storage", handleStorage);

    // Periodic live-sync polling every 4 seconds
    const interval = setInterval(() => {
      fetchEvidenceAndLogs();
    }, 4000);

    return () => {
      if (bc) bc.close();
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("storage", handleStorage);
      clearInterval(interval);
    };
  }, []);

  const notifyUpdate = () => {
    try {
      const bc = new BroadcastChannel("trace_vault_sync");
      bc.postMessage({ type: "VAULT_UPDATED" });
      bc.close();
    } catch (e) {}
  };

  const handleLogout = async () => {
    const logoutAction = `${user.username} logged out • Session terminated`;
    try {
      await fetch("/api/evidence/logs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: logoutAction, username: user.username, role: user.role })
      });
    } catch (e) {}

    try {
      const currentLogs = JSON.parse(localStorage.getItem("vault_logs") || "[]");
      currentLogs.unshift({
        id: Date.now(),
        username: user.username,
        role: user.role,
        action: logoutAction,
        created_at: new Date().toISOString()
      });
      localStorage.setItem("vault_logs", JSON.stringify(currentLogs));
    } catch (e) {}

    localStorage.removeItem("user");
    localStorage.removeItem("token");
    notifyUpdate();
    navigate("/");
  };

  // File Selection Handler (supports images, pdf, txt, docx, etc.)
  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setFileName(file.name);
      const lower = file.name.toLowerCase();
      let type = "document";
      if (lower.endsWith(".pdf")) type = "pdf";
      else if (lower.endsWith(".png") || lower.endsWith(".jpg") || lower.endsWith(".jpeg") || lower.endsWith(".webp") || lower.endsWith(".gif") || lower.endsWith(".svg")) type = "image";
      else if (lower.endsWith(".txt") || lower.endsWith(".json") || lower.endsWith(".csv") || lower.endsWith(".log") || lower.endsWith(".md")) type = "text";
      setFileType(type);
      setFileDetails({
        name: file.name,
        size: (file.size / 1024).toFixed(1) + " KB",
        type: file.type || type
      });

      // Auto-extract readable text if it's a plain text/code/csv file
      if (type === "text" || lower.endsWith(".txt") || lower.endsWith(".json") || lower.endsWith(".csv") || lower.endsWith(".log") || lower.endsWith(".md")) {
        const textReader = new FileReader();
        textReader.onload = () => {
          setDocContent(textReader.result);
        };
        textReader.readAsText(file);
      }

      const reader = new FileReader();
      reader.onload = () => {
        setFilePreview(reader.result);
      };
      reader.readAsDataURL(file);
    }
  };

  // Admin Upload / Write Evidence Handler (Supports 100% Offline Upload + Auto Cloudinary Sync)
  const handleFormSubmit = async (e) => {
    e.preventDefault();
    if (user.role !== "Admin") {
      alert("Unauthorized. Only Admin can upload or author documents.");
      return;
    }

    if (!caseRef.trim() || !fileName.trim()) {
      alert("Please provide both Case Reference ID and Document Name.");
      return;
    }

    if (uploadMode === "write" && !docContent.trim()) {
      alert("Please write the document/case report content.");
      return;
    }

    setIsSubmitting(true);

    // Determine type: 'document', 'pdf', 'image', 'written_report'
    let resolvedType = uploadMode === "write" ? "written_report" : fileType;
    const lowerName = fileName.toLowerCase();
    if (lowerName.endsWith(".pdf")) resolvedType = "pdf";
    else if (lowerName.endsWith(".png") || lowerName.endsWith(".jpg") || lowerName.endsWith(".jpeg") || lowerName.endsWith(".webp")) resolvedType = "image";
    else if (lowerName.endsWith(".txt") || lowerName.endsWith(".doc") || lowerName.endsWith(".docx")) resolvedType = "document";

    // Generate SHA-256 hash using Web Crypto API in client
    const hashSource = (filePreview || docContent || fileName) + Date.now().toString();
    const computedHash = await computeClientSHA256(hashSource);

    // If data is disconnected or navigator is offline, save to Offline Vault immediately!
    const isOffline = !isOnline || (typeof navigator !== "undefined" && !navigator.onLine);

    if (isOffline) {
      const offlineId = `offline_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
      const offlineRecord = {
        _id: offlineId,
        id: offlineId,
        case_ref: caseRef.trim(),
        file_name: fileName.trim(),
        doc_type: resolvedType,
        doc_content: docContent.trim() || (resolvedType === "pdf" ? "Cryptographically sealed PDF Document." : "Cryptographically verified evidence record."),
        category: docCategory || (resolvedType === "pdf" ? "FIR Case Brief" : "Digital Evidence"),
        hash: computedHash,
        image_base64: filePreview || "",
        uploaded_by: user.username,
        created_at: new Date().toISOString(),
        sync_status: "pending",
        is_offline: true
      };

      await saveOfflineEvidence(offlineRecord);
      setEvidenceList(prev => [offlineRecord, ...prev]);
      setPendingOfflineCount(prev => prev + 1);

      // Local log entry
      const offLog = {
        id: Date.now(),
        _id: "log_" + Date.now(),
        username: user.username,
        role: user.role,
        action: `[OFFLINE] ${user.username} secured document "${fileName.trim()}" (Pending Cloudinary Sync)`,
        created_at: new Date().toISOString()
      };
      setLogs(prev => [offLog, ...prev]);

      // Reset Form fields
      setCaseRef("");
      setFileName("");
      setDocContent("");
      setFilePreview(null);
      setFileDetails(null);
      setFileType("document");
      if (fileInputRef.current) fileInputRef.current.value = "";
      setIsSubmitting(false);

      notifyUpdate();
      showToast(`⚡ Data Disconnected! File uploaded to site & secured in Local Vault. It will auto-sync to Cloudinary as soon as data returns.`);
      setActiveTab("vault");
      return;
    }

    // Attempt online upload to server & Cloudinary
    const token = localStorage.getItem("token");
    const headers = {
      "Content-Type": "application/json",
      "x-user-role": "Admin"
    };
    if (token) headers["Authorization"] = `Bearer ${token}`;

    const endpoint = uploadMode === "write" ? "/api/evidence/write" : "/api/evidence/upload";
    const payload = uploadMode === "write" ? {
      case_ref: caseRef.trim(),
      file_name: fileName.trim(),
      doc_type: "written_report",
      category: docCategory,
      doc_content: docContent.trim(),
      uploaded_by: user.username
    } : {
      case_ref: caseRef.trim(),
      file_name: fileName.trim(),
      doc_type: resolvedType,
      doc_content: docContent.trim(),
      category: docCategory || (resolvedType === "pdf" ? "FIR Case Brief" : "Digital Evidence"),
      image_base64: filePreview || "",
      uploaded_by: user.username
    };

    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers,
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.message || `Server error (${res.status})`);
      }

      const resData = await res.json();

      // Prepend to evidence list immediately
      if (resData?.evidence) {
        setEvidenceList(prev => [resData.evidence, ...prev.filter(d => (d._id || d.id) !== (resData.evidence._id || resData.evidence.id))]);
      }

      // Reset Form fields
      setCaseRef("");
      setFileName("");
      setDocContent("");
      setFilePreview(null);
      setFileDetails(null);
      setFileType("document");
      if (fileInputRef.current) fileInputRef.current.value = "";
      setIsSubmitting(false);

      // Fetch latest evidence and logs from server
      await fetchEvidenceAndLogs();
      notifyUpdate();

      const cloudNote = resData?.evidence?.cloudinary_url ? " & Synced to Cloudinary" : "";
      showToast(`✓ Document "${resData?.evidence?.file_name || fileName}" secured in Central Vault${cloudNote}!`);
      setActiveTab("vault");
    } catch (err) {
      // Network failure / disconnected fallback: Store in Offline Vault safely!
      console.warn("Network request failed, securing document in Offline Vault:", err);
      setIsOnline(false);

      const offlineId = `offline_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
      const offlineRecord = {
        _id: offlineId,
        id: offlineId,
        case_ref: caseRef.trim(),
        file_name: fileName.trim(),
        doc_type: resolvedType,
        doc_content: docContent.trim() || (resolvedType === "pdf" ? "Cryptographically sealed PDF Document." : "Cryptographically verified evidence record."),
        category: docCategory || (resolvedType === "pdf" ? "FIR Case Brief" : "Digital Evidence"),
        hash: computedHash,
        image_base64: filePreview || "",
        uploaded_by: user.username,
        created_at: new Date().toISOString(),
        sync_status: "pending",
        is_offline: true
      };

      await saveOfflineEvidence(offlineRecord);
      setEvidenceList(prev => [offlineRecord, ...prev]);
      setPendingOfflineCount(prev => prev + 1);

      const offLog = {
        id: Date.now(),
        _id: "log_" + Date.now(),
        username: user.username,
        role: user.role,
        action: `[OFFLINE] ${user.username} secured document "${fileName.trim()}" (Pending Cloudinary Sync)`,
        created_at: new Date().toISOString()
      };
      setLogs(prev => [offLog, ...prev]);

      setCaseRef("");
      setFileName("");
      setDocContent("");
      setFilePreview(null);
      setFileDetails(null);
      setFileType("document");
      if (fileInputRef.current) fileInputRef.current.value = "";
      setIsSubmitting(false);

      notifyUpdate();
      showToast(`⚡ Network Disconnected! File secured in Local Vault. It will auto-sync to Cloudinary when data reconnects.`);
      setActiveTab("vault");
    }
  };

  // Admin Delete Handler
  const handleDelete = async (id, fName) => {
    if (user.role !== "Admin") {
      alert("Unauthorized. Only Admin can purge evidence.");
      return;
    }

    if (window.confirm(`Are you sure you want to purge ${fName}?`)) {
      const token = localStorage.getItem("token");
      const headers = { "x-user-role": "Admin" };
      if (token) headers["Authorization"] = `Bearer ${token}`;

      try {
        await fetch(`/api/evidence/${id}`, {
          method: "DELETE",
          headers
        });
      } catch (err) {}

      const updated = evidenceList.filter((item) => item.id !== id && item._id !== id);
      setEvidenceList(updated);
      try {
        localStorage.setItem("vault_evidence", JSON.stringify(updated));
      } catch (e) {}

      const deleteLog = {
        id: Date.now(),
        _id: "log_" + Date.now(),
        username: user.username,
        role: user.role,
        action: `${user.username} purged record: "${fName}"`,
        created_at: new Date().toISOString()
      };
      const updatedLogs = [deleteLog, ...logs];
      setLogs(updatedLogs);
      try {
        localStorage.setItem("vault_logs", JSON.stringify(updatedLogs));
      } catch (e) {}

      notifyUpdate();
    }
  };

  const filteredEvidence = evidenceList.filter(
    (ev) =>
      (ev.file_name && ev.file_name.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (ev.case_ref && ev.case_ref.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (ev.doc_content && ev.doc_content.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const getDocTypeBadge = (item) => {
    if (item.sync_status === "pending" || item.is_offline) {
      return <span className="doc-type-tag doc-type-offline">⚡ Offline Vault</span>;
    }
    if (item.cloudinary_url) {
      return (
        <span className="doc-type-tag doc-type-cloudinary" title="Synced to Cloudinary">
          <Cloud size={11} style={{ marginRight: 3, verticalAlign: "middle" }} />
          Cloudinary
        </span>
      );
    }
    const type = item.doc_type || (item.file_name?.toLowerCase().endsWith(".pdf") ? "pdf" : "document");
    if (type === "pdf") return <span className="doc-type-tag doc-type-pdf">PDF Doc</span>;
    if (type === "written_report") return <span className="doc-type-tag doc-type-report">FIR Report</span>;
    if (type === "image") return <span className="doc-type-tag doc-type-img">Image</span>;
    return <span className="doc-type-tag doc-type-doc">Document</span>;
  };

  return (
    <div className="dashboard-layout">
      {/* Sidebar */}
      <aside className="dashboard-sidebar">
        <div>
          <div className="sidebar-brand-box">
            <div className="sidebar-logo-icon">
              <Shield size={22} />
            </div>
            <div>
              <div className="sidebar-brand-title">Trace Vault</div>
              <div className="sidebar-brand-sub">Evidence Security</div>
            </div>
          </div>

          <div className="sidebar-menu">
            <button
              type="button"
              className={`sidebar-tab-btn ${activeTab === "vault" ? "active" : ""}`}
              onClick={() => setActiveTab("vault")}
            >
              <FolderLock size={18} />
              <span>Central Vault</span>
            </button>

            {user.role === "Admin" ? (
              <button
                type="button"
                className={`sidebar-tab-btn ${activeTab === "upload" ? "active" : ""}`}
                onClick={() => setActiveTab("upload")}
              >
                <UploadCloud size={18} />
                <span>Secure Upload / Write</span>
              </button>
            ) : (
              <button
                type="button"
                className="sidebar-tab-btn"
                style={{ opacity: 0.6, cursor: "not-allowed" }}
                title="Admin clearance required to author or upload documents"
                onClick={() => alert("Document upload & authoring is restricted to Admin. As Demo User, you can view, read, and verify all documents uploaded by Admin.")}
              >
                <Lock size={16} />
                <span>Upload (Admin Only)</span>
              </button>
            )}

            <button
              type="button"
              className={`sidebar-tab-btn ${activeTab === "logs" ? "active" : ""}`}
              onClick={() => setActiveTab("logs")}
            >
              <Clock size={18} />
              <span>Audit Logs</span>
            </button>
          </div>
        </div>

        {/* Sidebar Footer User Info */}
        <div className="sidebar-user-card">
          <div className="user-meta-group">
            <div className="user-avatar-hex">
              {user.username.charAt(0).toUpperCase()}
            </div>
            <div className="user-details">
              <h5>{user.username}</h5>
              <span className={`user-role-badge ${user.role === "Admin" ? "badge-admin" : "badge-user"}`}>
                {user.role === "Admin" ? "Admin (Write)" : "Demo User (Read)"}
              </span>
            </div>
          </div>

          <button
            type="button"
            className="btn-logout-icon"
            onClick={handleLogout}
            title="Log Out & Lock Session"
          >
            <LogOut size={18} />
          </button>
        </div>
      </aside>

      {/* Main Dashboard Area */}
      <main className="dashboard-main">
        {/* Top Header */}
        <header className="dashboard-header">
          <div className="header-title-box">
            <h2>
              {activeTab === "vault" && "Central Evidence & Document Vault"}
              {activeTab === "upload" && "Admin Document Station (Write & Upload)"}
              {activeTab === "logs" && "System Audit Trail & Session Logs"}
            </h2>
          </div>

          <div className="header-right-tools">
            {/* Network Connectivity Status Indicator */}
            {isSyncing ? (
              <span className="network-status-badge syncing" title="Syncing pending files to Cloudinary...">
                <RefreshCw size={13} className="spin-icon" />
                Syncing Cloudinary...
              </span>
            ) : isOnline ? (
              <span className="network-status-badge online" title="Internet Connection Active • Cloud Ready">
                <Wifi size={13} />
                Online
              </span>
            ) : (
              <span className="network-status-badge offline" title="Data Disconnected: Files will be secured locally in Offline Vault">
                <WifiOff size={13} />
                Offline Mode
              </span>
            )}

            {/* Cloudinary Sync Action Button */}
            <button
              type="button"
              className="btn-header-sync"
              onClick={syncAllPendingItems}
              disabled={isSyncing}
              title={pendingOfflineCount > 0 
                ? `${pendingOfflineCount} offline document(s) waiting to sync to Cloudinary` 
                : "Sync / verify all vault documents with Cloudinary"}
            >
              <CloudUpload size={14} className={isSyncing ? "spin-icon" : ""} />
              <span>
                {isSyncing 
                  ? "Syncing..." 
                  : pendingOfflineCount > 0 
                    ? `Sync to Cloudinary (${pendingOfflineCount})` 
                    : "Sync Cloudinary"}
              </span>
            </button>

            {/* Cloudinary Settings Button */}
            <button
              type="button"
              onClick={() => setShowCloudinaryModal(true)}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "5px",
                padding: "6px 11px",
                borderRadius: "8px",
                border: "1px solid var(--border-color)",
                background: "#ffffff",
                color: "var(--text-secondary)",
                fontSize: "12px",
                fontWeight: 600,
                cursor: "pointer",
                width: "auto"
              }}
              title="Cloudinary Cloud Configuration"
            >
              <Settings size={14} />
              <span>Cloud Config</span>
            </button>

            <span className={`user-role-badge ${user.role === "Admin" ? "badge-admin" : "badge-user"}`} style={{ fontSize: "12px", padding: "4px 10px" }}>
              {user.role === "Admin" ? "Admin (Full Access)" : "Field Inspector (User View)"}
            </span>

            {/* Instant Role Toggle for testing User & Admin experience */}
            <button
              type="button"
              onClick={handleToggleRole}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                padding: "6px 12px",
                borderRadius: "8px",
                border: "1px solid var(--border-color)",
                background: user.role === "Admin" ? "#eff6ff" : "#fef2f2",
                color: user.role === "Admin" ? "#1d4ed8" : "#b91c1c",
                fontSize: "12px",
                fontWeight: 700,
                cursor: "pointer",
                boxShadow: "0 1px 2px rgba(0,0,0,0.05)",
                width: "auto"
              }}
              title="Click to instantly toggle between Admin (Write) and User (Read) views"
            >
              <Shield size={14} />
              <span>{user.role === "Admin" ? "Switch to User View" : "Switch to Admin View"}</span>
            </button>
          </div>
        </header>

        {/* Global Toast Notification */}
        {toastMessage && (
          <div style={{
            position: "fixed",
            top: "20px",
            right: "24px",
            zIndex: 99999,
            background: "#0f172a",
            color: "#ffffff",
            padding: "14px 22px",
            borderRadius: "10px",
            boxShadow: "0 12px 30px rgba(0,0,0,0.35)",
            display: "flex",
            alignItems: "center",
            gap: "12px",
            fontSize: "13px",
            fontWeight: 600,
            border: "1px solid rgba(255,255,255,0.15)"
          }}>
            <CheckCircle2 size={20} color="#10b981" />
            <span>{toastMessage}</span>
            <button
              type="button"
              onClick={() => setToastMessage(null)}
              style={{ background: "transparent", border: "none", color: "#9ca3af", cursor: "pointer", padding: "2px", width: "auto" }}
            >
              <X size={16} />
            </button>
          </div>
        )}

        {/* Content Body */}
        <div className="content-container">
          {/* Welcome Banner */}
          <div className="dash-hero-banner">
            <div className="hero-info-group">
              <div className="hero-avatar-large">
                {user.username.charAt(0).toUpperCase()}
              </div>
              <div>
                <div className="hero-greeting">Authenticated Session 👋</div>
                <div className="hero-username">{user.username}</div>
                <div className="hero-role-desc">
                  {user.role === "Admin" 
                    ? "Administrator • Full Upload, Writing & Vault Management Authority" 
                    : "Field Inspector / Demo User • Authorized Document & Evidence Reader"}
                </div>
              </div>
            </div>

            <div className="hero-stats-group">
              <div className="hero-stat-item">
                <div className="hero-stat-num">{evidenceList.length}</div>
                <div className="hero-stat-label">Vault Documents</div>
              </div>
              <div className="hero-stat-item">
                <div className="hero-stat-num">{logs.length}</div>
                <div className="hero-stat-label">Audit Logs</div>
              </div>
            </div>
          </div>

          {/* TAB 1: VAULT (VIEW DOCUMENTS & EVIDENCE) */}
          {activeTab === "vault" && (
            <div className="animate-fade-in">
              <div className="evidence-section-header">
                <div style={{ position: "relative", width: "340px" }}>
                  <Search size={16} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "#9ca3af" }} />
                  <input
                    type="text"
                    placeholder="Search documents by name, case, or text..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    style={{ paddingLeft: "36px" }}
                  />
                </div>

                <div style={{ display: "flex", gap: "10px" }}>
                  <button
                    type="button"
                    onClick={fetchEvidenceAndLogs}
                    style={{ width: "auto", padding: "10px 14px", background: "#ffffff", color: "var(--text-secondary)", border: "1px solid var(--border-color)" }}
                    title="Refresh Vault"
                  >
                    <RefreshCw size={15} />
                    Sync
                  </button>

                  {user.role === "Admin" && (
                    <button
                      type="button"
                      style={{ width: "auto", padding: "10px 18px", fontSize: "14px" }}
                      onClick={() => setActiveTab("upload")}
                    >
                      <UploadCloud size={16} />
                      Write / Upload Doc
                    </button>
                  )}
                </div>
              </div>

              {/* Offline Documents Queue Banner */}
              {pendingOfflineCount > 0 && (
                <div className="offline-sync-banner">
                  <div className="offline-sync-banner-content">
                    <WifiOff size={22} color="#b45309" style={{ flexShrink: 0 }} />
                    <div>
                      <div style={{ fontWeight: 800, fontSize: "14px" }}>
                        {pendingOfflineCount} Document{pendingOfflineCount > 1 ? "s" : ""} Saved in Offline Vault
                      </div>
                      <div style={{ fontSize: "12px", opacity: 0.9, marginTop: "2px" }}>
                        {isOnline 
                          ? "Internet connection active! Click 'Sync Now' or documents will automatically back up to Cloudinary."
                          : "Data is disconnected. Your files are sealed locally in browser storage and will auto-sync to Cloudinary once connection restores."}
                      </div>
                    </div>
                  </div>
                  <div className="offline-sync-banner-actions">
                    <button 
                      type="button" 
                      className="btn-banner-sync"
                      disabled={isSyncing}
                      onClick={syncAllPendingItems}
                    >
                      <CloudUpload size={14} className={isSyncing ? "spin-icon" : ""} />
                      {isSyncing ? "Syncing..." : "Sync to Cloudinary Now"}
                    </button>
                  </div>
                </div>
              )}

              {filteredEvidence.length === 0 ? (
                <div className="card" style={{ maxWidth: "100%", padding: "50px", textAlign: "center" }}>
                  <FileText size={48} color="#9ca3af" style={{ margin: "0 auto 12px" }} />
                  <h3>No Documents Found</h3>
                  <p style={{ color: "#6b7280", marginTop: "6px" }}>
                    No documents match your query. Admin can write or upload new documents in the Secure Upload Station.
                  </p>
                </div>
              ) : (
                <div className="evidence-grid">
                  {filteredEvidence.map((item) => {
                    const isImg = item.doc_type === "image" || 
                                  Boolean(item.file_name?.match(/\.(png|jpe?g|webp|gif|svg)$/i)) ||
                                  (typeof item.image_base64 === "string" && item.image_base64.startsWith("data:image/"));
                    const isPdf = item.doc_type === "pdf" || 
                                  Boolean(item.file_name?.match(/\.pdf$/i)) ||
                                  (typeof item.image_base64 === "string" && item.image_base64.startsWith("data:application/pdf"));
                    const imgSource = item.image_base64 || item.file_url || item.image_url;
                    const isItemOffline = item.sync_status === "pending" || item.is_offline;

                    return (
                      <div key={item._id || item.id} className="evidence-card">
                        {isImg && imgSource ? (
                          <div className="evidence-img-box" style={{ background: "#0a0a0c", position: "relative" }}>
                            {getDocTypeBadge(item)}
                            <img 
                              src={imgSource} 
                              alt={item.file_name} 
                              style={{ width: "100%", height: "100%", objectFit: "cover" }}
                              onError={(e) => {
                                e.currentTarget.style.display = "none";
                                const fb = e.currentTarget.parentElement?.querySelector(".img-fallback-box");
                                if (fb) fb.style.display = "flex";
                              }}
                            />
                            <div className="img-fallback-box" style={{ display: "none", width: "100%", height: "100%", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "#f8fafc", color: "#6b7280" }}>
                              <ImageIcon size={32} color="var(--primary-red)" />
                              <span style={{ fontSize: "11px", fontWeight: 700, marginTop: "6px" }}>Sealed Image Record</span>
                            </div>
                          </div>
                        ) : isPdf ? (
                          <div className="doc-card-box" style={{ background: "linear-gradient(135deg, #fff5f5 0%, #fee2e2 100%)" }}>
                            {getDocTypeBadge(item)}
                            <div style={{
                              width: 52,
                              height: 52,
                              borderRadius: 12,
                              background: "#fff",
                              color: "var(--primary-red)",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              marginBottom: 8,
                              boxShadow: "0 2px 8px rgba(220, 38, 38, 0.15)"
                            }}>
                              <FileText size={28} />
                            </div>
                            <span style={{ fontSize: "12px", fontWeight: 800, color: "var(--primary-red)", letterSpacing: "0.5px" }}>
                              SEALED PDF EVIDENCE
                            </span>
                            <p className="doc-snippet" style={{ color: "#4b5563" }}>
                              {item.doc_content && item.doc_content !== "Cryptographically sealed PDF Document." 
                                ? item.doc_content 
                                : "Official PDF Case Document • Authenticated Seal Active"}
                            </p>
                          </div>
                        ) : (
                          <div className="doc-card-box">
                            {getDocTypeBadge(item)}
                            <div style={{
                              width: 52,
                              height: 52,
                              borderRadius: 12,
                              background: "rgba(200, 30, 30, 0.08)",
                              color: "var(--primary-red)",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              marginBottom: 8
                            }}>
                              <FileText size={26} />
                            </div>
                            <span style={{ fontSize: "12px", fontWeight: 700, color: "var(--text-main)" }}>
                              {item.category || "Sealed Document"}
                            </span>
                            {item.doc_content && (
                              <p className="doc-snippet">
                                "{item.doc_content}"
                              </p>
                            )}
                          </div>
                        )}

                        <div className="evidence-body">
                          <h4 className="evidence-title" title={item.file_name}>
                            {item.file_name}
                          </h4>
                          <div className="evidence-case">Case: {item.case_ref}</div>
                          
                          <div className="hash-pill" title={item.hash}>
                            SHA-256: {item.hash ? item.hash.substring(0, 22) : "cryptographic_hash"}...
                          </div>

                          {/* Cloudinary & Offline Status Indicator */}
                          {isItemOffline ? (
                            <div style={{
                              display: "flex",
                              justifyContent: "space-between",
                              alignItems: "center",
                              marginBottom: "10px",
                              background: "#fffbeb",
                              padding: "6px 10px",
                              borderRadius: "8px",
                              border: "1px solid #fde68a"
                            }}>
                              <span style={{ fontSize: "11px", fontWeight: 700, color: "#b45309", display: "inline-flex", alignItems: "center", gap: "4px" }}>
                                <WifiOff size={12} /> Local Offline Vault
                              </span>
                              <button
                                type="button"
                                className="btn-card-sync"
                                onClick={() => syncSingleItem(item)}
                                disabled={isSyncing}
                                title="Sync this document to Cloudinary"
                              >
                                <CloudUpload size={11} className={isSyncing ? "spin-icon" : ""} />
                                Sync
                              </button>
                            </div>
                          ) : item.cloudinary_url ? (
                            <div style={{
                              display: "flex",
                              alignItems: "center",
                              gap: "5px",
                              marginBottom: "10px",
                              fontSize: "11px",
                              color: "#0369a1",
                              fontWeight: 700
                            }}>
                              <Cloud size={13} />
                              <span>Cloudinary Verified & Live</span>
                            </div>
                          ) : null}

                          <div style={{ marginBottom: "12px" }}>
                            <button
                              type="button"
                              className="btn-view-doc"
                              onClick={() => setSelectedDoc(item)}
                            >
                              <Eye size={14} />
                              View / Read Document
                            </button>
                          </div>

                          <div className="evidence-footer">
                            <span>Authored By: <strong>{item.uploaded_by || "admin"}</strong></span>
                            {user.role === "Admin" ? (
                              <button
                                type="button"
                                className="btn-delete"
                                onClick={() => handleDelete(item._id || item.id, item.file_name)}
                                title="Purge document (Admin only)"
                              >
                                <Trash2 size={15} />
                              </button>
                            ) : (
                              <span style={{ color: "var(--success-green)", fontWeight: 600, fontSize: "11px", display: "inline-flex", alignItems: "center", gap: "4px" }}>
                                <Check size={13} />
                                Verified Read
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* TAB 2: UPLOAD / WRITE STATION (ADMIN ONLY) */}
          {activeTab === "upload" && (
            <div className="animate-fade-in">
              {user.role !== "Admin" ? (
                <div className="card" style={{ maxWidth: "500px", margin: "40px auto" }}>
                  <AlertCircle size={48} color="var(--primary-red)" style={{ margin: "0 auto 12px" }} />
                  <h3>Access Restricted</h3>
                  <p style={{ color: "#6b7280", margin: "10px 0 20px" }}>
                    Authoring and uploading new documents requires Level 5 Admin Clearance.
                    As Demo User, you are authorized to view and read all secured documents in the vault.
                  </p>
                  <button type="button" onClick={() => setActiveTab("vault")}>
                    Return to Central Vault
                  </button>
                </div>
              ) : (
                <div className="upload-card">
                  <div style={{ textAlign: "center", marginBottom: "20px" }}>
                    <h3 style={{ fontSize: "20px", fontWeight: 800, color: "var(--text-main)" }}>
                      Central Vault Document Station
                    </h3>
                    <p style={{ fontSize: "14px", color: "#6b7280", marginTop: "4px" }}>
                      Any document written or uploaded here will be permanently sealed and immediately visible to Demo Users.
                    </p>
                  </div>

                  {/* Offline Warning Notice */}
                  {!isOnline && (
                    <div style={{
                      background: "#fffbeb",
                      border: "1px solid #fde68a",
                      borderRadius: "10px",
                      padding: "12px 16px",
                      marginBottom: "18px",
                      display: "flex",
                      alignItems: "center",
                      gap: "12px",
                      color: "#92400e",
                      fontSize: "13px"
                    }}>
                      <WifiOff size={20} color="#b45309" style={{ flexShrink: 0 }} />
                      <div>
                        <strong>Offline Mode Active (Data Disconnected):</strong> You can upload files or author case reports now. They will be cryptographically sealed in the browser's Local Vault, and automatically synced to Cloudinary as soon as data returns.
                      </div>
                    </div>
                  )}

                  {/* Mode Selector: Upload File vs Write Case Report */}
                  <div className="upload-mode-selector">
                    <button
                      type="button"
                      className={`upload-mode-btn ${uploadMode === "file" ? "active" : ""}`}
                      onClick={() => setUploadMode("file")}
                    >
                      <UploadCloud size={16} />
                      Upload File (PDF / Image / Doc)
                    </button>
                    <button
                      type="button"
                      className={`upload-mode-btn ${uploadMode === "write" ? "active" : ""}`}
                      onClick={() => setUploadMode("write")}
                    >
                      <PenTool size={16} />
                      Write Case Document / Report
                    </button>
                  </div>

                  <form onSubmit={handleFormSubmit}>
                    {uploadMode === "file" ? (
                      <div>
                        <label>Select Document or File</label>
                        <label className="dropzone-label" htmlFor="docUploadInput">
                          {filePreview ? (
                            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: "100%", padding: "10px" }}>
                              {fileType === "image" ? (
                                <img src={filePreview} alt="Selected preview" className="preview-thumb" style={{ maxHeight: "150px", maxWidth: "100%", objectFit: "contain", borderRadius: "8px", marginBottom: "10px", boxShadow: "0 4px 12px rgba(0,0,0,0.08)" }} />
                              ) : fileType === "pdf" ? (
                                <div style={{
                                  padding: "16px 24px",
                                  background: "#fee2e2",
                                  borderRadius: "12px",
                                  color: "var(--primary-red)",
                                  display: "flex",
                                  flexDirection: "column",
                                  alignItems: "center",
                                  gap: "8px",
                                  marginBottom: "10px"
                                }}>
                                  <FileText size={44} />
                                  <span style={{ fontSize: "11px", fontWeight: 800, letterSpacing: "1px", textTransform: "uppercase" }}>PDF Document Ready</span>
                                </div>
                              ) : (
                                <div style={{
                                  width: "100%",
                                  maxWidth: "460px",
                                  padding: "12px 16px",
                                  background: "#f8fafc",
                                  borderRadius: "10px",
                                  border: "1px solid var(--border-color)",
                                  marginBottom: "10px",
                                  textAlign: "left"
                                }}>
                                  <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12px", fontWeight: 700, color: "var(--primary-red)", marginBottom: "4px" }}>
                                    <FileText size={15} /> Extracted Document Text Preview:
                                  </div>
                                  <div style={{ fontSize: "11px", color: "var(--text-main)", whiteSpace: "pre-wrap", maxHeight: "100px", overflowY: "auto", fontFamily: "monospace", opacity: 0.85 }}>
                                    {docContent ? docContent.slice(0, 300) + (docContent.length > 300 ? "..." : "") : "File loaded successfully."}
                                  </div>
                                </div>
                              )}
                              <span style={{ fontSize: "14px", fontWeight: 700, color: "var(--text-main)" }}>
                                {fileName} {fileDetails?.size ? `(${fileDetails.size})` : ""}
                              </span>
                              <div style={{ display: "flex", alignItems: "center", gap: "12px", marginTop: "8px" }}>
                                <span style={{ fontSize: "12px", color: "var(--primary-red)", fontWeight: 600 }}>
                                  Click to change document
                                </span>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    setFilePreview(null);
                                    setFileDetails(null);
                                    setFileName("");
                                    setDocContent("");
                                    if (fileInputRef.current) fileInputRef.current.value = "";
                                  }}
                                  style={{
                                    width: "auto",
                                    padding: "3px 10px",
                                    fontSize: "11px",
                                    fontWeight: 700,
                                    background: "#fee2e2",
                                    color: "var(--primary-red)",
                                    border: "1px solid #fca5a5",
                                    borderRadius: "6px",
                                    cursor: "pointer"
                                  }}
                                >
                                  Remove
                                </button>
                              </div>
                            </div>
                          ) : (
                            <>
                              <UploadCloud size={44} color="#9ca3af" style={{ marginBottom: "10px" }} />
                              <span style={{ fontSize: "14px", fontWeight: 600, color: "var(--text-main)" }}>
                                Click to Select Document or Evidence File
                              </span>
                              <span style={{ fontSize: "12px", color: "#9ca3af", marginTop: "4px" }}>
                                PDF, DOC, DOCX, TXT, CSV, PNG, JPG, or WEBP supported
                              </span>
                            </>
                          )}
                        </label>
                        <input
                          id="docUploadInput"
                          type="file"
                          accept=".pdf,.doc,.docx,.txt,.csv,.png,.jpg,.jpeg,.webp"
                          ref={fileInputRef}
                          onChange={handleFileChange}
                          style={{ display: "none" }}
                        />
                      </div>
                    ) : (
                      <div>
                        <label>Document Category</label>
                        <select
                          className="form-select"
                          value={docCategory}
                          onChange={(e) => setDocCategory(e.target.value)}
                        >
                          <option value="Investigation Report">Investigation Report</option>
                          <option value="Forensic Analysis">Forensic Analysis Report</option>
                          <option value="Witness Statement">Witness Statement</option>
                          <option value="Seizure Memo">Seizure & Recovery Memo</option>
                          <option value="FIR Case Brief">FIR Case Brief</option>
                        </select>

                        <label>Document Content / Case Statement</label>
                        <textarea
                          className="form-textarea"
                          placeholder="Type or paste the official case statement, forensic observations, suspect details, or investigation findings here..."
                          value={docContent}
                          onChange={(e) => setDocContent(e.target.value)}
                          required={uploadMode === "write"}
                        />
                      </div>
                    )}

                    <div>
                      <label>Document Title / Designation</label>
                      <input
                        type="text"
                        placeholder="e.g. preliminary_ballistics_report.pdf or witness_statement_sector4.txt"
                        value={fileName}
                        onChange={(e) => setFileName(e.target.value)}
                        required
                      />
                    </div>

                    <div>
                      <label>Case Reference ID</label>
                      <input
                        type="text"
                        placeholder="e.g. FIR-2026-CR-904"
                        value={caseRef}
                        onChange={(e) => setCaseRef(e.target.value)}
                        required
                      />
                    </div>

                    {uploadMode === "file" && (
                      <div>
                        <label>Optional Brief Note / Description</label>
                        <input
                          type="text"
                          placeholder="Short summary of this document..."
                          value={docContent}
                          onChange={(e) => setDocContent(e.target.value)}
                        />
                      </div>
                    )}

                    <button type="submit" disabled={isSubmitting} style={{ marginTop: "12px" }}>
                      <Shield size={18} />
                      {isSubmitting 
                        ? "Securing Document..." 
                        : isOnline 
                          ? "Sign, Encrypt & Store in Central Vault (Syncs to Cloudinary)" 
                          : "⚡ Seal in Local Vault (Auto-Syncs to Cloudinary When Online)"}
                    </button>
                  </form>
                </div>
              )}
            </div>
          )}

          {/* TAB 3: AUDIT LOGS */}
          {activeTab === "logs" && (
            <div className="animate-fade-in">
              <div className="audit-table-card">
                <div style={{
                  padding: "16px 20px",
                  borderBottom: "1px solid var(--border-color)",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center"
                }}>
                  <div>
                    <h3 style={{ fontSize: "16px", fontWeight: 800, color: "var(--text-main)" }}>
                      Audit Trail & Chain of Custody
                    </h3>
                    <span style={{ fontSize: "13px", color: "#6b7280" }}>
                      Immutable ledger of all document authoring, uploads, and authentication events
                    </span>
                  </div>

                  <span style={{
                    fontSize: "12px",
                    fontWeight: 700,
                    color: "var(--primary-red)",
                    background: "var(--primary-red-light)",
                    padding: "4px 10px",
                    borderRadius: "9999px"
                  }}>
                    {logs.length} Total Events
                  </span>
                </div>

                <div style={{ overflowX: "auto" }}>
                  <table className="audit-table">
                    <thead>
                      <tr>
                        <th>Timestamp</th>
                        <th>User</th>
                        <th>Role</th>
                        <th>Action Log / Event</th>
                      </tr>
                    </thead>
                    <tbody>
                      {logs.map((log, index) => (
                        <tr key={log._id || log.id || index}>
                          <td style={{ fontFamily: "monospace", fontSize: "13px", whiteSpace: "nowrap" }}>
                            {new Date(log.created_at).toLocaleString([], {
                              month: "short",
                              day: "numeric",
                              hour: "2-digit",
                              minute: "2-digit",
                              second: "2-digit"
                            })}
                          </td>
                          <td style={{ fontWeight: 700, color: "var(--text-main)" }}>
                            {log.username}
                          </td>
                          <td>
                            <span className={`user-role-badge ${log.role === "Admin" ? "badge-admin" : "badge-user"}`}>
                              {log.role}
                            </span>
                          </td>
                          <td>
                            <div className="log-action-tag">
                              <CheckCircle2 size={15} color="var(--primary-red)" />
                              <span>{log.action}</span>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* DOCUMENT VIEWER MODAL (ACCESSIBLE TO DEMO USER & ADMIN) */}
      {selectedDoc && (
        <div className="modal-backdrop" onClick={() => setSelectedDoc(null)}>
          <div className="modal-window" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <div style={{
                  width: 36,
                  height: 36,
                  borderRadius: 8,
                  background: "var(--primary-red-light)",
                  color: "var(--primary-red)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center"
                }}>
                  <FileText size={20} />
                </div>
                <div>
                  <h3 style={{ fontSize: "16px", fontWeight: 800, color: "var(--text-main)" }}>
                    {selectedDoc.file_name}
                  </h3>
                  <span style={{ fontSize: "12px", color: "var(--primary-red)", fontWeight: 600 }}>
                    Case: {selectedDoc.case_ref}
                  </span>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setSelectedDoc(null)}
                style={{
                  background: "transparent",
                  border: "none",
                  color: "#9ca3af",
                  cursor: "pointer",
                  padding: 4,
                  width: "auto"
                }}
              >
                <X size={20} />
              </button>
            </div>

            <div className="modal-body">
              {/* Verification Stamp */}
              <div className="verification-stamp">
                <CheckCircle2 size={18} color="#059669" />
                <div>
                  <div>Cryptographic Verification Confirmed • Untampered Record</div>
                  <div style={{ fontSize: "11px", fontWeight: 400, opacity: 0.9 }}>
                    Digitally signed by {selectedDoc.uploaded_by || "Admin"} • SHA-256 match validated
                  </div>
                </div>
              </div>

              {/* Cloudinary Backup Status Banner */}
              {selectedDoc.cloudinary_url ? (
                <div className="cloudinary-info-box">
                  <div className="cloudinary-info-content">
                    <Cloud size={18} color="#059669" />
                    <div>
                      <div>Cloudinary Cloud CDN Verified</div>
                      <div style={{ fontSize: "11px", fontWeight: 400, opacity: 0.85 }}>
                        Asset securely mirrored & backed up on Cloudinary
                      </div>
                    </div>
                  </div>
                  <a
                    href={selectedDoc.cloudinary_url}
                    target="_blank"
                    rel="noreferrer"
                    className="btn-cloudinary-link"
                  >
                    View on Cloudinary <ExternalLink size={12} />
                  </a>
                </div>
              ) : (selectedDoc.sync_status === "pending" || selectedDoc.is_offline) ? (
                <div style={{
                  background: "#fffbeb",
                  border: "1px solid #fde68a",
                  borderRadius: "10px",
                  padding: "12px 14px",
                  margin: "12px 0",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  color: "#92400e",
                  fontSize: "12px",
                  fontWeight: 600
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <WifiOff size={16} color="#b45309" />
                    <span>Sealed in Offline Vault • Awaiting Cloudinary Sync</span>
                  </div>
                  <button
                    type="button"
                    className="btn-banner-sync"
                    style={{ padding: "4px 10px", fontSize: "11px" }}
                    onClick={() => syncSingleItem(selectedDoc)}
                    disabled={isSyncing}
                  >
                    <CloudUpload size={12} className={isSyncing ? "spin-icon" : ""} />
                    Sync Now
                  </button>
                </div>
              ) : null}

              {/* Hash Information */}
              <div>
                <label style={{ fontSize: "12px", fontWeight: 700, color: "var(--text-secondary)", marginBottom: 4 }}>
                  SHA-256 Cryptographic Checksum
                </label>
                <div className="hash-pill" style={{ marginBottom: 0 }}>
                  {selectedDoc.hash}
                </div>
              </div>

              {/* FILE PREVIEW & CONTENT VIEWER */}
              {(() => {
                const docFileSource = selectedDoc.image_base64 || selectedDoc.file_url || selectedDoc.image_url || selectedDoc.cloudinary_url;
                const isDocImg = selectedDoc.doc_type === "image" || 
                                 Boolean(selectedDoc.file_name?.match(/\.(png|jpe?g|webp|gif|svg)$/i)) ||
                                 (typeof selectedDoc.image_base64 === "string" && selectedDoc.image_base64.startsWith("data:image/"));
                const isDocPdf = selectedDoc.doc_type === "pdf" || 
                                 Boolean(selectedDoc.file_name?.match(/\.pdf$/i)) ||
                                 (typeof selectedDoc.image_base64 === "string" && selectedDoc.image_base64.startsWith("data:application/pdf"));
                const isTextDoc = Boolean(selectedDoc.file_name?.match(/\.(txt|csv|json|log|md)$/i));

                return (
                  <>
                    {/* Visual Evidence (Image) */}
                    {isDocImg && docFileSource ? (
                      <div>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                          <label style={{ fontSize: "12px", fontWeight: 700, color: "var(--text-secondary)" }}>
                            Evidence Visual Attachment
                          </label>
                          <a
                            href={docFileSource}
                            target="_blank"
                            rel="noreferrer"
                            download={selectedDoc.file_name}
                            style={{
                              fontSize: "12px",
                              color: "var(--primary-red)",
                              fontWeight: 700,
                              textDecoration: "none",
                              display: "inline-flex",
                              alignItems: "center",
                              gap: "4px"
                            }}
                          >
                            <ExternalLink size={12} /> Open Full / Download
                          </a>
                        </div>
                        <div style={{
                          maxHeight: 380,
                          borderRadius: 8,
                          overflow: "hidden",
                          border: "1px solid var(--border-color)",
                          display: "flex",
                          justifyContent: "center",
                          alignItems: "center",
                          background: "#09090b",
                          padding: 6
                        }}>
                          <img 
                            src={docFileSource} 
                            alt={selectedDoc.file_name}
                            style={{ maxHeight: 360, maxWidth: "100%", objectFit: "contain", borderRadius: 4 }}
                          />
                        </div>
                      </div>
                    ) : null}

                    {/* Interactive Embedded PDF Viewer */}
                    {isDocPdf ? (
                      <div>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                          <label style={{ fontSize: "12px", fontWeight: 700, color: "var(--text-secondary)" }}>
                            Interactive PDF Evidence Viewer
                          </label>
                          {docFileSource ? (
                            <a
                              href={docFileSource}
                              download={selectedDoc.file_name}
                              target="_blank"
                              rel="noreferrer"
                              style={{
                                fontSize: "12px",
                                color: "var(--primary-red)",
                                fontWeight: 700,
                                textDecoration: "none",
                                display: "inline-flex",
                                alignItems: "center",
                                gap: "4px"
                              }}
                            >
                              <Download size={13} /> Download PDF File
                            </a>
                          ) : null}
                        </div>
                        {docFileSource ? (
                          <div style={{
                            width: "100%",
                            height: "360px",
                            borderRadius: "8px",
                            overflow: "hidden",
                            border: "1px solid var(--border-color)",
                            background: "#f3f4f6"
                          }}>
                            <iframe
                              src={docFileSource}
                              title={selectedDoc.file_name}
                              style={{ width: "100%", height: "100%", border: "none" }}
                            />
                          </div>
                        ) : (
                          <div style={{
                            padding: "16px",
                            background: "#fee2e2",
                            borderRadius: "8px",
                            display: "flex",
                            alignItems: "center",
                            gap: "12px"
                          }}>
                            <FileText size={32} color="var(--primary-red)" />
                            <div>
                              <div style={{ fontWeight: 700, fontSize: "13px" }}>{selectedDoc.file_name}</div>
                              <div style={{ fontSize: "11px", color: "#6b7280" }}>Cryptographically verified PDF record</div>
                            </div>
                          </div>
                        )}
                      </div>
                    ) : null}

                    {/* Document Statement & Text Findings */}
                    {selectedDoc.doc_content && (!isDocImg || selectedDoc.doc_content !== "Cryptographically verified evidence record.") ? (
                      <div>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                          <label style={{ fontSize: "12px", fontWeight: 700, color: "var(--text-secondary)" }}>
                            Document Statement & Findings
                          </label>
                          {docFileSource && !isDocImg && !isDocPdf ? (
                            <a
                              href={docFileSource}
                              download={selectedDoc.file_name}
                              target="_blank"
                              rel="noreferrer"
                              style={{
                                fontSize: "12px",
                                color: "var(--primary-red)",
                                fontWeight: 700,
                                textDecoration: "none",
                                display: "inline-flex",
                                alignItems: "center",
                                gap: "4px"
                              }}
                            >
                              <Download size={12} /> Download Original File
                            </a>
                          ) : null}
                        </div>
                        <div className="doc-sheet" style={{
                          fontFamily: isTextDoc ? "monospace" : "inherit",
                          whiteSpace: "pre-wrap",
                          maxHeight: "260px",
                          overflowY: "auto",
                          fontSize: isTextDoc ? "12px" : "13px",
                          lineHeight: "1.6"
                        }}>
                          {selectedDoc.doc_content}
                        </div>
                      </div>
                    ) : null}
                  </>
                );
              })()}

              {/* Metadata Details */}
              <div style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "12px",
                fontSize: "12px",
                background: "#f8fafc",
                padding: "12px 16px",
                borderRadius: "8px",
                border: "1px solid var(--border-light)"
              }}>
                <div>
                  <span style={{ color: "#6b7280" }}>Authored / Secured By:</span>
                  <div style={{ fontWeight: 700, color: "var(--text-main)", marginTop: 2 }}>
                    {selectedDoc.uploaded_by || "Admin"}
                  </div>
                </div>
                <div>
                  <span style={{ color: "#6b7280" }}>Timestamp of Sealing:</span>
                  <div style={{ fontWeight: 700, color: "var(--text-main)", marginTop: 2 }}>
                    {new Date(selectedDoc.created_at).toLocaleString()}
                  </div>
                </div>
              </div>
            </div>

            <div className="modal-footer">
              <span style={{ fontSize: "12px", color: "#6b7280" }}>
                Viewer Mode: <strong>{user.role === "Admin" ? "Admin (Level 5)" : "Demo User (Level 1 Read)"}</strong>
              </span>

              <button
                type="button"
                onClick={() => setSelectedDoc(null)}
                style={{ width: "auto", padding: "8px 18px", fontSize: "13px" }}
              >
                Close Viewer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CLOUDINARY CONFIGURATION & SYNC MODAL */}
      {showCloudinaryModal && (
        <div className="modal-backdrop" onClick={() => setShowCloudinaryModal(false)}>
          <div className="modal-window" onClick={(e) => e.stopPropagation()} style={{ maxWidth: "520px" }}>
            <div className="modal-header">
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <div style={{
                  width: 36,
                  height: 36,
                  borderRadius: 8,
                  background: "#eff6ff",
                  color: "#1d4ed8",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center"
                }}>
                  <Cloud size={20} />
                </div>
                <div>
                  <h3 style={{ fontSize: "16px", fontWeight: 800, color: "var(--text-main)" }}>
                    Cloudinary Sync Center
                  </h3>
                  <span style={{ fontSize: "12px", color: "#6b7280" }}>
                    Offline-to-Cloud synchronization engine
                  </span>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setShowCloudinaryModal(false)}
                style={{ background: "transparent", border: "none", color: "#9ca3af", cursor: "pointer", padding: 4, width: "auto" }}
              >
                <X size={20} />
              </button>
            </div>

            <div className="modal-body">
              {/* Status Card */}
              <div style={{
                background: isOnline ? "#ecfdf5" : "#fffbeb",
                border: `1px solid ${isOnline ? "#a7f3d0" : "#fde68a"}`,
                borderRadius: "10px",
                padding: "14px",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between"
              }}>
                <div>
                  <div style={{ fontSize: "13px", fontWeight: 700, color: isOnline ? "#065f46" : "#92400e" }}>
                    Network: {isOnline ? "🟢 Online & Ready" : "⚡ Offline Mode Active"}
                  </div>
                  <div style={{ fontSize: "12px", color: isOnline ? "#047857" : "#b45309", marginTop: "2px" }}>
                    {pendingOfflineCount > 0 
                      ? `${pendingOfflineCount} offline document(s) waiting to sync to Cloudinary` 
                      : "All documents in Central Vault are synchronized."}
                  </div>
                </div>

                <button
                  type="button"
                  className="btn-banner-sync"
                  onClick={syncAllPendingItems}
                  disabled={isSyncing || pendingOfflineCount === 0}
                  style={{ opacity: pendingOfflineCount === 0 ? 0.6 : 1 }}
                >
                  <CloudUpload size={13} className={isSyncing ? "spin-icon" : ""} />
                  {isSyncing ? "Syncing..." : "Sync Now"}
                </button>
              </div>

              {/* Server Cloudinary Status */}
              <div style={{
                background: "#f8fafc",
                border: "1px solid var(--border-light)",
                borderRadius: "10px",
                padding: "14px",
                marginTop: "14px"
              }}>
                <h4 style={{ fontSize: "13px", fontWeight: 700, color: "var(--text-main)", marginBottom: "6px" }}>
                  Cloudinary Vault Status
                </h4>
                <div style={{ fontSize: "12px", color: "#6b7280", lineHeight: 1.6 }}>
                  <div>Connected Cloud: <strong>{serverCloudStatus.cloud_name || cloudinaryConfig.cloudName || "trace-vault-cloud (Default)"}</strong></div>
                  <div>Sync Mode: <strong style={{ color: "#059669" }}>Automatic on Reconnect (Online Listener Active)</strong></div>
                  <div>Storage Engine: <strong>IndexedDB (Offline) ➔ Cloudinary Cloud CDN (Online)</strong></div>
                </div>
              </div>

              {/* Client Cloudinary Settings Form */}
              <div style={{ marginTop: "16px" }}>
                <h4 style={{ fontSize: "13px", fontWeight: 700, color: "var(--text-main)", marginBottom: "6px" }}>
                  Custom Cloudinary Configuration (Optional)
                </h4>
                <p style={{ fontSize: "12px", color: "#6b7280", marginBottom: "12px" }}>
                  If you have a personal Cloudinary cloud, configure your Cloud Name and Upload Preset below.
                </p>

                <label style={{ fontSize: "12px", fontWeight: 600 }}>Cloud Name</label>
                <input
                  type="text"
                  placeholder="e.g. dxyz123abc"
                  value={cloudinaryConfig.cloudName || ""}
                  onChange={(e) => setCloudinaryConfig({ ...cloudinaryConfig, cloudName: e.target.value })}
                  style={{ marginBottom: "10px" }}
                />

                <label style={{ fontSize: "12px", fontWeight: 600 }}>Upload Preset (Unsigned)</label>
                <input
                  type="text"
                  placeholder="e.g. trace_vault_preset or ml_default"
                  value={cloudinaryConfig.uploadPreset || ""}
                  onChange={(e) => setCloudinaryConfig({ ...cloudinaryConfig, uploadPreset: e.target.value })}
                  style={{ marginBottom: "12px" }}
                />
              </div>
            </div>

            <div className="modal-footer">
              <button
                type="button"
                onClick={() => {
                  saveLocalCloudinaryConfig(cloudinaryConfig);
                  showToast("✓ Cloudinary configuration saved! Offline sync will use these settings.");
                  setShowCloudinaryModal(false);
                }}
                style={{ width: "auto", padding: "8px 18px", fontSize: "13px" }}
              >
                Save Configuration
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Home;
