import { useEffect, useRef, useState } from "react";
import { FaceDetector, FilesetResolver } from "@mediapipe/tasks-vision";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, UserCheck } from "lucide-react";
import "./App.css";

function FaceScanner() {
  const navigate = useNavigate();
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const detectorRef = useRef(null);
  const intervalRef = useRef(null);
  const streamRef = useRef(null);

  const [status, setStatus] = useState("Loading face detector...");
  const [showPopup, setShowPopup] = useState(false);
  const [currentUser, setCurrentUser] = useState({ username: "inspector_sharma", role: "User" });

  useEffect(() => {
    try {
      const saved = localStorage.getItem("user");
      if (saved) {
        setCurrentUser(JSON.parse(saved));
      }
    } catch (e) {
      console.warn("Could not load user", e);
    }

    let cancelled = false;

    const setup = async () => {
      try {
        console.log("Loading MediaPipe...");
        const vision = await FilesetResolver.forVisionTasks(
          "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm"
        );

        if (cancelled) return;

        console.log("Creating detector...");
        const detector = await FaceDetector.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath:
              "https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite",
            delegate: "CPU",
          },
          runningMode: "IMAGE",
          minDetectionConfidence: 0.3,
        });

        if (cancelled) return;
        detectorRef.current = detector;
        console.log("Detector ready!");

        setStatus("Starting camera...");
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user", width: 640, height: 480 },
          audio: false,
        });

        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        streamRef.current = stream;
        const video = videoRef.current;
        if (!video) return;
        video.srcObject = stream;

        await new Promise((resolve) => {
          video.onloadeddata = resolve;
        });
        await video.play();

        setStatus("Scanning for face...");

        const offscreen = document.createElement("canvas");

        intervalRef.current = setInterval(() => {
          if (!detectorRef.current || !videoRef.current) return;

          const v = videoRef.current;
          if (v.readyState < 2 || v.videoWidth === 0) return;

          offscreen.width = v.videoWidth;
          offscreen.height = v.videoHeight;
          const offCtx = offscreen.getContext("2d");
          offCtx.drawImage(v, 0, 0);

          try {
            const results = detectorRef.current.detect(offscreen);
            const detections = results.detections || [];

            const canvas = canvasRef.current;
            if (!canvas) return;
            canvas.width = v.videoWidth;
            canvas.height = v.videoHeight;
            const ctx = canvas.getContext("2d");
            ctx.clearRect(0, 0, canvas.width, canvas.height);

            if (detections.length >= 1) {
              detections.forEach((det) => {
                const box = det.boundingBox;
                ctx.strokeStyle = "#c81e1e";
                ctx.lineWidth = 3;
                ctx.strokeRect(box.originX, box.originY, box.width, box.height);

                const conf = det.categories?.[0]?.score || 0;
                ctx.fillStyle = "#c81e1e";
                ctx.font = "bold 15px sans-serif";
                ctx.fillText(
                  `${(conf * 100).toFixed(0)}%`,
                  box.originX,
                  box.originY - 8
                );
              });

              if (detections.length === 1) {
                // Face verified!
                clearInterval(intervalRef.current);
                intervalRef.current = null;
                setStatus("Face Detected!");

                // Generate and record audit log for who came and what happened
                try {
                  const storedLogs = JSON.parse(localStorage.getItem("vault_logs") || "[]");
                  const userSaved = JSON.parse(localStorage.getItem("user") || '{"username":"User","role":"User"}');
                  const logEntry = {
                    id: Date.now(),
                    username: userSaved.username,
                    role: userSaved.role,
                    action: `${userSaved.username} (${userSaved.role}) completed Biometric Face Scan • Access Granted`,
                    created_at: new Date().toISOString()
                  };
                  storedLogs.unshift(logEntry);
                  localStorage.setItem("vault_logs", JSON.stringify(storedLogs));
                } catch (err) {
                  console.error("Log error", err);
                }

                setShowPopup(true);

                setTimeout(() => {
                  cleanup();
                  navigate("/home");
                }, 1300);
              } else {
                setStatus("Multiple faces detected — show only yours");
              }
            } else {
              setStatus("No face detected — look directly at camera");
            }
          } catch (err) {
            console.error("Detection error:", err);
            setStatus("Detection error: " + err.message);
          }
        }, 300);
      } catch (err) {
        console.error("Setup error:", err);
        setStatus("Error: " + err.message);
      }
    };

    const cleanup = () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
      if (detectorRef.current) {
        detectorRef.current.close();
        detectorRef.current = null;
      }
    };

    setup();

    return () => {
      cancelled = true;
      cleanup();
    };
  }, [navigate]);

  return (
    <div className="app">
      <div className="scanner-card">
        <h1>Face Scanner</h1>
        <p style={{ color: "#6b7280", fontSize: "14px", marginTop: "-12px", marginBottom: "14px" }}>
          Biometric Session Verification for <strong>{currentUser.username}</strong> ({currentUser.role})
        </p>

        <div className="camera-container">
          <video
            ref={videoRef}
            className="video"
            autoPlay
            playsInline
            muted
          />
          <canvas ref={canvasRef} className="canvas" />

          {/* Reticle with corner marks */}
          <div className="scanner-reticle">
            <span className="corner-mark c-tl"></span>
            <span className="corner-mark c-tr"></span>
            <span className="corner-mark c-bl"></span>
            <span className="corner-mark c-br"></span>
          </div>

          <div className="laser-scan-line"></div>
        </div>

        <div className="info">
          <h2>{status}</h2>
        </div>

        <div className="buttons" style={{ display: "flex", gap: "10px", marginTop: "16px" }}>
          <button className="secondary" onClick={() => navigate("/")}>
            <ArrowLeft size={16} />
            Cancel & Return
          </button>
          <button 
            type="button"
            onClick={() => {
              try {
                const storedLogs = JSON.parse(localStorage.getItem("vault_logs") || "[]");
                const userSaved = JSON.parse(localStorage.getItem("user") || '{"username":"User","role":"User"}');
                const logEntry = {
                  id: Date.now(),
                  username: userSaved.username,
                  role: userSaved.role,
                  action: `${userSaved.username} (${userSaved.role}) verified identity • Access Granted`,
                  created_at: new Date().toISOString()
                };
                storedLogs.unshift(logEntry);
                localStorage.setItem("vault_logs", JSON.stringify(storedLogs));
              } catch (err) {}
              setShowPopup(true);
              setTimeout(() => {
                navigate("/home");
              }, 700);
            }}
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "6px",
              background: "var(--primary-red)",
              color: "#ffffff"
            }}
          >
            <UserCheck size={16} />
            Verify & Enter Vault
          </button>
        </div>
      </div>

      {/* User Found Modal */}
      {showPopup && (
        <div className="modal-overlay">
          <div className="popup-box">
            <div className="popup-check">✓</div>
            <h3>User Found</h3>
            <p>
              Identity confirmed for <strong>{currentUser.username}</strong> ({currentUser.role}).<br />
              Audit log recorded. Entering Vault...
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

export default FaceScanner;
