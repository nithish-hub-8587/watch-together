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

const PORT = process.env.PORT || 3000;

io.on("connection", (socket) => {

    socket.on("join-room", (roomID) => {
        socket.join(roomID);
        socket.to(roomID).emit("user-connected");
    });

    socket.on("offer", (offer, roomID) => {
        socket.to(roomID).emit("offer", offer);
    });

    socket.on("answer", (answer, roomID) => {
        socket.to(roomID).emit("answer", answer);
    });

    socket.on("ice-candidate", (candidate, roomID) => {
        socket.to(roomID).emit("ice-candidate", candidate);
    });

});

server.listen(PORT, () => {
    console.log("Server running on port " + PORT);
});