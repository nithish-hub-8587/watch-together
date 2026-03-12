const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(__dirname));

app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "index.html"));
});

io.on("connection", (socket) => {

    socket.on("join-room", (roomID) => {
        socket.join(roomID);
        socket.to(roomID).emit("user-connected");
    });

    // 🔥 FORWARD OFFER
    socket.on("offer", (offer, roomID) => {
        socket.to(roomID).emit("offer", offer);
    });

    // 🔥 FORWARD ANSWER
    socket.on("answer", (answer, roomID) => {
        socket.to(roomID).emit("answer", answer);
    });

    // 🔥 FORWARD ICE CANDIDATES
    socket.on("ice-candidate", (candidate, roomID) => {
        socket.to(roomID).emit("ice-candidate", candidate);
    });

});

const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
    console.log("Server running...");
});
socket.on("video-play", (roomID) => {
    socket.to(roomID).emit("video-play");
});

socket.on("video-pause", (roomID) => {
    socket.to(roomID).emit("video-pause");
});
const rooms = {};

socket.on("join-room", (roomID) => {

    socket.join(roomID);

    if (!rooms[roomID]) rooms[roomID] = 0;
    rooms[roomID]++;

    io.to(roomID).emit("viewer-count", rooms[roomID]);

    socket.on("disconnect", () => {
        rooms[roomID]--;
        io.to(roomID).emit("viewer-count", rooms[roomID]);
    });
});