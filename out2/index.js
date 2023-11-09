let electron = require("electron");
let app = electron.app;
let protocol = electron.protocol;

let manager = {
  is_debugging: true,
  context: {},
};

app.commandLine.appendSwitch("js-flags", "--expose-gc --always_compact");

if (protocol.registerStandardSchemes) {
  protocol.registerStandardSchemes(["app", "dynalist"]);
} else {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: "app",
      privileges: { standard: true, secure: true, bypassCSP: true },
    },
    {
      scheme: "dynalist",
      privileges: { standard: true, secure: true, bypassCSP: true },
    },
  ]);
}

app.on("ready", function () {
  let dynalist = require("./main.js");
  dynalist(manager, __dirname);
});
