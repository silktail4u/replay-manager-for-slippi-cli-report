/* eslint global-require: off, no-console: off, promise/always-return: off */

/**
 * This module executes inside of electron's main process. You can start
 * electron renderer process from here and communicate with the other processes
 * through IPC.
 *
 * When running `npm run build` or `npm run build:main`, this file is compiled to
 * `./src/main.js` using webpack. This gives us some performance wins.
 */
import path from 'path';
import { app, BrowserWindow, shell } from 'electron';
import { EventEmitter } from 'events';
import MenuBuilder from './menu';
import { resolveHtmlPath } from './util';
import setupIPCs from './ipc';
import { Id, SlpSinglesGame } from '../common/types';
import express from 'express';
import { tryGetPendingSetById } from '../main/ipc'
import { getCurrentTournament } from './startgg';
let mainWindow: BrowserWindow | null = null;
let enforcerWindow: BrowserWindow | null = null;
const eventEmitter = new EventEmitter();

async function handleProtocolUrl(url: string) {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'replay-manager:') return;
    if (parsed.hostname === 'load') {
      const paths = parsed.searchParams.get('path');
      if (paths) {
        const slpUrls = paths.split(';');
        if (mainWindow) {
          if (mainWindow.isMinimized()) {
            mainWindow.restore();
          }
          mainWindow.show();
          mainWindow.focus();
        }
        eventEmitter.emit('protocol-load-slp-urls', slpUrls);
      }
    }
    if (parsed.hostname === 'report-singles') {
      const matches = parsed.searchParams.get('matches');
      if (matches) {
        const matchObjects: SlpSinglesGame[] = matches.split(';').map(s=>JSON.parse(s));
        eventEmitter.emit('protocol-report-singles-slp-urls', matchObjects);
      }
    }
  } catch (e) {
    // invalid URL
  }
}

if (!app.isDefaultProtocolClient('replay-manager')) {
  app.setAsDefaultProtocolClient('replay-manager');
}

if (process.env.NODE_ENV === 'production') {
  const sourceMapSupport = require('source-map-support');
  sourceMapSupport.install();
}

const isDebug =
  process.env.NODE_ENV === 'development' || process.env.DEBUG_PROD === 'true';

if (isDebug) {
  require('electron-debug')();
}

const installExtensions = async () => {
  const installer = require('electron-devtools-installer');
  const forceDownload = !!process.env.UPGRADE_EXTENSIONS;
  const extensions = ['REACT_DEVELOPER_TOOLS'];

  return installer
    .default(
      extensions.map((name) => installer[name]),
      forceDownload,
    )
    .catch(console.log);
};

const createWindow = async () => {
  if (isDebug) {
    await installExtensions();
  }

  const RESOURCES_PATH = app.isPackaged
    ? path.join(process.resourcesPath, 'assets')
    : path.join(__dirname, '../../assets');

  const getAssetPath = (...paths: string[]): string => {
    return path.join(RESOURCES_PATH, ...paths);
  };

  mainWindow = new BrowserWindow({
    minWidth: 901,
    minHeight: 720,
    show: false,
    width: 1024,
    height: 896,
    icon: getAssetPath('icon.png'),
    webPreferences: {
      preload: app.isPackaged
        ? path.join(__dirname, 'preload.js')
        : path.join(__dirname, '../../.erb/dll/preload.js'),
    },
  });

  mainWindow.loadURL(resolveHtmlPath('index.html'));

  mainWindow.on('ready-to-show', () => {
    if (!mainWindow) {
      throw new Error('"mainWindow" is not defined');
    }
    if (process.env.START_MINIMIZED) {
      mainWindow.minimize();
    } else {
      mainWindow.show();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
    // Respect the OSX convention of having the application in memory even
    // after all windows have been closed
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });

  const menuBuilder = new MenuBuilder(mainWindow);
  menuBuilder.buildMenu();

  // Open urls in the user's browser
  mainWindow.webContents.setWindowOpenHandler((edata) => {
    shell.openExternal(edata.url);
    return { action: 'deny' };
  });

  if (enforcerWindow === null) {
    enforcerWindow = new BrowserWindow({
      show: false,
      webPreferences: {
        preload: app.isPackaged
          ? path.join(__dirname, 'preload.js')
          : path.join(__dirname, '../../.erb/dll/preload.js'),
      },
    });
    enforcerWindow.loadURL(resolveHtmlPath('enforcer.html'));
  }

  setupIPCs(mainWindow, enforcerWindow, eventEmitter);
};

/**
 * Add event listeners...
 */
app
  .whenReady()
  .then(() => {
    createWindow();

    // macOS: handle protocol URLs
    app.on('open-url', (event, url) => {
      event.preventDefault();
      handleProtocolUrl(url);
    });

    // Windows/Linux: handle protocol URLs via second-instance
    if (!app.requestSingleInstanceLock()) {
      app.quit();
    } else {
      app.on('second-instance', (event, argv) => {
        // protocol URL should always be last in argv
        const lastArg = argv.pop();
        if (lastArg && lastArg.startsWith('replay-manager://')) {
          handleProtocolUrl(lastArg);
        }
      });
    }

    app.on('activate', () => {
      // On macOS it's common to re-create a window in the app when the
      // dock icon is clicked and there are no other windows open.
      if (mainWindow === null) createWindow();
    });
  })
  .catch(console.log);
const startServer = () => {
  const serverApp = express();

  serverApp.get('/singlescheck/', (req, res) => {

    if(!req.query.event||!req.query.players)
      return 400;
    const players = req.query.players;
    const ev = getCurrentTournament()?.events.find(e=>e.id == Number.parseInt(req.query.event as string))
    // Ensure it's always an array of Ids
    const array = (Array.isArray(players) ? players : players ? [players] : []).map(p=>p as Id);
    res.json({ pending: (tryGetPendingSetById(array,ev)==null) });
  });

  serverApp.listen(3005, () => {
    console.log('Electron Web Server listening on http://localhost:3005');
  });
};
