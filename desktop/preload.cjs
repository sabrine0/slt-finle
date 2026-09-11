const { contextBridge } = require("electron");

contextBridge.exposeInMainWorld("stlsDesktop", {
  isDesktop: true,
  shell: "electron",
  platform: process.platform,
  versions: {
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
  },
});
