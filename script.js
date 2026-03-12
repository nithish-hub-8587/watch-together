const socket = io();

const localVideo = document.getElementById("localVideo");
const remoteVideo = document.getElementById("remoteVideo");
const fullscreenBtn = document.getElementById("fullscreenBtn");
const urlParams = new URLSearchParams(window.location.search);
const autoRoom = urlParams.get("room");

if (autoRoom) {
    roomInput.value = autoRoom;
}

let localStream;
let peerConnection;
let currentRoom;
let isCreator = false;
let offerSent = false;

// FULLSCREEN
fullscreenBtn.addEventListener("click", () => {

    if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen();
    } else {
        document.exitFullscreen();
    }

});

const config = {
    iceServers: [
        {
            urls: "stun:stun.l.google.com:19302"
        },
        {
            urls: "stun:stun1.l.google.com:19302"
        },
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
// ================= CREATE ROOM =================
createBtn.addEventListener("click", async () => {

    isCreator = true;

    currentRoom = Math.random().toString(36).substring(2, 8).toUpperCase();

    await startScreenShare();

    socket.emit("join-room", currentRoom);

    const roomLink = window.location.origin + "?room=" + currentRoom;

    roomDisplay.innerHTML = `
        Room ID: ${currentRoom} <br>
        Share Link: <input value="${roomLink}" id="roomLink" readonly>
    `;
});



// ================= JOIN ROOM =================
joinBtn.addEventListener("click", () => {

    remoteVideo.srcObject = null;
    isCreator = false;

    if (peerConnection) {
        peerConnection.close();
        peerConnection = null;
    }

    currentRoom = roomInput.value.trim().toUpperCase();
    if (!currentRoom) return alert("Enter Room ID");

    socket.emit("join-room", currentRoom);
    roomDisplay.innerText = "Joined Room: " + currentRoom;
});



// ================= START SCREEN SHARE =================
async function startScreenShare() {

    const isMobile = /Android|iPhone|iPad/i.test(navigator.userAgent);

    if (isMobile) {
        localStream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: true
        });
    } else {
        localStream = await navigator.mediaDevices.getDisplayMedia({
            video: true,
            audio: true
        });
    }

    localVideo.srcObject = localStream;
}



// ================= WHEN JOINER CONNECTS =================
socket.on("user-connected", async () => {

    if (!isCreator || offerSent) return;

    createPeerConnection();

    localStream.getTracks().forEach(track => {
        peerConnection.addTrack(track, localStream);
    });

    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);

    socket.emit("offer", offer, currentRoom);

    offerSent = true;
});



// ================= RECEIVE OFFER =================
socket.on("offer", async (offer) => {

    if (isCreator) return;

    createPeerConnection();

    await peerConnection.setRemoteDescription(
        new RTCSessionDescription(offer)
    );

    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);

    socket.emit("answer", answer, currentRoom);
});



// ================= RECEIVE ANSWER =================
socket.on("answer", async (answer) => {

    if (!isCreator || !peerConnection) return;

    if (peerConnection.signalingState !== "have-local-offer") {
        console.log("Ignoring duplicate answer");
        return;
    }

    await peerConnection.setRemoteDescription(
        new RTCSessionDescription(answer)
    );
});



// ================= ICE CANDIDATES =================
socket.on("ice-candidate", async (candidate) => {

    if (peerConnection) {
        try {
            await peerConnection.addIceCandidate(
                new RTCIceCandidate(candidate)
            );
        } catch (e) {
            console.error("Error adding ICE candidate", e);
        }
    }
});



function createPeerConnection() {

    if (peerConnection) {
        peerConnection.close();
        peerConnection = null;
    }

    peerConnection = new RTCPeerConnection(config);

    peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
            socket.emit("ice-candidate", event.candidate, currentRoom);
        }
    };

    peerConnection.ontrack = (event) => {
    console.log("Receiving stream");

    if (!remoteVideo.srcObject) {
        remoteVideo.srcObject = event.streams[0];

        }
    };

    peerConnection.onconnectionstatechange = () => {
        console.log("Connection State:", peerConnection.connectionState);

        if (
            peerConnection.connectionState === "disconnected" ||
            peerConnection.connectionState === "failed"
        ) {
            remoteVideo.srcObject = null;
        }
    };
}
remoteVideo.addEventListener("play", () => {
    socket.emit("video-play", currentRoom);
});

remoteVideo.addEventListener("pause", () => {
    socket.emit("video-pause", currentRoom);
});

socket.on("video-play", () => {
    remoteVideo.play();
});

socket.on("video-pause", () => {
    remoteVideo.pause();
});
socket.on("viewer-count", (count) => {
    document.getElementById("viewerCount").innerText =
        "Viewers: " + count;
});