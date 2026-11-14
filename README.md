# andkondev.github.io

Source for [andkon.dev](https://andkon.dev/), a personal developer portfolio presented as a small old-OS style desktop.

## Links

- [Live site](https://andkon.dev/) - the main fake desktop homepage. Double-click icons to open projects, including Orbit.
- [This repository](https://github.com/andkondev/andkondev.github.io) - source for the GitHub Pages site.
- [GitHub profile](https://github.com/andkondev) - the account linked by the desktop's `/andkondev` shortcut.

## Desktop Projects

- [Grokipedia Split View](https://andkon.dev/grokipedia-wikipedia-split/) - a side-by-side reading and comparison page.
- [License Plate Tracker](https://andkon.dev/license-plate-tracker/) - a license plate tracking project page.
- [Andkon's Swim Timer](https://andkon.dev/swim-timer/) - a browser swim timing tool.
- [Multirow Taskbar W11](https://github.com/andkondev/draggable-multirow-taskbar-systray-windows-11/tree/main#readme) - a Windows 11 multi-row taskbar and system tray mod repository.
- [Orbit](orbit/) - a web port of the old Orbit game from Encarta 97's Interactivities section. It opens from the desktop icon and also runs directly at [andkon.dev/orbit](https://andkon.dev/orbit/). See the [Orbit README](orbit/README.md) for screenshots and historical links.

- [Lava Lamp](https://addons.mozilla.org/en-US/firefox/addon/lavalamp/) - an animated lava lamp theme for Firefox. The desktop's Lava Lamp window draws the same wax live, using the theme's own simulation (`assets/lava-core.js`).

## Credits

- `assets/phoenix-logo.png` is the logo of Mozilla's Phoenix browser (2002), by Mozilla, from [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Mozilla_Phoenix_Logo.png), available under the MPL 1.1, GPL and LGPL.

## Local Development

This is a static site. From the repository root:

```powershell
python -m http.server 8777 --bind 127.0.0.1
```

Then open [http://127.0.0.1:8777/](http://127.0.0.1:8777/).
