const {
  app,
  BrowserWindow,
  desktopCapturer,
  session,
  ipcMain,
  screen,
} = require("electron");
const Store = require("electron-store");

// Initialize the store
const store = new Store();

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (require("electron-squirrel-startup")) {
  app.quit();
}

let mainWindow = null;
let selectionWindow = null;

const createSelectionWindow = (bounds) => {
  // Hide the main window
  if (mainWindow) {
    mainWindow.hide();
  }

  selectionWindow = new BrowserWindow({
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY,
    },
  });

  selectionWindow.loadURL(`data:text/html;charset=utf-8,
    <html>
      <head>
        <style>
          body {
            margin: 0;
            padding: 0;
            overflow: hidden;
            background: rgba(0, 0, 0, 0.5);
            cursor: crosshair;
          }
          #selectionBox {
            position: fixed;
            border: 2px solid #fff;
            background: rgba(255, 255, 255, 0.1);
            pointer-events: none;
            display: none;
          }
        </style>
      </head>
      <body>
        <div id="selectionBox"></div>
        <script>
          const selectionBox = document.getElementById('selectionBox');
          let isSelecting = false;
          let startX, startY;

          document.addEventListener('mousedown', (e) => {
            isSelecting = true;
            startX = e.clientX;
            startY = e.clientY;
            selectionBox.style.display = 'block';
            selectionBox.style.left = startX + 'px';
            selectionBox.style.top = startY + 'px';
          });

          document.addEventListener('mousemove', (e) => {
            if (!isSelecting) return;
            const width = e.clientX - startX;
            const height = e.clientY - startY;
            selectionBox.style.left = (width < 0 ? e.clientX : startX) + 'px';
            selectionBox.style.top = (height < 0 ? e.clientY : startY) + 'px';
            selectionBox.style.width = Math.abs(width) + 'px';
            selectionBox.style.height = Math.abs(height) + 'px';
          });

          document.addEventListener('mouseup', (e) => {
            if (!isSelecting) return;
            isSelecting = false;
            const width = e.clientX - startX;
            const height = e.clientY - startY;
            const cropArea = {
              x: width < 0 ? e.clientX : startX,
              y: height < 0 ? e.clientY : startY,
              width: Math.abs(width),
              height: Math.abs(height)
            };
            window.electron.send('selection-complete', cropArea);
            window.close();
          });

          document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
              window.electron.send('selection-cancelled');
              window.close();
            }
          });
        </script>
      </body>
    </html>
  `);

  selectionWindow.on("closed", () => {
    selectionWindow = null;
    // Show the main window again
    if (mainWindow) {
      mainWindow.show();
    }
  });
};

const createWindow = () => {
  // Create the browser window.
  mainWindow = new BrowserWindow({
    width: 1024,
    height: 768,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY,
    },
  });

  session.defaultSession.setDisplayMediaRequestHandler(
    (request, callback) => {
      desktopCapturer
        .getSources({ types: ["window", "screen"] })
        .then((sources) => {
          callback({ video: sources[0], audio: "loopback" });
        });
    },
    { useSystemPicker: true }
  );

  // and load the index.html of the app.
  mainWindow.loadURL(MAIN_WINDOW_WEBPACK_ENTRY);

  // Open the DevTools.
  mainWindow.webContents.openDevTools();
};

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  createWindow();

  // Handle get-accounts request
  ipcMain.handle("get-accounts", async () => {
    const accounts = store.get("accounts") || [];
    return accounts;
  });

  // Handle add-account request
  ipcMain.handle("add-account", async (event, account) => {
    const accounts = store.get("accounts") || [];
    const newAccount = {
      ...account,
      id: Date.now().toString(), // Simple ID generation
    };
    accounts.push(newAccount);
    store.set("accounts", accounts);
    return accounts;
  });

  // Handle get-transactions request
  ipcMain.handle("get-transactions", async () => {
    const transactions = store.get("transactions") || [];
    return transactions;
  });

  // Handle add-transaction request
  ipcMain.handle("add-transaction", async (event, transaction) => {
    const transactions = store.get("transactions") || [];
    const newTransaction = {
      ...transaction,
      id: Date.now().toString(), // Simple ID generation
    };
    transactions.push(newTransaction);
    store.set("transactions", transactions);
    return transactions;
  });

  // Handle selection window creation request
  ipcMain.on("create-selection-window", (event, bounds) => {
    createSelectionWindow(bounds);
  });

  // Handle selection completion
  ipcMain.on("selection-complete", (event, cropArea) => {
    if (selectionWindow) {
      selectionWindow.close();
      selectionWindow = null;
    }
    // Forward the selection to the main window
    mainWindow.webContents.send("selection-complete", cropArea);
  });

  // Handle selection cancellation
  ipcMain.on("selection-cancelled", () => {
    if (selectionWindow) {
      selectionWindow.close();
      selectionWindow = null;
    }
  });

  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
