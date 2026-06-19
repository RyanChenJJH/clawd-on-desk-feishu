"use strict";

const EventEmitter = require("node:events");

function createFakeFeishuChannel(options = {}) {
  const channel = new EventEmitter();
  channel.calls = [];
  channel.connected = false;
  channel.disconnected = false;
  channel.sendResults = options.sendResults ? options.sendResults.slice() : [];
  channel.sendErrors = options.sendErrors ? options.sendErrors.slice() : [];
  channel.updateErrors = options.updateErrors ? options.updateErrors.slice() : [];

  channel.connect = async () => {
    channel.calls.push({ method: "connect" });
    channel.connected = true;
  };

  channel.disconnect = async () => {
    channel.calls.push({ method: "disconnect" });
    channel.disconnected = true;
    channel.connected = false;
  };

  channel.send = async (to, input, opts) => {
    channel.calls.push({ method: "send", to, input, opts });
    if (channel.sendErrors.length) throw channel.sendErrors.shift();
    return channel.sendResults.length ? channel.sendResults.shift() : { messageId: `om_${channel.calls.length}` };
  };

  channel.updateCard = async (messageId, card) => {
    channel.calls.push({ method: "updateCard", messageId, card });
    if (channel.updateErrors.length) throw channel.updateErrors.shift();
  };

  channel.emitCardAction = (event) => {
    channel.emit("cardAction", event);
  };

  channel.emitMessage = (event) => {
    channel.emit("message", event);
  };

  return channel;
}

module.exports = {
  createFakeFeishuChannel,
};
