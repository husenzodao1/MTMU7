import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { messagePush, type MessagePushSource } from "../../src/lib/push/payload.ts";

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

  it("still calls any other attachment a file", () => {
    assert.equal(messagePush({ ...base, type: "file", preview: "" }, "u2", "tg").body, "📎 Файл");
  });

  it("titles a group by its name and puts the sender in the body", () => {
    const push = messagePush({ ...base, conversation_type: "group", conversation_name: "9 «А»", type: "image", preview: "" }, "u2", "tg");
    assert.equal(push.title, "9 «А»");
    assert.equal(push.body, "Мадина Каримова: 📷 Сурат");
    assert.equal(push.url, "/messages/c1");
  });
});
