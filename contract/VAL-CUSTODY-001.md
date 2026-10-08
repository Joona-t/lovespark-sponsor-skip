# VAL-CUSTODY-001: Delivery stays inside the assigned local scope

Surface: artifact.
Needs: `evidence/preexisting-lib.sha256`, final scoped Git diff, and activity record.
Behavior: Pre-existing `lib/` contents remain byte-identical to the recorded initial snapshot, this nested repository's mission edits avoid unrelated paths, and no publish, deploy, store submission, remote release, commit, or push is performed.
Evidence: `shasum -a 256 -c evidence/preexisting-lib.sha256` passes; final scoped `git status --short` and `git diff --stat` distinguish mission files from preserved pre-existing lib state; delivery record lists local-only actions.
Fail: Any recorded `lib/` hash changes after the snapshot, an unrelated nested-repository path is edited by this mission, or any prohibited external action occurs.
