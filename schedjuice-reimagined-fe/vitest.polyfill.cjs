const { webcrypto } = require("node:crypto");

if (!globalThis.crypto?.getRandomValues) {
  globalThis.crypto = webcrypto;
}

if (typeof globalThis.self === "undefined") {
  globalThis.self = globalThis;
}
