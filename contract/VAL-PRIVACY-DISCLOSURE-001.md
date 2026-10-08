# VAL-PRIVACY-DISCLOSURE-001: Public privacy claims match retained and transmitted data

Surface: artifact.
Needs: final storage and network schemas.
Behavior: `PRIVACY.md`, README, and Firefox manifest consistently disclose local preferences, statistics, skip receipts, cache segment metadata, user-selected channel/video whitelist identifiers, the outbound four-character hash prefix as Firefox `browsingActivity`, and the fact that deterministic full-hash cache keys reduce immediate readability but are not anonymity. They do not claim that no data is stored.
Evidence: Automated claim checks plus a source-to-disclosure matrix covering every `storage.local` key family and outbound request field.
Fail: A shipped claim denies retained identifiers, calls deterministic keys anonymous/opaque without qualification, or omits a transmitted field.
