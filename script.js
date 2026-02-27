const socket = io();

const localVideo = document.getElementById("localVideo");
const remoteVideo = document.getElementById("remoteVideo");

let localStream;
let peerConnection;
let currentRoom;
let isCreator = false;

const config = {
    iceServers: [
        {
            urls: "stun:stun.l.google.com:19302"
        },
        {
            urls: "turn:openrelay.metered.ca:80",
            username: "openrelayproject",
            credential: "openrelayproject"
        }
    ]
};
// CREATE ROOM
createBtn.addEventListener("click", async () => {
    isCreator = true;

    currentRoom = Math.random().toString(36).substring(2, 8).toUpperCase();

    await startScreenShare();

    socket.emit("join-room", currentRoom);
    roomDisplay.innerText = "Created Room: " + currentRoom;
});

// JOIN ROOM
joinBtn.addEventListener("click", () => {
    currentRoom = roomInput.value.trim().toUpperCase();
    if (!currentRoom) return alert("Enter Room ID");

    socket.emit("join-room", currentRoom);
    roomDisplay.innerText = "Joined Room: " + currentRoom;
});

// START SCREEN SHARE (ONLY CREATOR)
async function startScreenShare() {
    localStream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: true
    });

    localVideo.srcObject = localStream;
}

// WHEN SECOND USER JOINS
socket.on("user-connected", async () => {
    if (!isCreator) return;

    createPeerConnection();

    localStream.getTracks().forEach(track => {
        peerConnection.addTrack(track, localStream);
    });

    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);

    socket.emit("offer", offer, currentRoom);
});

// RECEIVE OFFER (JOINER)
socket.on("offer", async (offer) => {

    if (isCreator) return; // 🔥 prevent creator handling offer

    createPeerConnection();

    await peerConnection.setRemoteDescription(
        new RTCSessionDescription(offer)
    );

    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);

    socket.emit("answer", answer, currentRoom);
});
// RECEIVE ANSWER (CREATOR)
socket.on("answer", async (answer) => {

    if (!isCreator) return; // 🔥 only creator handles answer

    await peerConnection.setRemoteDescription(
        new RTCSessionDescription(answer)
    );
});
// ICE
socket.on("ice-candidate", async (candidate) => {
    if (peerConnection) {
        await peerConnection.addIceCandidate(candidate);
    }
});

function createPeerConnection() {

    if (peerConnection) {
        peerConnection.close();
    }

    peerConnection = new RTCPeerConnection(config);

    peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
            socket.emit("ice-candidate", event.candidate, currentRoom);
        }
    };

    peerConnection.ontrack = (event) => {
        if (!remoteVideo.srcObject) {
            remoteVideo.srcObject = event.streams[0];
        }
    };
}