# VAL-UNDO-001: Undo is durable and statistics remain honest

Surface: browser.
Needs: a successfully auto-skipped segment and local statistic fixtures.
Behavior: Undo uses a skip-specific, non-viewing-history receipt to seek to the segment start, suppress automatic re-skip for that active video, and reverse that skip's total/today/category/time contribution exactly once without making values negative. Immediate Undo before asynchronous record acknowledgement, duplicate record/Undo delivery, and unrelated concurrent stat updates remain correct.
Evidence: `npm test` asserts playback time, no re-skip, immediate and delayed acknowledgement ordering, duplicate messages, concurrent unrelated updates, one reversal, and exact nonnegative storage values. Manual release check observes the user-visible flow on an unpacked extension.
Fail: The undone segment auto-skips again, retained statistics credit undone time, or duplicate Undo changes counters twice.
