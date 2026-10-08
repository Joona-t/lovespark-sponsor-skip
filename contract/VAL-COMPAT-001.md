# VAL-COMPAT-001: Supported browsers have valid runtime entry points

Surface: browser.
Needs: installed local Chrome and Firefox binaries plus the unpacked extension directory.
Behavior: One package targets Chrome/Edge 121+ and Firefox 140+, declares `background.service_worker` and `background.scripts` together at the top-level background key, loads the API alias/core before runtime code, uses Promise-safe `browser.*` calls, accurately declares Firefox `data_collection_permissions.required: ["browsingActivity"]`, and adds no API/host permissions. Optional badge APIs cannot abort initialization. Default commands are `Alt+Shift+S` and `Alt+Shift+W`, and README/settings match them.
Evidence: `npm run check` parses the manifest, rejects nested Gecko background declarations/reserved shortcuts/legacy Firefox disclosure/`chrome.*` runtime calls, checks file order, permissions, version floors, docs parity, and optional badge absence. `npm run smoke:chrome` must find this exact package's worker target and a successful ping response. Firefox temporary-load evidence must show the same package's background page plus a successful ping response and no startup error.
Fail: A runtime entry is absent, a shortcut is invalid, initialization throws, Chrome smoke fails, or Firefox manual evidence is unavailable. Firefox evidence unavailability blocks only the Firefox real-runtime verdict; it is not converted to a pass.
Scope: Store acceptance and Edge-specific runtime execution are not claimed; Edge compatibility is limited to its Chromium 121+ manifest/runtime model.
