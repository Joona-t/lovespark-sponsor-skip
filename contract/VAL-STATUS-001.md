# VAL-STATUS-001: The popup reports current lookup state honestly

Surface: browser.
Needs: popup fixtures for each background tab status.
Behavior: The popup distinguishes loading/unknown, disabled, whitelisted, non-video, clean, cached/offline, unavailable, and ready states; unavailable is never presented as clean. Status is bound to the active tab and current video, stale lookup completion cannot overwrite a newer navigation, and a restarted background can recover current state from the content runtime or show unknown rather than a false clean/non-video result.
Evidence: `npm test` renders every status and exercises navigation races/background state loss with tab/video identities. Chrome runtime evidence opens the popup on non-video and YouTube fixtures and records state plus background/content ping results.
Fail: Two materially different failure/success states share a misleading message, or unavailable appears clean/ready.
