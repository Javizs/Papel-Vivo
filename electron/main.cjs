const { app, BrowserWindow } = require("electron");
const fs = require("fs");
const path = require("path");

const isDev = !app.isPackaged;
const windowsIconPath = path.join(__dirname, "../build/icon.ico");
const fallbackIconPath = path.join(__dirname, "../public/icon-512.png");
const iconPath = fs.existsSync(windowsIconPath) ? windowsIconPath : fallbackIconPath;

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 650,
    title: "Papel Vivo",
    icon: iconPath,
    backgroundColor: "#141715",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false
    }
  });

  if (isDev) {
    win.loadURL("http://127.0.0.1:5173?target=desktop");
  } else {
    win.loadFile(path.join(__dirname, "../dist/index.html"), { query: { target: "desktop" } });
  }
}

app.whenReady().then(() => {
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
