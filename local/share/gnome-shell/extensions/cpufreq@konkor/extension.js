/*
 * This is a part of CPUFreq Manager
 * Copyright (C) 2016-2019 konkor <konkor.github.io>
 *
 * Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 * You should have received a copy of the GNU General Public License along
 * with this program. If not, see <http://www.gnu.org/licenses/>.
 */

const Lang      = imports.lang;
const GLib      = imports.gi.GLib;
const Gio       = imports.gi.Gio;
const St        = imports.gi.St;
const Main      = imports.ui.main;
const Tweener   = imports.ui.tweener;
const PanelMenu = imports.ui.panelMenu;

const ExtensionUtils = imports.misc.extensionUtils;

const Me = ExtensionUtils.getCurrentExtension ();
const Logger       = Me.imports.common.Logger;
const Convenience  = Me.imports.convenience;
const EXTENSIONDIR = Me.dir.get_path ();
const APP_PATH     = EXTENSIONDIR + "/cpufreq-application";

const SAVE_SETTINGS_KEY = 'save-settings';
const EXTENSION_MODE_KEY= 'extension-mode';
const SHOW_SPLASH_KEY   = 'show-splash';
const PROFILE_ID_KEY    = 'profile-id';
const MONITOR_KEY       = 'monitor';
const EPROFILES_KEY     = 'event-profiles';
const LABEL_KEY         = 'label'
//const SETTINGS_ID = 'org.gnome.shell.extensions.cpufreq';

let event = 0;
let event_style = 0;
let monitor_event = 0;
let settingsID, powerID, scheduleID;

let save = false;
let extmode = true;
let splash = true;
let label_text = "";
let title_text = "\u26A0";
let title_style = "";
let monitor_timeout = 500;
let eprofiles = [
  {percent:0, event:0, guid:""},
  {percent:100, event:1, guid:""}
];
let first_boot = true;
let guid_battery = "";

const UP_BUS_NAME = 'org.freedesktop.UPower';
const UP_OBJECT_PATH = '/org/freedesktop/UPower/devices/DisplayDevice';
const DisplayDeviceInterface = '<node> \
<interface name="org.freedesktop.UPower.Device"> \
  <property name="Type" type="u" access="read"/> \
  <property name="State" type="u" access="read"/> \
  <property name="Percentage" type="d" access="read"/> \
  <property name="TimeToEmpty" type="x" access="read"/> \
  <property name="TimeToFull" type="x" access="read"/> \
  <property name="IsPresent" type="b" access="read"/> \
  <property name="IconName" type="s" access="read"/> \
</interface> \
</node>';
const PowerManagerProxy = Gio.DBusProxy.makeProxyWrapper(DisplayDeviceInterface);

const BUS_NAME = 'org.konkor.cpufreq.service';
const OBJECT_PATH = '/org/konkor/cpufreq/service';
const CpufreqServiceIface = '<node> \
<interface name="org.konkor.cpufreq.service"> \
<property name="Frequency" type="t" access="read"/> \
<signal name="FrequencyChanged"> \
  <arg name="title" type="s"/> \
</signal> \
<signal name="LoadingEvent"> \
  <arg name="loading" type="t"/> \
</signal> \
<signal name="StyleChanged"> \
  <arg name="style" type="s"/> \
</signal> \
</interface> \
</node>';
const CpufreqServiceProxy = Gio.DBusProxy.makeProxyWrapper (CpufreqServiceIface);

const FrequencyIndicator = new Lang.Class({
  Name: 'Cpufreq',
  Extends: PanelMenu.Button,

  _init: function () {
    this.parent (0.0, "CPU Frequency Indicator", false);
    this.settings = Convenience.getSettings();
    this.on_settings (null, null);

    this.statusLabel = new St.Label ({
      text: title_text, y_expand: true, y_align: 2, style_class:'cpufreq-text'
    });
    this.statusLabel.style = title_style;
    let _box = new St.BoxLayout();
    _box.add_actor (this.statusLabel);
    this.actor.add_actor (_box);
    this.actor.connect ('button-press-event', () => {
      var args = extmode ? "--extension" : "";
      if (splash)
        if (!this.app_running) this.show_splash ();
      if (!guid_battery || (guid_battery == this.guid)) this.launch_app (args);
      else this.launch_app (args + " --no-save");
    });
    if (!monitor_timeout) this.statusLabel.set_text (this.get_title ());

    this.add_event ();

    //TODO: Workaround updating title
    this.settings.set_boolean (SAVE_SETTINGS_KEY, !save);
    this.settings.set_boolean (SAVE_SETTINGS_KEY, save);

    if (settingsID) this.settings.disconnect (settingsID);
    settingsID = this.settings.connect ("changed", this.on_settings.bind (this));

    this.power = new PowerManagerProxy (Gio.DBus.system, UP_BUS_NAME, UP_OBJECT_PATH, (proxy, e) => {
      if (e) {
        error (e.message);
        return;
      }
      this.on_power_state (proxy.State, proxy.Percentage);
      if (save && first_boot && !guid_battery) this.launch_app ("-p user");
      first_boot = false;
      GLib.timeout_add (0, 8000, () => {
        powerID = this.power.connect ('g-properties-changed', (o,a) => {
          //a = a{sv}
          this.on_power_state (this.power.State, this.power.Percentage);
        });
      });
    });
  },

  on_settings: function (o, key) {
    let s;
    o = o || this.settings;

    if (!key) {
      this.guid =  o.get_string (PROFILE_ID_KEY);
      monitor_timeout =  o.get_int (MONITOR_KEY);
      save = o.get_boolean (SAVE_SETTINGS_KEY);
      extmode = o.get_boolean (EXTENSION_MODE_KEY);
      splash = o.get_boolean (SHOW_SPLASH_KEY);
      label_text = o.get_string (LABEL_KEY);
      s = o.get_string (EPROFILES_KEY);
      if (s) eprofiles = JSON.parse (s);
    }

    if (key == MONITOR_KEY) {
      monitor_timeout =  o.get_int (MONITOR_KEY);
      if (monitor_event) {
        GLib.source_remove (monitor_event);
        monitor_event = 0;
      }
      monitor_event = GLib.timeout_add (100, 1000, this.add_event.bind (this));
    } else if (key == PROFILE_ID_KEY) {
      this.guid =  o.get_string (PROFILE_ID_KEY);
    } else if (key == LABEL_KEY) {
      label_text = o.get_string (LABEL_KEY);
    } else if (key == EPROFILES_KEY) {
      s = o.get_string (EPROFILES_KEY);
      if (s) eprofiles = JSON.parse (s);
    } else if (key == EXTENSION_MODE_KEY) {
      extmode = o.get_boolean (EXTENSION_MODE_KEY);
    } else if (key == SHOW_SPLASH_KEY) {
      splash = o.get_boolean (SHOW_SPLASH_KEY);
    }

    if ((key == LABEL_KEY) && !monitor_timeout) this.statusLabel.set_text (this.get_title ());

    /*if ((key == "power-state") || (key == "power-percentage")) {
      debug ("power-state changed...");
      this.on_power_state (o.get_uint ("power-state"), o.get_double ("power-percentage"));
    }*/
  },

  on_power_state: function (state, percentage) {
    let id = eprofiles[1].guid;
    //debug ("on_power_state: %s %s%%".format (this.power.State, this.power.Percentage));
    debug ("on_power_state: %s %s%%".format (state, percentage));
    if (!id) return;
    if (state == 2) {
      //on battery
      if (id == guid_battery) return;
      if (percentage < eprofiles[1].percent) {
        this.schedule_profile ('--no-save -p ' + id);
        guid_battery = id;
      }
    } else {
      //restoring prev state
      if (guid_battery == this.guid) return;
      this.schedule_profile ('-p user');
      guid_battery = this.guid;
    }
  },

  unschedule_profile: function () {
    GLib.source_remove (scheduleID);
    scheduleID = 0;
  },

  schedule_profile: function (options) {
    if (scheduleID) this.unschedule_profile ();
    scheduleID = GLib.timeout_add (0, 5000, () => {
      this.launch_app (options);
      scheduleID = 0;
    });
  },

  launch_app: function (options) {
    let extra = "";
    /*if (Logger.debug_lvl == 2) extra = " --debug";
    else if (Logger.debug_lvl == 1) extra = " --verbose";*/
    options = options || "";
    info ("launch_app " + options + extra);
    GLib.spawn_command_line_async ("%s %s".format (APP_PATH, options + extra));
  },

  get app_running () {
    let res = GLib.spawn_command_line_sync ("ps -A");
    let o, n;
    if (res[0]) o = Convenience.byteArrayToString (res[1]).toString().split("\n");
    for (let i = 0; i < o.length; i++) {
      if (o[i].indexOf ("cpufreq-app") > -1) {
        n = parseInt (o[i].trim().split(" ")[0]);
        if (Number.isInteger(n) && n > 0) return n;
      }
    }
    return 0;
  },

  get_title: function (text) {
    text = text || label_text;
    title_text = text.trim ();
    return title_text;
  },

  add_event: function () {
    this.remove_proxy ();
    if (monitor_timeout > 0) {
      if (!GLib.spawn_command_line_async (EXTENSIONDIR + "/cpufreq-service")) {
        //error ("Unable to start cpufreq service...");
        return;
      }
      this.proxy = new CpufreqServiceProxy (Gio.DBus.session, BUS_NAME, OBJECT_PATH, (proxy, e) => {
        if (e) {
          error (e.message);
          return;
        }
        event = this.proxy.connectSignal ('FrequencyChanged', (o, s, title) => {
          if (title) this.statusLabel.set_text (this.get_title (title.toString ()));
        });
        event_style = this.proxy.connectSignal ('StyleChanged', (o, s, style) => {
          if (style) {
            title_style = style.toString ();
            this.statusLabel.style = title_style;
          }
        });
      });
    }
    monitor_event = 0;
    // cpufreq-service should stop auto on disabled monitors
    //else GLib.spawn_command_line_async ("killall cpufreq-service");
  },

  remove_proxy: function () {
    if (this.proxy) {
      if (event) this.proxy.disconnectSignal (event);
      if (event_style) this.proxy.disconnectSignal (event_style);
      delete this.proxy;
    }
    this.proxy = null;
    event = 0;
    event_style = 0;
  },

  remove_events: function () {
    this.remove_proxy ();
    if (settingsID) this.settings.disconnect (settingsID);
    if (powerID) this.power.disconnect (powerID);
    if (monitor_event) GLib.source_remove (monitor_event);
    event = 0; monitor_event = 0;
    settingsID = 0; powerID = 0;
    //GLib.spawn_command_line_async ("killall cpufreq-service");
  },

  show_splash: function () {
    let monitor = Main.layoutManager.focusMonitor;
    let height = monitor.height < monitor.width ? monitor.height : monitor.width;
    let width = 512 * height / 1200;
    if (!this.splash)
      this.splash = Gio.icon_new_for_string (EXTENSIONDIR + "/data/splash.svg");
    let splash = new St.Icon ({gicon: this.splash, icon_size: width});
    Main.uiGroup.add_actor (splash);

    splash.set_position (Math.floor (monitor.width / 2 - splash.width / 2),
      Math.floor (monitor.height / 2 - splash.height / 2));

    Tweener.addTween (splash, {
      time: 2, transition: 'easeOut',
      onComplete: () => {
        Main.uiGroup.remove_actor (splash);
        splash = null;
      }
    });
  }
});

function show_notify (message, style) {
  //var text = new St.Label ({text: message, style_class: style?style:'cpufreq-notify'});
  var text = new St.Label ({text: message, style_class: "modal-dialog audio-selection-content restart-message"});
  text.opacity = 255;
  Main.uiGroup.add_actor (text);

  text.set_position (Math.floor (Main.layoutManager.primaryMonitor.width / 2 - text.width / 2),
    Math.floor (Main.layoutManager.primaryMonitor.height / 2 - text.height / 2));

  Tweener.addTween (text, {
    opacity: 224, time: 1.2, transition: 'easeOut',
    onComplete: () => {
      Main.uiGroup.remove_actor (text);
      text = null;
    }
  });
}

function show_warn (message) {
    show_notify (message, "warn-label");
}

let monitor;
Logger.init (Logger.LEVEL.ERROR, true);

function info (msg) {
  Logger.info ("extension", msg);
}

function debug (msg) {
  Logger.debug ("extension", msg);
}

function error (msg) {
  Logger.error ("extension", msg);
}

function init () {
}

function enable () {
  monitor = new FrequencyIndicator;
  Main.panel.addToStatusArea ('cpufreq-indicator', monitor);
}

function disable () {
  monitor.remove_events ();
  monitor.destroy ();
  monitor = null;
}
