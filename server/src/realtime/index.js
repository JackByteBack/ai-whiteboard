let io = null;

const setIo = (instance) => {
  io = instance;
};

const boardRoom = (boardId) => `wb:${boardId}`;

const emitToBoard = (boardId, event, payload, exceptSocketId) => {
  if (!io) return;
  const channel = exceptSocketId
    ? io.to(boardRoom(boardId)).except(exceptSocketId)
    : io.to(boardRoom(boardId));
  channel.emit(event, payload);
};

module.exports = { setIo, emitToBoard, boardRoom };
