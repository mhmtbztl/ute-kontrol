# Codex worktree denetimi — 25 Eylül 2026

Referans: `origin/master` = `ca6fbb9`. Denetim salt okunur yapıldı; hiçbir worktree veya dal kaldırılmadı. `.env` içerikleri okunmadı.

| Mutlak yol | Dal | HEAD | Ahead / behind | Benzersiz commit | Tracked değişiklik | Takipsiz dosya | Yerel env dosyası | Öneri |
|---|---|---:|---:|---:|---:|---:|---|---|
| `C:\Users\pc\Desktop\lexbnb-codex-marketing` | `codex/marketing` | `650db4f4e8a8` | 0 / 108 | 0 | 0 | 0 | yok | Kaldırılabilir |
| `C:\Users\pc\Desktop\lexbnb-codex-phase34` | `codex/phase34-cleaning-operations` | `c53830647a08` | 0 / 60 | 0 | 0 | 0 | `.env` | Kaldırılabilir; worktree kaldırma yerel env kopyasını da kaldırır |
| `C:\Users\pc\Desktop\lexbnb-codex-phase36` | `codex/phase36-property-readiness` | `743215c285d2` | 0 / 57 | 0 | 0 | 0 | `.env`, `.env.test` | Kaldırılabilir; worktree kaldırma iki yerel env kopyasını da kaldırır |
| `C:\Users\pc\Desktop\lexbnb-codex-phase38` | `codex/phase38-executive-kpis` | `d0585a06f415` | 0 / 55 | 0 | 0 | 0 | `.env`, `.env.test` | Kaldırılabilir; worktree kaldırma iki yerel env kopyasını da kaldırır |
| `C:\Users\pc\Desktop\lexbnb-codex-push-20260924` | `codex/push-20260924` | `f03897ad63d7` | 0 / 16 | 0 | 0 | 0 | `.env` | HATALAR.md'de adı yoktu; aynı ölçütlerle kaldırılabilir, otomatik kaldırılmadı |

`lexbnb-claude` ve `lexbnb-antigravity` yalnız `git worktree list` envanterinde görüldü; aktif araç worktree'leri oldukları için içerikleri denetlenmedi ve onlara dokunulmadı.

Kaldırma ancak açık kullanıcı onayından sonra, her mutlak yol yeniden doğrulanarak `git worktree remove <mutlak-yol>` ile ve `--force` olmadan yapılır. Dal silme ayrı onay gerektirir.
