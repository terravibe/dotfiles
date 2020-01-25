/* extension.js
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 2 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 *
 * SPDX-License-Identifier: GPL-2.0-or-later
 *
 * Original Author: fmuellner@gnome.org
 */

const { GLib, GObject, Meta } = imports.gi;

const CloseDialog = imports.ui.closeDialog;

let DisableCloseDialog = GObject.registerClass({
    Implements: [ Meta.CloseDialog ],
    Properties: {
        window: GObject.ParamSpec.override('window', Meta.CloseDialog)
    }
}, class DisableCloseDialog extends GObject.Object {
    _init(window) {
        super._init();
        this._window = window;
    }

    get window() {
        return this._window;
    }

    vfunc_show() {
        GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
            this.response(Meta.CloseDialogResponse.WAIT);
            return GLib.SOURCE_REMOVE;
        });
    }

    vfunc_hide() {
    }

    vfunc_focus() {
    }
});

class Extension {
    constructor() {
        this._origCloseDialog = CloseDialog.CloseDialog;
    }

    enable() {
        CloseDialog.CloseDialog = DisableCloseDialog;
    }

    disable() {
        CloseDialog.CloseDialog = this._origCloseDialog;
    }
}

function init() {
    return new Extension();
}
