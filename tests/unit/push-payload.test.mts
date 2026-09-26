import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { actionLabels, messagePush, type MessagePushSource } from "../../src/lib/push/payload.ts";

const base: MessagePushSource = {
  message_id: "m1",
  conversation_id: "c1",
  conversation_type: "direct",
  conversation_name: null,
  requester_id: null,
  sender_id: "u1",
  type: "text",
  preview: "Салом",
  sender: "Мадина Каримова",
};

describe("push for a message", () => {
  it("names a photo as a photo, with its caption when it has one", () => {
    assert.equal(messagePush({ ...base, type: "image", preview: "" }, "u2", "tg").body, "📷 Сурат");
    assert.equal(messagePush({ ...base, type: "image", preview: "Тахта" }, "u2", "ru").body, "📷 Фото · Тахта");
    assert.equal(messagePush({ ...base, type: "image", preview: "  " }, "u2", "en").body, "📷 Photo");
  });

  it("names a file by its caption or its own name, and a recording as a voice message", () => {
    assert.equal(messagePush({ ...base, type: "file", preview: "" }, "u2", "tg").body, "📎 Файл");
    assert.equal(messagePush({ ...base, type: "file", preview: "Timetable.pdf" }, "u2", "tg").body, "📎 Timetable.pdf");
    assert.equal(messagePush({ ...base, type: "audio", preview: "" }, "u2", "ru").body, "🎤 Голосовое сообщение");
  });

  it("words the notification's own buttons in the reader's language", () => {
    assert.deepEqual(
      { reply: actionLabels("tg").reply, read: actionLabels("tg").read },
      { reply: "Ҷавоб", read: "Хондам" }
    );
    assert.equal(actionLabels("en").read, "Mark as read");
    assert.ok(actionLabels("ru").failed.length > 0);
  });

  it("titles a group by its name and puts the sender in the body", () => {
    const push = messagePush({ ...base, conversation_type: "group", conversation_name: "9 «А»", type: "image", preview: "" }, "u2", "tg");
    assert.equal(push.title, "9 «А»");
    assert.equal(push.body, "Мадина Каримова: 📷 Сурат");
    assert.equal(push.url, "/messages/c1");
  });
});
