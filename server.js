const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");

const app = express();
const server = http.createServer(app);

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

const roomCreators = {};
const roomMembers = {};

io.on("connection", (socket) => {
    console.log("User connected:", socket.id);

    socket.on("join-room", ({ roomID, isCreator }) => {
        socket.data.roomID = roomID;
        socket.data.isCreator = isCreator;

        socket.join(roomID);

        if (!roomMembers[roomID]) {
            roomMembers[roomID] = new Set();
        }

        roomMembers[roomID].add(socket.id);

        if (isCreator) {
            roomCreators[roomID] = socket.id;
        }

        io.to(roomID).emit("viewer-count", roomMembers[roomID].size);

        socket.emit("joined-room", {
            roomID,
            creatorId: roomCreators[roomID] || null
        });

        if (!isCreator && roomCreators[roomID]) {
            io.to(roomCreators[roomID]).emit("viewer-joined", socket.id);
        }
    });

    socket.on("offer", (offer, targetId) => {
        io.to(targetId).emit("offer", offer, socket.id);
    });

    socket.on("answer", (answer, targetId) => {
        io.to(targetId).emit("answer", answer, socket.id);
    });

    socket.on("ice-candidate", (candidate, targetId) => {
        io.to(targetId).emit("ice-candidate", candidate, socket.id);
    });

    socket.on("chat-message", ({ roomID, message, sender }) => {
        io.to(roomID).emit("chat-message", { sender, message });
    });

    socket.on("disconnect", () => {
        const roomID = socket.data.roomID;
        const isCreator = socket.data.isCreator;

        if (!roomID || !roomMembers[roomID]) return;

        roomMembers[roomID].delete(socket.id);

        if (roomMembers[roomID].size === 0) {
            delete roomMembers[roomID];
            delete roomCreators[roomID];
        } else {
            io.to(roomID).emit("viewer-count", roomMembers[roomID].size);

            if (isCreator) {
                delete roomCreators[roomID];
                io.to(roomID).emit("creator-left");
            }
        }

        console.log("User disconnected:", socket.id);
    });
});

const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
    console.log("Server running on port", PORT);
});