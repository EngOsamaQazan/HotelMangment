# Legacy bed-level combinability snapshot

Captured at: 2026-04-22T20:12:23.941Z
Total rows with `combinable=true`: **6**

This snapshot was taken right before the `combinable` / `combines_to_type`
columns on `unit_type_beds` were dropped. Use it if you later need to
identify which unit types historically had bed-level combinability set, so
you can create the equivalent `UnitMerge` rows (room-to-room merging).

| UnitType (AR) | Code | Room | Bed | Count | CombinesTo | SleepsExtra | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| شقة غرفة نوم — سريران مفردان | APT-1BR-TWIN | غرفة النوم | single | 2 | king | — |  |
| شقة غرفتين وصالة — مزدوج + ثلاثي مفرد | APT-2BR-MIX-A | غرفة النوم الثانية | single | 3 | king | — |  |
| شقة غرفتين وصالة — مزدوج + ثنائي مفرد | APT-2BR-MIX-B | غرفة النوم الثانية | single | 2 | king | — |  |
| غرفة ثنائية مفردة | HTL-TWIN | الغرفة | single | 2 | king | — |  |
| غرفة ثلاثية مفردة | HTL-TRIPLE | الغرفة | single | 3 | king | — |  |
| غرفة رباعية مفردة | HTL-QUAD | الغرفة | single | 4 | king | — |  |
