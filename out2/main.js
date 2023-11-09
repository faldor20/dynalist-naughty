"use strict";

let PLATFORM = (function () {
  let platforms = {
    win32: "win",
    darwin: "mac",
    linux: "linux",
  };
  let platform = platforms[process.platform];
  if (!platform) {
    platform = process.platform;
  }
  return platform;
})();

module.exports = function (manager, RES_PATH) {
  let DATA_PATH = manager.data_path;

  console.log("Dynalist loading", RES_PATH);

  let electron = require("electron");
  let { app, shell, ipcMain, Menu, BrowserWindow, dialog, globalShortcut } =
    electron;
  let fs = require("fs");
  let path = require("path");

  let electronVer = parseInt(process.versions.electron.split(".")[0]);

  function file_exists(file) {
    try {
      return fs.lstatSync(file).isFile();
    } catch (e) {}
  }

  function dir_exists(file) {
    try {
      return fs.lstatSync(file).isDirectory();
    } catch (e) {}
  }

  // Source: https://github.com/parshap/node-sanitize-filename/blob/master/index.js
  let illegalRe = /[\/?<>\\:*|"]/g;
  let controlRe = /[\x00-\x1f\x80-\x9f]/g;
  let reservedRe = /^\.+$/;
  let windowsReservedRe = /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(\..*)?$/i;
  let windowsTrailingRe = /[. ]+$/;

  function sanitize_filename(input, replacement) {
    return input
      .replace(illegalRe, replacement)
      .replace(controlRe, replacement)
      .replace(reservedRe, replacement)
      .replace(windowsReservedRe, replacement)
      .replace(windowsTrailingRe, replacement);
  }

  if (!RES_PATH) {
    RES_PATH = __dirname;
  }

  if (!DATA_PATH) {
    DATA_PATH = path.join(app.getPath("userData"), "dynalist");
    try {
      fs.mkdirSync(DATA_PATH);
    } catch (e) {}
  }

  let PROTOCOL = "app";
  let URL_ROOT = "app://dynalist.io/";
  let FILES_ROOT = RES_PATH + "/www/";
  let APP_ROUTE = "index.html";

  let SETTINGS_PATH = path.join(DATA_PATH, "settings.json");
  let LOCAL_ICON_PATH = path.join(DATA_PATH, "icon.png");
  let ICON_PATH = path.join(RES_PATH, "icon.png");
  let SMALL_ICON_PATH = path.join(RES_PATH, "icon-small.png");

  let FILE_PROTO = "file://";
  // On windows, strip all 3 slashes.
  if (PLATFORM === "win") {
    FILE_PROTO = "file:///";
  }
  function openExternalUrl(url) {
    if (url.startsWith(FILE_PROTO)) {
      url = decodeURIComponent(url.substr(FILE_PROTO.length));
      url = path.normalize(url);
      console.log("Opening file: " + url);
      shell.openItem(url);
      return;
    }

    console.log("Opening URL: " + url);
    shell.openExternal(url);
  }

  let route = (url) => {
    // Strip query and hash components
    if (url.indexOf("?") > 0) {
      url = url.substr(0, url.indexOf("?"));
    }
    if (url.indexOf("#") > 0) {
      url = url.substr(0, url.indexOf("#"));
    }
    if (url.indexOf(URL_ROOT) === 0) {
      url = decodeURIComponent(url.substr(URL_ROOT.length));
      if (url === "" || url.substring(0, 2) === "d/") {
        url = APP_ROUTE;
      }
      url = FILES_ROOT + url;
    }
    return path.normalize(url);
  };

  class WindowManager {
    constructor(config) {
      this.context_menu_override = false;

      config = config || {};
      let window_config = {
        width: 800,
        height: 600,
        icon: ICON_PATH,
        autoHideMenuBar: !config.showMenu,
        webPreferences: {
          webSecurity: false,
          nodeIntegration: true,
          contextIsolation: false,
          enableRemoteModule: true,
          spellcheck: true,
        },
      };

      if (config.x !== undefined && config.y !== undefined) {
        window_config.x = config.x;
        window_config.y = config.y;
      }

      if (config.width !== undefined && config.height !== undefined) {
        window_config.width = config.width;
        window_config.height = config.height;
      }

      let window = (this.window = new BrowserWindow(window_config));
      let webContents = (this.webContents = window.webContents);

      if (window.autoHideMenuBar === undefined) {
        Object.defineProperty(window, "autoHideMenuBar", {
          get() {
            return this.isMenuBarAutoHide();
          },
          set(value) {
            this.setAutoHideMenuBar(value);
          },
        });
      }

      let setZoom = (zoom) => {
        if (zoom === null || zoom === undefined) {
          return;
        }
        if (webContents.setZoomLevel) {
          webContents.setZoomLevel(zoom);
        } else {
          webContents.zoomLevel = zoom;
        }
      };

      if (webContents.zoomLevel === undefined && webContents.setZoomLevel) {
        let setZoomLevel = webContents.setZoomLevel;
        webContents.setZoomLevel = function (zoomLevel) {
          if (!isNaN(zoomLevel)) {
            this.zoomLevel = zoomLevel;
            setZoomLevel.call(this, zoomLevel);
          }
        };
      }

      webContents.on("did-finish-load", () => {
        setZoom(config.zoom);
      });

      setZoom(config.zoom);

      if (config.maximized) {
        window.maximize();
      }

      this.setup_right_click_menu();
      this.setup_windows_history_buttons();
      this.setup_redirect();
    }

    set_context_menu_override(override) {
      this.context_menu_override = override;
    }

    setup_right_click_menu() {
      this.webContents.on("context-menu", (e, props) => {
        const editFlags = props.editFlags;
        const hasText = props.selectionText.trim().length > 0;
        const can = (type) => editFlags[`can${type}`] && hasText;

        let template = [
          // {
          // 	accelerator: 'CmdOrCtrl+Z',
          // 	click: function (item, win) {
          // 		win.webContents.undo();
          // 	}
          // },
          // {
          // 	accelerator: 'CmdOrCtrl+Y',
          // 	click: function (item, win) {
          // 		win.webContents.undo();
          // 	}
          // },
          {
            accelerator: "CmdOrCtrl+X",
            label: "Cut",
            role: can("Cut") ? "cut" : "",
            enabled: can("Cut"),
            visible: props.isEditable,
          },
          {
            accelerator: "CmdOrCtrl+C",
            label: "Copy",
            role: can("Copy") ? "copy" : "",
            enabled: can("Copy"),
            visible: props.isEditable || hasText,
          },
          {
            accelerator: "CmdOrCtrl+V",
            label: "Paste",
            role: editFlags.canPaste ? "paste" : "",
            enabled: editFlags.canPaste,
            visible: props.isEditable,
          },
          {
            accelerator: "CmdOrCtrl+A",
            label: "Select All",
            role: hasText ? "selectall" : "",
            enabled: hasText,
          },
        ];

        if (electronVer > 8) {
          let misspelledWord = props.misspelledWord;
          let dictionarySuggestions = props.dictionarySuggestions;
          if (misspelledWord && misspelledWord.length >= 1) {
            let new_template = [];

            if (dictionarySuggestions && dictionarySuggestions.length > 0) {
              dictionarySuggestions.slice(0, 5).forEach((correction) => {
                new_template.push({
                  label: correction,
                  click: () => {
                    this.webContents.replaceMisspelling(correction);
                  },
                });
              });
            } else {
              new_template.push({
                label: "No suggestion",
                enabled: false,
              });
            }

            new_template.push({
              label: "Add to Dictionary",
              click: () => {
                this.webContents.session.addWordToSpellCheckerDictionary(
                  misspelled,
                );
                this.webContents.replaceMisspelling(misspelled);
              },
            });
            new_template.push({ type: "separator" });
            template = new_template.concat(template);
          }
        }

        if (this.context_menu_override) {
          this.webContents.send("context-menu", props, template);
        } else {
          Menu.buildFromTemplate(template).popup(this.window);
        }
      });
    }

    setup_windows_history_buttons() {
      this.window.on("app-command", (e, cmd) => {
        if (cmd === "browser-backward" && this.webContents.canGoBack()) {
          this.webContents.goBack();
        } else if (
          cmd === "browser-forward" &&
          this.webContents.canGoForward()
        ) {
          this.webContents.goForward();
        }
      });
      this.window.on("swipe", (e, direction) => {
        if (direction === "left" && this.webContents.canGoBack()) {
          this.webContents.goBack();
        } else if (direction === "right" && this.webContents.canGoForward()) {
          this.webContents.goForward();
        }
      });
    }

    setup_redirect() {
      // Redirect links in local browser
      this.webContents.on("new-window", (e, url) => {
        e.preventDefault();
        openExternalUrl(url);
      });
      this.webContents.on("will-navigate", (e, url) => {
        if (url.indexOf(URL_ROOT) !== 0) {
          e.preventDefault();
          openExternalUrl(url);
        }
      });
    }

    get_window_state() {
      let bounds = this.window.getBounds();

      let state = {
        x: bounds.x,
        y: bounds.y,
        width: bounds.width,
        height: bounds.height,
        maximized: this.window.isMaximized(),
        zoom: this.webContents.zoomLevel || 0,
        showMenu: !this.window.autoHideMenuBar,
      };
      return state;
    }
  }

  class DynalistApp {
    constructor() {
      this.settings = {};
      this.window = null;
    }

    save_settings() {
      fs.writeFileSync(SETTINGS_PATH, JSON.stringify(this.settings));
    }

    load_settings() {
      try {
        this.settings =
          JSON.parse(fs.readFileSync(SETTINGS_PATH, "utf8")) || {};
      } catch (e) {}
    }

    register_protocol() {
      /*
			electron.protocol.interceptFileProtocol('file', function (req, callback) {
				let url = route(req.url);
				console.log(url);
				callback({path: url});
			});
			*/
      electron.protocol.registerFileProtocol(PROTOCOL, (req, callback) => {
        let url = route(req.url);
        console.log(url);
        callback({ path: url });
      });
    }

    unregister_protocol() {
      electron.protocol.unregisterProtocol(PROTOCOL);
    }

    start_ipc() {
      ipcMain.on("appdata", (event, arg) => {
        event.returnValue = DATA_PATH;
      });
      ipcMain.on("context-menu-override", (event, arg) => {
        console.log("Received context menu override from renderer", arg);
        this.window.set_context_menu_override(arg);
        event.returnValue = arg;
      });
      ipcMain.on("relaunch", (event, arg) => {
        if (manager.relaunch) {
          manager.relaunch();
        } else {
          app.relaunch();
          app.releaseSingleInstance();
          app.exit();
        }

        event.returnValue = 0;
      });
      ipcMain.on("updater", (event, arg) => {
        let result = {};

        if (manager.updater) {
          result.updating = manager.updater.updating;
        }
        if (manager.config) {
          try {
            result.shell_version = manager.config.get_shell_version();
            result.dynalist_version = manager.last_dynalist_version;
            result.new_dynalist_version =
              manager.config.get_package("dynalist").version;
          } catch (e) {}
        } else if (manager.is_debugging) {
          result.updating = true;
          result.shell_version = "1.0.0-dev";
          result.dynalist_version = "1.0.0-dev";
          result.new_dynalist_version = "1.0.1-dev";
        }

        event.returnValue = result;
      });
      ipcMain.on("async-global-shortcut", (event, shortcut, register) => {
        if (!shortcut) {
          return;
        }
        if (register) {
          globalShortcut.register(shortcut, () => {
            if (this.window === null) {
              this.create_window();
            }
            let win = this.window;
            win.window.focus();
            win.webContents.focus();
            win.webContents.send("async-global-shortcut-trigger", shortcut);
          });
        } else {
          globalShortcut.unregister(shortcut);
        }
      });
    }

    setup_application_menu() {
      let sendUndoRedo = (webContents, redo) => {
        let modifiers = [];

        modifiers.push(PLATFORM === "mac" ? "meta" : "control");

        if (redo) {
          modifiers.push("shift");
        }

        webContents.sendInputEvent({
          type: "keyDown",
          keyCode: "Z",
          modifiers: modifiers,
        });
        webContents.sendInputEvent({
          type: "keyUp",
          keyCode: "Z",
          modifiers: modifiers,
        });
      };

      // Menu based on https://github.com/electron/electron/blob/02a95a3ebad1095811227f2ea384061405e41bf1/default_app/main.js#L47
      // Default implementations of roles: https://github.com/electron/electron/blob/02a95a3ebad1095811227f2ea384061405e41bf1/lib/browser/api/menu-item-roles.js

      const template = [
        {
          label: "&Edit",
          submenu: [
            {
              label: "Undo",
              accelerator: "CmdOrCtrl+Z",
              click(item, focusedWindow) {
                if (focusedWindow) {
                  sendUndoRedo(focusedWindow.webContents, false);
                  if (PLATFORM === "mac") {
                    focusedWindow.webContents.undo();
                  }
                }
              },
            },
            {
              label: "Redo",
              accelerator: "Shift+CmdOrCtrl+Z",
              click(item, focusedWindow) {
                if (focusedWindow) {
                  sendUndoRedo(focusedWindow.webContents, true);
                  if (PLATFORM === "mac") {
                    focusedWindow.webContents.redo();
                  }
                }
              },
            },
            { type: "separator" },
            { role: "cut" },
            { role: "copy" },
            { role: "paste" },
            { role: "pasteandmatchstyle" },
            { role: "delete" },
            { role: "selectall" },
          ],
        },
        {
          label: "&View",
          submenu: [
            // {
            // 	label: 'Reload',
            // 	accelerator: 'CmdOrCtrl+R',
            // 	click (item, focusedWindow) {
            // 		if (focusedWindow) {
            // 			focusedWindow.reload()
            // 		}
            // 	}
            // },
            {
              label: "Navigate back",
              accelerator: PLATFORM === "mac" ? "CmdOrCtrl+Left" : "Alt+Left",
              click(item, focusedWindow) {
                if (focusedWindow) {
                  focusedWindow.webContents.goBack();
                }
              },
            },
            {
              label: "Navigate forward",
              accelerator: PLATFORM === "mac" ? "CmdOrCtrl+Right" : "Alt+Right",
              click(item, focusedWindow) {
                if (focusedWindow) {
                  focusedWindow.webContents.goForward();
                }
              },
            },
            { role: "resetzoom" },
            { role: "zoomin", accelerator: "CommandOrControl+=" },
            { role: "zoomout", accelerator: "CommandOrControl+-" },
            {
              label: "Auto-Hide Main Menu",
              click(item, focusedWindow) {
                if (focusedWindow) {
                  focusedWindow.autoHideMenuBar =
                    !focusedWindow.autoHideMenuBar;
                  focusedWindow.setMenuBarVisibility(true);
                }
              },
            },
            { type: "separator" },
            { role: "togglefullscreen" },
            {
              label: "Toggle Developer Tools",
              accelerator:
                PLATFORM === "mac" ? "Alt+Command+I" : "Ctrl+Shift+I",
              click(item, focusedWindow) {
                if (focusedWindow) {
                  focusedWindow.toggleDevTools();
                }
              },
            },
          ],
        },
        {
          label: "&Window",
          role: "window",
          submenu: [{ role: "minimize" }, { role: "close" }],
        },
        {
          label: "&Help",
          role: "help",
          submenu: [
            {
              label: "Community",
              click() {
                shell.openExternal("http://talk.dynalist.io");
              },
            },
            {
              label: "Help Center",
              click() {
                shell.openExternal("http://help.dynalist.io");
              },
            },
            {
              label: "Go to Dynalist",
              click() {
                shell.openExternal("https://dynalist.io");
              },
            },
          ],
        },
      ];

      let print = {
        label: "Print",
        accelerator: "CommandOrControl+P",
        click(item, focusedWindow) {
          if (focusedWindow) {
            focusedWindow.webContents.print();
          }
        },
      };

      let print_to_pdf = {
        label: "Print to PDF",
        accelerator: "CommandOrControl+Shift+P",
        click(item, focusedWindow) {
          if (!focusedWindow) {
            return;
          }

          let filename = focusedWindow.getTitle();

          filename = sanitize_filename(filename);

          dialog.showSaveDialog(
            focusedWindow,
            {
              title: "Save PDF",
              defaultPath: "*/" + filename + ".pdf",
              filters: [
                { name: "PDF file", extensions: ["pdf"] },
                { name: "All Files", extensions: ["*"] },
              ],
            },
            (filename) => {
              if (!filename) {
                return;
              }

              console.log("Printing to PDF file", filename);
              focusedWindow.webContents.printToPDF({}, (error, data) => {
                fs.writeFileSync(filename, data);
              });
            },
          );
        },
      };

      if (PLATFORM === "mac") {
        template.unshift({
          label: "&Dynalist",
          submenu: [
            { role: "hide" },
            { role: "hideothers" },
            { role: "unhide" },
            { type: "separator" },
            print,
            print_to_pdf,
            { role: "quit" },
          ],
        });
        template[1].submenu.push(
          { type: "separator" },
          {
            label: "Speech",
            submenu: [{ role: "startspeaking" }, { role: "stopspeaking" }],
          },
        );
        template[3].submenu = [
          { role: "close" },
          { role: "minimize" },
          { role: "zoom" },
          { type: "separator" },
          { role: "front" },
        ];
      } else {
        template.unshift({
          label: "&File",
          submenu: [print, print_to_pdf, { role: "quit" }],
        });
      }

      Menu.setApplicationMenu(Menu.buildFromTemplate(template));
    }

    create_window() {
      this.window = new WindowManager(this.settings.window);

      let win = this.window.window;

      // win.webContents.on('did-finish-load', () => {
      // 	win.setTitle(app.getName());
      // });

      win.webContents.on(
        "did-fail-load",
        (event, errorCode, errorDescription, validatedURL) => {
          let systemPath = route(validatedURL);
          let data = `<style>body{margin:50px;text-align:center;}</style><h3>Dynalist failed to load... </h3><p>Error: ${errorDescription}</p><p>Path: ${systemPath}</p><h4>If you keep seeing this error, please contact <a href="mailto:support@dynalist.io">support@dynalist.io</a></h4>`;
          win.webContents.executeJavaScript(
            'document.write(atob("' +
              new Buffer(data).toString("base64") +
              '"))',
          );
        },
      );

      win.on("close", () => {
        this.settings.window = this.window.get_window_state();
        this.save_settings();
      });

      win.on("closed", () => {
        this.window = null;
      });

      win.loadURL(URL_ROOT + APP_ROUTE);

      if (manager.is_debugging) {
        win.webContents.openDevTools();
      }
    }

    run() {
      this.load_settings();
      this.register_protocol();
      this.start_ipc();

      try {
        this.setup_application_menu();
      } catch (e) {
        console.error(e);
      }

      try {
        this.create_linux_desktop_file();
      } catch (e) {
        console.error(e);
      }

      this.create_window();
    }

    on_activate() {
      if (!this.window) {
        this.create_window();
      }
    }

    create_linux_desktop_file() {
      if (PLATFORM !== "linux") {
        return;
      }

      // Copy icon over
      if (!file_exists(LOCAL_ICON_PATH)) {
        fs.writeFileSync(LOCAL_ICON_PATH, fs.readFileSync(SMALL_ICON_PATH));
      }

      let desktop_file_location = path.resolve(
        process.env.HOME,
        ".local/share/applications",
      );
      if (!dir_exists(desktop_file_location)) {
        return;
      }

      let desktop_file = path.join(desktop_file_location, "dynalist.desktop");
      if (file_exists(desktop_file)) {
        return;
      }

      // Create the desktop file
      let data = [
        "[Desktop Entry]",
        "Encoding=UTF-8",
        "Version=1.0",
        "Type=Application",
        "Terminal=false",
        "Exec=" + process.execPath,
        "Name=Dynalist",
        "Icon=" + LOCAL_ICON_PATH,
      ];
      fs.writeFileSync(desktop_file, data.join("\n"), "utf8");
    }
  }

  let dynalist = new DynalistApp();
  manager.context.app = dynalist;

  dynalist.run();

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") {
      app.quit();
    }
  });

  app.on("activate", () => {
    dynalist.on_activate();
  });

  app.on("will-quit", () => {
    globalShortcut.unregisterAll();
  });
};
