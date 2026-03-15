const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");

const app = express();
const server = http.createServer(app);

// IMPORTANT: enable CORS
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

app.use(express.static(__dirname));

app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "index.html"));
});

// ================= SOCKET =================

const rooms = {};

io.on("connection", (socket) => {

    console.log("User connected:", socket.id);

    socket.on("join-room", (roomID) => {

        socket.join(roomID);

        if (!rooms[roomID]) rooms[roomID] = 0;
        rooms[roomID]++;

        io.to(roomID).emit("viewer-count", rooms[roomID]);

        socket.to(roomID).emit("user-connected");

        socket.on("disconnect", () => {

            rooms[roomID]--;

            io.to(roomID).emit("viewer-count", rooms[roomID]);

        });

    });

    // OFFER
    socket.on("offer", (offer, roomID) => {
        socket.to(roomID).emit("offer", offer);
    });

    // ANSWER
    socket.on("answer", (answer, roomID) => {
        socket.to(roomID).emit("answer", answer);
    });

    // ICE
    socket.on("ice-candidate", (candidate, roomID) => {
        socket.to(roomID).emit("ice-candidate", candidate);
    });

    // VIDEO SYNC
    socket.on("video-play", (roomID) => {
        socket.to(roomID).emit("video-play");
    });

    socket.on("video-pause", (roomID) => {
        socket.to(roomID).emit("video-pause");
    });

});

// ================= PORT =================

const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
    console.log("Server running on port", PORT);
});