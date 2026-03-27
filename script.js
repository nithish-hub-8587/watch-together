const socket = io();

const createBtn = document.getElementById("createBtn");
const joinBtn = document.getElementById("joinBtn");
const roomInput = document.getElementById("roomInput");
const roomDisplay = document.getElementById("roomDisplay");
const viewerCount = document.getElementById("viewerCount");

const localVideo = document.getElementById("localVideo");
const remoteVideo = document.getElementById("remoteVideo");
const fullscreenBtn = document.getElementById("fullscreenBtn");

const chatInput = document.getElementById("chatInput");
const sendChatBtn = document.getElementById("sendChatBtn");
const chatBox = document.getElementById("chatBox");

const urlParams = new URLSearchParams(window.location.search);
const autoRoom = urlParams.get("room");
if (autoRoom) {
    roomInput.value = autoRoom;
}

let localStream = null;
let currentRoom = "";
let isCreator = false;
let creatorId = null;

const peerConnections = {};
const qualityIntervals = {};
const qualityStats = {};

const config = {
    iceServers: [
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "stun:stun1.l.google.com:19302" },
        {
            urls: "turn:openrelay.metered.ca:80",
            username: "openrelayproject",
            credential: "openrelayproject"
        },
        {
            urls: "turn:openrelay.metered.ca:443",
            username: "openrelayproject",
            credential: "openrelayproject"
        },
        {
            urls: "turn:openrelay.metered.ca:443?transport=tcp",
            username: "openrelayproject",
            credential: "openrelayproject"
        }
    ]
};

// ================= FULLSCREEN =================
fullscreenBtn.addEventListener("click", () => {
    if (!document.fullscreenElement) {
        remoteVideo.requestFullscreen().catch(err => {
            console.log("Fullscreen error:", err);
        });
    } else {
        document.exitFullscreen();
    }
});

// ================= ROOM CREATE =================
createBtn.addEventListener("click", async () => {
    try {
        cleanupAllConnections();

        isCreator = true;
        currentRoom = generateRoomID();

        await startScreenShare();

        socket.emit("join-room", {
            roomID: currentRoom,
            isCreator: true
        });

        const roomLink = `${window.location.origin}?room=${currentRoom}`;

        roomDisplay.innerHTML = `
            <div><strong>Room ID:</strong> ${currentRoom}</div>
            <div style="margin-top:8px;">
                <input value="${roomLink}" readonly id="roomLink" />
            </div>
        `;
    } catch (err) {
        console.error("Create room error:", err);
        alert("Could not start screen sharing.");
    }
});

// ================= ROOM JOIN =================
joinBtn.addEventListener("click", () => {
    cleanupAllConnections();

    isCreator = false;
    currentRoom = roomInput.value.trim().toUpperCase();

    if (!currentRoom) {
        alert("Enter Room ID");
        return;
    }

    socket.emit("join-room", {
        roomID: currentRoom,
        isCreator: false
    });

    roomDisplay.innerText = "Joined Room: " + currentRoom;
});

// ================= CHAT =================
sendChatBtn.addEventListener("click", sendChatMessage);
chatInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") sendChatMessage();
});

function sendChatMessage() {
    const message = chatInput.value.trim();
    if (!message || !currentRoom) return;

    const sender = isCreator ? "Host" : "Viewer";

    socket.emit("chat-message", {
        roomID: currentRoom,
        message,
        sender
    });

    addChatMessage(sender, message);
    chatInput.value = "";
}

function addChatMessage(sender, message) {
    const div = document.createElement("div");
    div.className = "chat-message";
    div.innerHTML = `<strong>${sender}:</strong> ${message}`;
    chatBox.appendChild(div);
    chatBox.scrollTop = chatBox.scrollHeight;
}

// ================= SCREEN SHARE / MOBILE CAMERA =================
async function startScreenShare() {
    const isMobile = /Android|iPhone|iPad/i.test(navigator.userAgent);

    if (isMobile) {
        localStream = await navigator.mediaDevices.getUserMedia({
            video: {
                width: { ideal: 1280 },
                height: { ideal: 720 },
                frameRate: { ideal: 24 }
            },
            audio: {
                echoCancellation: false,
                noiseSuppression: false,
                autoGainControl: false,
                channelCount: 2,
                sampleRate: 48000
            }
        });
    } else {
        localStream = await navigator.mediaDevices.getDisplayMedia({
            video: {
                width: { ideal: 1920 },
                height: { ideal: 1080 },
                frameRate: { ideal: 30 }
            },
            audio: {
                echoCancellation: false,
                noiseSuppression: false,
                autoGainControl: false,
                channelCount: 2,
                sampleRate: 48000
            }
        });
    }

    localVideo.srcObject = localStream;
}

// ================= SOCKET EVENTS =================
socket.on("joined-room", ({ roomID, creatorId: serverCreatorId }) => {
    creatorId = serverCreatorId;
    console.log("Joined room:", roomID, "creator:", creatorId);
});

socket.on("viewer-count", (count) => {
    viewerCount.innerText = "Viewers: " + count;
});

socket.on("chat-message", ({ sender, message }) => {
    addChatMessage(sender, message);
});

socket.on("creator-left", () => {
    alert("Host left the room.");
    remoteVideo.srcObject = null;
});

socket.on("viewer-joined", async (viewerId) => {
    if (!isCreator || !localStream) return;

    const pc = createPeerConnection(viewerId, true);

    localStream.getTracks().forEach(track => {
        pc.addTrack(track, localStream);
    });

    optimizeVideoQuality(viewerId);
    optimizeAudioQuality(viewerId);
    startAdaptiveQuality(viewerId);

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    socket.emit("offer", offer, viewerId);
});

socket.on("offer", async (offer, fromId) => {
    if (isCreator) return;

    const pc = createPeerConnection(fromId, false);

    await pc.setRemoteDescription(new RTCSessionDescription(offer));

    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);

    socket.emit("answer", answer, fromId);
});

socket.on("answer", async (answer, fromId) => {
    const pc = peerConnections[fromId];
    if (!pc) return;

    if (pc.signalingState !== "have-local-offer") {
        console.log("Ignoring duplicate answer from", fromId);
        return;
    }

    await pc.setRemoteDescription(new RTCSessionDescription(answer));
});

socket.on("ice-candidate", async (candidate, fromId) => {
    const pc = peerConnections[fromId];
    if (!pc) return;

    try {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (err) {
        console.error("ICE candidate error:", err);
    }
});

// ================= PEER CONNECTION =================
function createPeerConnection(peerId, senderSide) {
    if (peerConnections[peerId]) {
        return peerConnections[peerId];
    }

    const pc = new RTCPeerConnection(config);
    peerConnections[peerId] = pc;

    pc.onicecandidate = (event) => {
        if (event.candidate) {
            socket.emit("ice-candidate", event.candidate, peerId);
        }
    };

    pc.ontrack = (event) => {
        console.log("Receiving stream from", peerId);
        remoteVideo.srcObject = event.streams[0];
    };

    pc.onconnectionstatechange = () => {
        console.log(`Connection ${peerId}:`, pc.connectionState);

        if (pc.connectionState === "failed" || pc.connectionState === "disconnected") {
            if (!senderSide) {
                remoteVideo.srcObject = null;
            }
            clearAdaptiveQuality(peerId);
        }

        if (pc.connectionState === "closed") {
            clearAdaptiveQuality(peerId);
        }
    };

    return pc;
}

// ================= ADAPTIVE VIDEO QUALITY =================
function optimizeVideoQuality(peerId) {
    const pc = peerConnections[peerId];
    if (!pc) return;

    const sender = pc.getSenders().find(s => s.track && s.track.kind === "video");
    if (!sender) return;

    const params = sender.getParameters();
    if (!params.encodings) {
        params.encodings = [{}];
    }

    params.encodings[0].maxBitrate = 1500000;
    params.encodings[0].scaleResolutionDownBy = 1;

    sender.setParameters(params).catch(console.error);
}

function startAdaptiveQuality(peerId) {
    if (qualityIntervals[peerId]) return;

    qualityIntervals[peerId] = setInterval(async () => {
        const pc = peerConnections[peerId];
        if (!pc) return;

        const sender = pc.getSenders().find(s => s.track && s.track.kind === "video");
        if (!sender) return;

        const stats = await pc.getStats(sender);

        stats.forEach(report => {
            if (report.type === "outbound-rtp" && report.kind === "video") {
                const prev = qualityStats[peerId];

                if (prev) {
                    const bytes = report.bytesSent - prev.bytesSent;
                    const time = report.timestamp - prev.timestamp;
                    const bitrate = (bytes * 8 * 1000) / time;

                    if (bitrate < 500000) {
                        setSenderQuality(sender, 500000, 2);
                        console.log("Lowering quality for", peerId);
                    } else if (bitrate > 1200000) {
                        setSenderQuality(sender, 2000000, 1);
                        console.log("Increasing quality for", peerId);
                    }
                }

                qualityStats[peerId] = {
                    bytesSent: report.bytesSent,
                    timestamp: report.timestamp
                };
            }
        });
    }, 5000);
}

function clearAdaptiveQuality(peerId) {
    if (qualityIntervals[peerId]) {
        clearInterval(qualityIntervals[peerId]);
        delete qualityIntervals[peerId];
    }

    if (qualityStats[peerId]) {
        delete qualityStats[peerId];
    }
}

function setSenderQuality(sender, maxBitrate, scaleResolutionDownBy) {
    const params = sender.getParameters();
    if (!params.encodings) {
        params.encodings = [{}];
    }

    params.encodings[0].maxBitrate = maxBitrate;
    params.encodings[0].scaleResolutionDownBy = scaleResolutionDownBy;

    sender.setParameters(params).catch(console.error);
}

// ================= CLEANUP =================
function cleanupAllConnections() {
    Object.keys(peerConnections).forEach(peerId => {
        clearAdaptiveQuality(peerId);
        peerConnections[peerId].close();
        delete peerConnections[peerId];
    });

    remoteVideo.srcObject = null;
    creatorId = null;
}

function generateRoomID() {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
}
function optimizeAudioQuality(peerId) {
    const pc = peerConnections[peerId];
    if (!pc) return;

    const sender = pc.getSenders().find(
        s => s.track && s.track.kind === "audio"
    );

    if (!sender) return;

    const params = sender.getParameters();

    if (!params.encodings) {
        params.encodings = [{}];
    }

    params.encodings[0].maxBitrate = 128000; // 128 kbps

    sender.setParameters(params).catch(console.error);
}