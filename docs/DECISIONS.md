# Atlas owner decisions

Owner: Tulga. Recorded 16 November 2026. Claude Code uses these during the autonomous build and does not ask about them again. To change one, edit this file and the matching configuration.

| # | Decision | Answer |
|---|---|---|
| D1 | Google Cloud project and YouTube Data API key | **Done.** Project `atlas-charts` under the owner's Google account. API key "Atlas YouTube collector", created 16 Nov 2026, restricted to YouTube Data API v3 only. It is supplied as the environment variable `YOUTUBE_API_KEY`; never commit it. |
| D2 | Apply for YouTube's derived-metrics amendment (Analytics & Reporting) | **Yes**; the owner applies separately. Until acceptance is confirmed here, the system runs in **30-day mode**. Build both modes; the mode is a configuration value. |
| D3 | Public YouTube ranking | **Dashboard only** for now. Build the public pages behind a feature flag that is off. |
| D4 | Video kinds that count towards a song | **Official music video, official audio ("Topic") and official lyric video.** Live, performance and fan uploads can be catalogued with their kind but don't count towards the song total. |
| D5 | YouTube history after 36 months | Delete raw YouTube statistics at the end of the active window. Keep only Atlas's own weekly and monthly summaries, and only if the accepted policy allows; otherwise delete those too. Default until confirmed: delete. |
| D6 | Daily YouTube collection time | **05:30 Asia/Ulaanbaatar.** Comment collection (A8) runs after statistics. Apple stays at 06:00. |
| D7 | Starting music-context vocabulary | The lists below. Editors can propose new terms; administrators approve them. |
| D8 | AI suggestions for tags | **Yes.** Suggestions only, from permitted metadata; an editor confirms each tag. Uses `ANTHROPIC_API_KEY` and `ATLAS_AI_MODEL`. |
| D9 | Who labels an artist's scene | **Editors and administrators only**, with evidence. Artists and labels can dispute through the existing dispute flow. |
| D10 | Comment sentiment | AI provider: **Anthropic** (`ANTHROPIC_API_KEY`, model from `ATLAS_AI_MODEL`, default `claude-haiku-5-5`). Minimum accuracy on the editor-labelled sample: **80%** overall and per language group. **Dashboard only** until the owner enables the public flag. |

## Still outstanding (not blocking the build)

- **Apple Music developer token** (`APPLE_MUSIC_DEVELOPER_TOKEN`): the owner is obtaining it. Build and test against fixtures until then.
- **Anthropic API key** for tag suggestions and sentiment: the owner will add it. Build and test with fixtures and a fake model client until then.
- **Hosted Supabase:** migrations are not pushed by Claude Code. See `docs/HANDOFF.md` after the build.
- **YouTube derived-metrics application:** owner action (D2).

## D7: starting vocabulary

Slugs are English, lower-case, hyphenated. Labels: Mongolian first, then English.

### Genre (song level; artist profile is calculated)

| Slug | Mongolian | English |
|---|---|---|
| pop | Поп | Pop |
| hip-hop | Хип хоп | Hip-hop / Rap |
| rnb-soul | Ар энд би / Соул | R&B / Soul |
| rock | Рок | Rock |
| metal | Метал | Metal |
| hunnu-rock | Хүннү рок / фолк метал | Hunnu rock / Folk metal |
| indie-alternative | Инди / Альтернатив | Indie / Alternative |
| electronic | Электрон | Electronic / Dance |
| ballad | Баллад | Ballad |
| folk-fusion | Ардын хөгжмийн фьюжн | Folk fusion |
| mongolian-folk | Ардын дуу | Mongolian folk song |
| traditional | Уламжлалт хөгжим (хөөмий, морин хуур, уртын дуу) | Traditional (khöömii, morin khuur, long song) |
| jazz | Жазз | Jazz |
| classical | Сонгодог | Classical |
| other | Бусад | Other |

### Theme (what the song is about; song level)

| Slug | Mongolian | English |
|---|---|---|
| love | Хайр дурлал | Love |
| heartbreak | Салалт, шаналал | Heartbreak |
| homeland | Эх орон | Homeland / Patriotism |
| nature-steppe | Байгаль, тал нутаг | Nature and the steppe |
| parents-family | Эцэг эх, гэр бүл | Parents and family |
| friendship | Нөхөрлөл | Friendship |
| party-nightlife | Үдэшлэг, зугаа цэнгэл | Party and nightlife |
| ambition-hustle | Тэмүүлэл, амжилт | Ambition and hustle |
| self-empowerment | Өөртөө итгэх | Self-empowerment |
| city-life | Хотын амьдрал | City life / Ulaanbaatar |
| social-commentary | Нийгмийн шүүмж | Social commentary |
| spiritual | Оюун санаа, сүсэг | Spiritual |
| nostalgia | Дурсамж | Nostalgia |
| humour | Хошин | Humour |

### Scene (artist level)

| Slug | Mongolian | English |
|---|---|---|
| underground | Андерграунд | Underground |
| independent | Бие даасан | Independent |
| mainstream | Мэйнстрийм | Mainstream / Commercial |
| traditional-ensemble | Уламжлалт чуулга | Traditional ensemble |

### Mood (optional, song level)

| Slug | Mongolian | English |
|---|---|---|
| upbeat | Хөгжилтэй | Upbeat |
| energetic | Эрч хүчтэй | Energetic |
| romantic | Романтик | Romantic |
| melancholic | Гунигтай | Melancholic |
| calm | Тайван | Calm |
| aggressive | Ширүүн | Aggressive |
