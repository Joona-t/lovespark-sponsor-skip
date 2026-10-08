# VAL-INPUT-001: Runtime inputs cannot corrupt control or storage state

Surface: library.
Needs: shared core plus message/storage fixtures.
Behavior: Malformed video IDs, modes, categories, durations, segment arrays, whitelist records, receipt IDs, and unknown actions are rejected or normalized without storage/stat mutation, unsafe playback, or an unhandled message rejection.
Evidence: Table-driven core tests and background message integration tests assert response shape and unchanged storage/playback for each invalid class.
Fail: Invalid input reaches fetch/playback, changes counters/whitelists/modes, or leaves a message unresolved.

