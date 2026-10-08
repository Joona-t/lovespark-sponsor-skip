'use strict';

// Chrome/Edge use a service worker; Firefox loads the same files from
// background.scripts. Keeping the order identical makes both runtimes execute
// the Promise API alias and shared validation core before background.js.
importScripts('lib/browser-polyfill.min.js', 'core.js', 'background.js');
