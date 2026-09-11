const path = require("path");
const { app, BrowserWindow, shell } = require("electron");

const DEFAULT_START_URL = "http://127.0.0.1:3000/studio";
const startUrl = process.env.STLS_DESKTOP_START_URL || DEFAULT_START_URL;
const isProduction = app.isPackaged || process.env.STLS_DESKTOP_MODE === "production";
const isDevShell = !isProduction;

function createMainWindow() {
  const window = new BrowserWindow({
    width: 1600,
    height: 980,
    minWidth: 1280,
    minHeight: 800,
    show: false,
    backgroundColor: "#05070a",
    autoHideMenuBar: true,
    title: "STLS Hybrid Command Platform",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      devTools: Boolean(isDevShell),
    },
  });

  window.once("ready-to-show", () => {
    window.show();
  });

  const allowedOrigin = new URL(startUrl).origin;

  window.webContents.setWindowOpenHandler(({ url }) => {
    if (isAllowedExternalUrl(url)) {
      void shell.openExternal(url);
    }

    return { action: "deny" };
  });

  window.webContents.on("will-navigate", (event, targetUrl) => {
    if (!targetUrl.startsWith(allowedOrigin)) {
      event.preventDefault();

      if (isAllowedExternalUrl(targetUrl)) {
        void shell.openExternal(targetUrl);
      }
    }
  });

  window.loadURL(startUrl).catch((error) => {
    console.error("Failed to load STLS desktop shell URL:", error);
  });

  return window;
}

function isAllowedExternalUrl(url) {
  return /^https?:\/\//.test(url) || /^mailto:/.test(url);
}

app.whenReady().then(() => {
  createMainWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
