# Darwish Music Studio — Design Brief for Google Stitch

> Paste section 1 (the global brief) first, then generate screens one at a time with the prompts in section 4.
> Generate each screen in **mobile (390×844)** and **desktop (1440×900)**.

---

## 1. Global brief (paste this first)

Design a music streaming web app called **Darwish Music Studio (DMS)**. It is an **Arabic, right-to-left (RTL)** app for people who grew up in the 90s and 2000s. It plays the theme songs of dubbed cartoons and anime, children's classics and TV-series intros, plus live internet radio stations.

**Mood:** 80s/90s **synthwave nostalgia** that is still clean and modern. Think neon sunset, boombox, cassette tapes, retro TV, palm silhouettes and a glowing grid floor, used as accents only. The UI itself should feel like a polished modern streaming app, close to Spotify and Anghami in layout but with its own neon personality. It should not look cluttered.

**Language & direction:** All UI text is Egyptian-Arabic, and the layout is mirrored for RTL. Navigation and the sidebar sit on the **right**. Media controls (play, next, previous, the progress bar) stay left-to-right, as in all music apps. Latin song and station names can appear inside Arabic text.

**Brand / logo:** a rounded-square app icon showing a chrome **boombox** in front of a striped **synthwave sunset**. Under it, the letters **"DMS"** are painted in graffiti brush style, **D in hot pink, M in yellow, S in cyan**, with "DARWISH MUSIC STUDIO" in cream brush lettering. The background is purple-blue with stars and palm trees.

**Accessibility:** text contrast at least 4.5:1, touch targets at least 44px, and color never used as the only signal.

---

## 2. Design tokens

### Colors — dark theme (default)
| Token | Hex | Use |
|---|---|---|
| Background | `#0E0930` | App background (night-purple sky) |
| Background 2 | `#160F42` | Sidebar, bars, modals |
| Surface | `#21175C` | Cards |
| Surface 2 | `#2C1F73` | Hover / selected |
| Text | `#F7F3FF` | Primary text |
| Text 2 | `#CFC6F0` | Secondary text |
| Muted | `#9D93C9` | Captions |
| Accent (neon magenta) | `#FF2D9B` | Primary buttons, active states, progress |
| Accent 2 (sunset orange) | `#FF8A2A` | Gradient end, highlights |
| Yellow (logo "M") | `#FFD23F` | Small highlights, badges |
| Cyan (logo "S") | `#22C4FF` | Secondary highlights, links |
| Live red | `#F87171` | "● مباشر" live badge |
| Success | `#34D399` | Published / OK |

Primary button: gradient **magenta → orange** (`#FF2D9B → #FF8A2A`) with dark ink `#1A0633`.

### Light theme
Background `#FAF7FF`, surface `#FFFFFF`, text `#1C1236`, accent `#D4127E`, accent 2 `#E8590C`.

### Retro theme (optional third theme)
Warm cassette-paper look: background `#F1E4C8` with a faint dot texture, surface `#FBF3E0`, text `#3A2414`, accent `#C2410C`. Buttons get a 2px dark border and a hard offset shadow (4px 4px 0).

### Typography
- **Cairo** (Google Font) for everything: 400 / 600 / 700 / 900.
- **Lalezar** (Google Font) for big display headings (page titles, station names, hero).
- Base 15px, line height 1.6.

### Shape & spacing
- Radius: cards 14px, buttons pill (999px), modals 18px, app-icon style images 22–26%.
- 8px spacing grid. Page padding 28px on desktop, 16px on mobile.
- Soft deep shadows: `0 10px 30px rgba(0,0,0,.35)`, and a **neon glow** (`0 0 18px` at 45% accent) for "playing" states only.

### Motion (for prototypes)
Pages fade and slide up 14px. Sections reveal one after another as you scroll. Cards lift 4px on hover. The heart "pops" when liked. The play button pulses while playing. The live badge blinks softly.

---

## 3. App structure

**Desktop:** a right sidebar (240px) holds the logo, main nav, "مكتبتي" (my library), modes and a theme switch. A top bar holds a large search field, a "🎲 فاجئني" (Surprise me) button and an avatar. The main content scrolls. A **persistent player bar** (84px) runs along the bottom.

**Mobile:** a top bar (logo, search, surprise, avatar). A **floating mini player** (rounded, 64px) sits above a **bottom tab bar** with 5 tabs: الرئيسية (Home), استكشف (Explore), الراديو (Radio), العب (Play), أنا (Me).

**Sidebar nav items:** الرئيسية · استكشف · الراديو · آلة الزمن · خمّن الشارة — then **مكتبتي**: ذكرياتي · المفضلة · قوائمي · سجل الاستماع — then **أوضاع**: وضع السيارة · لوحة الإدارة (admin only).

**Horizontal shelves** (rows of cards): no visible scrollbar. Use round arrow buttons that appear on the edges on hover, a soft fade on the edge where more cards are hidden, and small page dots under the row (the active dot is a longer magenta pill).

---

## 4. Screen prompts (one per generation)

### 4.1 Home — الرئيسية
Home screen of the Arabic RTL music app described above.
- **Hero card** (large, rounded 24px): a soft neon gradient with blurred pink and orange glow blobs. On the right, the kicker "مساء الطفولة 🎈، محمد". The headline in Lalezar reads "ذكريات عايشة جوانا... وأغاني عمرها ما بتنسينا", and a small subtitle reads "Your Memories. Your Music. Your Universe.". Three buttons: primary "🎲 فاجئني بأغنية", ghost "اسمع الراديو", ghost "خمّن الشارة". On the left, the floating DMS boombox logo with a neon glow and a small 5-bar equalizer (pink, yellow, cyan, orange, pink).
- Shelf **"رجّعلي اللي كنت بسمعه"** (recently played): square song cards with cover art, title, and show name.
- Shelf **"محطات الراديو"**: wide station cards. Each has a station logo, name in Lalezar, a one-line description, a round colored play button, and when live a "● مباشر · 12 بيسمعوا" badge. Each station has its own color tint in the card corner.
- Shelf **"عيش ذكرياتك من جديد"**: playlist cards with a 2×2 mosaic cover.
- Shelves **"أحدث الإضافات"** and **"الأكثر استماعًا"**.
- **"آلة الزمن"**: large decade chips "90s · 2000s" with song counts.
- **"التصنيفات"**: colorful gradient tiles (شارات سبيستون, كرتون عربي, أنمي مدبلج, أغاني أطفال كلاسيكية, مسلسلات وذكريات, أعمال درويش الأصلية).
- Bottom player bar showing a song playing.

### 4.2 Now Playing (full player)
A full-screen player over a blurred, color-drifting version of the cover art.
- Big square cover (20px radius, deep shadow), gently floating while playing.
- Title, then the show name and artist, with a heart on the side.
- Progress bar with times (LTR). Controls: shuffle, previous, a **big magenta play button** (72px, pulsing ring), next, repeat.
- A row with a sleep-timer (moon/clock) button showing "30د" and a volume slider.
- A side panel (desktop) or bottom sheet (mobile) with tabs "قائمة الانتظار" (queue list with small covers) and "الكلمات والاعتمادات" (lyrics in large comfortable Arabic type).

### 4.3 Radio station — live
A station page for "Spacetoon Memories" with an orange station color.
- Hero with the station logo, kicker "محطة راديو · بث مباشر", the name in Lalezar, the description, a big "▶ اسمع مباشر" button, and "128 بيسمعوا دلوقتي".
- **"على الهوا دلوقتي"** card: cover, blinking "● مباشر" badge, current song title.
- **"الجاية"** (up next) and **"اتذاعت قبل كده"** (recently aired) mini lists.
- **"اطلب أغنية"** panel: a search field, a dedication message field, results with an "اطلب" button, and a queue of pending requests with status pills ("في الطابور" / "مستني موافقة").

### 4.4 Radio list — الراديو
A grid of station cards (7 stations): Spacetoon Memories, Cartoon Arabic, 90s & 2000s, Anime Arabic, Kids Classics, Drama Memories, Darwish Originals. Each card uses its own color glow in one corner. Some cards are "internet stream" stations with a real logo; others are library stations. One card is live, with a pulsing outline.

### 4.5 Guess the Theme game — خمّن الشارة
A playful quiz screen.
- Start state: a game-controller icon, the title "خمّن الشارة", a short explanation, and a big "يلا نبدأ" button.
- Question state: a spinning **vinyl record** (200px) that plays an 8-second clip, a score bar "النتيجة 7/10 · 🔥 3 · أعلى سلسلة 5", and 4 large answer buttons in a 2×2 grid (show names).
- Answer state: the correct answer glows green and pops, a wrong pick shakes in red, and **confetti** bursts. A result card reads "برافو! 🎉" with the song name and buttons "السؤال اللي بعده" and "اسمعها كاملة".

### 4.6 Year Machine — آلة الزمن
Decade chips at the top (90s, 2000s). A horizontal strip of year buttons (1994…2003), each with a song count, and the selected year filled in magenta. Below: "شغّل الكل" and "🎲 فاجئني من الفترة دي", a shelf of the shows from that year, and a song list.

### 4.7 My Music Memories — ذكرياتي
A personal "Wrapped"-style summary.
- Period chips: آخر شهر · 3 شهور · السنة · من الأول.
- Big stat tiles: "86 أغنية مختلفة", "412 مرة استماع", "21 ساعة و 40 دقيقة", "بالليل — أكتر وقت بتسمع فيه".
- "أغانيك الأكتر": a ranked top-10 list with covers and play counts.
- Bar lists "أكتر تصنيفات" and "محطاتك" (colored bars).
- "بتسمع إمتى؟": a 24-hour column chart.
- "الأعمال اللي رجعتلها أكتر": a grid of show covers.
- Make it feel celebratory, with room for a shareable card.

### 4.8 Song page
A big cover (220px), kicker "أغنية · 1998", the title in Lalezar, links to the artist, show and category, then "3:42 · 1,240 مرة استماع · محتوى مرخّص" (green rights tag). Buttons: play, heart, "لقائمة تشغيل", "مشاركة", "تنزيل" (only when allowed), and a report flag. Two columns: "الكلمات" (lyrics) and "الاعتمادات" (credits). Then a "أغاني قريبة منها" shelf.

### 4.9 Show page (cartoon / anime)
A show cover, kicker "أنمي · 2001 · مركز الزهرة", the Arabic title, the original title, a description, "شغّل الكل" and "عشوائي" buttons, and a track list (numbered rows: cover 44px, title, show/artist, duration, heart, ⋯ menu).

### 4.10 Search
A large search field at the top with Arabic placeholder "دوّر على أغنية، كرتون، أنمي أو فنان...". Results are grouped into "أعمال" (shelf), "أغاني" (list) and "فنانين" (chips). Include a friendly empty state.

### 4.11 Login / Register
Centered card on a neon gradient background. The DMS logo (112px) overlaps the top edge of the card. Title "أهلاً بيك تاني". Email and password fields, a gradient "دخول" button, and the links "اعمل حساب جديد" and "نسيت كلمة المرور؟".

### 4.12 Car mode — وضع السيارة
Pure black, high-contrast, huge targets. Big cover, a very large title, the station name, three giant buttons (previous, a 150px magenta play, next), and a grid of big station buttons with colored borders. Top note: "جهّز اللي هتسمعه قبل ما تسوق 🚗".

### 4.13 Settings
Cards for: account (display name), privacy (toggle "احفظ سجل الاستماع", a "امسح سجل الاستماع" button), change password, appearance (chips ليلي / نهاري / ريترو), and the app ("ثبّت التطبيق على الجهاز").

---

## 5. Admin panel screens (desktop first)

Same brand, but calmer and denser, like a dashboard. Right-side admin nav: نظرة عامة · مباشر: مين بيسمع · الأغاني · الأعمال · التصنيفات · الفنانين · المحطات · طلبات الأغاني · القوائم الرسمية · البلاغات · المستخدمين.

### 5.1 Admin overview — لوحة التحكم
A row of 8 stat tiles: users, active in 7 days, plays today, plays in 30 days, published songs "48 / 60", rights under review (warning tint), open reports, pending song requests. Two column charts: "مرات التشغيل يوميًا (30 يوم)" and "استهلاك البيانات". Lists: top songs, top stations, "تراخيص بتنتهي خلال 30 يوم", playback errors.

### 5.2 Live — مباشر: مين بيسمع
Real-time view with a "● تحديث كل 5 ثواني" badge.
- Stat tiles: online now (peak), listening now (on radio), signed-in / guests, from the installed app, **app installs**, **song downloads**, unique visitors.
- "بيتسمع دلوقتي": songs being played, each with a listener count. Station bars sized by listener count.
- Device breakdown bars (Android, iOS, Windows, Mac).
- A table **"مين أونلاين"**: user name and email (or "زائر #a1b2"), what they're listening to with the station ("📻 Spacetoon Memories"), a status pill (▶ بيسمع / ⏸ متوقف), device, current page, and online since.
- Daily charts for installs and downloads.

### 5.3 Song library + upload
- An upload panel with defaults (category, show, add to station, artist, rights status, rights source) and a big dashed **drag-and-drop zone** with an upload icon. Per-file progress rows.
- Filters row: search, rights, published, processing status, category, station.
- A sticky **bulk action bar** when rows are selected: نشر، إلغاء النشر، الحقوق، التصنيف، العمل، ضيف لمحطة، حذف.
- Table: checkbox, cover + title + meta, rights pill (أصلي / مرخّص green, قيد المراجعة amber), processing pill (جاهز / بيتجهز pulsing / فشل), a published toggle switch, play count, edit.

### 5.4 Edit song (modal, wide)
Left: cover with "تغيير الغلاف", status, an audio preview, "إعادة معالجة", and delete. Right: fields for title, artist, year, show and category; a **"الحقوق والترخيص"** fieldset (rights type, license expiry date, source/document, regions, scope chips: استماع حسب الطلب / بث راديو / تنزيل / استخدام تجاري, internal notes); station chips; lyrics and credits textareas. Footer: a "منشورة للجمهور" toggle, with a hint explaining why publishing is disabled when rights are pending.

### 5.5 Add radio station by link (modal)
- A segmented switch: "رابط بث من الإنترنت" / "من أغاني مكتبتي".
- A stream URL field (LTR) and an "اختبار الرابط" button. Below it, a **green result card** reading "✓ الرابط شغال · BBC Radio · 128 kbps · audio/mpeg · بيذيع دلوقتي: …" (and a red variant for failures).
- Name, description, website, color, logo upload, slug, and a visible toggle.
- Also a separate modal **"إضافة كذا محطة بالروابط"**: a large LTR textarea for pasting one link per line, then a results list with ✓ / ✗ per line.

---

## 6. Components to include in a design system page
Buttons (primary gradient, ghost, danger, small, icon), chips and segmented controls, inputs/selects/textareas (RTL and LTR), song card, playlist mosaic card, station card (normal and live), track row (idle, hover, playing with an animated equalizer), mini player and full player, live badge, rights and status pills, toggle switch, stat tile, column chart, horizontal shelf with arrows, edge fades and dots, modal, toast, empty state, and a skeleton/loading equalizer.

## 7. Don'ts
- No copyrighted cartoon or anime characters. Use abstract covers, gradients, the DMS boombox, and generic retro shapes instead.
- No visible scrollbars on horizontal rows.
- Don't mirror the play, next or previous icons for RTL.
- Neon glow only on active or playing things, not everywhere.
