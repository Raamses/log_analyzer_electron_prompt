const { app, BrowserWindow, ipcMain, dialog } = require('electron')
const path = require('path')
const fs = require('fs')

function createWindow () {
  const win = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      preload: path.join(__dirname, 'src/preload.js'),
      nodeIntegration: false,
      contextIsolation: true
    }
  })

  win.loadFile('src/index.html')
}

ipcMain.on('open-file-dialog', (event) => {
  dialog.showOpenDialog({
    properties: ['openFile'],
    filters: [{ name: 'Log Files', extensions: ['log', 'txt'] }]
  }).then(result => {
    if (!result.canceled) {
      const filePath = result.filePaths[0]
      fs.readFile(filePath, 'utf-8', (err, data) => {
        if (err) {
          console.error('Error reading file:', err)
          return
        }
        event.sender.send('file-content', data)
      })
    }
  }).catch(err => {
    console.error(err)
  })
})

app.whenReady().then(createWindow)

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})
