const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const isStandaloneBundle = fs.existsSync(path.join(root, "server.js"));

module.exports = {
  apps: [
    isStandaloneBundle
      ? {
          name: "app",
          cwd: root,
          script: "server.js",
          env: {
            NODE_ENV: "production",
            PORT: 1112,
          },
        }
      : {
          name: "app",
          cwd: root,
          script: "npm",
          args: "start",
          env: {
            NODE_ENV: "production",
            PORT: 1112,
          },
        },
  ],
};
