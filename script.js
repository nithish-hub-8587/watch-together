const socket = io();
const video = document.getElementById("video");

let localStream;
let peerConnection;
let currentRoom;

function generateRoomID() {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
}
const config = {
    iceServers: [
        { urls: "stun:stun.l.google.com:19302" }
    ]
};

// Create Room
createBtn.addEventListener("click", async () => {
    currentRoom = generateRoomID();
    await startScreenShare();
    socket.emit("join-room", currentRoom);
    roomDisplay.innerText = "Created Room: " + currentRoom;
});

// Join Room
joinBtn.addEventListener("click", async () => {
    currentRoom = roomInput.value.trim().toUpperCase();
    if (!currentRoom) return alert("Enter Room ID");

    socket.emit("join-room", currentRoom);
    roomDisplay.innerText = "Joined Room: " + currentRoom;
});

async function startScreenShare() {
    localStream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: true
    });

    video.srcObject = localStream;
}

socket.on("user-connected", async () => {
    createPeerConnection();

    localStream.getTracks().forEach(track => {
        peerConnection.addTrack(track, localStream);
    });

    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);

    socket.emit("offer", offer, currentRoom);
});

socket.on("offer", async (offer) => {
    createPeerConnection();

    await peerConnection.setRemoteDescription(offer);

    localStream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: true
    });

    localStream.getTracks().forEach(track => {
        peerConnection.addTrack(track, localStream);
    });

    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);

    socket.emit("answer", answer, currentRoom);
});

socket.on("answer", async (answer) => {
    await peerConnection.setRemoteDescription(answer);
});

socket.on("ice-candidate", async (candidate) => {
    if (peerConnection) {
        await peerConnection.addIceCandidate(candidate);
    }
});

function createPeerConnection() {
    peerConnection = new RTCPeerConnection(config);

    peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
            socket.emit("ice-candidate", event.candidate, currentRoom);
        }
    };

    peerConnection.ontrack = (event) => {
        video.srcObject = event.streams[0];
    };
}